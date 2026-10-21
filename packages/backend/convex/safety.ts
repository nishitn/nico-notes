import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { type QueryCtx } from './_generated/server';
import { liveMutation as mutation, liveInternalMutation as internalMutation } from './softDeletion';
import { internal } from './_generated/api';
import schema from './schema';
import { authedQuery, member, person, requireActiveUser, usersBlocked, TERMS_VERSION } from './lib';
import { depart, isModerator } from './account';
import { softDeleteVisit as deleteVisit } from './cleanup';
import { syncPlace } from './places';
import type { Id } from './_generated/dataModel';

export const acceptTerms = mutation({
  args: { version: v.string() },
  returns: v.null(),
  handler: async (ctx, { version }) => {
    const userId = await requireActiveUser(ctx);
    if (version !== TERMS_VERSION)
      throw new ConvexError('Please read the latest terms before accepting.');
    await ctx.db.patch(userId, { termsVersion: version, termsAcceptedAt: Date.now() });
    return null;
  },
});
async function checkReportRate(ctx: QueryCtx, userId: Id<'users'>) {
  const recent = await ctx.db
    .query('reports')
    .withIndex('by_reporterId', (q) => q.eq('reporterId', userId))
    .order('desc')
    .take(10);
  if (recent.filter((r) => r.createdAt > Date.now() - 60 * 60 * 1000).length >= 10)
    throw new ConvexError(
      'Your reports have been received. Please wait an hour before submitting more, or email support.',
    );
}
function reportText(value: string) {
  const clean = value.trim();
  if (clean.length < 5 || clean.length > 2000)
    throw new ConvexError('Describe the problem in 5–2,000 characters.');
  return clean;
}
export const report = mutation({
  args: {
    boardId: v.id('boards'),
    visitId: v.optional(v.id('visits')),
    photoId: v.optional(v.id('photos')),
    userId: v.optional(v.id('users')),
    reason: v.string(),
  },
  returns: v.id('reports'),
  handler: async (ctx, args) => {
    const reporterId = await requireActiveUser(ctx);
    await member(ctx, args.boardId);
    let visitId = args.visitId;
    if (args.photoId) {
      const photo = await ctx.db.get(args.photoId);
      if (!photo) throw new ConvexError('This photo is no longer available.');
      if (visitId && visitId !== photo.visitId)
        throw new ConvexError('Choose a photo from this visit.');
      visitId = photo.visitId;
    }
    if (visitId) {
      const visit = await ctx.db.get(visitId);
      if (!visit || visit.boardId !== args.boardId)
        throw new ConvexError('Choose content from this board.');
    }
    if (args.userId) {
      const membership = await ctx.db
        .query('memberships')
        .withIndex('by_boardId_and_userId', (q) =>
          q.eq('boardId', args.boardId).eq('userId', args.userId!),
        )
        .first();
      if (!membership) throw new ConvexError('Choose a current member of this board.');
    }
    await checkReportRate(ctx, reporterId);
    return ctx.db.insert('reports', {
      ...args,
      visitId,
      reason: reportText(args.reason),
      reporterId,
      kind: 'content',
      status: 'open',
      createdAt: Date.now(),
    });
  },
});
export const reportProblem = mutation({
  args: { description: v.string(), version: v.string(), platform: v.string() },
  returns: v.id('reports'),
  handler: async (ctx, { description, version, platform }) => {
    const reporterId = await requireActiveUser(ctx);
    await checkReportRate(ctx, reporterId);
    return ctx.db.insert('reports', {
      reporterId,
      kind: 'problem',
      reason: reportText(description),
      version: version.slice(0, 80),
      platform: platform.slice(0, 80),
      status: 'open',
      createdAt: Date.now(),
    });
  },
});
export const block = mutation({
  args: { boardId: v.id('boards'), userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { boardId, userId }) => {
    const blockerId = await requireActiveUser(ctx);
    if (blockerId === userId) throw new ConvexError('You cannot block yourself.');
    const existing = await ctx.db
      .query('blocks')
      .withIndex('by_blockerId_and_userId', (q) =>
        q.eq('blockerId', blockerId).eq('userId', userId),
      )
      .first();
    if (existing) return null;
    await member(ctx, boardId);
    const target = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
      .first();
    if (!target) throw new ConvexError('This person is no longer a member of this board.');
    const blocks = await ctx.db
      .query('blocks')
      .withIndex('by_blockerId', (q) => q.eq('blockerId', blockerId))
      .take(100);
    if (blocks.length >= 100)
      throw new ConvexError(
        'You can block up to 100 accounts. Contact support for additional help.',
      );
    const blockId = await ctx.db.insert('blocks', { blockerId, userId, pending: true });
    const ownMembership = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', blockerId))
      .unique();
    if (ownMembership) await depart(ctx, ownMembership);
    await ctx.scheduler.runAfter(0, internal.safety.leaveSharedBoards, { blockId, cursor: null });
    return null;
  },
});
export const leaveSharedBoards = internalMutation({
  args: { blockId: v.id('blocks'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { blockId, cursor }) => {
    const block = await ctx.db.get(blockId);
    if (!block) return null;
    const page = await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q) => q.eq('userId', block.blockerId))
      .paginate({ cursor, numItems: 20 });
    for (const membership of page.page) {
      const other = await ctx.db
        .query('memberships')
        .withIndex('by_boardId_and_userId', (q) =>
          q.eq('boardId', membership.boardId).eq('userId', block.userId),
        )
        .first();
      if (other) await depart(ctx, membership);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.safety.leaveSharedBoards, {
        blockId,
        cursor: page.continueCursor,
      });
    else await ctx.db.patch(blockId, { pending: false });
    return null;
  },
});
export const blocked = authedQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id('blocks'), userId: v.id('users'), name: v.string() })),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('blocks')
      .withIndex('by_blockerId', (q) => q.eq('blockerId', ctx.userId))
      .take(100);
    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        userId: row.userId,
        name: (await person(ctx, row.userId)).name,
      })),
    );
  },
});
export const unblock = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const blockerId = await requireActiveUser(ctx);
    const row = await ctx.db
      .query('blocks')
      .withIndex('by_blockerId_and_userId', (q) =>
        q.eq('blockerId', blockerId).eq('userId', userId),
      )
      .first();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
