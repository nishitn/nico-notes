import { storedPlace } from '../placePersistence';
import { logChange, logVisitChange } from './activity';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import schema, { locationValidator } from './schema';
import { authedMutation, authedQuery, member } from './lib';
import { textValue } from '../shared';
import { validateLocation } from './places';
import { ensurePlannedVisit, safeLink } from './plannedVisits';
import { type MutationCtx } from './_generated/server';
import { liveInternalMutation as internalMutation } from './softDeletion';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { softDeleteVisit as deleteVisit } from './cleanup';

export const list = authedQuery({
  args: { boardId: v.id('boards'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(schema.doc('wishlist')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { boardId, paginationOpts }) => {
    await member(ctx, boardId);
    const { page, isDone, continueCursor } = await ctx.db
      .query('wishlist')
      .withIndex('by_boardId_and_createdAt', (q) => q.eq('boardId', boardId))
      .order('desc')
      .paginate(paginationOpts);
    return { page, isDone, continueCursor };
  },
});

export const get = authedQuery({
  args: { id: v.id('wishlist') },
  returns: v.union(schema.doc('wishlist'), v.null()),
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item) return null;
    await member(ctx, item.boardId);
    return item;
  },
});

export const savedPlaceIds = authedQuery({
  args: { boardId: v.id('boards') },
  returns: v.array(v.string()),
  handler: async (ctx, { boardId }) => {
    await member(ctx, boardId);
    const items = await ctx.db
      .query('wishlist')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .take(500);
    return items.map((i) => i.googlePlaceId).filter((id): id is string => !!id);
  },
});

export const add = authedMutation({
  args: {
    boardId: v.id('boards'),
    title: v.string(),
    place: v.optional(v.string()),
    notes: v.optional(v.string()),
    location: v.optional(locationValidator),
    googlePlaceId: v.optional(v.string()),
    link: v.optional(v.string()),
  },
  returns: v.id('wishlist'),
  handler: async (ctx, { boardId, title, place, notes, location, googlePlaceId, link }) => {
    const { userId } = await member(ctx, boardId);
    ({ title, place, location } = storedPlace({ title, place, location, googlePlaceId }));
    const cleanTitle = textValue(title, 'Place or wishlist name');
    const validLocation = validateLocation(location);

    if (googlePlaceId) {
      const existing = await ctx.db
        .query('wishlist')
        .withIndex('by_boardId_and_googlePlaceId', (q) =>
          q.eq('boardId', boardId).eq('googlePlaceId', googlePlaceId),
        )
        .first();
      if (existing) {
        if (notes?.trim()) {
          await ctx.db.patch(existing._id, { notes: notes.trim().slice(0, 500) });
        }
        if (existing.visitId && notes?.trim()) {
          const visit = await ctx.db.get(existing.visitId);
          if (visit?.status === 'planned')
            await ctx.db.patch(visit._id, {
              notes: notes.trim().slice(0, 500),
              notesAuthorId: userId,
              revision: (visit.revision ?? 0) + 1,
            });
        }
        await ensurePlannedVisit(ctx, {
          ...existing,
          ...(notes?.trim() ? { notes: notes.trim().slice(0, 500) } : {}),
        });
        if (notes?.trim() && notes.trim().slice(0, 500) !== existing.notes)
          await logChange(
            ctx,
            boardId,
            userId,
            `updated a planned visit: “${existing.title}”`,
            existing.visitId,
          );
        return existing._id;
      }
    }

    const id = await ctx.db.insert('wishlist', {
      boardId,
      creatorId: userId,
      title: cleanTitle,
      place: place?.trim().slice(0, 250),
      notes: notes?.trim().slice(0, 500),
      location: validLocation,
      googlePlaceId: googlePlaceId ? textValue(googlePlaceId, 'Google Place ID', 300) : undefined,
      link: safeLink(link),
      createdAt: Date.now(),
    });
    const visitId = await ensurePlannedVisit(ctx, (await ctx.db.get(id))!);
    await logVisitChange(ctx, visitId, userId, 'added to the wishlist:');
    return id;
  },
});

export const remove = authedMutation({
  args: {
    id: v.id('wishlist'),
    confirmed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { id, confirmed }) => {
    if (!confirmed) throw new ConvexError('Confirm removing this wishlist item.');
    const item = await ctx.db.get(id);
    if (!item) return null;
    await member(ctx, item.boardId);
    await logChange(
      ctx,
      item.boardId,
      ctx.userId,
      `removed from the wishlist: “${item.title}”`,
      item.visitId,
    );
    if (item.visitId) await deleteVisit(ctx, item.visitId);
    else await ctx.db.delete(id);
    return null;
  },
});

export const update = authedMutation({
  args: {
    id: v.id('wishlist'),
    title: v.string(),
    place: v.optional(v.string()),
    notes: v.optional(v.string()),
    link: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, title, place, notes, link }) => {
    const item = await ctx.db.get(id);
    if (!item) throw new ConvexError('This wishlist item is no longer available.');
    await member(ctx, item.boardId);
    ({ title, place } = storedPlace({ title, place, googlePlaceId: item.googlePlaceId }));
    const fields = {
      title: textValue(title, 'Place or wishlist name'),
      place: place?.trim().slice(0, 250),
      notes: notes?.trim().slice(0, 500),
      link: safeLink(link),
    };
    await ctx.db.patch(id, fields);
    const visitId = await ensurePlannedVisit(ctx, { ...item, ...fields });
    const visit = (await ctx.db.get(visitId))!;
    await ctx.db.patch(visitId, {
      title: fields.title,
      place: fields.place ?? '',
      notes: fields.notes ?? '',
      notesAuthorId: ctx.userId,
      savedLink: fields.link,
      revision: (visit.revision ?? 0) + 1,
    });
    await logVisitChange(ctx, visitId, ctx.userId, 'updated a planned visit:');
    return null;
  },
});

export const ensureVisit = authedMutation({
  args: { id: v.id('wishlist') },
  returns: v.id('visits'),
  handler: async (ctx, { id }) => {
    const wish = await ctx.db.get(id);
    if (!wish) throw new ConvexError('This planned visit is no longer available.');
    await member(ctx, wish.boardId);
    return ensurePlannedVisit(ctx, wish);
  },
});

async function migrateBoardBatch(ctx: MutationCtx, boardId: Id<'boards'>) {
  const board = await ctx.db.get(boardId);
  if (!board || board.deleting) return;
  const batch = await ctx.db
    .query('wishlist')
    .withIndex('by_boardId_and_visitId', (q) => q.eq('boardId', boardId).eq('visitId', undefined))
    .take(25);
  for (const wish of batch) await ensurePlannedVisit(ctx, wish);
  if (batch.length === 25)
    await ctx.scheduler.runAfter(0, internal.wishlist.migrateBoard, { boardId });
}

export const ensurePlanned = authedMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    await member(ctx, boardId);
    await migrateBoardBatch(ctx, boardId);
    return null;
  },
});

export const migrateBoard = internalMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    await migrateBoardBatch(ctx, boardId);
    return null;
  },
});
