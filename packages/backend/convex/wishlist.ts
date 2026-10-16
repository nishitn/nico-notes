import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import schema, { locationValidator } from './schema';
import { authedMutation, authedQuery, member } from './lib';
import { textValue } from '../shared';
import { validateLocation } from './places';

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
        return existing._id;
      }
    }

    return ctx.db.insert('wishlist', {
      boardId,
      creatorId: userId,
      title: cleanTitle,
      place: place?.trim().slice(0, 250),
      notes: notes?.trim().slice(0, 500),
      location: validLocation,
      googlePlaceId: googlePlaceId ? textValue(googlePlaceId, 'Google Place ID', 300) : undefined,
      link: link?.trim().slice(0, 500),
      createdAt: Date.now(),
    });
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
    await ctx.db.delete(id);
    return null;
  },
});
