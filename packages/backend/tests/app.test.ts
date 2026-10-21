import { POLICY_VERSION } from '../legal';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { average, INVITE_LIFETIME, MAX_PHOTO_BYTES } from '../shared';

const modules = import.meta.glob('../convex/**/*.*s');
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    alice: await ctx.db.insert('users', { termsVersion: POLICY_VERSION, name: 'Alice' }),
    bob: await ctx.db.insert('users', { termsVersion: POLICY_VERSION, name: 'Bob' }),
    outsider: await ctx.db.insert('users', { termsVersion: POLICY_VERSION, name: 'Outsider' }),
  }));
  const alice = t.withIdentity({ subject: `${ids.alice}|session-alice` });
  const bob = t.withIdentity({ subject: `${ids.bob}|session-bob` });
  const outsider = t.withIdentity({ subject: `${ids.outsider}|session-outsider` });
  const boardId = await alice.mutation(api.boards.create, {
    name: 'Food visits',
    description: '',
    accent: 'coral',
  });
  const invite = await alice.mutation(api.boards.createInvitation, { boardId });
  await bob.mutation(api.boards.acceptInvitation, { token: invite.token });
  const [request] = await alice.query(api.boards.pendingRequests, { boardId });
  await alice.mutation(api.boards.acceptRequest, { requestId: request._id });
  const visitId = await alice.mutation(api.visits.create, {
    boardId,
    title: 'Friday dinner',
    date: '2026-09-18',
    place: 'Little Table',
    notes: '',
    showDishes: true,
  });
  const dishId = await alice.mutation(api.items.saveDish, {
    visitId,
    name: 'Burrata',
    description: 'Shared',
  });
  return { t, alice, bob, outsider, ids, boardId, invite, visitId, dishId };
}
afterEach(() => vi.useRealTimers());

describe('Profile names', () => {
  it('updates only the signed-in member and preserves the name across provider refreshes', async () => {
    const { t, alice, bob, ids, boardId } = await setup();
    await alice.mutation(api.boards.updateProfile, { name: '  Alice Cooper  ' });
    expect((await alice.query(api.boards.me, {})).name).toBe('Alice Cooper');
    expect((await bob.query(api.boards.me, {})).name).toBe('Bob');
    const board = await bob.query(api.boards.get, { boardId });
    expect(board.members.find((member) => member._id === ids.alice)?.name).toBe('Alice Cooper');
    await t.run((ctx) => ctx.db.patch(ids.alice, { name: 'Google profile name' }));
    expect((await alice.query(api.boards.me, {})).name).toBe('Alice Cooper');
  });

  it('rejects unauthenticated changes and empty or oversized names', async () => {
    const { t, alice } = await setup();
    await expect(t.mutation(api.boards.updateProfile, { name: 'Someone' })).rejects.toThrow(
      /sign in/,
    );
    for (const name of ['   ', 'a'.repeat(81)]) {
      await expect(alice.mutation(api.boards.updateProfile, { name })).rejects.toThrow(
        /between 1 and 80/,
      );
    }
    expect((await alice.query(api.boards.me, {})).name).toBe('Alice');
  });
});

