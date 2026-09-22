import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async redirect({ redirectTo }) {
      const allowed = [
        process.env.SITE_URL,
        ...(process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) ?? []),
      ].filter((s): s is string => Boolean(s));

      for (const origin of allowed) {
        if (redirectTo.startsWith(origin)) {
          return redirectTo;
        }
      }
      return process.env.SITE_URL ?? redirectTo;
    },
  },
});
