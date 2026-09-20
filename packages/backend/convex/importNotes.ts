import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { bangaloreNotes } from '../imports/bangalore';
import { validScore } from '../shared';

// Operator-only, idempotent import. Never exposed as an unauthenticated seed endpoint.
export const bangalore = internalMutation({
  args: { boardId: v.id('boards') },
  returns: v.object({ inserted: v.number(), skipped: v.number(), ratings: v.number() }),
  handler: async (ctx, { boardId }) => {
    const board = await ctx.db.get(boardId);
    if (!board || board.deleting) throw new ConvexError('Board unavailable.');
    const owner = await ctx.db.get(board.ownerId);
    if (!owner?.name?.toLowerCase().includes('nishit'))
      throw new ConvexError('Import requires Nishit’s board.');
    let inserted = 0,
      skipped = 0,
      ratings = 0;
    for (const [index, note] of bangaloreNotes.entries()) {
      const importKey = `bangalore-notes-v1:${index}`;
      const existing = await ctx.db
        .query('visits')
        .withIndex('by_boardId_and_importKey', (q) =>
          q.eq('boardId', boardId).eq('importKey', importKey),
        )
        .unique();
      if (existing) {
        // Fill newly verified locations without overwriting a pin or editing notes/ratings.
        if (!existing.location && note.location)
          await ctx.db.patch(existing._id, { location: note.location });
        if (existing.place === 'Near Bangalore, Bangalore')
          await ctx.db.patch(existing._id, { place: 'Near Bangalore' });
        skipped++;
        continue;
      }
      const visitId = await ctx.db.insert('visits', {
        boardId,
        creatorId: board.ownerId,
        title: note.title,
        date: '',
        place:
          note.area === 'Near Bangalore'
            ? note.area
            : note.area
              ? `${note.area}, Bangalore`
              : 'Bangalore',
        notes: note.notes ?? '',
        typeName: note.categories ? 'Adventure' : 'Food',
        showDishes: !note.categories,
        visitNumber: note.visitNumber ?? 1,
        importKey,
        location: note.location,
        mapQuery: note.mapQuery ?? `${note.title} ${note.area ?? ''} Bangalore`,
      });
      for (const [position, item] of (note.dishes ?? note.categories ?? []).entries()) {
        const [name, mansi, nishit, description = '', mansiNote = '', nishitNote = ''] = item;
        const kind = note.categories ? ('category' as const) : ('dish' as const);
        const targetId =
          kind === 'dish'
            ? await ctx.db.insert('dishes', { visitId, name, description })
            : await ctx.db.insert('categories', { visitId, name, position });
        for (const [author, score, personalNote] of [
          ['Mansi', mansi, mansiNote],
          ['Nishit', nishit, nishitNote],
        ] as const) {
          if (score === null) continue;
          if (!validScore(score)) throw new ConvexError('Invalid score in import.');
          await ctx.db.insert('ratings', {
            visitId,
            targetId,
            kind,
            score,
            ...(author === 'Nishit' ? { userId: board.ownerId } : { importedName: author }),
            note: [personalNote, kind === 'category' ? description : ''].filter(Boolean).join(' '),
          });
          ratings++;
        }
      }
      inserted++;
    }
    return { inserted, skipped, ratings };
  },
});
