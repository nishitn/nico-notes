import { POLICY_VERSION } from '../legal';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';

const modules = import.meta.glob('../convex/**/*.*s');
const paginationOpts = { numItems: 30, cursor: null };
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    alice: await ctx.db.insert('users', { name: 'Alice', termsVersion: POLICY_VERSION }),
    bob: await ctx.db.insert('users', { name: 'Bob', termsVersion: POLICY_VERSION }),
    outsider: await ctx.db.insert('users', { name: 'Outsider', termsVersion: POLICY_VERSION }),
  }));
  const alice = t.withIdentity({ subject: `${ids.alice}|alice` });
  const bob = t.withIdentity({ subject: `${ids.bob}|bob` });
  const outsider = t.withIdentity({ subject: `${ids.outsider}|outsider` });
  const boardId = await alice.mutation(api.boards.create, {
    name: 'Our board',
    description: '',
    accent: 'coral',
  });
  await t.run((ctx) => ctx.db.insert('memberships', { boardId, userId: ids.bob, role: 'member' }));
  const addVisit = () =>
    alice.mutation(api.visits.create, {
      boardId,
      title: 'Friday dinner',
      date: '2026-10-20',
      place: 'Little Table',
      notes: '',
      showDishes: true,
    });
  const feed = () => alice.query(api.notifications.list, { boardId, paginationOpts });
  return { t, ids, alice, bob, outsider, boardId, addVisit, feed };
}
afterEach(() => vi.useRealTimers());

