import { getAuthUserId } from '@convex-dev/auth/server';
import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { liveReader, liveWriter } from './softDeletion';

export { POLICY_VERSION as TERMS_VERSION } from '../legal';
import { POLICY_VERSION as TERMS_VERSION } from '../legal';

export async function requireUser(ctx: Pick<QueryCtx, 'auth'>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError('Please sign in to continue.');
  return userId;
}
const authenticated = customCtx(async (ctx: QueryCtx) => {
  const userId = await requireActiveUser(ctx);
  const user = await ctx.db.get(userId);
  if (!user || user.deleting)
    throw new ConvexError('This account is no longer available. Please sign in again.');
  if (user.suspended) throw new ConvexError('This account is suspended. Contact support for help.');
  return { userId, db: liveReader(ctx) };
});
export const authedQuery = customQuery(query, authenticated);
export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx: MutationCtx) => {
    const userId = await requireActiveUser(ctx);
    const user = await ctx.db.get(userId);
    if (user?.termsVersion !== TERMS_VERSION)
      throw new ConvexError('Please accept the current terms before making changes.');
    return { userId, db: liveWriter(ctx, userId) };
  }),
);

export async function requireActiveUser(ctx: QueryCtx) {
  const userId = await requireUser(ctx);
  const user = await ctx.db.get(userId);
  if (!user || user.deleting)
    throw new ConvexError('This account is no longer available. Please sign in again.');
  if (user.suspended) throw new ConvexError('This account is suspended. Contact support for help.');
  if (user.reactivatedAt !== undefined) {
    const identity = await ctx.auth.getUserIdentity();
    const rawSessionId = identity?.subject.split('|')[1];
    const sessionId = rawSessionId ? ctx.db.normalizeId('authSessions', rawSessionId) : null;
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (
      !session ||
      session.userId !== userId ||
      session.expirationTime <= Date.now() ||
      session._creationTime < user.reactivatedAt
    )
      throw new ConvexError('Sign in again after account recovery.');
  }
  return userId;
}
export async function usersBlocked(ctx: QueryCtx, first: Id<'users'>, second: Id<'users'>) {
  const [a, b] = await Promise.all([
    ctx.db
      .query('blocks')
      .withIndex('by_blockerId_and_userId', (q) => q.eq('blockerId', first).eq('userId', second))
      .first(),
    ctx.db
      .query('blocks')
      .withIndex('by_blockerId_and_userId', (q) => q.eq('blockerId', second).eq('userId', first))
      .first(),
  ]);
  return Boolean(a || b);
}

export function membershipRole(board: Doc<'boards'>, membership: Doc<'memberships'>) {
  return membership.role ?? (membership.userId === board.ownerId ? 'admin' : 'member');
}

export async function member(ctx: QueryCtx, boardId: Id<'boards'>) {
  const userId = await requireActiveUser(ctx);
  const board = await ctx.db.get(boardId);
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', userId))
    .unique();
  if (
    !board ||
    board.deleting ||
    board.deletedAt !== undefined ||
    !membership ||
    membership.deletedAt !== undefined
  )
    throw new ConvexError('This board is unavailable or you no longer have access.');
  const members = await ctx.db
    .query('memberships')
    .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
    .take(20);
  for (const other of members) {
    if (other.userId !== userId && (await usersBlocked(ctx, userId, other.userId)))
      throw new ConvexError('This board is unavailable while a block is being applied.');
  }
  return { board, userId, isAdmin: membershipRole(board, membership) === 'admin' };
}
export async function admin(ctx: QueryCtx, boardId: Id<'boards'>) {
  const result = await member(ctx, boardId);
  if (!result.isAdmin) throw new ConvexError('Only a board admin can do that.');
  return result;
}
export async function visitAccess(ctx: QueryCtx, visitId: Id<'visits'>) {
  const visit = await ctx.db.get(visitId);
  if (!visit || visit.deletedAt !== undefined)
    throw new ConvexError('This visit is no longer available.');
  return { visit, ...(await member(ctx, visit.boardId)) };
}
export const personValidator = v.object({
  _id: v.id('users'),
  name: v.string(),
  image: v.optional(v.string()),
});
export async function person(ctx: QueryCtx, id: Id<'users'>) {
  const found = await ctx.db.get(id);
  const user = found?.deleting || found?.deletedAt !== undefined ? null : found;
  const image = user?.hideProfilePhoto
    ? undefined
    : user?.profilePhotoId
      ? ((await ctx.storage.getUrl(user.profilePhotoId)) ?? undefined)
      : user?.image;
  return {
    _id: id,
    name: user ? (user.displayName ?? user.name ?? 'nico notes member') : 'Former member',
    ...(image ? { image } : {}),
  };
}

export async function bumpVisitCount(ctx: MutationCtx, boardId: Id<'boards'>, delta: number) {
  const board = await ctx.db.get(boardId);
  if (!board || board.deleting) return;
  await ctx.db.patch(boardId, {
    countRevision: (board.countRevision ?? 0) + 1,
    ...(board.visitCount === undefined
      ? {}
      : { visitCount: Math.max(0, board.visitCount + delta) }),
  });
  if (board.visitCount === undefined && !board.counting) {
    await ctx.db.patch(boardId, { counting: true });
    await ctx.scheduler.runAfter(0, internal.boards.countVisits, {
      boardId,
      cursor: null,
      count: 0,
      revision: (board.countRevision ?? 0) + 1,
    });
  }
}
