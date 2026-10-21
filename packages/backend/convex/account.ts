import { v } from 'convex/values';
import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireUser, membershipRole, TERMS_VERSION } from './lib';
import { deletePhoto, deleteVisit } from './cleanup';
import { ACCOUNT_RECOVERY_MS, recoverableTables } from './softDeletion';

export async function isModerator(ctx: QueryCtx, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  if (
    !user ||
    user.deleting ||
    user.suspended ||
    user.emailVerificationTime === undefined ||
    !user.email
  )
    return false;
  const allowed = (process.env.MODERATOR_EMAILS ?? 'nishit.nagar1@gmail.com')
    .split(',')
    .map((email: string) => email.trim().toLowerCase());
  if (!allowed.includes(user.email.toLowerCase())) return false;
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'google'))
    .first();
  return Boolean(account);
}
export const status = query({
  args: {},
  returns: v.object({
    deleting: v.boolean(),
    suspended: v.boolean(),
    termsVersion: v.union(v.string(), v.null()),
    requiredTermsVersion: v.string(),
    isModerator: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return {
      deleting: !user || Boolean(user.deleting),
      suspended: Boolean(user?.suspended),
      termsVersion: user?.termsVersion ?? null,
      requiredTermsVersion: TERMS_VERSION,
      isModerator: await isModerator(ctx, userId),
    };
  },
});
export const verifiedGoogleEmail = internalMutation({
  args: { userId: v.id('users'), email: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, email }) => {
    const user = await ctx.db.get(userId);
    if (user && user.email === email)
      await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
    return null;
  },
});
export const remove = mutation({
  args: { confirmation: v.literal('DELETE') },
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user || user.deleting) return null;
    // The marker immediately denies all data access, including previously issued JWTs.
    const now = Date.now();
    await ctx.db.patch(userId, {
      deleting: true,
      deletedAt: now,
      purgeAfter: now + ACCOUNT_RECOVERY_MS,
    });
    await ctx.scheduler.runAfter(0, internal.account.revokeSessions, { userId });
    // The due-date index and 30-minute cron start erasure after the recovery window.
    return null;
  },
});