describe('Board notifications', () => {
  it('starts empty and records shared changes with the actor, time and a working visit target', async () => {
    const { alice, bob, boardId, addVisit, feed } = await setup();
    expect((await feed()).page).toEqual([]);
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(false);
    const visitId = await addVisit();
    await bob.mutation(api.ratings.save, {
      visitId,
      kind: 'overall',
      targetId: visitId,
      score: 8.5,
      note: '',
    });
    const rows = (await feed()).page;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actorName: 'Bob',
      summary: 'added overall rating to 8.5/10 on “Friday dinner”',
      visitId,
      unread: true,
    });
    expect(rows[1]).toMatchObject({
      actorName: 'Alice',
      summary: 'added a visit: “Friday dinner”',
      visitId,
    });
    expect(rows[0].createdAt).toBeGreaterThanOrEqual(rows[1].createdAt);
    // Saving the same rating is not a change.
    await bob.mutation(api.ratings.save, {
      visitId,
      kind: 'overall',
      targetId: visitId,
      score: 8.5,
      note: '',
    });
    expect((await feed()).page).toHaveLength(2);
  });

  it('keeps read state per member and never marks later changes read with an older request', async () => {
    const { alice, bob, boardId, addVisit, feed } = await setup();
    await addVisit();
    const first = (await feed()).page[0];
    await alice.mutation(api.notifications.markRead, { boardId, throughId: first._id });
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(false);
    expect(await bob.query(api.notifications.hasUnread, { boardId })).toBe(true);
    await addVisit();
    const newest = (await feed()).page[0];
    await alice.mutation(api.notifications.markRead, { boardId, throughId: first._id });
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(true);
    await alice.mutation(api.notifications.markRead, { boardId, throughId: newest._id });
    await alice.mutation(api.notifications.markRead, { boardId, throughId: first._id });
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(false);
    expect((await feed()).page.every((row) => !row.unread)).toBe(true);
  });

  it('denies outsiders, unauthenticated users, removed members and cross-board read markers', async () => {
    const { t, alice, bob, outsider, ids, boardId, addVisit, feed } = await setup();
    await addVisit();
    const row = (await feed()).page[0];
    for (const client of [t, outsider]) {
      await expect(
        client.query(api.notifications.list, { boardId, paginationOpts }),
      ).rejects.toThrow();
      await expect(client.query(api.notifications.hasUnread, { boardId })).rejects.toThrow();
      await expect(
        client.mutation(api.notifications.markRead, { boardId, throughId: row._id }),
      ).rejects.toThrow();
    }
    const other = await alice.mutation(api.boards.create, {
      name: 'Private',
      description: '',
      accent: 'sage',
    });
    await expect(
      alice.mutation(api.notifications.markRead, { boardId: other, throughId: row._id }),
    ).rejects.toThrow(/Invalid notification/);
    await alice.mutation(api.boards.removeMember, { boardId, userId: ids.bob });
    await expect(bob.query(api.notifications.list, { boardId, paginationOpts })).rejects.toThrow(
      /access/,
    );
  });

  it('paginates newest first and retains deletion history without a broken visit link', async () => {
    const { alice, boardId, addVisit, feed } = await setup();
    const visitId = await addVisit();
    await alice.mutation(api.items.saveDish, { visitId, name: 'Pasta', description: '' });
    await alice.mutation(api.visits.remove, { visitId });
    const first = await alice.query(api.notifications.list, {
      boardId,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(first.page[0]).toMatchObject({
      summary: 'deleted a visit: “Friday dinner”',
      visitId: null,
    });
    expect(first.isDone).toBe(false);
    const next = await alice.query(api.notifications.list, {
      boardId,
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(next.page).toHaveLength(2);
    expect(next.page.every((row) => row.visitId === null)).toBe(true);
    expect((await feed()).page).toHaveLength(3);
  });

  it('logs wishlist changes and completion once while keeping automatic migration quiet', async () => {
    const { alice, boardId, feed } = await setup();
    const id = await alice.mutation(api.wishlist.add, { boardId, title: 'Next cafe' });
    expect((await feed()).page[0].summary).toContain('added to the wishlist');
    await alice.mutation(api.wishlist.ensurePlanned, { boardId });
    const visitId = await alice.mutation(api.wishlist.ensureVisit, { id });
    expect((await feed()).page).toHaveLength(1);
    await alice.mutation(api.visits.markVisited, { visitId, date: '2026-10-20' });
    await alice.mutation(api.visits.markVisited, { visitId, date: '2026-10-20' });
    const rows = (await feed()).page;
    expect(rows).toHaveLength(2);
    expect(rows[0].summary).toBe('marked as visited: “Next cafe”');
  });

  it('does not publish failed changes or reservations and logs a completed photo only once', async () => {
    const { t, alice, bob, boardId, addVisit, feed } = await setup();
    const visitId = await addVisit();
    await expect(
      bob.mutation(api.boards.update, {
        boardId,
        name: 'Denied',
        description: '',
        accent: 'coral',
      }),
    ).rejects.toThrow(/admin/);
    const uploadId = await alice.mutation(api.photos.reserve, { visitId, caption: '' });
    expect((await feed()).page).toHaveLength(1);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(['photo'], { type: 'image/png' })),
    );
    await alice.mutation(internal.photos.finishUpload, {
      uploadId,
      storageId,
      contentType: 'image/png',
    });
    await alice.mutation(internal.photos.finishUpload, {
      uploadId,
      storageId,
      contentType: 'image/png',
    });
    expect((await feed()).page).toHaveLength(2);
    expect((await feed()).page[0].summary).toBe('added a photo to “Friday dinner”');
  });

  it('anonymizes deleted actors while preserving the board history for remaining members', async () => {
    vi.useFakeTimers();
    const { t, alice, bob, ids, boardId, addVisit } = await setup();
    await addVisit();
    await alice.mutation(api.account.remove, { confirmation: 'DELETE' });
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.account.resumeDeletions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await bob.query(api.notifications.list, { boardId, paginationOpts });
    expect(rows.page[0].actorName).toBe('Former member');
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('boardChanges')
          .withIndex('by_actorId', (q) => q.eq('actorId', ids.alice))
          .collect(),
      ),
    ).toEqual([]);
  });

  it('retains change history privately when deleting a board', async () => {
    vi.useFakeTimers();
    const { t, alice, boardId, addVisit } = await setup();
    await addVisit();
    await alice.mutation(api.boards.remove, { boardId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('boardChanges')
          .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
          .collect(),
      ),
    ).toHaveLength(1);
  });
});
