import { v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';

export async function deletePhoto(ctx: MutationCtx, photo: Doc<'photos'>) {
  if (photo.storageId) await ctx.storage.delete(photo.storageId);
  if (photo.localKey)
    await ctx.db.insert('localPhotoDeletions', {
      key: photo.localKey,
      contentType: photo.contentType,
    });
  await ctx.db.delete(photo._id);
}

export async function deleteVisit(ctx: MutationCtx, visitId: Id<'visits'>) {
  for (const table of ['ratings', 'dishes', 'categories', 'uploads'] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
      .take(2000);
    for (const row of rows) await ctx.db.delete(row._id);
  }
  const photos = await ctx.db
    .query('photos')
    .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
    .take(10);
  for (const photo of photos) {
    await deletePhoto(ctx, photo);
  }
  if (await ctx.db.get(visitId)) await ctx.db.delete(visitId);
}
export const board = internalMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    const board = await ctx.db.get(boardId);
    if (!board?.deleting) return null;
    const visits = await ctx.db
      .query('visits')
      .withIndex('by_boardId_and_date', (q) => q.eq('boardId', boardId))
      .take(1);
    if (visits.length) {
      await deleteVisit(ctx, visits[0]._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.board, { boardId });
    } else {
      for (const table of ['memberships', 'visitTypes', 'invitations', 'joinRequests'] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
          .take(100);
        for (const row of rows) await ctx.db.delete(row._id);
      }
      await ctx.db.delete(boardId);
    }
    return null;
  },
});
export const expiredUploads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('uploads')
      .withIndex('by_expiresAt', (q) => q.lte('expiresAt', Date.now()))
      .take(100);
    for (const upload of expired) await ctx.db.delete(upload._id);
    if (expired.length === 100)
      await ctx.scheduler.runAfter(0, internal.cleanup.expiredUploads, {});
    return null;
  },
});
export const expireInvitation = internalMutation({
  args: { invitationId: v.id('invitations') },
  returns: v.null(),
  handler: async (ctx, { invitationId }) => {
    const invitation = await ctx.db.get(invitationId);
    if (invitation && invitation.expiresAt <= Date.now())
      await ctx.db.patch(invitationId, { revoked: true });
    return null;
  },
});
export const orphanStorage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.system.query('_storage').paginate({ cursor, numItems: 50 });
    for (const file of result.page) {
      if (file._creationTime > Date.now() - 24 * 60 * 60 * 1000) continue;
      const photo = await ctx.db
        .query('photos')
        .withIndex('by_storageId', (q) => q.eq('storageId', file._id))
        .first();
      if (!photo) await ctx.storage.delete(file._id);
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.cleanup.orphanStorage, {
        cursor: result.continueCursor,
      });
    return null;
  },
});
