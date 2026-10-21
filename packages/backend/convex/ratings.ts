import { logVisitChange } from './activity';
import { ConvexError, v } from 'convex/values';
import { authedMutation, visitAccess } from './lib';
import { validScore } from '../shared';
import { targetKind } from './schema';

export const save = authedMutation({
  args: {
    visitId: v.id('visits'),
    kind: targetKind,
    targetId: v.union(v.id('visits'), v.id('dishes'), v.id('categories')),
    score: v.union(v.number(), v.null()),
    note: v.string(),
    userId: v.optional(v.id('users')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { visit, board, isAdmin } = await visitAccess(ctx, args.visitId);
    if (visit.status === 'planned')
      throw new ConvexError('Mark this visit as visited before adding ratings.');
    const userId = args.userId ?? ctx.userId;
    if (userId !== ctx.userId) {
      if (!isAdmin) throw new ConvexError('Only a board admin can rate for another member.');
      const membership = await ctx.db
        .query('memberships')
        .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', board._id).eq('userId', userId))
        .unique();
      if (!membership) throw new ConvexError('This person is no longer a board member.');
    }
    if (args.kind === 'overall') {
      if (args.targetId !== args.visitId) throw new ConvexError('Invalid overall rating target.');
    } else {
      const id = ctx.db.normalizeId(args.kind === 'dish' ? 'dishes' : 'categories', args.targetId);
      const target = id ? await ctx.db.get(id) : null;
      if (!target || target.visitId !== args.visitId)
        throw new ConvexError('This rating target does not belong to this visit.');
    }
    const existing = await ctx.db
      .query('ratings')
      .withIndex('by_visitId_and_userId_and_kind_and_targetId', (q) =>
        q
          .eq('visitId', args.visitId)
          .eq('userId', userId)
          .eq('kind', args.kind)
          .eq('targetId', args.targetId),
      )
      .unique();
    if (args.score === null) {
      if (existing) {
        await ctx.db.delete(existing._id);
        await logVisitChange(ctx, args.visitId, ctx.userId, `cleared ${args.kind} rating on`);
      }
      return null;
    }
    if (!validScore(args.score)) throw new ConvexError('Ratings must be 1–10 in half-point steps.');
    const fields = {
      visitId: args.visitId,
      kind: args.kind,
      targetId: args.targetId,
      userId,
      score: args.score,
      note: args.note.trim().slice(0, 1000),
    };
    if (existing?.score === fields.score && existing.note === fields.note) return null;
    if (existing) await ctx.db.patch(existing._id, fields);
    else {
      const ratings = await ctx.db
        .query('ratings')
        .withIndex('by_visitId', (q) => q.eq('visitId', args.visitId))
        .take(2000);
      if (ratings.length >= 2000)
        throw new ConvexError('This visit has reached its 2,000-rating limit.');
      await ctx.db.insert('ratings', fields);
    }
    await logVisitChange(
      ctx,
      args.visitId,
      ctx.userId,
      `${existing ? 'updated' : 'added'} ${args.kind} rating to ${fields.score}/10 on`,
    );
    return null;
  },
});
