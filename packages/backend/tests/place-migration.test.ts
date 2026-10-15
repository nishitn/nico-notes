import { describe, expect, it } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import schema from '../convex/schema';
import { internal } from '../convex/_generated/api';
import { normalizedPlaceKey } from '../convex/places';

const modules = import.meta.glob('../convex/**/*.*s');
// Model the widening phase, even after the final schema requires the backfilled key.
const migrationSchema = defineSchema({
  ...schema.tables,
  places: defineTable({
    ...schema.tables.places.validator.fields,
    matchKey: v.optional(v.string()),
  }),
});

describe('legacy place lookup-key migration', () => {
  it('resumes in bounded batches, preserves original rows and links, and is idempotent', async () => {
    const t = convexTest(migrationSchema, modules);
    const before = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Member' });
      const boardId = await ctx.db.insert('boards', {
        name: 'Visits',
        description: '',
        accent: 'coral',
        ownerId,
        deleting: false,
      });
      const rows = [];
      for (let i = 0; i < 103; i++) {
        const id = await ctx.db.insert('places', {
          boardId,
          name: `Café ${i}`,
          address: 'Bangalore',
          key: `cafe-${i}`,
          earlierVisits: 2,
          visitCount: 3,
          lastVisitDate: '2026-09-01',
          mapQuery: 'Original query',
          location: { latitude: 12, longitude: 77 },
          ...(i === 0 ? { googlePlaceId: 'google-place', matchKey: 'stale-key' } : {}),
        });
        rows.push((await ctx.db.get(id))!);
      }
      const visitId = await ctx.db.insert('visits', {
        boardId,
        creatorId: ownerId,
        title: rows[0].name,
        place: 'Bangalore',
        date: '',
        notes: '',
        typeName: 'Visit',
        showDishes: true,
        placeId: rows[0]._id,
      });
      return { rows, visit: (await ctx.db.get(visitId))! };
    });
    const first = await t.mutation(internal.migrations.placeMatchKeys, { cursor: null });
    expect(first).toMatchObject({ scanned: 100, updated: 100 });
    expect(first.nextCursor).not.toBeNull();
    const second = await t.mutation(internal.migrations.placeMatchKeys, {
      cursor: first.nextCursor,
    });
    expect(second).toEqual({ scanned: 3, updated: 3, nextCursor: null });
    await t.run(async (ctx) => {
      for (const row of before.rows) {
        expect(await ctx.db.get(row._id)).toEqual({
          ...row,
          matchKey: normalizedPlaceKey(row.name, row.address),
        });
      }
      expect(await ctx.db.get(before.visit._id)).toEqual(before.visit);
      expect(await ctx.db.query('places').take(200)).toHaveLength(103);
    });
    const repeated = await t.mutation(internal.migrations.placeMatchKeys, { cursor: null });
    expect(repeated.updated).toBe(0);
    expect(
      (
        await t.mutation(internal.migrations.placeMatchKeys, {
          cursor: repeated.nextCursor,
        })
      ).updated,
    ).toBe(0);
  });
});
