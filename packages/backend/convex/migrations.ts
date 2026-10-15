import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { normalizedPlaceKey } from './places';

// Operator-only, bounded and resumable. Preserve IDs, visit links and legacy metadata.
// Deploy with optional matchKey first; tighten it after every batch has completed.
export const placeMatchKeys = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { cursor }) => {
    const batch = await ctx.db.query('places').paginate({ cursor, numItems: 100 });
    let updated = 0;
    for (const place of batch.page) {
      const matchKey = normalizedPlaceKey(place.name, place.address);
      if (place.matchKey === matchKey) continue;
      await ctx.db.patch(place._id, { matchKey });
      updated++;
    }
    return {
      scanned: batch.page.length,
      updated,
      nextCursor: batch.isDone ? null : batch.continueCursor,
    };
  },
});
