import { safeRedirect } from '../redirect';
import Google from '@auth/core/providers/google';
import { convexAuth, createAccount } from '@convex-dev/auth/server';
import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import type { DataModel } from './_generated/dataModel';
import { verifyNativeGoogleIdentity } from '../googleIdentity';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    ConvexCredentials<DataModel>({
      id: 'google-native',
      authorize: async (credentials, ctx) => {
        const identity = await verifyNativeGoogleIdentity(
          credentials.idToken,
          credentials.nonce,
          process.env.AUTH_GOOGLE_ID,
        );
        // Native and web accounts are identified by Google's immutable subject.
        // Do not merge different Google identities merely because emails match.
        const profile = {
          name: identity.name,
          email: identity.email,
          emailVerified: false,
          ...(identity.image ? { image: identity.image } : {}),
        };
        // Share the exact Google subject/account namespace with the web OAuth flow.
        // Convex Auth atomically reuses the existing account and all its board data.
        const { user } = await createAccount(ctx, {
          provider: 'google',
          account: { id: identity.subject },
          profile,
          shouldLinkViaEmail: false,
        });
        return { userId: user._id };
      },
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      return safeRedirect(redirectTo, process.env.SITE_URL);
    },
  },
});
