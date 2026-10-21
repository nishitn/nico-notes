import { describe, expect, it } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import { api } from '../convex/_generated/api';
import schema from '../convex/schema';
import { POLICY_VERSION } from '../legal';

const modules = import.meta.glob('../convex/**/*.*s');

async function setup() {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => ctx.db.insert('users', { name: 'New member' }));
  return { t, id, user: t.withIdentity({ subject: `${id}|terms-test` }) };
}

describe('server-published terms policy', () => {
  it('publishes the required version without recording acceptance', async () => {
    const { t, id, user } = await setup();
    const status = await user.query(api.account.status, {});
    expect(status.requiredTermsVersion).toBe(POLICY_VERSION);
    expect(status.termsVersion).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(id)))?.termsAcceptedAt).toBeUndefined();
  });

  it('accepts the published version even when the client has a different bundled version', async () => {
    const { user } = await setup();
    const bundledVersion = 'old-client-policy';
    const { requiredTermsVersion } = await user.query(api.account.status, {});
    expect(requiredTermsVersion).not.toBe(bundledVersion);
    await user.mutation(api.safety.acceptTerms, { version: requiredTermsVersion });
    expect((await user.query(api.account.status, {})).termsVersion).toBe(requiredTermsVersion);
    await expect(
      user.mutation(api.boards.create, { name: 'Board', description: '', accent: 'coral' }),
    ).resolves.toBeDefined();
  });

  it('still rejects an outdated policy and leaves the write gate closed', async () => {
    const { user } = await setup();
    await expect(
      user.mutation(api.safety.acceptTerms, { version: 'old-client-policy' }),
    ).rejects.toThrow(/latest terms/);
    expect((await user.query(api.account.status, {})).termsVersion).toBeNull();
    await expect(
      user.mutation(api.boards.create, { name: 'Board', description: '', accent: 'coral' }),
    ).rejects.toThrow(/accept the current terms/);
  });
});
