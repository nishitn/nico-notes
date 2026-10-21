import { POLICY_VERSION } from '../legal';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

const modules = import.meta.glob('../convex/**/*.*s');
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    alice: await ctx.db.insert('users', { name: 'Alice', termsVersion: POLICY_VERSION }),
    bob: await ctx.db.insert('users', { name: 'Bob', termsVersion: POLICY_VERSION }),
    moderator: await ctx.db.insert('users', {
      name: 'Safety',
      email: 'nishit.nagar1@gmail.com',
      emailVerificationTime: Date.now(),
      termsVersion: POLICY_VERSION,
    }),
  }));
  await t.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId: ids.moderator,
      provider: 'google',
      providerAccountId: 'verified-moderator-sub',
    }),
  );
  const alice = t.withIdentity({ subject: `${ids.alice}|a` });
  const bob = t.withIdentity({ subject: `${ids.bob}|b` });
  const moderator = t.withIdentity({ subject: `${ids.moderator}|m` });
  const boardId = await alice.mutation(api.boards.create, {
    name: 'Shared',
    description: '',
    accent: 'coral',
  });
  const invite = await alice.mutation(api.boards.createInvitation, { boardId });
  await bob.mutation(api.boards.requestToJoin, { code: invite.token });
  const [request] = await alice.query(api.boards.pendingRequests, { boardId });
  await alice.mutation(api.boards.acceptRequest, { requestId: request._id });
  const visitId = await alice.mutation(api.visits.create, {
    boardId,
    title: 'Cafe',
    place: 'Street',
    date: '2026-10-20',
    notes: 'Private authored note',
    showDishes: true,
  });
  return { t, ids, alice, bob, moderator, boardId, visitId, invite };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Release privacy and safety', () => {
  it('shows approval only while the applicant still has board access', async () => {
    const { alice, bob, boardId, ids } = await setup();
    expect((await bob.query(api.boards.myOutgoingRequests, {}))[0].status).toBe('accepted');
    await alice.mutation(api.boards.removeMember, { boardId, userId: ids.bob });
    expect(await bob.query(api.boards.myOutgoingRequests, {})).toEqual([]);
  });
  it('enforces current terms at the write boundary and permits account deletion without accepting', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.db.insert('users', { name: 'New member' }));
    const user = t.withIdentity({ subject: `${id}|new` });
    const fields = { name: 'Board', description: '', accent: 'coral' as const };
    await expect(user.mutation(api.boards.create, fields)).rejects.toThrow(/accept/);
    await expect(user.mutation(api.safety.acceptTerms, { version: 'old' })).rejects.toThrow(
      /latest/,
    );
    await user.mutation(api.safety.acceptTerms, { version: POLICY_VERSION });
    expect((await user.query(api.account.status, {})).termsVersion).toBe(POLICY_VERSION);
    await user.mutation(api.boards.create, fields);
    await t.run((ctx) => ctx.db.patch(id, { termsVersion: undefined }));
    await user.mutation(api.account.remove, { confirmation: 'DELETE' });
    expect((await user.query(api.account.status, {})).deleting).toBe(true);
    await expect(user.query(api.boards.me, {})).rejects.toThrow(/no longer/);
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('lets a member report an admin, restricts the operator queue and exposes only reported photos', async () => {
    const { t, alice, bob, moderator, ids, boardId, visitId } = await setup();
    const ticket = await alice.mutation(api.photos.reserve, { visitId, caption: 'Reported photo' });
    const upload = await alice.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    const { photoId } = (await upload.json()) as { photoId: Id<'photos'> };
    expect((await moderator.fetch(`/photos/file?id=${photoId}`)).status).toBe(403);
    const reportId = await bob.mutation(api.safety.report, {
      boardId,
      visitId,
      photoId,
      userId: ids.alice,
      reason: 'This admin uploaded abusive content.',
    });
    await expect(
      bob.query(api.safety.reports, { paginationOpts: { cursor: null, numItems: 10 } }),
    ).rejects.toThrow(/safety team/);
    expect(
      (
        await moderator.query(api.safety.reports, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page[0].contentSummary,
    ).toContain('Private authored note');
    expect((await moderator.fetch(`/photos/file?id=${photoId}`)).status).toBe(200);
    await moderator.mutation(api.safety.resolveReport, {
      reportId,
      action: 'remove-content',
      note: 'Removed after review.',
    });
    expect((await t.run((ctx) => ctx.db.get(photoId)))?.deletedAt).toBeDefined();
    expect(
      (
        await moderator.query(api.safety.reports, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toHaveLength(0);
  });

  it('blocks existing shared boards and rejects rejoining in either direction, with reversible blocking', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, ids, boardId } = await setup();
    const code = (await alice.query(api.boards.get, { boardId })).board.inviteCode!;
    await bob.mutation(api.safety.block, { boardId, userId: ids.alice });
    await expect(bob.query(api.boards.get, { boardId })).rejects.toThrow(/access|block/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await bob.query(api.boards.list, { paginationOpts: { cursor: null, numItems: 10 } })).page,
    ).toHaveLength(0);
    await expect(bob.mutation(api.boards.requestToJoin, { code })).rejects.toThrow(/blocked/);
    expect((await alice.query(api.boards.get, { boardId })).members).toHaveLength(1);
    expect((await bob.query(api.safety.blocked, {}))[0].userId).toBe(ids.alice);
    await bob.mutation(api.safety.unblock, { userId: ids.alice });
    await bob.mutation(api.boards.requestToJoin, { code });
    const [request] = await alice.query(api.boards.pendingRequests, { boardId });
    await alice.mutation(api.boards.acceptRequest, { requestId: request._id });
    expect((await bob.query(api.boards.get, { boardId })).members).toHaveLength(2);
  });

  it('suspends reported users without giving the reporter moderator powers', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, moderator, ids, boardId } = await setup();
    const reportId = await bob.mutation(api.safety.report, {
      boardId,
      userId: ids.alice,
      reason: 'Repeated targeted harassment from this account.',
    });
    await expect(
      bob.mutation(api.safety.resolveReport, { reportId, action: 'suspend-user', note: '' }),
    ).rejects.toThrow(/safety team/);
    await moderator.mutation(api.safety.resolveReport, {
      reportId,
      action: 'suspend-user',
      note: 'Reviewed.',
    });
    expect((await alice.query(api.account.status, {})).suspended).toBe(true);
    await expect(alice.query(api.boards.get, { boardId })).rejects.toThrow(/suspended/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('erases personal contributions and auth records while retaining other members contributions', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, ids, boardId, visitId } = await setup();
    await bob.mutation(api.ratings.save, {
      visitId,
      kind: 'overall',
      targetId: visitId,
      score: 9,
      note: 'Bob note',
    });
    await alice.mutation(api.ratings.save, {
      visitId,
      kind: 'overall',
      targetId: visitId,
      score: 8,
      note: 'Alice note',
    });
    const ticket = await alice.mutation(api.photos.reserve, { visitId, caption: 'Own photo' });
    await alice.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    await alice.mutation(api.wishlist.add, {
      boardId,
      title: 'Personal wish',
      notes: 'My private note',
    });
    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert('authSessions', {
        userId: ids.alice,
        expirationTime: Date.now() + 100000,
      });
      for (let i = 0; i < 105; i++)
        await ctx.db.insert('authRefreshTokens', {
          sessionId,
          expirationTime: Date.now() + 100000,
        });
      await ctx.db.insert('authVerifiers', { sessionId, signature: 'test' });
      const accountId = await ctx.db.insert('authAccounts', {
        userId: ids.alice,
        provider: 'google',
        providerAccountId: 'a',
      });
      await ctx.db.insert('authVerificationCodes', {
        accountId,
        provider: 'google',
        code: 'test',
        expirationTime: Date.now() + 100000,
      });
    });
    await alice.mutation(api.account.remove, { confirmation: 'DELETE' });
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(ids.alice))).toBeNull();
    const detail = await bob.query(api.visits.get, { visitId });
    expect(detail.visit.creatorId).toBeUndefined();
    expect(detail.visit.notes).toBe('');
    expect(detail.ratings).toHaveLength(1);
    expect(detail.ratings[0].note).toBe('Bob note');
    expect(detail.photos).toHaveLength(0);
    expect(detail.board.ownerId).toBe(ids.bob);
    expect(detail.isAdmin).toBe(true);
    expect(
      (
        await bob.query(api.wishlist.list, {
          boardId,
          paginationOpts: { cursor: null, numItems: 50 },
        })
      ).page,
    ).toHaveLength(0);
    expect(
      await t.run(async (ctx) => ({
        sessions: await ctx.db.query('authSessions').collect(),
        tokens: await ctx.db.query('authRefreshTokens').collect(),
        accounts: await ctx.db
          .query('authAccounts')
          .withIndex('userIdAndProvider', (q) => q.eq('userId', ids.alice))
          .collect(),
        codes: await ctx.db.query('authVerificationCodes').collect(),
        verifiers: await ctx.db.query('authVerifiers').collect(),
      })),
    ).toEqual({ sessions: [], tokens: [], accounts: [], codes: [], verifiers: [] });
  });

  it('deletes notes by their latest author while retaining a collaborators replacement note', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, ids, boardId, visitId } = await setup();
    await bob.mutation(api.visits.update, {
      visitId,
      title: 'Cafe',
      place: 'Street',
      date: '2026-10-20',
      notes: 'Bob replacement',
      showDishes: true,
      expectedRevision: 0,
    });
    const otherVisit = await bob.mutation(api.visits.create, {
      boardId,
      title: 'Another cafe',
      place: '',
      date: '',
      notes: '',
      showDishes: false,
    });
    await alice.mutation(api.visits.update, {
      visitId: otherVisit,
      title: 'Another cafe',
      place: '',
      date: '',
      notes: 'Alice contribution',
      showDishes: false,
      expectedRevision: 0,
    });
    await alice.mutation(api.account.remove, { confirmation: 'DELETE' });
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await bob.query(api.visits.get, { visitId })).visit.notes).toBe('Bob replacement');
    const other = (await bob.query(api.visits.get, { visitId: otherVisit })).visit;
    expect(other.notes).toBe('');
    expect(other.creatorId).toBe(ids.bob);
  });

  it('deletes a solo board when its only member deletes their account', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, ids, boardId } = await setup();
    await bob.mutation(api.boards.leave, { boardId });
    await alice.mutation(api.account.remove, { confirmation: 'DELETE' });
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(boardId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(ids.alice))).toBeNull();
  });
});