// Preserve the remaining group's contributions. An empty group is deleted; otherwise
// ownership/admin responsibility passes to a current member before departure.
export async function depart(ctx: MutationCtx, membership: Doc<'memberships'>, permanent = false) {
  if (membership.deletedAt !== undefined) {
    await ctx.db.delete(membership._id);
    return;
  }
  const board = await ctx.db.get(membership.boardId);
  if (board && !board.deleting) {
    const members = await ctx.db
      .query('memberships')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .take(20);
    const others = members.filter(
      (m) => m.userId !== membership.userId && m.deletedAt === undefined,
    );
    if (!others.length) {
      if (permanent) {
        await ctx.db.patch(board._id, { deleting: true });
        await ctx.scheduler.runAfter(0, internal.cleanup.board, { boardId: board._id });
      } else await ctx.db.delete(board._id);
    } else {
      const successor = others.find((m) => membershipRole(board, m) === 'admin') ?? others[0];
      if (!others.some((m) => membershipRole(board, m) === 'admin'))
        await ctx.db.patch(successor._id, { role: 'admin' });
      if (board.ownerId === membership.userId)
        await ctx.db.patch(board._id, { ownerId: successor.userId });
    }
  }
  await ctx.db.delete(membership._id);
}
async function drainSession(ctx: MutationCtx, userId: Id<'users'>) {
  const session = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .first();
  if (!session) return false;
  await ctx.db.patch(session._id, { expirationTime: Date.now() });
  const tokens = await ctx.db
    .query('authRefreshTokens')
    .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
    .take(100);
  for (const token of tokens) await ctx.db.delete(token._id);
  const verifiers = await ctx.db
    .query('authVerifiers')
    .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
    .take(100);
  for (const verifier of verifiers) await ctx.db.delete(verifier._id);
  if (tokens.length < 100 && verifiers.length < 100) await ctx.db.delete(session._id);
  return true;
}
export const revokeSessions = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user?.deleting && !user?.suspended) return null;
    if (await drainSession(ctx, userId))
      await ctx.scheduler.runAfter(0, internal.account.revokeSessions, { userId });
    return null;
  },
});
export const erase = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user?.deleting || (user.purgeAfter !== undefined && user.purgeAfter > Date.now()))
      return null;
    const next = async () => {
      await ctx.scheduler.runAfter(0, internal.account.erase, { userId });
      return null;
    };
    if (await drainSession(ctx, userId)) return next();
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .first();
    if (account) {
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .take(100);
      for (const code of codes) await ctx.db.delete(code._id);
      if (codes.length < 100) await ctx.db.delete(account._id);
      return next();
    }
    const photos = await ctx.db
      .query('photos')
      .withIndex('by_uploaderId', (q) => q.eq('uploaderId', userId))
      .take(10);
    if (photos.length) {
      for (const photo of photos) await deletePhoto(ctx, photo);
      return next();
    }
    const ratings = await ctx.db
      .query('ratings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(100);
    if (ratings.length) {
      for (const rating of ratings) await ctx.db.delete(rating._id);
      return next();
    }
    const wishes = await ctx.db
      .query('wishlist')
      .withIndex('by_creatorId', (q) => q.eq('creatorId', userId))
      .take(50);
    if (wishes.length) {
      for (const wish of wishes) {
        if (wish.visitId) await deleteVisit(ctx, wish.visitId);
        else await ctx.db.delete(wish._id);
      }
      return next();
    }
    const uploads = await ctx.db
      .query('uploads')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(50);
    if (uploads.length) {
      for (const upload of uploads) await ctx.db.delete(upload._id);
      return next();
    }
    const notes = await ctx.db
      .query('visits')
      .withIndex('by_notesAuthorId', (q) => q.eq('notesAuthorId', userId))
      .take(50);
    if (notes.length) {
      for (const visit of notes)
        await ctx.db.patch(visit._id, {
          notes: '',
          notesAuthorId: undefined,
          revision: (visit.revision ?? 0) + 1,
        });
      return next();
    }
    const visits = await ctx.db
      .query('visits')
      .withIndex('by_creatorId', (q) => q.eq('creatorId', userId))
      .take(50);
    if (visits.length) {
      for (const visit of visits) {
        await ctx.db.patch(visit._id, {
          creatorId: undefined,
          ...(visit.notesAuthorId === undefined ? { notes: '' } : {}),
          revision: (visit.revision ?? 0) + 1,
        });
        const snapshots = await ctx.db
          .query('reports')
          .withIndex('by_visitId', (q) => q.eq('visitId', visit._id))
          .take(100);
        for (const report of snapshots)
          await ctx.db.patch(report._id, { contentSummary: undefined });
      }
      return next();
    }
    const changes = await ctx.db
      .query('boardChanges')
      .withIndex('by_actorId', (q) => q.eq('actorId', userId))
      .take(100);
    if (changes.length) {
      for (const change of changes) await ctx.db.patch(change._id, { actorId: undefined });
      return next();
    }
    const requests = await ctx.db
      .query('joinRequests')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(100);
    if (requests.length) {
      for (const request of requests) await ctx.db.delete(request._id);
      return next();
    }
    const reviewed = await ctx.db
      .query('joinRequests')
      .withIndex('by_reviewedBy', (q) => q.eq('reviewedBy', userId))
      .take(100);
    if (reviewed.length) {
      for (const request of reviewed) await ctx.db.patch(request._id, { reviewedBy: undefined });
      return next();
    }
    const reports = await ctx.db
      .query('reports')
      .withIndex('by_reporterId', (q) => q.eq('reporterId', userId))
      .take(50);
    if (reports.length) {
      for (const report of reports) await ctx.db.delete(report._id);
      return next();
    }
    const targeted = await ctx.db
      .query('reports')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(50);
    if (targeted.length) {
      for (const report of targeted)
        await ctx.db.patch(report._id, {
          userId: undefined,
          reason: 'Reported account deleted.',
          contentSummary: undefined,
          note: undefined,
        });
      return next();
    }
    const outgoing = await ctx.db
      .query('blocks')
      .withIndex('by_blockerId', (q) => q.eq('blockerId', userId))
      .take(100);
    const incoming = await ctx.db
      .query('blocks')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(100);
    if (outgoing.length || incoming.length) {
      for (const block of [...outgoing, ...incoming]) await ctx.db.delete(block._id);
      return next();
    }
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (membership) {
      await depart(ctx, membership, true);
      return next();
    }
    const retainedFiles = await ctx.db
      .query('retainedFiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(20);
    if (retainedFiles.length) {
      for (const file of retainedFiles) {
        await ctx.storage.delete(file.storageId);
        await ctx.db.delete(file._id);
      }
      return next();
    }
    const batches = await ctx.db
      .query('deletions')
      .withIndex('by_actorId', (q) => q.eq('actorId', userId))
      .take(100);
    if (batches.length) {
      for (const batch of batches) await ctx.db.patch(batch._id, { actorId: undefined });
      return next();
    }
    for (const table of recoverableTables) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_deletedBy', (q) => q.eq('deletedBy', userId))
        .take(100);
      if (rows.length) {
        for (const row of rows) await ctx.db.patch(row._id, { deletedBy: undefined });
        return next();
      }
    }
    const departingUser = await ctx.db.get(userId);
    if (departingUser?.profilePhotoId) await ctx.storage.delete(departingUser.profilePhotoId);
    await ctx.db.delete(userId);
    return null;
  },
});

export const resumeDeletions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('users')
      .withIndex('by_deleting_and_purgeAfter', (q) =>
        q.eq('deleting', true).lte('purgeAfter', Date.now()),
      )
      .take(50);
    for (const user of pending)
      await ctx.scheduler.runAfter(0, internal.account.erase, { userId: user._id });
    return null;
  },
});
