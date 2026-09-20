// Internal-only fixtures for the explicitly enabled development browser tests.
// No token-minting or test sign-in endpoint is exposed to the frontend.
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

function enabled() {
  if (process.env.DATE_NOTES_E2E_ENABLED !== 'true')
    throw new Error('Browser-test fixtures are disabled.');
}
export const createUsers = internalMutation({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id('users'),
      sessionId: v.id('authSessions'),
      refreshTokenId: v.id('authRefreshTokens'),
      name: v.string(),
    }),
  ),
  handler: async (ctx) => {
    enabled();
    const result = [];
    for (const name of [
      'Alex · browser test',
      'Sam · browser test',
      'Taylor · browser test',
      'Jordan · browser test',
    ]) {
      const userId = await ctx.db.insert('users', { name });
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 60 * 60 * 1000,
      });
      const refreshTokenId = await ctx.db.insert('authRefreshTokens', {
        sessionId,
        expirationTime: Date.now() + 60 * 60 * 1000,
      });
      result.push({ userId, sessionId, refreshTokenId, name });
    }
    return result;
  },
});
export const removeUsers = internalMutation({
  args: { userIds: v.array(v.id('users')) },
  returns: v.null(),
  handler: async (ctx, { userIds }) => {
    enabled();
    for (const userId of userIds) {
      const user = await ctx.db.get(userId);
      if (!user?.name?.endsWith(' · browser test'))
        throw new Error('Only generated test users can be cleaned up.');
      const memberships = await ctx.db
        .query('memberships')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(100);
      for (const membership of memberships) {
        const board = await ctx.db.get(membership.boardId);
        if (board?.ownerId === userId) {
          await ctx.db.patch(board._id, { deleting: true });
          await ctx.scheduler.runAfter(0, internal.cleanup.board, { boardId: board._id });
        }
        await ctx.db.delete(membership._id);
      }
      const sessions = await ctx.db
        .query('authSessions')
        .withIndex('userId', (q) => q.eq('userId', userId))
        .take(100);
      for (const session of sessions) {
        const refreshTokens = await ctx.db
          .query('authRefreshTokens')
          .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
          .take(100);
        for (const token of refreshTokens) await ctx.db.delete(token._id);
        await ctx.db.delete(session._id);
      }
      await ctx.db.delete(userId);
    }
    return null;
  },
});
