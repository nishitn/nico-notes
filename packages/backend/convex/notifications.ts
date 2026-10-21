import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { authedMutation, authedQuery, member, person } from './lib';
import { notificationMessage } from './schema';
import { legacyVisitMessage } from '../notificationText';

const notification = v.object({
  _id: v.id('boardChanges'),
  createdAt: v.number(),
  actorName: v.string(),
  summary: v.string(),
  message: v.optional(notificationMessage),
  visitStatus: v.optional(v.literal('planned')),
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
      .withIndex('by_boardId', (q) =>
        q.eq('boardId', boardId).gt('_creationTime', membership?.notificationsClearedAt ?? 0),
      )
      .order('desc')
      .paginate(paginationOpts);
    const readIds = new Set(membership?.notificationReadIds);
    const page = await Promise.all(
      result.page.map(async (change) => {
        const actor = change.actorId ? await person(ctx, change.actorId) : null;
        const target = change.visitId ? await ctx.db.get(change.visitId) : null;
        const visit = target?.boardId === boardId ? target : null;
        const subject = change.memberChange ? await person(ctx, change.memberChange.userId) : null;
        const summary =
          change.memberChange && subject
            ? change.memberChange.role
              ? `made ${subject.name} ${change.memberChange.role === 'admin' ? 'an admin' : 'a member'}`
              : `removed ${subject.name} from the board`
            : change.summary;
        return {
          _id: change._id,
          createdAt: change._creationTime,
          actorName: actor?.name ?? 'Former member',
          summary,
          message: change.message ?? (visit ? legacyVisitMessage(summary, visit) : undefined),
          visitId: visit?._id ?? null,
          visitStatus: visit?.status,
          unread:
            change._creationTime > (membership?.notificationsReadAt ?? 0) &&
            !readIds.has(change._id),
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
    const readIds = new Set(membership?.notificationReadIds);
    // One more change than the sparse read markers guarantees an unread item.
    const changes = await ctx.db
      .query('boardChanges')
      .withIndex('by_boardId', (q) =>
        q
          .eq('boardId', boardId)
          .gt(
            '_creationTime',
            Math.max(membership?.notificationsReadAt ?? 0, membership?.notificationsClearedAt ?? 0),
          ),
      )
      .order('desc')
      .take(readIds.size + 1);
    return changes.some((change) => !readIds.has(change._id));
  },
});

export const deleteAll = authedMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    const { userId } = await member(ctx, boardId);
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
      .unique();
    if (!membership) throw new ConvexError('This board is unavailable.');
    const newest = await ctx.db
      .query('boardChanges')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .order('desc')
      .first();
    if (!newest) return null;
    // Clear only this member's feed, including notifications beyond the loaded pages.
    const clearedAt = Math.max(membership.notificationsClearedAt ?? 0, newest._creationTime);
    await ctx.db.patch(membership._id, {
      notificationsClearedAt: clearedAt,
      notificationsReadAt: Math.max(membership.notificationsReadAt ?? 0, clearedAt),
      notificationReadIds: [],
    });
    return null;
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
    const readAt = Math.max(membership.notificationsReadAt ?? 0, change._creationTime);
    const individualReads = await Promise.all(
      (membership.notificationReadIds ?? []).map((id) => ctx.db.get(id)),
    );
    await ctx.db.patch(membership._id, {
      notificationsReadAt: readAt,
      notificationReadIds: individualReads.flatMap((row) =>
        row && row._creationTime > readAt ? [row._id] : [],
      ),
    });
    return null;
  },
});

export const markOneRead = authedMutation({
  args: { boardId: v.id('boards'), notificationId: v.id('boardChanges') },
  returns: v.null(),
  handler: async (ctx, { boardId, notificationId }) => {
    const { userId } = await member(ctx, boardId);
    const change = await ctx.db.get(notificationId);
    if (!change || change.boardId !== boardId) throw new ConvexError('Invalid notification.');
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
      .unique();
    if (!membership) throw new ConvexError('This board is unavailable.');
    const readIds = membership.notificationReadIds ?? [];
    if (
      change._creationTime > (membership.notificationsReadAt ?? 0) &&
      !readIds.includes(change._id)
    ) {
      await ctx.db.patch(membership._id, { notificationReadIds: [...readIds, change._id] });
    }
    return null;
  },
});
