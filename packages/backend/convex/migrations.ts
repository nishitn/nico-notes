import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { normalizedPlaceKey } from './places';
import { liveWriter } from './softDeletion';
import { isQuietNotification, legacyVisitMessage } from '../notificationText';

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

// Operator-only and resumable. Retired events are archived, never hard-deleted.
export const notificationPreferences = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    scanned: v.number(),
    archived: v.number(),
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { cursor }) => {
    const batch = await ctx.db.query('boardChanges').paginate({ cursor, numItems: 100 });
    const writer = liveWriter(ctx);
    let archived = 0;
    let updated = 0;
    for (const change of batch.page) {
      if (change.deletedAt !== undefined) continue;
      if (isQuietNotification(change.summary)) {
        await writer.delete(change._id);
        archived++;
        continue;
      }
      if (!change.message && change.visitId) {
        const visit = await ctx.db.get(change.visitId);
        if (visit?.boardId === change.boardId) {
          const message = legacyVisitMessage(change.summary, visit);
          if (message) {
            await ctx.db.patch(change._id, {
              message,
              summary: `${message.prefix}${message.title}${message.suffix}`,
            });
            updated++;
          }
        }
      } else if (change.summary === 'joined the board' || change.summary === 'left the board') {
        const board = await ctx.db.get(change.boardId);
        if (board) {
          await ctx.db.patch(change._id, { summary: `${change.summary}: ${board.name}` });
          updated++;
        }
      }
    }
    return {
      scanned: batch.page.length,
      archived,
      updated,
      nextCursor: batch.isDone ? null : batch.continueCursor,
    };
  },
});
