import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import { POLICY_VERSION } from '../legal';

const modules = import.meta.glob('../convex/**/*.*s');
afterEach(() => vi.useRealTimers());

describe('Google-only authentication', () => {
  it('rejects all flows from the retired password provider', async () => {
    const t = convexTest(schema, modules);
    for (const flow of ['signIn', 'signUp', 'reset', 'reset-verification']) {
      await expect(
        t.action(api.auth.signIn, {
          provider: 'play-reviewer',
          params: { flow, email: 'play-reviewer', password: 'old-test-password' },
        }),
      ).rejects.toThrow();
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query('users').take(10)).toHaveLength(0);
      expect(await ctx.db.query('authSessions').take(10)).toHaveLength(0);
    });
  });

  it('retires only the legacy identity, revokes sessions and preserves its data', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { userId, otherId, boardId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        name: 'Old demo',
        termsVersion: POLICY_VERSION,
      });
      const otherId = await ctx.db.insert('users', { name: 'Google user' });
      await ctx.db.insert('authAccounts', {
        provider: 'play-reviewer',
        providerAccountId: 'play-reviewer',
        userId,
      });
      await ctx.db.insert('authAccounts', {
        provider: 'google',
        providerAccountId: 'other-subject',
        userId: otherId,
      });
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 3600000,
      });
      await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 3600000 });
      const boardId = await ctx.db.insert('boards', {
        name: 'Fictional demo',
        description: '',
        accent: 'coral',
        ownerId: userId,
        deleting: false,
      });
      await ctx.db.insert('memberships', { boardId, userId, role: 'admin' });
      return { userId, otherId, boardId };
    });
    await t.mutation(internal.reviewer.retirePasswordAccount, {});
    const oldIdentity = t.withIdentity({ subject: `${userId}|old-session` });
    await expect(oldIdentity.query(api.boards.get, { boardId })).rejects.toThrow();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(userId))?.suspended).toBe(true);
      expect((await ctx.db.get(otherId))?.suspended).toBeUndefined();
      expect(await ctx.db.get(boardId)).not.toBeNull();
      expect(await ctx.db.query('authSessions').take(10)).toHaveLength(0);
      expect(await ctx.db.query('authRefreshTokens').take(10)).toHaveLength(0);
    });
  });

  it('refuses to suspend an identity that has been linked to Google', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Linked identity' });
      for (const provider of ['play-reviewer', 'google']) {
        await ctx.db.insert('authAccounts', {
          provider,
          providerAccountId: 'play-reviewer',
          userId,
        });
      }
      return userId;
    });
    await expect(t.mutation(internal.reviewer.retirePasswordAccount, {})).rejects.toThrow('Google');
    await t.run(async (ctx) => {
      expect((await ctx.db.get(userId))?.suspended).toBeUndefined();
    });
  });
});