describe('Release data integrity', () => {
  it('drains every board-owned table beyond a single batch', async () => {
    vi.useFakeTimers();
    const { t, alice, ids, boardId } = await setup();
    await alice.mutation(api.wishlist.add, { boardId, title: 'Delete me', notes: 'Private note' });
    await t.run(async (ctx) => {
      for (let i = 0; i < 125; i++)
        await ctx.db.insert('joinRequests', {
          boardId,
          userId: ids.alice,
          status: 'rejected',
          createdAt: i,
        });
    });
    await t.run((ctx) => ctx.db.patch(boardId, { deleting: true }));
    await t.mutation(internal.cleanup.board, { boardId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(boardId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query('wishlist').collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query('joinRequests').collect())).toHaveLength(0);
  });
  it('returns the original cloud photo after response loss and reservation cleanup', async () => {
    const { t, alice, bob, visitId } = await setup();
    const ticket = await alice.mutation(api.photos.reserve, { visitId, caption: 'One photo' });
    const send = () =>
      alice.fetch(`/photos/upload?ticket=${ticket}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: png,
      });
    const original = (await (await send()).json()) as { photoId: Id<'photos'> };
    expect(await (await send()).json()).toEqual(original);
    await t.run((ctx) => ctx.db.delete(ticket));
    expect(await alice.query(api.photos.uploadProvider, { uploadId: ticket })).toBe('convex');
    expect(await (await send()).json()).toEqual(original);
    expect((await alice.query(api.visits.get, { visitId })).photos).toHaveLength(1);
    expect(
      (
        await bob.fetch(`/photos/upload?ticket=${ticket}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: png,
        })
      ).status,
    ).toBe(403);
    expect(await t.run((ctx) => ctx.db.system.query('_storage').collect())).toHaveLength(1);
  });
  it('rejects stale visit revisions without overwriting the first saved edit', async () => {
    const { alice, bob, visitId } = await setup();
    const fields = {
      visitId,
      title: 'Cafe',
      place: 'Street',
      date: '2026-10-20',
      notes: 'First change',
      showDishes: true,
      expectedRevision: 0,
    };
    await alice.mutation(api.visits.update, fields);
    await expect(
      bob.mutation(api.visits.update, { ...fields, notes: 'Stale edit' }),
    ).rejects.toThrow(/changed while/);
    expect((await bob.query(api.visits.get, { visitId })).visit.notes).toBe('First change');
  });
  it('edits wishlist safely and removes it only when logging successfully and explicitly selected', async () => {
    const { t, alice, boardId } = await setup();
    const id = await alice.mutation(api.wishlist.add, {
      boardId,
      title: 'Old',
      location: { latitude: 12, longitude: 77 },
      googlePlaceId: 'google-id',
    });
    await expect(
      alice.mutation(api.wishlist.update, { id, title: 'New', link: 'javascript:bad' }),
    ).rejects.toThrow(/http/);
    await alice.mutation(api.wishlist.update, {
      id,
      title: 'New',
      notes: 'Edited',
      link: 'https://example.com',
    });
    const wish = await t.run((ctx) => ctx.db.get(id));
    expect(wish?.location).toBeUndefined();
    expect(wish?.title).toBe('Saved Google place');
    const fields = {
      boardId,
      wishlistId: id,
      keepWishlist: false,
      title: 'Cafe',
      date: 'impossible',
      place: '',
      notes: '',
      showDishes: false,
    };
    await expect(alice.mutation(api.visits.create, fields)).rejects.toThrow(/date/);
    expect(await t.run((ctx) => ctx.db.get(id))).not.toBeNull();
    await alice.mutation(api.visits.create, { ...fields, date: '2026-10-20' });
    expect((await t.run((ctx) => ctx.db.get(id)))?.deletedAt).toBeDefined();
  });
  it('backfills bounded counts and maintains them transactionally on create/delete', async () => {
    vi.useFakeTimers();
    const { t, alice, boardId, visitId } = await setup();
    expect((await alice.query(api.boards.summaries, {}))[0].visitCount).toBe(1);
    await t.run((ctx) => ctx.db.patch(boardId, { visitCount: undefined }));
    expect((await alice.query(api.boards.summaries, {}))[0].visitCount).toBeNull();
    await alice.mutation(api.boards.ensureCounts, { boardId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await alice.query(api.boards.summaries, {}))[0].visitCount).toBe(1);
    await alice.mutation(api.visits.remove, { visitId });
    expect((await alice.query(api.boards.summaries, {}))[0].visitCount).toBe(0);
  });
});
