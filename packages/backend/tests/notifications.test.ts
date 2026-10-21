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
    await bob.mutation(api.visits.update, {
      visitId,
      title: 'Friday dinner',
      date: '2026-10-20',
      place: 'Little Table',
      notes: 'Book a table',
      showDishes: true,
    });
    const rows = (await feed()).page;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actorName: 'Bob',
      summary: 'updated the visit to Friday dinner · Changed: notes',
      visitId,
      unread: true,
    });
    expect(rows[1]).toMatchObject({
      actorName: 'Alice',
      summary: 'added a visit to Friday dinner',
      visitId,
    });
    expect(rows[0].createdAt).toBeGreaterThanOrEqual(rows[1].createdAt);
    // Saving unchanged fields must not create another notification.
    await bob.mutation(api.visits.update, {
      visitId,
      title: 'Friday dinner',
      date: '2026-10-20',
      place: 'Little Table',
      notes: 'Book a table',
      showDishes: true,
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

  it('marks one notification read without hiding older unread changes or changing another member', async () => {
    const { alice, bob, boardId, addVisit, feed } = await setup();
    await addVisit();
    await addVisit();
    const [newest, older] = (await feed()).page;
    await alice.mutation(api.notifications.markOneRead, { boardId, notificationId: newest._id });
    await alice.mutation(api.notifications.markOneRead, { boardId, notificationId: newest._id });
    expect((await feed()).page.map((row) => row.unread)).toEqual([false, true]);
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(true);
    expect(
      (await bob.query(api.notifications.list, { boardId, paginationOpts })).page.every(
        (row) => row.unread,
      ),
    ).toBe(true);
    await alice.mutation(api.notifications.markRead, { boardId, throughId: older._id });
    expect((await feed()).page.every((row) => !row.unread)).toBe(true);
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(false);
    await addVisit();
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(true);
    await alice.mutation(api.notifications.markRead, {
      boardId,
      throughId: (await feed()).page[0]._id,
    });
    expect((await feed()).page.every((row) => !row.unread)).toBe(true);
  });

  it('clears the unread indicator after all notifications are individually marked read', async () => {
    const { alice, boardId, addVisit, feed } = await setup();
    await addVisit();
    await addVisit();
    for (const row of (await feed()).page) {
      await alice.mutation(api.notifications.markOneRead, { boardId, notificationId: row._id });
    }
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(false);
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
      await expect(
        client.mutation(api.notifications.markOneRead, { boardId, notificationId: row._id }),
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
    await expect(
      alice.mutation(api.notifications.markOneRead, { boardId: other, notificationId: row._id }),
    ).rejects.toThrow(/Invalid notification/);
    await alice.mutation(api.boards.removeMember, { boardId, userId: ids.bob });
    await expect(bob.query(api.notifications.list, { boardId, paginationOpts })).rejects.toThrow(
      /access/,
    );
  });

  it('paginates newest first and retains deletion history without a broken visit link', async () => {
    const { alice, boardId, addVisit, feed } = await setup();
    const visitId = await addVisit();
    await alice.mutation(api.visits.update, {
      visitId,
      title: 'Friday dinner',
      date: '2026-10-20',
      place: 'Little Table',
      notes: 'Book a table',
      showDishes: true,
    });
    await alice.mutation(api.visits.remove, { visitId });
    const first = await alice.query(api.notifications.list, {
      boardId,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(first.page[0]).toMatchObject({
      summary: 'deleted the visit to Friday dinner',
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
    expect((await feed()).page[0].summary).toBe('added Next cafe to the wishlist');
    await alice.mutation(api.wishlist.ensurePlanned, { boardId });
    const visitId = await alice.mutation(api.wishlist.ensureVisit, { id });
    expect((await feed()).page).toHaveLength(1);
    await alice.mutation(api.visits.markVisited, { visitId, date: '2026-10-20' });
    await alice.mutation(api.visits.markVisited, { visitId, date: '2026-10-20' });
    const rows = (await feed()).page;
    expect(rows).toHaveLength(2);
    expect(rows[0].summary).toBe('marked Next cafe as visited');
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
    expect((await feed()).page[0].summary).toBe('added a photo to the visit to Friday dinner');
    const photo = await t.run((ctx) => ctx.db.query('photos').first());
    await alice.mutation(api.photos.updateCaption, {
      photoId: photo!._id,
      caption: 'Dinner together',
    });
    expect((await feed()).page[0].summary).toBe(
      'updated a photo caption for the visit to Friday dinner',
    );
    await alice.mutation(api.photos.remove, { photoId: photo!._id });
    expect((await feed()).page[0].summary).toBe('removed a photo from the visit to Friday dinner');
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

describe('Approved notification preferences', () => {
  it('keeps all rating, dish, category and storage changes silent without changing their behavior', async () => {
    const { alice, bob, boardId, addVisit, feed } = await setup();
    const visitId = await addVisit();
    await alice.mutation(api.notifications.markRead, {
      boardId,
      throughId: (await feed()).page[0]._id,
    });
    const dishId = await alice.mutation(api.items.saveDish, {
      visitId,
      name: 'Pizza',
      description: '',
    });
    const categoryId = await alice.mutation(api.items.saveCategory, { visitId, name: 'Service' });
    for (const target of [
      { kind: 'overall' as const, targetId: visitId },
      { kind: 'dish' as const, targetId: dishId },
      { kind: 'category' as const, targetId: categoryId },
    ]) {
      for (const score of [8, 9, null]) {
        await bob.mutation(api.ratings.save, { visitId, ...target, score, note: '' });
      }
    }
    await alice.mutation(api.items.saveDish, {
      visitId,
      id: dishId,
      name: 'Pasta',
      description: 'Fresh',
    });
    await alice.mutation(api.items.saveCategory, { visitId, id: categoryId, name: 'Ambience' });
    await alice.mutation(api.items.remove, { visitId, target: dishId, confirmed: true });
    await alice.mutation(api.items.remove, { visitId, target: categoryId, confirmed: true });
    await alice.mutation(api.photos.setStorage, { boardId, provider: 'convex' });
    expect((await feed()).page).toHaveLength(1);
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(false);
  });

  it('records actual changed fields for visits and wishlists, and keeps unchanged saves quiet', async () => {
    const { alice, boardId, addVisit, feed } = await setup();
    const visitId = await addVisit();
    await alice.mutation(api.visits.update, {
      visitId,
      title: 'Friday dinner',
      date: '2026-10-21',
      place: 'Little Table',
      notes: 'Window table',
      showDishes: true,
    });
    expect((await feed()).page[0].summary).toBe(
      'updated the visit to Friday dinner · Changed: date, notes',
    );
    const id = await alice.mutation(api.wishlist.add, { boardId, title: 'Next cafe' });
    await alice.mutation(api.wishlist.update, { id, title: 'Next cafe', notes: 'Try brunch' });
    expect((await feed()).page[0].summary).toBe(
      'updated Next cafe in the wishlist · Changed: notes',
    );
    const count = (await feed()).page.length;
    await alice.mutation(api.wishlist.update, { id, title: 'Next cafe', notes: 'Try brunch' });
    expect((await feed()).page).toHaveLength(count);
    await alice.mutation(api.wishlist.remove, { id, confirmed: true });
    expect((await feed()).page[0]).toMatchObject({
      summary: 'removed Next cafe from the wishlist',
      visitId: null,
    });
  });

  it('resolves Google names in memory for new, legacy and deleted visit notifications', async () => {
    const { projectLivePlaces } = await import('../livePlaces');
    const { notificationText } = await import('../notificationText');
    const { t, alice, boardId, feed } = await setup();
    const id = await alice.mutation(api.wishlist.add, {
      boardId,
      title: 'Toit',
      googlePlaceId: 'google-toit',
    });
    const visitId = await alice.mutation(api.wishlist.ensureVisit, { id });
    await t.run((ctx) =>
      ctx.db.insert('boardChanges', {
        boardId,
        visitId,
        summary: 'added a visit: “Saved Google place”',
      }),
    );
    const live = { id: 'google-toit', name: 'Toit', address: 'Indiranagar' };
    const projected = projectLivePlaces((await feed()).page, () => live);
    expect(projected.map(notificationText)).toEqual([
      'added a visit to Toit',
      'added Toit to the wishlist',
    ]);
    await alice.mutation(api.visits.remove, { visitId });
    const deleted = projectLivePlaces((await feed()).page[0], () => live);
    expect(notificationText(deleted)).toBe('removed Toit from the wishlist');
    expect(deleted.visitId).toBeNull();
    const stored = await t.run((ctx) => ctx.db.query('boardChanges').collect());
    expect(JSON.stringify(stored)).not.toContain('Indiranagar');
    expect(stored.every((row) => !row.summary.includes('Toit'))).toBe(true);
  });

  it('names affected members, protects deleted member identities, and names boards in join and leave events', async () => {
    const { t, ids, alice, bob, boardId, feed } = await setup();
    await alice.mutation(api.boards.setMemberRole, { boardId, userId: ids.bob, role: 'admin' });
    expect((await feed()).page[0].summary).toBe('made Bob an admin');
    await alice.mutation(api.boards.setMemberRole, { boardId, userId: ids.bob, role: 'member' });
    expect((await feed()).page[0].summary).toBe('made Bob a member');
    await bob.mutation(api.boards.leave, { boardId });
    expect((await feed()).page[0]).toMatchObject({
      actorName: 'Bob',
      summary: 'left the board: Our board',
    });
    const requestId = await t.run((ctx) =>
      ctx.db.insert('joinRequests', {
        boardId,
        userId: ids.bob,
        status: 'pending',
        createdAt: Date.now(),
      }),
    );
    await alice.mutation(api.boards.acceptRequest, { requestId });
    expect((await feed()).page[0]).toMatchObject({
      actorName: 'Bob',
      summary: 'joined the board: Our board',
    });
    await alice.mutation(api.boards.removeMember, { boardId, userId: ids.bob });
    expect((await feed()).page[0].summary).toBe('removed Bob from the board');
    await t.run((ctx) => ctx.db.patch(ids.bob, { deleting: true }));
    expect((await feed()).page[0].summary).toBe('removed Former member from the board');
    expect(JSON.stringify((await feed()).page)).not.toContain('Bob');
  });

  it('names changed board settings and visit types without notifying on unchanged saves', async () => {
    const { alice, boardId, feed } = await setup();
    await alice.mutation(api.boards.update, {
      boardId,
      name: 'Food Journal',
      description: 'Shared meals',
      accent: 'coral',
    });
    expect((await feed()).page[0].summary).toBe('updated the board · Changed: name, description');
    const id = await alice.mutation(api.visitTypes.save, {
      boardId,
      name: 'Dinner',
      categories: [],
      showDishes: true,
    });
    expect((await feed()).page[0].summary).toBe('added the visit type Dinner');
    const count = (await feed()).page.length;
    await alice.mutation(api.visitTypes.save, {
      boardId,
      id,
      name: 'Dinner',
      categories: [],
      showDishes: true,
    });
    expect((await feed()).page).toHaveLength(count);
    await alice.mutation(api.visitTypes.save, {
      boardId,
      id,
      name: 'Lunch',
      categories: [],
      showDishes: true,
    });
    expect((await feed()).page[0].summary).toBe('updated the visit type Lunch');
    await alice.mutation(api.visitTypes.remove, { id });
    expect((await feed()).page[0].summary).toBe('removed the visit type Lunch');
  });

  it('archives old noisy entries in resumable batches, preserving journal data and read markers', async () => {
    const { t, ids, alice, boardId, addVisit, feed } = await setup();
    const visitId = await addVisit();
    await alice.mutation(api.notifications.markRead, {
      boardId,
      throughId: (await feed()).page[0]._id,
    });
    const legacy = await t.run(async (ctx) => {
      const rows = [];
      for (let i = 0; i < 105; i++)
        rows.push(
          await ctx.db.insert('boardChanges', {
            boardId,
            actorId: ids.bob,
            visitId,
            summary: [
              'added dish rating to 9/10 on “Friday dinner”',
              'cleared overall rating on “Friday dinner”',
              'updated category rating to 8/10 on “Friday dinner”',
              'added a dish to “Friday dinner”',
              'removed a category from “Friday dinner”',
              'changed the photo storage setting',
            ][i % 6],
          }),
        );
      return rows;
    });
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(true);
    let cursor: string | null = null;
    let archived = 0;
    let batches = 0;
    do {
      const result: { archived: number; nextCursor: string | null } = await t.mutation(
        internal.migrations.notificationPreferences,
        { cursor },
      );
      archived += result.archived;
      cursor = result.nextCursor;
      batches++;
    } while (cursor);
    expect(batches).toBe(2);
    expect(archived).toBe(105);
    expect((await feed()).page).toHaveLength(1);
    expect(await alice.query(api.notifications.hasUnread, { boardId })).toBe(false);
    const retained = await t.run((ctx) => ctx.db.get(legacy[0]));
    expect(retained?.deletedAt).toEqual(expect.any(Number));
    expect(retained?.deletionId).toBeDefined();
    expect(await t.run((ctx) => ctx.db.get(visitId))).toBeTruthy();
    expect(
      (await t.mutation(internal.migrations.notificationPreferences, { cursor: null })).archived,
    ).toBe(0);
  });
});
