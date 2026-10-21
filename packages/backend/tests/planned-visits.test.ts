import { POLICY_VERSION } from '../legal';
import { describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';

const modules = import.meta.glob('../convex/**/*.*s');
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Member', termsVersion: POLICY_VERSION }),
  );
  const strangerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Stranger', termsVersion: POLICY_VERSION }),
  );
  const member = t.withIdentity({ subject: `${userId}|session` });
  const stranger = t.withIdentity({ subject: `${strangerId}|session` });
  const boardId = await member.mutation(api.boards.create, {
    name: 'Dates',
    description: '',
    accent: 'coral',
  });
  return { t, userId, member, stranger, boardId };
}

describe('planned visit lifecycle', () => {
  it('converts legacy wishlist data once, retaining journal content and removing cached Google details', async () => {
    const { t, userId, member, stranger, boardId } = await setup();
    const original = {
      boardId,
      creatorId: userId,
      title: 'Café ✨',
      place: 'Indiranagar',
      notes: 'Try the cinnamon rolls\nAnd cold brew',
      link: 'https://example.com/menu?q=coffee',
      googlePlaceId: 'google-cafe',
      location: { latitude: 12.97, longitude: 77.64, source: 'google' },
      createdAt: 1234567,
    };
    const id = await t.run((ctx) => ctx.db.insert('wishlist', original));
    await expect(stranger.mutation(api.wishlist.ensureVisit, { id })).rejects.toThrow();
    await expect(stranger.mutation(api.wishlist.ensurePlanned, { boardId })).rejects.toThrow();
    const visitId = await member.mutation(api.wishlist.ensureVisit, { id });
    await member.mutation(api.wishlist.ensurePlanned, { boardId });
    expect(await member.mutation(api.wishlist.ensureVisit, { id })).toBe(visitId);
    expect(await t.run((ctx) => ctx.db.query('visits').collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(id))).toEqual({
      ...original,
      title: 'Saved Google place',
      place: '',
      location: undefined,
      _id: id,
      _creationTime: expect.any(Number),
      visitId,
    });
    const { visit } = await member.query(api.visits.get, { visitId });
    expect(visit).toMatchObject({
      status: 'planned',
      title: 'Saved Google place',
      place: '',
      notes: original.notes,
      savedLink: original.link,
      googlePlaceId: original.googlePlaceId,
      creatorId: userId,
      plannedAt: original.createdAt,
      date: '',
    });
    expect(visit.placeId).toBeUndefined();
  });

  it('completes the same visit, preserves its content, and counts it only once', async () => {
    const { t, userId, member, stranger, boardId } = await setup();
    const visitId = await member.mutation(api.visits.create, {
      boardId,
      planned: true,
      title: 'Bakehouse',
      date: '',
      place: 'Bangalore',
      notes: 'Cinnamon rolls',
      savedLink: 'https://example.com/menu',
      showDishes: true,
      dishes: ['Cold brew'],
    });
    const photoId = await t.run((ctx) =>
      ctx.db.insert('photos', {
        visitId,
        uploaderId: userId,
        caption: 'Recommendation',
        contentType: 'image/jpeg',
      }),
    );
    const before = await member.query(api.visits.get, { visitId });
    const wishlist = await member.query(api.wishlist.list, {
      boardId,
      paginationOpts: { cursor: null, numItems: 50 },
    });
    expect(wishlist.page[0].visitId).toBe(visitId);
    expect(
      (
        await member.query(api.visits.list, {
          boardId,
          paginationOpts: { cursor: null, numItems: 24 },
        })
      ).page,
    ).toHaveLength(0);
    expect(
      (
        await member.query(api.visits.places, {
          boardId,
          paginationOpts: { cursor: null, numItems: 100 },
        })
      ).page,
    ).toHaveLength(0);
    expect(
      (
        await member.query(api.visits.places, {
          boardId,
          includePlanned: true,
          paginationOpts: { cursor: null, numItems: 100 },
        })
      ).page,
    ).toHaveLength(1);
    expect((await member.query(api.boards.summaries, {}))[0].visitCount).toBe(0);
    expect(
      (
        await member.query(api.places.list, {
          boardId,
          paginationOpts: { cursor: null, numItems: 100 },
        })
      ).page,
    ).toHaveLength(0);
    const rating = { visitId, kind: 'overall' as const, targetId: visitId, score: 8, note: '' };
    await expect(member.mutation(api.ratings.save, rating)).rejects.toThrow(/visited/);
    await expect(
      stranger.mutation(api.visits.markVisited, { visitId, date: '2026-10-20' }),
    ).rejects.toThrow();
    await expect(member.mutation(api.visits.markVisited, { visitId, date: '' })).rejects.toThrow(
      /date/,
    );
    expect(
      await member.mutation(api.visits.markVisited, {
        visitId,
        date: '2026-10-20',
        expectedRevision: 0,
      }),
    ).toBe(visitId);
    // A retry after a lost response remains successful even with the old revision.
    expect(
      await member.mutation(api.visits.markVisited, {
        visitId,
        date: '2026-10-20',
        expectedRevision: 0,
      }),
    ).toBe(visitId);
    const after = await member.query(api.visits.get, { visitId });
    expect(after.visit.status).toBeUndefined();
    expect(after.visit.date).toBe('2026-10-20');
    expect(after.visit.notes).toBe(before.visit.notes);
    expect(after.visit.savedLink).toBe(before.visit.savedLink);
    expect(after.visit.plannedAt).toBe(before.visit.plannedAt);
    expect(after.photos.map((photo) => photo._id)).toEqual([photoId]);
    expect(after.dishes).toEqual(before.dishes);
    expect(after.categories).toEqual(before.categories);
    expect(
      (
        await member.query(api.wishlist.list, {
          boardId,
          paginationOpts: { cursor: null, numItems: 50 },
        })
      ).page,
    ).toHaveLength(0);
    expect((await member.query(api.boards.summaries, {}))[0].visitCount).toBe(1);
    expect(
      (
        await member.query(api.visits.list, {
          boardId,
          paginationOpts: { cursor: null, numItems: 24 },
        })
      ).page.map((visit) => visit._id),
    ).toEqual([visitId]);
    await member.mutation(api.ratings.save, rating);
    expect((await member.query(api.visits.get, { visitId })).ratings).toHaveLength(1);
  });

  it('syncs planned edits, rejects stale completion, and cleans up without reducing visited counts', async () => {
    const { t, member, boardId } = await setup();
    const id = await member.mutation(api.wishlist.add, {
      boardId,
      title: 'Cafe',
      notes: 'Original',
      link: 'https://example.com',
    });
    const visitId = await member.mutation(api.wishlist.ensureVisit, { id });
    await member.mutation(api.visits.update, {
      visitId,
      expectedRevision: 0,
      title: 'New cafe',
      date: '',
      place: 'New address',
      notes: 'Bring friends',
      savedLink: '',
      location: { latitude: 12, longitude: 77 },
      showDishes: true,
    });
    expect(await member.query(api.wishlist.get, { id })).toMatchObject({
      title: 'New cafe',
      notes: 'Bring friends',
      place: 'New address',
      location: { latitude: 12, longitude: 77 },
    });
    expect((await member.query(api.wishlist.get, { id }))?.link).toBeUndefined();
    await expect(
      member.mutation(api.visits.markVisited, { visitId, date: '2026-10-20', expectedRevision: 0 }),
    ).rejects.toThrow(/changed/);
    expect((await member.query(api.visits.get, { visitId })).visit.status).toBe('planned');
    await member.mutation(api.visits.remove, { visitId });
    expect((await t.run((ctx) => ctx.db.get(id)))?.deletedAt).toBeDefined();
    expect((await member.query(api.boards.summaries, {}))[0].visitCount).toBe(0);
  });

  it('migrates all batches and excludes plans from count and place backfills', async () => {
    vi.useFakeTimers();
    try {
      const { t, member, userId, boardId } = await setup();
      await t.run(async (ctx) => {
        for (let i = 0; i < 60; i++)
          await ctx.db.insert('wishlist', {
            boardId,
            creatorId: userId,
            title: `Place ${i}`,
            notes: `Keep ${i}`,
            createdAt: i,
          });
        await ctx.db.patch(boardId, { visitCount: undefined });
      });
      await member.mutation(api.wishlist.ensurePlanned, { boardId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await member.mutation(api.wishlist.ensurePlanned, { boardId });
      await member.mutation(api.boards.ensureCounts, { boardId });
      await member.mutation(api.places.ensureLinked, { boardId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const wishes = await t.run((ctx) => ctx.db.query('wishlist').collect());
      expect(wishes).toHaveLength(60);
      expect(new Set(wishes.map((wish) => wish.visitId)).size).toBe(60);
      expect(wishes.every((wish) => !!wish.visitId)).toBe(true);
      const plans = await t.run((ctx) => ctx.db.query('visits').collect());
      expect(plans).toHaveLength(60);
      expect(plans.every((visit) => visit.status === 'planned' && !visit.placeId)).toBe(true);
      expect((await member.query(api.boards.summaries, {}))[0].visitCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