export async function checkJoinBlocks(ctx: QueryCtx, boardId: Id<'boards'>, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  if (!user || user.deleting || user.suspended)
    throw new ConvexError('This account is no longer available.');
  const members = await ctx.db
    .query('memberships')
    .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
    .take(20);
  for (const membership of members) {
    if (await usersBlocked(ctx, userId, membership.userId))
      throw new ConvexError('This board is unavailable because of a blocked account.');
  }
}
export const reports = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(schema.doc('reports')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    if (!(await isModerator(ctx, ctx.userId)))
      throw new ConvexError('Only the safety team can review reports.');
    const page = await ctx.db
      .query('reports')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .order('asc')
      .paginate({ ...paginationOpts, numItems: Math.min(50, paginationOpts.numItems) });
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      page: await Promise.all(
        page.page.map(async (report) => {
          const visit = report.visitId ? await ctx.db.get(report.visitId) : null;
          const photo = report.photoId ? await ctx.db.get(report.photoId) : null;
          const reported = report.userId ? await ctx.db.get(report.userId) : null;
          const contentSummary = [
            reported?.displayName ?? reported?.name,
            visit ? `${visit.title} — ${visit.notes.slice(0, 1000)}` : undefined,
            photo ? `Photo: ${photo.caption}` : undefined,
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 1500);
          return { ...report, ...(contentSummary ? { contentSummary } : {}) };
        }),
      ),
    };
  },
});
export const resolveReport = mutation({
  args: {
    reportId: v.id('reports'),
    action: v.union(v.literal('dismiss'), v.literal('remove-content'), v.literal('suspend-user')),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { reportId, action, note }) => {
    const userId = await requireActiveUser(ctx);
    if (!(await isModerator(ctx, userId)))
      throw new ConvexError('Only the safety team can review reports.');
    const report = await ctx.db.get(reportId);
    if (!report || report.status === 'resolved') return null;
    if (action === 'remove-content') {
      if (report.photoId) {
        const photo = await ctx.db.get(report.photoId);
        if (photo) await ctx.db.delete(photo._id);
      } else if (report.visitId) {
        const visit = await ctx.db.get(report.visitId);
        if (visit) {
          await deleteVisit(ctx, visit._id);
          if (visit.placeId) await syncPlace(ctx, visit.placeId);
        }
      } else throw new ConvexError('This report has no content to remove.');
    }
    if (action === 'suspend-user') {
      if (!report.userId) throw new ConvexError('This report has no reported account.');
      if (report.userId === userId)
        throw new ConvexError('Another moderator must review this report.');
      if (await ctx.db.get(report.userId)) {
        await ctx.db.patch(report.userId, { suspended: true });
        await ctx.scheduler.runAfter(0, internal.account.revokeSessions, { userId: report.userId });
      }
    }
    await ctx.db.patch(reportId, {
      status: 'resolved',
      reviewedAt: Date.now(),
      resolution: action,
      note: note.trim().slice(0, 1000),
    });
    return null;
  },
});

export const resumeBlocks = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('blocks')
      .withIndex('by_pending', (q) => q.eq('pending', true))
      .take(50);
    for (const block of pending)
      await ctx.scheduler.runAfter(0, internal.safety.leaveSharedBoards, {
        blockId: block._id,
        cursor: null,
      });
    return null;
  },
});
