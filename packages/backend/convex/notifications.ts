import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { authedMutation, authedQuery, member, person } from './lib';

const notification = v.object({
  _id: v.id('boardChanges'),
  createdAt: v.number(),
  actorName: v.string(),
  summary: v.string(),
  visitId: v.union(v.id('visits'), v.null()),
  unread: v.boolean(),
});

export const list = authedQuery({
  args: { boardId: v.id('boards'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(notification),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { boardId, paginationOpts }) => {
    const { userId } = await member(ctx, boardId);
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
      .unique();
    const result = await ctx.db
      .query('boardChanges')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .order('desc')
      .paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (change) => {
        const actor = change.actorId ? await person(ctx, change.actorId) : null;
        const visit = change.visitId ? await ctx.db.get(change.visitId) : null;
        return {
          _id: change._id,
          createdAt: change._creationTime,
          actorName: actor?.name ?? 'Former member',
          summary: change.summary,
          visitId: visit?.boardId === boardId ? visit._id : null,
          unread: change._creationTime > (membership?.notificationsReadAt ?? 0),
        };
      }),
    );
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const hasUnread = authedQuery({
  args: { boardId: v.id('boards') },
  returns: v.boolean(),
  handler: async (ctx, { boardId }) => {
    const { userId } = await member(ctx, boardId);
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
      .unique();
    const latest = await ctx.db
      .query('boardChanges')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .order('desc')
      .first();
    return !!latest && latest._creationTime > (membership?.notificationsReadAt ?? 0);
  },
});

export const markRead = authedMutation({
  args: { boardId: v.id('boards'), throughId: v.id('boardChanges') },
  returns: v.null(),
  handler: async (ctx, { boardId, throughId }) => {
    const { userId } = await member(ctx, boardId);
    const change = await ctx.db.get(throughId);
    if (!change || change.boardId !== boardId) throw new ConvexError('Invalid notification.');
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
      .unique();
    if (!membership) throw new ConvexError('This board is unavailable.');
    await ctx.db.patch(membership._id, {
      notificationsReadAt: Math.max(membership.notificationsReadAt ?? 0, change._creationTime),
    });
    return null;
  },
});
