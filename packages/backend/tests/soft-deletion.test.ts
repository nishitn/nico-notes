import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { POLICY_VERSION } from '../legal';
import { ACCOUNT_RECOVERY_MS } from '../convex/softDeletion';

const modules = import.meta.glob('../convex/**/*.*s');
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const paginationOpts = { cursor: null, numItems: 50 };
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async (ctx) =>
    Promise.all(
      ['Alice', 'Bob'].map((name) =>
        ctx.db.insert('users', { name, termsVersion: POLICY_VERSION }),
      ),
    ),
  );
  const alice = t.withIdentity({ subject: `${aliceId}|alice` });
  const bob = t.withIdentity({ subject: `${bobId}|bob` });
  const boardId = await alice.mutation(api.boards.create, {
    name: 'Journal',
    description: '',
    accent: 'coral',
  });
  await t.run((ctx) => ctx.db.insert('memberships', { boardId, userId: bobId, role: 'member' }));
  const fields = {
    boardId,
    title: 'Cafe',
    place: 'Street',
    date: '2026-10-21',
    notes: 'Alice note',
    showDishes: true,
  };
  const visitId = await alice.mutation(api.visits.create, fields);
  const addPhoto = async () => {
    const uploadId = await alice.mutation(api.photos.reserve, { visitId, caption: 'Photo' });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([png], { type: 'image/png' })),
    );
    const photoId = await alice.mutation(internal.photos.finishUpload, {
      uploadId,
      storageId,
      contentType: 'image/png',
    });
    return { storageId, photoId };
  };
  return { t, aliceId, bobId, alice, bob, boardId, visitId, fields, addPhoto };
}
afterEach(() => vi.useRealTimers());

