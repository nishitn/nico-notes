import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { GOOGLE_PLACE_LABEL } from '../placePersistence';

const phase = v.union(
  v.literal('boards'),
  v.literal('places'),
  v.literal('visits'),
  v.literal('wishlist'),
);
/** Operator-only, repeatable, bounded production migration. No journal notes or files are removed. */
export const convexOnlyAndPlaceReferences = internalMutation({
  args: { phase, cursor: v.union(v.string(), v.null()) },
  returns: v.object({ isDone: v.boolean(), cursor: v.string(), updated: v.number() }),
  handler: async (ctx, { phase, cursor }) => {
    let updated = 0;
    if (phase === 'boards') {
      const page = await ctx.db.query('boards').paginate({ cursor, numItems: 50 });
      for (const row of page.page) {
        await ctx.db.patch(row._id, { photoStorage: 'convex' });
        updated++;
      }
      return { isDone: page.isDone, cursor: page.continueCursor, updated };
    }
    if (phase === 'places') {
      const page = await ctx.db.query('places').paginate({ cursor, numItems: 50 });
      for (const row of page.page) {
        if (!row.googlePlaceId) continue;
        await ctx.db.patch(row._id, {
          name: GOOGLE_PLACE_LABEL,
          address: '',
          location: undefined,
          mapQuery: undefined,
          key: undefined,
          matchKey: JSON.stringify(['google', row.googlePlaceId]),
        });
        updated++;
      }
      return { isDone: page.isDone, cursor: page.continueCursor, updated };
    }
    if (phase === 'visits') {
      const page = await ctx.db.query('visits').paginate({ cursor, numItems: 50 });
      for (const row of page.page) {
        if (!row.googlePlaceId) continue;
        await ctx.db.patch(row._id, {
          title: GOOGLE_PLACE_LABEL,
          place: '',
          location: undefined,
          mapQuery: undefined,
          revision: (row.revision ?? 0) + 1,
        });
        updated++;
      }
      return { isDone: page.isDone, cursor: page.continueCursor, updated };
    }
    const page = await ctx.db.query('wishlist').paginate({ cursor, numItems: 50 });
    for (const row of page.page) {
      if (!row.googlePlaceId) continue;
      await ctx.db.patch(row._id, { title: GOOGLE_PLACE_LABEL, place: '', location: undefined });
      updated++;
    }
    return { isDone: page.isDone, cursor: page.continueCursor, updated };
  },
});
