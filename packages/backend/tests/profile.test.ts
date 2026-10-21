import { POLICY_VERSION } from '../legal';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import { MAX_PHOTO_BYTES } from '../shared';

const modules = import.meta.glob('../convex/**/*.*s');
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

async function setup() {
  const t = convexTest(schema, modules);
  const aliceId = await t.run((ctx) =>
    ctx.db.insert('users', {
      name: 'Alice',
      image: 'https://example.com/google.jpg',
      termsVersion: POLICY_VERSION,
    }),
  );
  const bobId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Bob', termsVersion: POLICY_VERSION }),
  );
  const alice = t.withIdentity({ subject: `${aliceId}|alice` });
  const bob = t.withIdentity({ subject: `${bobId}|bob` });
  const upload = () =>
    alice.fetch('/profile/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
  return { t, aliceId, bobId, alice, bob, upload };
}

afterEach(() => vi.useRealTimers());

describe('Profile photos', () => {
  it('uploads an owned photo, updates board avatars and preserves it after Google refreshes', async () => {
    const { t, alice, aliceId, upload } = await setup();
    const boardId = await alice.mutation(api.boards.create, {
      name: 'Board',
      description: '',
      accent: 'coral',
    });
    expect((await upload()).status).toBe(200);
    const user = await t.run((ctx) => ctx.db.get(aliceId));
    expect(user?.profilePhotoId).toBeDefined();
    const photoUrl = await t.run((ctx) => ctx.storage.getUrl(user!.profilePhotoId!));
    expect((await alice.query(api.boards.me, {}))?.image).toBe(photoUrl);
    expect((await alice.query(api.boards.get, { boardId })).members[0].image).toBe(photoUrl);
    await t.run((ctx) => ctx.db.patch(aliceId, { image: 'https://example.com/refreshed.jpg' }));
    expect((await alice.query(api.boards.me, {}))?.image).toBe(photoUrl);
  });

  it('replaces and removes only the signed-in users photo, including the Google fallback', async () => {
    const { t, alice, aliceId, bob, upload } = await setup();
    await upload();
    const first = (await t.run((ctx) => ctx.db.get(aliceId)))!.profilePhotoId!;
    await bob.mutation(api.profile.removePhoto, {});
    expect(await t.run((ctx) => ctx.db.system.get(first))).not.not.toBeNull();
    await upload();
    expect(await t.run((ctx) => ctx.db.system.get(first))).not.toBeNull();
    const second = (await t.run((ctx) => ctx.db.get(aliceId)))!.profilePhotoId!;
    await alice.mutation(api.profile.removePhoto, {});
    await alice.mutation(api.profile.removePhoto, {});
    expect(await t.run((ctx) => ctx.db.system.get(second))).not.toBeNull();
    expect((await alice.query(api.boards.me, {}))?.image).toBeUndefined();
    await t.run((ctx) => ctx.db.patch(aliceId, { image: 'https://example.com/new-google.jpg' }));
    expect((await alice.query(api.boards.me, {}))?.image).toBeUndefined();
    await upload();
    expect((await alice.query(api.boards.me, {}))?.image).toBeTruthy();
  });

  it('rejects unsigned, suspended and invalid uploads without changing the existing photo', async () => {
    const { t, alice, aliceId, upload } = await setup();
    await upload();
    const before = (await alice.query(api.boards.me, {}))?.image;
    expect(
      (
        await t.fetch('/profile/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: png,
        })
      ).status,
    ).toBe(401);
    for (const [contentType, body, length, status] of [
      ['image/svg+xml', '<svg/>', undefined, 415],
      ['image/png', '<html>not an image</html>', undefined, 415],
      ['image/png', png, String(MAX_PHOTO_BYTES + 1), 413],
      ['image/png', new Uint8Array(MAX_PHOTO_BYTES + 1), undefined, 413],
    ] as const) {
      const response = await alice.fetch('/profile/photo', {
        method: 'POST',
        headers: { 'Content-Type': contentType, ...(length ? { 'Content-Length': length } : {}) },
        body,
      });
      expect(response.status).toBe(status);
    }
    expect((await alice.query(api.boards.me, {}))?.image).toBe(before);
    expect(await t.run((ctx) => ctx.db.system.query('_storage').collect())).toHaveLength(1);
    await t.run((ctx) => ctx.db.patch(aliceId, { suspended: true }));
    expect((await upload()).ok).toBe(false);
    await expect(alice.mutation(api.profile.removePhoto, {})).rejects.toThrow(/suspended/);
  });

  it('keeps referenced profile photos during orphan cleanup and erases them with the account', async () => {
    vi.useFakeTimers();
    const { t, alice, aliceId, upload } = await setup();
    await upload();
    const photoId = (await t.run((ctx) => ctx.db.get(aliceId)))!.profilePhotoId!;
    const orphan = await t.run((ctx) => ctx.storage.store(new Blob([png], { type: 'image/png' })));
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    await t.mutation(internal.cleanup.orphanStorage, { cursor: null });
    expect(await t.run((ctx) => ctx.db.system.get(photoId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(orphan))).toBeNull();
    await alice.mutation(api.account.remove, { confirmation: 'DELETE' });
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.system.get(photoId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(aliceId))).toBeNull();
  });
});