describe('Internal support recovery', () => {
  it('preserves original content and images, merges a recreated place, and respects independent photo deletion', async () => {
    const { t, alice, bob, boardId, visitId, fields, addPhoto } = await setup();
    const removed = await addPhoto();
    const retained = await addPhoto();
    await alice.mutation(api.photos.remove, { photoId: removed.photoId });
    await alice.mutation(api.visits.remove, { visitId });
    const archived = (await t.run((ctx) => ctx.db.get(visitId)))!;
    expect(archived.deletedAt).toBeDefined();
    expect(await t.run((ctx) => ctx.db.system.get(retained.storageId))).not.toBeNull();
    expect((await bob.fetch(`/photos/file?id=${retained.photoId}`)).status).toBe(403);
    expect((await bob.query(api.visits.list, { boardId, paginationOpts })).page).toEqual([]);
    const { boardId: ignoredBoard, ...updateFields } = fields;
    void ignoredBoard;
    await expect(alice.mutation(api.visits.update, { ...updateFields, visitId })).rejects.toThrow(
      /available/,
    );
    const replacementId = await alice.mutation(api.visits.create, {
      ...fields,
      date: '2026-10-22',
    });
    const canonical = (await alice.query(api.visits.get, { visitId: replacementId })).visit.placeId;
    await t.mutation(internal.recovery.restore, {
      deletionId: archived.deletionId!,
      reason: 'Verified ticket 1001',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const restored = await bob.query(api.visits.get, { visitId });
    expect(restored.visit._id).toBe(visitId);
    expect(restored.visit.placeId).toBe(canonical);
    expect(restored.photos.map((photo) => photo._id)).toEqual([retained.photoId]);
    expect((await bob.fetch(`/photos/file?id=${retained.photoId}`)).status).toBe(200);
    expect((await bob.fetch(`/photos/file?id=${removed.photoId}`)).status).toBe(403);
    expect((await bob.query(api.boards.summaries, {}))[0].visitCount).toBe(2);
  });

  it('hides an entire board and restores it with the same child IDs', async () => {
    const { t, alice, bob, boardId, visitId, addPhoto } = await setup();
    const { photoId } = await addPhoto();
    await alice.mutation(api.boards.remove, { boardId });
    const board = (await t.run((ctx) => ctx.db.get(boardId)))!;
    expect(await bob.query(api.boards.summaries, {})).toEqual([]);
    await expect(bob.query(api.visits.get, { visitId })).rejects.toThrow(/available/);
    expect((await bob.fetch(`/photos/file?id=${photoId}`)).status).toBe(403);
    await t.mutation(internal.recovery.restore, {
      deletionId: board.deletionId!,
      reason: 'Verified ticket 1002',
    });
    expect((await bob.query(api.visits.get, { visitId })).visit._id).toBe(visitId);
    expect((await bob.fetch(`/photos/file?id=${photoId}`)).status).toBe(200);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await bob.query(api.boards.summaries, {}))[0].visitCount).toBe(1);
  });

  it('restores a removed dish and its ratings atomically, and refuses to overwrite a newer rating', async () => {
    const { t, alice, visitId } = await setup();
    const dishId = await alice.mutation(api.items.saveDish, {
      visitId,
      name: 'Dinner',
      description: '',
    });
    const rating = { visitId, kind: 'dish' as const, targetId: dishId, score: 8, note: 'Original' };
    await alice.mutation(api.ratings.save, rating);
    await alice.mutation(api.items.remove, { visitId, target: dishId, confirmed: true });
    const dish = (await t.run((ctx) => ctx.db.get(dishId)))!;
    expect((await alice.query(api.visits.get, { visitId })).dishes).toEqual([]);
    await t.mutation(internal.recovery.restore, {
      deletionId: dish.deletionId!,
      reason: 'Verified ticket 1003',
    });
    expect((await alice.query(api.visits.get, { visitId })).ratings[0].score).toBe(8);
    await alice.mutation(api.ratings.save, { ...rating, score: null });
    const removed = await t.run((ctx) =>
      ctx.db
        .query('ratings')
        .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
        .first(),
    );
    await alice.mutation(api.ratings.save, { ...rating, score: 9 });
    await expect(
      t.mutation(internal.recovery.restore, {
        deletionId: removed!.deletionId!,
        reason: 'Verified ticket 1004',
      }),
    ).rejects.toThrow(/newer rating/);
    expect((await alice.query(api.visits.get, { visitId })).ratings[0].score).toBe(9);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('refuses a board recovery that would reunite blocked accounts', async () => {
    const { t, alice, aliceId, bobId, boardId } = await setup();
    await alice.mutation(api.boards.remove, { boardId });
    await t.run((ctx) => ctx.db.insert('blocks', { blockerId: aliceId, userId: bobId }));
    const board = (await t.run((ctx) => ctx.db.get(boardId)))!;
    await expect(
      t.mutation(internal.recovery.restore, {
        deletionId: board.deletionId!,
        reason: 'Verified ticket 1005',
      }),
    ).rejects.toThrow(/blocked/);
    expect((await t.run((ctx) => ctx.db.get(boardId)))?.deletedAt).toBeDefined();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('recovers an account only during the window and requires a new valid sign-in session', async () => {
    const { t, alice, aliceId, boardId } = await setup();
    await alice.mutation(api.account.remove, { confirmation: 'DELETE' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(aliceId)))?.deleting).toBe(true);
    await expect(alice.query(api.boards.get, { boardId })).rejects.toThrow(/no longer/);
    await t.mutation(internal.account.erase, { userId: aliceId });
    expect(await t.run((ctx) => ctx.db.get(aliceId))).not.toBeNull();
    await t.mutation(internal.recovery.restoreAccount, {
      userId: aliceId,
      reason: 'Verified ticket 1006',
    });
    await expect(alice.query(api.boards.get, { boardId })).rejects.toThrow(/Sign in again/);
    await expect(
      alice.mutation(api.boards.update, {
        boardId,
        name: 'Denied',
        description: '',
        accent: 'coral',
      }),
    ).rejects.toThrow(/Sign in again/);
    const sessionId = await t.run((ctx) =>
      ctx.db.insert('authSessions', { userId: aliceId, expirationTime: Date.now() + 3_600_000 }),
    );
    const fresh = t.withIdentity({ subject: `${aliceId}|${sessionId}` });
    expect((await fresh.query(api.boards.get, { boardId })).board.name).toBe('Journal');
    await vi.advanceTimersByTimeAsync(ACCOUNT_RECOVERY_MS + 1);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(aliceId)))?.deleting).toBe(false);
  });

  it('permanently erases archived contributions and retained profile images when the account window expires', async () => {
    const { t, alice, aliceId, bob, visitId, addPhoto } = await setup();
    const { photoId, storageId } = await addPhoto();
    await alice.mutation(api.photos.remove, { photoId });
    await alice.fetch('/profile/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    const profileId = (await t.run((ctx) => ctx.db.get(aliceId)))!.profilePhotoId!;
    await alice.mutation(api.profile.removePhoto, {});
    await alice.mutation(api.account.remove, { confirmation: 'DELETE' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(profileId))).not.toBeNull();
    await vi.advanceTimersByTimeAsync(ACCOUNT_RECOVERY_MS + 1);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(aliceId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(photoId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(profileId))).toBeNull();
    expect((await bob.query(api.visits.get, { visitId })).visit.notes).toBe('');
    await expect(
      t.mutation(internal.recovery.restoreAccount, {
        userId: aliceId,
        reason: 'Verified ticket 1007',
      }),
    ).rejects.toThrow(/window/);
  });

  it('restores a retained profile photo without exposing an archive to app clients', async () => {
    const { t, alice } = await setup();
    await alice.fetch('/profile/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    const original = await alice.query(api.boards.me, {});
    await alice.mutation(api.profile.removePhoto, {});
    const archive = (await t.run((ctx) => ctx.db.query('retainedFiles').first()))!;
    expect((await alice.query(api.boards.me, {})).image).toBeUndefined();
    await t.mutation(internal.recovery.restoreProfilePhoto, {
      fileId: archive._id as Id<'retainedFiles'>,
      reason: 'Verified ticket 1008',
    });
    expect((await alice.query(api.boards.me, {})).image).toBe(original.image);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
