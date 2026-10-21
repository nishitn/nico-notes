import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import schema from './schema';
import { isLive, liveReader, liveWriter, recoverableTables } from './softDeletion';
import { usersBlocked } from './lib';
import { syncPlace } from './places';
import { MAX_ITEMS, MAX_PHOTOS } from '../shared';

function reason(value: string) {
  const clean = value.trim();
  if (clean.length < 5 || clean.length > 500)
    throw new ConvexError('Provide a support ticket reference or reason in 5–500 characters.');
  return clean;
}

// Operator-only: these functions cannot be called through a client API token.
export const list = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(schema.doc('deletions')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query('deletions')
      .order('desc')
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 50) });
    return { page, isDone, continueCursor };
  },
});

async function activeUser(ctx: MutationCtx, id: Id<'users'>) {
  const user = await ctx.db.get(id);
  if (!user || user.deleting || user.suspended)
    throw new ConvexError(
      'Recover the account first, or resolve its suspension before restoring access.',
    );
  return user;
}

export const restore = internalMutation({
  args: { deletionId: v.id('deletions'), reason: v.string() },
  returns: v.object({ restored: v.number() }),
  handler: async (ctx, { deletionId, reason: explanation }) => {
    const note = reason(explanation);
    const batch = await ctx.db.get(deletionId);
    if (!batch) throw new ConvexError('Deletion batch not found.');
    if (batch.restoredAt !== undefined) return { restored: 0 };
    const rows: Doc<(typeof recoverableTables)[number]>[] = [];
    for (const table of recoverableTables) {
      const page = await ctx.db
        .query(table)
        .withIndex('by_deletionId', (q) => q.eq('deletionId', deletionId))
        .take(2501 - rows.length);
      rows.push(...page);
      if (rows.length > 2500)
        throw new ConvexError('This batch needs a separately reviewed bulk recovery.');
    }
    const restoring = new Set(rows.map((row) => row._id as string));
    const live = liveReader(ctx);
    const boardIds = new Set<Id<'boards'>>();
    const placeIds = new Set<Id<'places'>>();
    const redirects = new Map<Id<'places'>, Id<'places'>>();
    const skip = new Set<string>();
    const capacities = new Map<string, Doc<(typeof recoverableTables)[number]>[]>();

    for (const row of rows) {
      if ('boardId' in row && row.boardId) {
        const board = await ctx.db.get(row.boardId);
        if (
          !board ||
          board.deleting ||
          (board.deletedAt !== undefined && !restoring.has(board._id))
        )
          throw new ConvexError('Restore the parent board first.');
        boardIds.add(board._id);
      }
      if ('visitId' in row && row.visitId) {
        const visit = await ctx.db.get(row.visitId);
        if (!visit || (visit.deletedAt !== undefined && !restoring.has(visit._id)))
          throw new ConvexError('Restore the parent visit first.');
        const board = await ctx.db.get(visit.boardId);
        if (
          !board ||
          board.deleting ||
          (board.deletedAt !== undefined && !restoring.has(board._id))
        )
          throw new ConvexError('Restore the parent board first.');
        boardIds.add(board._id);
        for (const table of ['dishes', 'categories', 'photos', 'ratings'] as const) {
          if (!ctx.db.normalizeId(table, row._id)) continue;
          const limit = table === 'photos' ? MAX_PHOTOS : table === 'ratings' ? 2000 : MAX_ITEMS;
          const key = `${table}:${row.visitId}`;
          let existing = capacities.get(key);
          if (!existing) {
            existing = await ctx.db
              .query(table)
              .withIndex('live_by_visitId', (q) =>
                q.eq('deletedAt', undefined).eq('visitId', row.visitId!),
              )
              .take(limit + 1);
            capacities.set(key, existing);
          }
          const incoming = rows.filter(
            (item) =>
              Boolean(ctx.db.normalizeId(table, item._id)) &&
              'visitId' in item &&
              item.visitId === row.visitId,
          );
          if (existing.length + incoming.length > limit)
            throw new ConvexError('Recovery would exceed this visit’s item or photo limit.');
          if (
            table === 'categories' &&
            'name' in row &&
            existing.some(
              (item) => 'name' in item && item.name.toLowerCase() === row.name.toLowerCase(),
            )
          )
            throw new ConvexError(
              'A category with this name already exists. Review it before recovery.',
            );
        }
      }
      if (ctx.db.normalizeId('boards', row._id)) {
        const board = row as Doc<'boards'>;
        await activeUser(ctx, board.ownerId);
        boardIds.add(board._id);
      }
      if (ctx.db.normalizeId('memberships', row._id)) {
        const membership = row as Doc<'memberships'>;
        await activeUser(ctx, membership.userId);
        const existing = await ctx.db
          .query('memberships')
          .withIndex('live_by_boardId_and_userId', (q) =>
            q
              .eq('deletedAt', undefined)
              .eq('boardId', membership.boardId)
              .eq('userId', membership.userId),
          )
          .first();
        if (existing) skip.add(row._id);
      }
      if (ctx.db.normalizeId('places', row._id)) {
        const place = row as Doc<'places'>;
        const existing = place.googlePlaceId
          ? await ctx.db
              .query('places')
              .withIndex('live_by_boardId_and_googlePlaceId', (q) =>
                q
                  .eq('deletedAt', undefined)
                  .eq('boardId', place.boardId)
                  .eq('googlePlaceId', place.googlePlaceId),
              )
              .first()
          : await ctx.db
              .query('places')
              .withIndex('live_by_boardId_and_matchKey', (q) =>
                q
                  .eq('deletedAt', undefined)
                  .eq('boardId', place.boardId)
                  .eq('matchKey', place.matchKey),
              )
              .first();
        if (existing) {
          redirects.set(place._id, existing._id);
          skip.add(row._id);
        }
      }
      if (ctx.db.normalizeId('ratings', row._id)) {
        const rating = row as Doc<'ratings'>;
        if (rating.userId) await activeUser(ctx, rating.userId);
        if (rating.kind !== 'overall') {
          const targetId = ctx.db.normalizeId(
            rating.kind === 'dish' ? 'dishes' : 'categories',
            rating.targetId,
          );
          const target = targetId ? await ctx.db.get(targetId) : null;
          if (
            !target ||
            target.visitId !== rating.visitId ||
            (target.deletedAt !== undefined && !restoring.has(target._id))
          )
            throw new ConvexError('Restore the rating target first.');
        }
        const duplicate = await ctx.db
          .query('ratings')
          .withIndex('live_by_visitId_and_userId_and_kind_and_targetId', (q) =>
            q
              .eq('deletedAt', undefined)
              .eq('visitId', rating.visitId)
              .eq('userId', rating.userId)
              .eq('kind', rating.kind)
              .eq('targetId', rating.targetId),
          )
          .first();
        if (duplicate)
          throw new ConvexError(
            'A newer rating exists. Review it before recovering the old rating.',
          );
      }
      if (ctx.db.normalizeId('photos', row._id)) {
        const photo = row as Doc<'photos'>;
        await activeUser(ctx, photo.uploaderId);
        if (photo.storageId && !(await ctx.db.system.get(photo.storageId)))
          throw new ConvexError('This image has been permanently erased.');
      }
    }
    // A support recovery must not reintroduce access between blocked people.
    for (const boardId of boardIds) {
      const current = await ctx.db
        .query('memberships')
        .withIndex('live_by_boardId', (q) => q.eq('deletedAt', undefined).eq('boardId', boardId))
        .take(21);
      const incoming = rows.filter(
        (row): row is Doc<'memberships'> =>
          Boolean(ctx.db.normalizeId('memberships', row._id)) &&
          'boardId' in row &&
          row.boardId === boardId &&
          !skip.has(row._id),
      );
      const members = [...new Set([...current, ...incoming].map((row) => row.userId))];
      if (members.length > 20) throw new ConvexError('This board has reached its 20-member limit.');
      for (let a = 0; a < members.length; a++)
        for (let b = a + 1; b < members.length; b++)
          if (await usersBlocked({ ...ctx, db: live }, members[a], members[b]))
            throw new ConvexError('Recovery would restore access between blocked accounts.');
    }
    let restored = 0;
    for (const row of rows) {
      if (skip.has(row._id)) continue;
      await ctx.db.patch(row._id, {
        deletedAt: undefined,
        deletedBy: undefined,
        deletionId: undefined,
      });
      if (ctx.db.normalizeId('visits', row._id)) {
        const visit = row as Doc<'visits'>;
        if (visit.placeId) {
          const placeId = redirects.get(visit.placeId) ?? visit.placeId;
          await ctx.db.patch(visit._id, { placeId, revision: (visit.revision ?? 0) + 1 });
          placeIds.add(placeId);
        }
      }
      restored++;
    }
    // Recalculate derived counters/numbering; original content IDs are preserved.
    for (const boardId of boardIds) {
      const board = await ctx.db.get(boardId);
      if (board && (await isLive(ctx.db, board))) {
        const revision = (board.countRevision ?? 0) + 1;
        await ctx.db.patch(boardId, {
          visitCount: undefined,
          counting: true,
          countRevision: revision,
        });
        await ctx.scheduler.runAfter(0, internal.boards.countVisits, {
          boardId,
          cursor: null,
          count: 0,
          revision,
        });
      }
    }
    for (const placeId of placeIds) await syncPlace({ ...ctx, db: liveWriter(ctx) }, placeId);
    await ctx.db.patch(deletionId, { restoredAt: Date.now(), restoreReason: note });
    return { restored };
  },
});