describe('Private boards and invitations', () => {
  it('requires authentication and isolates every board', async () => {
    const { t, alice, outsider, boardId, visitId, dishId } = await setup();
    await expect(t.query(api.boards.get, { boardId })).rejects.toThrow(/sign in/);
    await expect(outsider.query(api.boards.get, { boardId })).rejects.toThrow(/access/);
    await expect(outsider.query(api.visits.get, { visitId })).rejects.toThrow(/access/);
    await expect(
      outsider.mutation(api.items.saveDish, { visitId, name: 'Attack', description: '' }),
    ).rejects.toThrow(/access/);
    await expect(
      outsider.mutation(api.ratings.save, {
        visitId,
        kind: 'dish',
        targetId: dishId,
        score: 8,
        note: '',
      }),
    ).rejects.toThrow(/access/);
    expect(
      (await outsider.query(api.boards.list, { paginationOpts: { numItems: 20, cursor: null } }))
        .page,
    ).toEqual([]);
    expect(await outsider.query(api.boards.summaries, {})).toEqual([]);
    const aliceSummaries = await alice.query(api.boards.summaries, {});
    expect(aliceSummaries).toHaveLength(1);
    expect(aliceSummaries[0].name).toBe('Food visits');
    expect(aliceSummaries[0].memberCount).toBe(2);
    expect(aliceSummaries[0].visitCount).toBe(1);
  });
  it('accepts once, enforces owner permissions, and honors revocation', async () => {
    const { alice, bob, outsider, boardId, invite } = await setup();
    await bob.mutation(api.boards.acceptInvitation, { token: invite.token });
    expect((await alice.query(api.boards.get, { boardId })).members).toHaveLength(2);
    expect((await bob.mutation(api.boards.createInvitation, { boardId }))._id).toBe(invite._id);
    await expect(
      bob.mutation(api.boards.revokeInvitation, { invitationId: invite._id }),
    ).rejects.toThrow(/admin/);
    await expect(bob.mutation(api.boards.regenerateInviteCode, { boardId })).rejects.toThrow(
      /admin/,
    );
    await alice.mutation(api.boards.revokeInvitation, { invitationId: invite._id });
    await expect(
      outsider.mutation(api.boards.acceptInvitation, { token: invite.token }),
    ).rejects.toThrow(/revoked/);
    expect((await bob.query(api.boards.get, { boardId })).board.name).toBe('Food visits');
  });
  it('lets members create and share links while only owners approve access', async () => {
    const { alice, bob, outsider, boardId, invite } = await setup();
    await alice.mutation(api.boards.revokeInvitation, { invitationId: invite._id });
    const memberInvite = await bob.mutation(api.boards.createInvitation, { boardId });
    expect(memberInvite._id).not.toBe(invite._id);
    expect((await bob.query(api.boards.invitations, { boardId })).map((i) => i._id)).toContain(
      memberInvite._id,
    );
    expect((await alice.mutation(api.boards.createInvitation, { boardId }))._id).toBe(
      memberInvite._id,
    );
    await expect(outsider.mutation(api.boards.createInvitation, { boardId })).rejects.toThrow(
      /access/,
    );
    await expect(outsider.query(api.boards.invitations, { boardId })).rejects.toThrow(/access/);

    const result = await outsider.mutation(api.boards.requestToJoin, {
      code: `https://example.com/invite/${memberInvite.token}`,
    });
    expect(result.status).toBe('requested');
    await expect(outsider.query(api.boards.get, { boardId })).rejects.toThrow(/access/);
    const [pending] = await alice.query(api.boards.pendingRequests, { boardId });
    await expect(
      bob.mutation(api.boards.acceptRequest, { requestId: pending._id }),
    ).rejects.toThrow(/admin/);
    await expect(
      bob.mutation(api.boards.rejectRequest, { requestId: pending._id }),
    ).rejects.toThrow(/admin/);
    await alice.mutation(api.boards.rejectRequest, { requestId: pending._id });
    expect(
      (await outsider.query(api.boards.invitation, { token: memberInvite.token })).requestStatus,
    ).toBe('rejected');

    // The legacy endpoint must also request access instead of bypassing approval.
    await outsider.mutation(api.boards.acceptInvitation, { token: memberInvite.token });
    await expect(outsider.query(api.boards.get, { boardId })).rejects.toThrow(/access/);
    expect(
      (await outsider.mutation(api.boards.requestToJoin, { code: memberInvite.token })).status,
    ).toBe('already_pending');
    const reopened = await alice.query(api.boards.pendingRequests, { boardId });
    expect(reopened).toHaveLength(1);
    expect(reopened[0]._id).toBe(pending._id);
    await alice.mutation(api.boards.acceptRequest, { requestId: pending._id });
    expect((await outsider.query(api.boards.get, { boardId })).members).toHaveLength(3);
  });
  it('rejects expired invites and does not silently join on preview', async () => {
    const { t, alice, outsider, boardId } = await setup();
    const invite = await alice.mutation(api.boards.createInvitation, { boardId });
    const preview = await outsider.query(api.boards.invitation, { token: invite.token });
    expect(preview.alreadyMember).toBe(false);
    expect((await alice.query(api.boards.get, { boardId })).members).toHaveLength(2);
    expect(invite.expiresAt - invite._creationTime).toBeCloseTo(INVITE_LIFETIME, -2);
    await t.run((ctx) => ctx.db.patch(invite._id, { expiresAt: Date.now() - 1 }));
    await expect(outsider.query(api.boards.invitation, { token: invite.token })).rejects.toThrow(
      /expired/,
    );
    await expect(
      outsider.mutation(api.boards.acceptInvitation, { token: invite.token }),
    ).rejects.toThrow(/expired/);
  });
  it('supports joining through invite code and board owner approval flow', async () => {
    const { alice, bob, outsider, boardId } = await setup();
    const boardDetail = await alice.query(api.boards.get, { boardId });
    let inviteCode = boardDetail.board.inviteCode;
    if (!inviteCode) {
      inviteCode = await alice.mutation(api.boards.ensureInviteCode, { boardId });
    }
    expect(inviteCode).toMatch(/^[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$/);

    // Outsider requests to join with invite code
    const reqRes = await outsider.mutation(api.boards.requestToJoin, {
      code: ` ${inviteCode.toLowerCase()} `,
    });
    expect(reqRes.status).toBe('requested');
    expect(reqRes.boardId).toBe(boardId);

    // Outsider is not a member yet
    expect((await alice.query(api.boards.get, { boardId })).members).toHaveLength(2);
    expect((await outsider.query(api.boards.myOutgoingRequests, {})).length).toBe(1);

    // Duplicate request returns already_pending
    const duplicate = await outsider.mutation(api.boards.requestToJoin, { code: inviteCode });
    expect(duplicate.status).toBe('already_pending');

    // Non-owner cannot view pending requests
    await expect(bob.query(api.boards.pendingRequests, { boardId })).rejects.toThrow(/admin/);

    // Alice (owner) sees the pending request
    const pending = await alice.query(api.boards.pendingRequests, { boardId });
    expect(pending).toHaveLength(1);
    expect(pending[0].userName).toBe('Outsider');

    // Alice accepts the request
    await alice.mutation(api.boards.acceptRequest, { requestId: pending[0]._id });

    // Now outsider is a member
    const updatedBoard = await alice.query(api.boards.get, { boardId });
    expect(updatedBoard.members).toHaveLength(3);

    // Reviewed outcomes remain visible to the requester.
    expect((await outsider.query(api.boards.myOutgoingRequests, {}))[0].status).toBe('accepted');

    // Once accepted, request returns already_member
    const afterAccept = await outsider.mutation(api.boards.requestToJoin, { code: inviteCode });
    expect(afterAccept.status).toBe('already_member');
  });
  it('allows owner to reject join requests', async () => {
    const { alice, outsider, boardId } = await setup();
    const code = await alice.mutation(api.boards.ensureInviteCode, { boardId });

    // Outsider requests
    await outsider.mutation(api.boards.requestToJoin, { code });
    const pending = await alice.query(api.boards.pendingRequests, { boardId });
    expect(pending).toHaveLength(1);

    // Alice rejects
    await alice.mutation(api.boards.rejectRequest, { requestId: pending[0]._id });

    // Pending requests list is now empty
    const pendingAfter = await alice.query(api.boards.pendingRequests, { boardId });
    expect(pendingAfter).toHaveLength(0);

    // Outsider is still not a member
    expect((await alice.query(api.boards.get, { boardId })).members).toHaveLength(2);
  });
  it('revokes reads and writes after removal while preserving prior ratings', async () => {
    const { alice, bob, ids, boardId, visitId, dishId } = await setup();
    await bob.mutation(api.ratings.save, {
      visitId,
      kind: 'dish',
      targetId: dishId,
      score: 7,
      note: 'Nice',
    });
    await alice.mutation(api.boards.removeMember, { boardId, userId: ids.bob });
    await expect(bob.query(api.visits.get, { visitId })).rejects.toThrow(/access/);
    await expect(bob.mutation(api.boards.createInvitation, { boardId })).rejects.toThrow(/access/);
    await expect(bob.query(api.boards.invitations, { boardId })).rejects.toThrow(/access/);
    await expect(bob.mutation(api.photos.reserve, { visitId, caption: '' })).rejects.toThrow(
      /access/,
    );
    expect((await alice.query(api.visits.get, { visitId })).ratings).toHaveLength(1);
    await expect(
      alice.mutation(api.boards.removeMember, { boardId, userId: ids.alice }),
    ).rejects.toThrow(/admin/);
  });
  it('paginates boards and sorts visits by their actual date', async () => {
    const { alice, boardId } = await setup();
    for (const date of ['2026-01-01', '2026-09-20'])
      await alice.mutation(api.visits.create, {
        boardId,
        title: date,
        date,
        place: '',
        notes: '',
        showDishes: false,
      });
    const first = await alice.query(api.visits.list, {
      boardId,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(first.page[0].date).toBe('2026-09-20');
    expect(first.isDone).toBe(false);
    const next = await alice.query(api.visits.list, {
      boardId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(next.page[0].date).toBe('2026-09-18');
    await alice.mutation(api.boards.create, {
      name: 'Adventure visits',
      description: '',
      accent: 'sage',
    });
    const boards = await alice.query(api.boards.list, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(boards.page).toHaveLength(1);
    expect(boards.isDone).toBe(false);
  });
});

describe('Per-person, per-visit ratings', () => {
  it('stores separate shared-dish ratings, updates only the caller, and clears only theirs', async () => {
    const { alice, bob, visitId, dishId, ids } = await setup();
    const target = { visitId, kind: 'dish' as const, targetId: dishId, note: '' };
    await alice.mutation(api.ratings.save, { ...target, score: 8.5 });
    await bob.mutation(api.ratings.save, { ...target, score: 7 });
    let detail = await alice.query(api.visits.get, { visitId });
    expect(average(detail.ratings.map((r) => r.score))).toBe(7.75);
    await bob.mutation(api.ratings.save, { ...target, score: 9 });
    detail = await alice.query(api.visits.get, { visitId });
    expect(detail.ratings).toHaveLength(2);
    expect(detail.ratings.find((r) => r.userId === ids.alice)?.score).toBe(8.5);
    await bob.mutation(api.ratings.save, { ...target, score: null });
    expect((await alice.query(api.visits.get, { visitId })).ratings.map((r) => r.userId)).toEqual([
      ids.alice,
    ]);
  });
  it.each([0, 10.5, 1.25, -1])('rejects invalid score %s', async (score) => {
    const { alice, visitId, dishId } = await setup();
    await expect(
      alice.mutation(api.ratings.save, {
        visitId,
        kind: 'dish',
        targetId: dishId,
        score,
        note: '',
      }),
    ).rejects.toThrow(/half-point/);
  });
  it('rejects member attempts to specify another author', async () => {
    const { bob, visitId, dishId, ids } = await setup();
    const forged = {
      visitId,
      kind: 'dish' as const,
      targetId: dishId,
      score: 9,
      note: '',
      userId: ids.alice,
    };
    await expect(bob.mutation(api.ratings.save, forged)).rejects.toThrow(/admin/);
  });
  it('keeps restaurant revisits independent and does not invent an overall score', async () => {
    const { alice, boardId, visitId, dishId } = await setup();
    const second = await alice.mutation(api.visits.create, {
      boardId,
      title: 'Friday dinner again',
      date: '2026-09-20',
      place: 'Little Table',
      notes: '',
      showDishes: true,
    });
    await alice.mutation(api.ratings.save, {
      visitId,
      kind: 'dish',
      targetId: dishId,
      score: 9,
      note: '',
    });
    expect((await alice.query(api.visits.get, { visitId: second })).dishes).toHaveLength(0);
    await expect(
      alice.mutation(api.ratings.save, {
        visitId: second,
        kind: 'dish',
        targetId: dishId,
        score: 9,
        note: '',
      }),
    ).rejects.toThrow(/does not belong/);
    const list = await alice.query(api.visits.list, {
      boardId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page.every((v) => v.overall === null)).toBe(true);
  });
  it('snapshots types, supports on-the-spot categories, and protects rated-item removal', async () => {
    const { alice, boardId } = await setup();
    const typeId = await alice.mutation(api.visitTypes.save, {
      boardId,
      name: 'Trek',
      categories: ['View', 'Trail'],
      showDishes: false,
    });
    const visitId = await alice.mutation(api.visits.create, {
      boardId,
      typeId,
      title: 'Sunrise trail',
      date: '2026-09-19',
      place: '',
      notes: '',
      showDishes: false,
    });
    await alice.mutation(api.visitTypes.save, {
      id: typeId,
      boardId,
      name: 'Trek',
      categories: ['Scenery'],
      showDishes: false,
    });
    expect((await alice.query(api.visits.get, { visitId })).categories.map((c) => c.name)).toEqual([
      'View',
      'Trail',
    ]);
    const category = await alice.mutation(api.items.saveCategory, { visitId, name: 'Weather' });
    await alice.mutation(api.ratings.save, {
      visitId,
      kind: 'category',
      targetId: category,
      score: 8,
      note: 'Perfect',
    });
    await expect(
      alice.mutation(api.items.remove, { visitId, target: category, confirmed: false }),
    ).rejects.toThrow(/Confirm/);
    await alice.mutation(api.items.remove, { visitId, target: category, confirmed: true });
    expect((await alice.query(api.visits.get, { visitId })).ratings).toHaveLength(0);
    await alice.mutation(api.visitTypes.remove, { id: typeId });
    expect((await alice.query(api.visits.get, { visitId })).visit.typeName).toBe('Trek');
  });
  it('rejects a type from another board and impossible dates', async () => {
    const { alice, boardId } = await setup();
    const other = await alice.mutation(api.boards.create, {
      name: 'Other',
      description: '',
      accent: 'sage',
    });
    const type = (await alice.query(api.boards.get, { boardId: other })).types[0];
    const visit = {
      boardId,
      title: 'Visit',
      date: '2026-02-30',
      place: '',
      notes: '',
      showDishes: false,
    };
    await expect(alice.mutation(api.visits.create, visit)).rejects.toThrow(/valid visit date/);
    await expect(
      alice.mutation(api.visits.create, { ...visit, date: '2026-02-28', typeId: type._id }),
    ).rejects.toThrow(/this board/);
  });
});

describe('Private photos and cleanup', () => {
  it('uploads with ownership checks and rejects unauthenticated photo requests', async () => {
    const { t, alice, bob, outsider, visitId } = await setup();
    const ticket = await alice.mutation(api.photos.reserve, { visitId, caption: 'Our table' });
    const stolen = await bob.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    expect(stolen.status).toBe(403);
    const uploaded = await alice.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Origin: 'http://localhost:5173' },
      body: png,
    });
    expect(uploaded.status).toBe(200);
    const { photoId } = (await uploaded.json()) as { photoId: Id<'photos'> };
    expect((await t.fetch(`/photos/file?id=${photoId}`)).status).toBe(403);
    expect((await outsider.fetch(`/photos/file?id=${photoId}`)).status).toBe(403);
    expect((await bob.fetch(`/photos/file?id=${photoId}`)).status).toBe(200);
    const detail = await alice.query(api.visits.get, { visitId });
    expect(detail.photos[0]).not.toHaveProperty('storageId');
    await expect(bob.mutation(api.photos.remove, { photoId })).rejects.toThrow(/uploader or admin/);
    await alice.mutation(api.photos.remove, { photoId });
    expect((await alice.fetch(`/photos/file?id=${photoId}`)).status).toBe(403);
  });
  it('validates file signatures and maximum size, and allows a failed reservation to be retried', async () => {
    const { alice, visitId } = await setup();
    const ticket = await alice.mutation(api.photos.reserve, { visitId, caption: '' });
    const fake = await alice.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: 'not a png',
    });
    expect(fake.status).toBe(415);
    const large = await alice.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'Content-Length': String(MAX_PHOTO_BYTES + 1) },
      body: png,
    });
    expect(large.status).toBe(413);
    const wrongType = await alice.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/svg+xml' },
      body: '<svg/>',
    });
    expect(wrongType.status).toBe(415);
    const retried = await alice.fetch(`/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    expect(retried.status).toBe(200);
  });
  it('limits reservations, expires abandoned uploads, and permits retry after cancellation', async () => {
    const { t, alice, visitId } = await setup();
    const tickets: Id<'uploads'>[] = [];
    for (let i = 0; i < 10; i++)
      tickets.push(await alice.mutation(api.photos.reserve, { visitId, caption: '' }));
    await expect(alice.mutation(api.photos.reserve, { visitId, caption: '' })).rejects.toThrow(
      /10 photos/,
    );
    await alice.mutation(api.photos.cancel, { uploadId: tickets[0] });
    await alice.mutation(api.photos.reserve, { visitId, caption: '' });
    await t.run((ctx) => ctx.db.patch(tickets[1], { expiresAt: Date.now() - 1 }));
    await t.mutation(internal.cleanup.expiredUploads, {});
    expect(await t.run((ctx) => ctx.db.get(tickets[1]))).toBeNull();
  });
  it('retains stored files and ratings but denies access when a visit is soft-deleted', async () => {
    const { t, alice, bob, visitId, dishId } = await setup();
    await expect(bob.mutation(api.visits.remove, { visitId })).rejects.toThrow(
      /creator or board admin/,
    );
    const uploadId = await alice.mutation(api.photos.reserve, { visitId, caption: '' });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([png], { type: 'image/png' })),
    );
    await alice.mutation(internal.photos.finishUpload, {
      uploadId,
      storageId,
      contentType: 'image/png',
    });
    await alice.mutation(api.ratings.save, {
      visitId,
      kind: 'dish',
      targetId: dishId,
      score: 8,
      note: '',
    });
    await alice.mutation(api.visits.remove, { visitId });
    expect((await t.run((ctx) => ctx.db.get(visitId)))?.deletedAt).toBeDefined();
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
    await expect(alice.query(api.visits.get, { visitId })).rejects.toThrow(/available/);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('ratings')
          .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
          .take(10),
      ),
    ).toHaveLength(1);
  });
  it('retains whole boards while immediately blocking normal access', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, boardId, visitId } = await setup();
    await alice.mutation(api.boards.remove, { boardId });
    await expect(bob.query(api.visits.get, { visitId })).rejects.toThrow(/available/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(boardId)))?.deletedAt).toBeDefined();
    expect(await t.run((ctx) => ctx.db.get(visitId))).not.toBeNull();
  });
});

describe('Map and note imports', () => {
  it('imports once, preserves separate visits, optional scores and named historical ratings', async () => {
    const { t, alice, ids, boardId } = await setup();
    await t.run((ctx) => ctx.db.patch(ids.alice, { name: 'Nishit' }));
    const first = await t.mutation(internal.importNotes.bangalore, { boardId });
    expect(first.inserted).toBe(22);
    expect((await t.mutation(internal.importNotes.bangalore, { boardId })).inserted).toBe(0);
    const places = await alice.query(api.visits.places, {
      boardId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const udupi = places.page.filter((p) => p.title === 'Udupi');
    expect(udupi).toHaveLength(2);
    expect(udupi.map((p) => p.visitNumber).sort()).toEqual([1, 2]);
    expect(udupi.every((p) => p.date === '')).toBe(true);
    const amudham = places.page.find((p) => p.title === 'Amudham')!;
    const details = await alice.query(api.visits.get, { visitId: amudham._id });
    const mansi = details.ratings.find((r) => r.importedName === 'Mansi')!;
    expect(mansi.userId).toBeUndefined();
    expect(mansi.score).toBe(8.5);
    expect(mansi.note).toContain('8.59');
    expect(details.ratings.filter((r) => r.kind === 'overall')).toHaveLength(0);
    const dhaba = places.page.find((p) => p.title === 'Chulha Choki')!;
    const dhabaDetail = await alice.query(api.visits.get, { visitId: dhaba._id });
    const roti = dhabaDetail.dishes.find((d) => d.name === 'Roti')!;
    expect(dhabaDetail.ratings.filter((r) => r.targetId === roti._id)).toHaveLength(0);
    await alice.mutation(api.ratings.save, {
      visitId: amudham._id,
      targetId: mansi.targetId as Id<'dishes'>,
      kind: 'dish',
      score: 9,
      note: '',
    });
    expect(
      (await alice.query(api.visits.get, { visitId: amudham._id })).ratings.find(
        (r) => r._id === mansi._id,
      )?.score,
    ).toBe(8.5);
  });
  it('protects map reads and rejects invalid pin coordinates', async () => {
    const { alice, outsider, boardId, visitId } = await setup();
    await expect(
      outsider.query(api.visits.places, {
        boardId,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow(/access/);
    const update = {
      visitId,
      title: 'A visit',
      date: '',
      place: 'Bangalore',
      notes: '',
      showDishes: true,
    };
    await expect(
      alice.mutation(api.visits.update, { ...update, location: { latitude: 91, longitude: 77 } }),
    ).rejects.toThrow(/map location/);
    await alice.mutation(api.visits.update, {
      ...update,
      location: { latitude: 12.95, longitude: 77.65 },
    });
    expect((await alice.query(api.visits.get, { visitId })).visit.location?.latitude).toBe(12.95);
    await alice.mutation(api.visits.update, { ...update, location: null });
    expect((await alice.query(api.visits.get, { visitId })).visit.location).toBeUndefined();
  });
});

describe('Board admins', () => {
  it('keeps legacy owners as admins and prevents removing the last admin', async () => {
    const { t, alice, boardId, ids } = await setup();
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query('memberships')
        .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', boardId).eq('userId', ids.alice))
        .unique();
      await ctx.db.patch(membership!._id, { role: undefined });
    });
    const detail = await alice.query(api.boards.get, { boardId });
    expect(detail.isAdmin).toBe(true);
    expect(detail.members.find((p) => p._id === ids.alice)?.role).toBe('admin');
    await expect(
      alice.mutation(api.boards.setMemberRole, { boardId, userId: ids.alice, role: 'member' }),
    ).rejects.toThrow(/at least one admin/);
    await expect(
      alice.mutation(api.boards.removeMember, { boardId, userId: ids.alice }),
    ).rejects.toThrow(/at least one admin/);
  });

  it('allows promotion and admin approvals, and revokes privileges on demotion', async () => {
    const { alice, bob, outsider, boardId, invite, ids } = await setup();
    await expect(
      bob.mutation(api.boards.setMemberRole, { boardId, userId: ids.bob, role: 'admin' }),
    ).rejects.toThrow(/admin/);
    await expect(
      outsider.mutation(api.boards.setMemberRole, { boardId, userId: ids.outsider, role: 'admin' }),
    ).rejects.toThrow(/access/);
    await expect(
      alice.mutation(api.boards.setMemberRole, { boardId, userId: ids.outsider, role: 'admin' }),
    ).rejects.toThrow(/no longer a board member/);
    await alice.mutation(api.boards.setMemberRole, { boardId, userId: ids.bob, role: 'admin' });
    expect((await bob.query(api.boards.get, { boardId })).isAdmin).toBe(true);
    await outsider.mutation(api.boards.requestToJoin, { code: invite.token });
    const [request] = await bob.query(api.boards.pendingRequests, { boardId });
    await bob.mutation(api.boards.acceptRequest, { requestId: request._id });
    await bob.mutation(api.boards.update, {
      boardId,
      name: 'Our board',
      description: '',
      accent: 'coral',
    });
    await bob.mutation(api.boards.setMemberRole, { boardId, userId: ids.alice, role: 'member' });
    expect((await alice.query(api.boards.get, { boardId })).isAdmin).toBe(false);
    await expect(alice.mutation(api.boards.regenerateInviteCode, { boardId })).rejects.toThrow(
      /admin/,
    );
    await bob.mutation(api.boards.removeMember, { boardId, userId: ids.alice });
    await alice.mutation(api.boards.requestToJoin, { code: invite.token });
    const [rejoin] = await bob.query(api.boards.pendingRequests, { boardId });
    await bob.mutation(api.boards.acceptRequest, { requestId: rejoin._id });
    expect((await alice.query(api.boards.get, { boardId })).isAdmin).toBe(false);
  });

  it('lets admins create, update and clear member ratings with member and target checks', async () => {
    const { alice, bob, boardId, visitId, ids } = await setup();
    await alice.mutation(api.boards.setMemberRole, { boardId, userId: ids.bob, role: 'admin' });
    const categoryId = await bob.mutation(api.items.saveCategory, { visitId, name: 'Ambience' });
    const target = { visitId, targetId: categoryId, kind: 'category' as const, note: 'Cozy' };
    const initial = await bob.query(api.visits.get, { visitId });
    expect(initial.members.map((m) => m._id)).toContain(ids.alice);
    expect(initial.isAdmin).toBe(true);
    await bob.mutation(api.ratings.save, { ...target, userId: ids.alice, score: 8 });
    await bob.mutation(api.ratings.save, { ...target, score: 6 });
    await alice.mutation(api.ratings.save, { ...target, score: 9 });
    let ratings = (await bob.query(api.visits.get, { visitId })).ratings;
    expect(ratings.find((r) => r.userId === ids.alice)?.score).toBe(9);
    expect(ratings.find((r) => r.userId === ids.bob)?.score).toBe(6);
    await expect(
      bob.mutation(api.ratings.save, { ...target, userId: ids.outsider, score: 8 }),
    ).rejects.toThrow(/no longer a board member/);
    await expect(
      bob.mutation(api.ratings.save, { ...target, userId: ids.alice, score: 8.25 }),
    ).rejects.toThrow(/half-point/);
    const otherVisit = await alice.mutation(api.visits.create, {
      boardId,
      title: 'Other',
      date: '2026-09-25',
      place: '',
      notes: '',
      showDishes: false,
    });
    await expect(
      bob.mutation(api.ratings.save, {
        ...target,
        visitId: otherVisit,
        userId: ids.alice,
        score: 8,
      }),
    ).rejects.toThrow(/does not belong/);
    await bob.mutation(api.ratings.save, { ...target, userId: ids.alice, score: null });
    ratings = (await bob.query(api.visits.get, { visitId })).ratings;
    expect(ratings.map((r) => r.userId)).toEqual([ids.bob]);
    await alice.mutation(api.boards.setMemberRole, { boardId, userId: ids.bob, role: 'member' });
    await expect(
      bob.mutation(api.ratings.save, { ...target, userId: ids.alice, score: 7 }),
    ).rejects.toThrow(/admin/);
    await alice.mutation(api.boards.removeMember, { boardId, userId: ids.bob });
    await expect(
      alice.mutation(api.ratings.save, { ...target, userId: ids.bob, score: 7 }),
    ).rejects.toThrow(/no longer a board member/);
    await expect(bob.mutation(api.ratings.save, { ...target, score: 7 })).rejects.toThrow(/access/);
  });
});

describe('Ratings during visit creation', () => {
  it('saves categories, dishes and separate member scores in one visit', async () => {
    const { alice, bob, boardId, ids } = await setup();
    const visitId = await alice.mutation(api.visits.create, {
      boardId,
      title: 'Coffee and cake',
      date: '2026-09-25',
      place: '',
      notes: '',
      showDishes: false,
      categories: ['Ambience', 'Value'],
      dishes: ['Flat white', 'Cake'],
      initialScores: [
        { userId: ids.alice, overall: 8, categories: [8.5, null], dishes: [9, null] },
        { userId: ids.bob, overall: null, categories: [7, 8], dishes: [null, 9.5] },
      ],
    });
    const result = await bob.query(api.visits.get, { visitId });
    expect(result.visit.showDishes).toBe(true);
    expect(result.categories.map((category) => category.name)).toEqual(['Ambience', 'Value']);
    expect(result.dishes.map((dish) => dish.name)).toEqual(['Flat white', 'Cake']);
    expect(result.ratings).toHaveLength(6);
    expect(
      result.ratings.find(
        (r) =>
          r.kind === 'category' &&
          r.targetId === result.categories[0]._id &&
          r.userId === ids.alice,
      )?.score,
    ).toBe(8.5);
    expect(
      result.ratings.find(
        (r) => r.kind === 'dish' && r.targetId === result.dishes[1]._id && r.userId === ids.bob,
      )?.score,
    ).toBe(9.5);
    expect(result.ratings.filter((r) => r.kind === 'overall').map((r) => r.userId)).toEqual([
      ids.alice,
    ]);
  });

  it('enforces admin and membership permissions when creating ratings', async () => {
    const { alice, bob, boardId, ids } = await setup();
    const args = {
      boardId,
      title: 'A visit',
      date: '',
      place: '',
      notes: '',
      showDishes: false,
      categories: ['View'],
      dishes: [],
    };
    const scores = { overall: null, categories: [8], dishes: [] };
    await expect(
      bob.mutation(api.visits.create, {
        ...args,
        initialScores: [{ ...scores, userId: ids.alice }],
      }),
    ).rejects.toThrow(/admin/);
    await expect(
      alice.mutation(api.visits.create, {
        ...args,
        initialScores: [{ ...scores, userId: ids.outsider }],
      }),
    ).rejects.toThrow(/no longer a board member/);
    const visitId = await bob.mutation(api.visits.create, {
      ...args,
      initialScores: [{ ...scores, userId: ids.bob }],
    });
    expect((await bob.query(api.visits.get, { visitId })).ratings[0].userId).toBe(ids.bob);
  });

  it('rejects invalid or mismatched scores without creating a partial visit', async () => {
    const { alice, boardId, ids } = await setup();
    const args = {
      boardId,
      title: 'Invalid visit',
      date: '',
      place: '',
      notes: '',
      showDishes: true,
      categories: ['Value'],
      dishes: ['Cake'],
    };
    const entry = { userId: ids.alice, overall: null, categories: [7], dishes: [8] };
    const listArgs = { boardId, paginationOpts: { numItems: 20, cursor: null } };
    const before = await alice.query(api.visits.list, listArgs);
    await expect(
      alice.mutation(api.visits.create, { ...args, initialScores: [{ ...entry, dishes: [10.5] }] }),
    ).rejects.toThrow(/half-point/);
    await expect(
      alice.mutation(api.visits.create, { ...args, initialScores: [{ ...entry, categories: [] }] }),
    ).rejects.toThrow(/Match scores/);
    await expect(
      alice.mutation(api.visits.create, { ...args, initialScores: [entry, entry] }),
    ).rejects.toThrow(/once per member/);
    expect((await alice.query(api.visits.list, listArgs)).page.map((visit) => visit._id)).toEqual(
      before.page.map((visit) => visit._id),
    );
  });
});

describe('Convex-only photo storage', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ignores legacy board preferences and disallows local storage even when old environment flags exist', async () => {
    vi.stubEnv('LOCAL_PHOTO_ENABLED', 'true');
    vi.stubEnv('LOCAL_PHOTO_SECRET', 'test-local-secret');
    const { t, alice, bob, outsider, boardId, visitId } = await setup();
    await t.run((ctx) => ctx.db.patch(boardId, { photoStorage: 'local' }));
    expect((await alice.query(api.photos.configuration, {})).localStorageReady).toBe(false);
    await expect(
      alice.mutation(api.photos.setStorage, { boardId, provider: 'local' }),
    ).rejects.toThrow(/no longer available/);
    const uploadId = await alice.mutation(api.photos.reserve, { visitId, caption: '' });
    expect(await alice.query(api.photos.uploadProvider, { uploadId })).toBe('convex');
    await expect(bob.query(api.photos.uploadProvider, { uploadId })).rejects.toThrow(
      /another person/,
    );
    await expect(outsider.query(api.photos.uploadProvider, { uploadId })).rejects.toThrow(/access/);
    await expect(
      alice.mutation(api.photos.finishLocalUpload, {
        uploadId,
        contentType: 'image/png',
        secret: 'test-local-secret',
      }),
    ).rejects.toThrow(/Local uploads are no longer available/);
    const response = await alice.fetch(`/photos/upload?ticket=${uploadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    expect(response.status).toBe(200);
    const { photoId } = await response.json();
    expect(await bob.query(api.photos.fileProvider, { photoId })).toBe('convex');
    await expect(outsider.query(api.photos.fileProvider, { photoId })).rejects.toThrow(/access/);
    expect((await bob.fetch(`/photos/file?id=${photoId}`)).status).toBe(200);
    await alice.mutation(api.photos.setStorage, { boardId, provider: 'convex' });
  });

  it('allows hosted and development photo requests while rejecting unrelated origins', async () => {
    vi.stubEnv('SITE_URL', 'https://notes.example.com');
    vi.stubEnv('ALLOWED_ORIGINS', 'http://localhost:5173');
    const { t } = await setup();
    for (const origin of ['https://notes.example.com', 'http://localhost:5173']) {
      const response = await t.fetch('/photos/upload', {
        method: 'OPTIONS',
        headers: { Origin: origin },
      });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }
    const response = await t.fetch('/photos/file', {
      method: 'OPTIONS',
      headers: { Origin: 'https://unrelated.example.com' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('Legacy local photo cleanup', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('retains historical local files on deletion without allowing new local uploads', async () => {
    vi.stubEnv('LOCAL_PHOTO_SECRET', 'test-local-secret');
    const { t, alice, bob, outsider, visitId } = await setup();
    const photoId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', 'alice@example.com'))
        .first();
      const visit = await ctx.db.get(visitId);
      return ctx.db.insert('photos', {
        visitId,
        uploaderId: user?._id ?? visit!.creatorId!,
        localKey: 'legacy-file',
        caption: '',
        contentType: 'image/png',
      });
    });
    expect(await bob.query(api.photos.fileProvider, { photoId })).toBe('local');
    expect(await bob.query(api.photos.localFile, { photoId })).toEqual({
      key: 'legacy-file',
      contentType: 'image/png',
    });
    await expect(outsider.query(api.photos.localFile, { photoId })).rejects.toThrow(/access/);
    await alice.mutation(api.photos.remove, { photoId });
    const jobs = await alice.query(api.photos.localDeletions, { secret: 'test-local-secret' });
    expect(jobs).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(photoId)))?.deletedAt).toBeDefined();
  });
});
