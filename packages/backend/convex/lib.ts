import { getAuthUserId } from '@convex-dev/auth/server';
import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';
import { ConvexError, v } from 'convex/values';
import { query, mutation, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

export async function requireUser(ctx: Pick<QueryCtx, 'auth'>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError('Please sign in to continue.');
  return userId;
}
const authenticated = customCtx(async (ctx: QueryCtx) => {
  const userId = await requireUser(ctx);
  if (!(await ctx.db.get(userId)))
    throw new ConvexError('This account is no longer available. Please sign in again.');
  return { userId };
});
export const authedQuery = customQuery(query, authenticated);
export const authedMutation = customMutation(mutation, authenticated);

export function membershipRole(board: Doc<'boards'>, membership: Doc<'memberships'>) {
  return membership.role ?? (membership.userId === board.ownerId ? 'admin' : 'member');
}

export async function member(ctx: QueryCtx, boardId: Id<'boards'>) {
  const userId = await requireUser(ctx);
  const board = await ctx.db.get(boardId);
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
    .unique();
  if (!board || board.deleting || !membership)
    throw new ConvexError('This board is unavailable or you no longer have access.');
  return { board, userId, isAdmin: membershipRole(board, membership) === 'admin' };
}
export async function admin(ctx: QueryCtx, boardId: Id<'boards'>) {
  const result = await member(ctx, boardId);
  if (!result.isAdmin) throw new ConvexError('Only a board admin can do that.');
  return result;
}
export async function visitAccess(ctx: QueryCtx, visitId: Id<'visits'>) {
  const visit = await ctx.db.get(visitId);
  if (!visit) throw new ConvexError('This visit is no longer available.');
  return { visit, ...(await member(ctx, visit.boardId)) };
}
export const personValidator = v.object({
  _id: v.id('users'),
  name: v.string(),
  image: v.optional(v.string()),
});
export async function person(ctx: QueryCtx, id: Id<'users'>) {
  const user = await ctx.db.get(id);
  return {
    _id: id,
    name: user?.name ?? 'Date Notes member',
    ...(user?.image ? { image: user.image } : {}),
  };
}