export const restoreAccount = internalMutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, reason: explanation }) => {
    const note = reason(explanation);
    const user = await ctx.db.get(userId);
    if (!user?.deleting || user.purgeAfter === undefined || user.purgeAfter <= Date.now())
      throw new ConvexError(
        'The account recovery window has ended or cleanup has already started.',
      );
    if (user.suspended)
      throw new ConvexError('Resolve the suspension separately before recovering this account.');
    await ctx.db.patch(userId, {
      deleting: false,
      deletedAt: undefined,
      deletedBy: undefined,
      purgeAfter: undefined,
      reactivatedAt: Date.now(),
    });
    await ctx.db.insert('deletions', {
      createdAt: user.deletedAt ?? Date.now(),
      firstTable: 'users',
      firstId: userId,
      actorId: userId,
      restoredAt: Date.now(),
      restoreReason: note,
    });
    return null;
  },
});

export const restoreProfilePhoto = internalMutation({
  args: { fileId: v.id('retainedFiles'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { fileId, reason: explanation }) => {
    const note = reason(explanation);
    const file = await ctx.db.get(fileId);
    if (!file || file.restoredAt !== undefined)
      throw new ConvexError('Retained photo unavailable.');
    const user = await activeUser(ctx, file.userId);
    if (user.profilePhotoId)
      throw new ConvexError('A newer profile photo exists. Review it before replacing it.');
    if (!(await ctx.db.system.get(file.storageId)))
      throw new ConvexError('Image has been permanently erased.');
    await ctx.db.patch(user._id, { profilePhotoId: file.storageId, hideProfilePhoto: false });
    await ctx.db.patch(fileId, { restoredAt: Date.now(), restoreReason: note });
    return null;
  },
});

export const eraseAccountNow = internalMutation({
  args: {
    userId: v.id('users'),
    confirmation: v.literal('ERASE PERSONAL DATA'),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, reason: explanation }) => {
    reason(explanation);
    const user = await ctx.db.get(userId);
    if (!user?.deleting) throw new ConvexError('Start account deletion before permanent erasure.');
    await ctx.db.patch(userId, { purgeAfter: Date.now() });
    await ctx.scheduler.runAfter(0, internal.account.erase, { userId });
    return null;
  },
});
