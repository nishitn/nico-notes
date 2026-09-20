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
    alice: await ctx.db.insert('users', { name: 'Alice' }),
    bob: await ctx.db.insert('users', { name: 'Bob' }),
    outsider: await ctx.db.insert('users', { name: 'Outsider' }),
  }));
  const alice = t.withIdentity({ subject: `${ids.alice}|session-alice` });
  const bob = t.withIdentity({ subject: `${ids.bob}|session-bob` });
  const outsider = t.withIdentity({ subject: `${ids.outsider}|session-outsider` });
  const boardId = await alice.mutation(api.boards.create, {
    name: 'Food dates',
    description: '',
    accent: 'coral',
  });
  const invite = await alice.mutation(api.boards.createInvitation, { boardId });
  await bob.mutation(api.boards.acceptInvitation, { token: invite.token });
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

describe('Private boards and invitations', () => {
  it('requires authentication and isolates every board', async () => {
    const { t, outsider, boardId, visitId, dishId } = await setup();
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
  });
  it('accepts once, enforces owner permissions, and honors revocation', async () => {
    const { alice, bob, outsider, boardId, invite } = await setup();
    await bob.mutation(api.boards.acceptInvitation, { token: invite.token });
    expect((await alice.query(api.boards.get, { boardId })).members).toHaveLength(2);
    await expect(bob.mutation(api.boards.createInvitation, { boardId })).rejects.toThrow(/owner/);
    await alice.mutation(api.boards.revokeInvitation, { invitationId: invite._id });
    await expect(
      outsider.mutation(api.boards.acceptInvitation, { token: invite.token }),
    ).rejects.toThrow(/revoked/);
    expect((await bob.query(api.boards.get, { boardId })).board.name).toBe('Food dates');
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
    await expect(bob.mutation(api.photos.reserve, { visitId, caption: '' })).rejects.toThrow(
      /access/,
    );
    expect((await alice.query(api.visits.get, { visitId })).ratings).toHaveLength(1);
    await expect(
      alice.mutation(api.boards.removeMember, { boardId, userId: ids.alice }),
    ).rejects.toThrow(/owner/);
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
      name: 'Adventure dates',
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
  it('rejects attempts to specify another author', async () => {
    const { alice, visitId, dishId, ids } = await setup();
    const forged = {
      visitId,
      kind: 'dish' as const,
      targetId: dishId,
      score: 9,
      note: '',
      userId: ids.bob,
    };
    await expect(alice.mutation(api.ratings.save, forged)).rejects.toThrow();
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
      title: 'Date',
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
    await expect(bob.mutation(api.photos.remove, { photoId })).rejects.toThrow(/uploader or owner/);
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
  it('removes stored files and ratings when a visit is deleted', async () => {
    const { t, alice, bob, visitId, dishId } = await setup();
    await expect(bob.mutation(api.visits.remove, { visitId })).rejects.toThrow(
      /creator or board owner/,
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
    expect(await t.run((ctx) => ctx.db.get(visitId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('ratings')
          .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
          .take(10),
      ),
    ).toEqual([]);
  });
  it('deletes whole boards in scheduled batches and immediately blocks access', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, boardId, visitId } = await setup();
    await alice.mutation(api.boards.remove, { boardId });
    await expect(bob.query(api.visits.get, { visitId })).rejects.toThrow(/access/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(boardId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(visitId))).toBeNull();
  });
});
