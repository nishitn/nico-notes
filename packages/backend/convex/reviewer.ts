import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

// Operator-only retirement of the abandoned password-based demo identity.
// Preserve its fictional data, deny existing tokens immediately, and revoke sessions.
export const retirePasswordAccount = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'play-reviewer').eq('providerAccountId', 'play-reviewer'),
      )
      .unique();
    if (!account) return null;
    const google = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', account.userId).eq('provider', 'google'),
      )
      .first();
    if (google) throw new Error('Do not retire an identity linked to a Google account.');
    const user = await ctx.db.get(account.userId);
    if (user) {
      await ctx.db.patch(user._id, { suspended: true });
      await ctx.scheduler.runAfter(0, internal.account.revokeSessions, { userId: user._id });
    }
    return null;
  },
});
