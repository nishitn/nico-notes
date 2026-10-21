import { POLICY_VERSION } from '../legal';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import { exportPKCS8, generateKeyPair } from 'jose';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { verifyNativeGoogleIdentity } from '../googleIdentity';

vi.mock('../googleIdentity', () => ({ verifyNativeGoogleIdentity: vi.fn() }));
const modules = import.meta.glob('../convex/**/*.*s');
let signingKey: string;
beforeAll(async () => {
  signingKey = await exportPKCS8(
    (await generateKeyPair('RS256', { extractable: true })).privateKey,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
function setup() {
  vi.stubEnv('JWT_PRIVATE_KEY', signingKey);
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.example');
  vi.mocked(verifyNativeGoogleIdentity).mockResolvedValue({
    subject: 'stable-google-sub',
    email: 'person@example.com',
    name: 'Person',
    image: undefined,
  });
  return convexTest(schema, modules);
}

describe('native Google session and account continuity', () => {
  it('exposes only the public client ID and readiness in sign-in configuration', async () => {
    const t = setup();
    vi.stubEnv('AUTH_GOOGLE_ID', 'public-client.apps.googleusercontent.com');
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'server-secret');
    vi.stubEnv('JWKS', 'server-signing-keys');
    expect(await t.query(api.photos.configuration, {})).toEqual({
      googleReady: true,
      googleClientId: 'public-client.apps.googleusercontent.com',
      supportEmail: 'nishit.nagar1@gmail.com',
      localStorageReady: false,
    });
  });
  it('opens a Convex session for the existing Google account, retaining its boards', async () => {
    const t = setup();
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', {
        termsVersion: POLICY_VERSION,
        name: 'Existing member',
        email: 'person@example.com',
      });
      await ctx.db.insert('authAccounts', {
        provider: 'google',
        providerAccountId: 'stable-google-sub',
        userId: id,
      });
      return id;
    });
    const signedIn = t.withIdentity({ subject: `${userId}|existing-session` });
    const boardId = await signedIn.mutation(api.boards.create, {
      name: 'Our board',
      description: '',
      accent: 'coral',
    });
    const result = await t.action(api.auth.signIn, {
      provider: 'google-native',
      params: { idToken: 'verified-by-boundary', nonce: 'n'.repeat(43) },
    });
    expect(result.tokens).toBeTruthy();
    expect(result.redirect).toBeUndefined();
    await t.run(async (ctx) => {
      expect(await ctx.db.query('users').take(10)).toHaveLength(1);
      expect((await ctx.db.query('authSessions').take(10))[0].userId).toBe(userId);
    });
    expect((await signedIn.query(api.boards.get, { boardId })).board.name).toBe('Our board');
  });
  it('does not merge a different Google subject by matching an existing email', async () => {
    const t = setup();
    const existingId = await t.run((ctx) =>
      ctx.db.insert('users', {
        termsVersion: POLICY_VERSION,
        name: 'Someone else',
        email: 'person@example.com',
        emailVerificationTime: Date.now(),
      }),
    );
    await t.action(api.auth.signIn, {
      provider: 'google-native',
      params: { idToken: 'verified-by-boundary', nonce: 'n'.repeat(43) },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query('users').take(10)).toHaveLength(2);
      expect((await ctx.db.query('authAccounts').take(10))[0].userId).not.toBe(existingId);
    });
  });
  it('never creates a user or session when Google token verification fails', async () => {
    const t = setup();
    vi.mocked(verifyNativeGoogleIdentity).mockRejectedValue(new Error('Invalid Google token'));
    await expect(
      t.action(api.auth.signIn, {
        provider: 'google-native',
        params: { idToken: 'forged', nonce: 'n'.repeat(43) },
      }),
    ).rejects.toThrow();
    await t.run(async (ctx) => {
      expect(await ctx.db.query('users').take(10)).toHaveLength(0);
      expect(await ctx.db.query('authSessions').take(10)).toHaveLength(0);
    });
  });
});
