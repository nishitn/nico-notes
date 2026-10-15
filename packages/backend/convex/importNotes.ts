import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { bangaloreNotes } from '../imports/bangalore';
import { linkVisit } from './places';
import { validScore } from '../shared';

// Operator-only, idempotent import. Never exposed as an unauthenticated seed endpoint.
export const bangalore = internalMutation({
  args: { boardId: v.id('boards') },
  returns: v.object({ inserted: v.number(), skipped: v.number(), ratings: v.number() }),
  handler: (ctx, { boardId }) => importBangalore(ctx, boardId),
});

async function importBangalore(ctx: MutationCtx, boardId: Id<'boards'>, mansiUserId?: Id<'users'>) {
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
      if (!existing.placeId && !existing.location && note.location)
        await ctx.db.patch(existing._id, { location: note.location });
      if (!existing.placeId && existing.place === 'Near Bangalore, Bangalore')
        await ctx.db.patch(existing._id, { place: 'Near Bangalore' });
      await linkVisit(ctx, existing._id);
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
    await linkVisit(ctx, visitId);
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
          ...(author === 'Nishit'
            ? { userId: board.ownerId }
            : mansiUserId
              ? { userId: mansiUserId }
              : { importedName: author }),
          note: [personalNote, kind === 'category' ? description : ''].filter(Boolean).join(' '),
        });
        ratings++;
      }
    }
    inserted++;
  }
  return { inserted, skipped, ratings };
}

// Operator-only recovery from the original notes. Existing authentication accounts are reused.
export const restoreBangalore = internalMutation({
  args: { ownerId: v.id('users'), mansiUserId: v.id('users') },
  returns: v.object({
    boardId: v.id('boards'),
    inserted: v.number(),
    skipped: v.number(),
    ratings: v.number(),
  }),
  handler: async (ctx, { ownerId, mansiUserId }) => {
    const nishit = await ctx.db.get(ownerId);
    const mansi = await ctx.db.get(mansiUserId);
    if (
      !nishit?.name?.toLowerCase().includes('nishit') ||
      !mansi?.name?.toLowerCase().includes('mansi') ||
      ownerId === mansiUserId
    ) {
      throw new ConvexError('Select Nishit and Mansi’s existing accounts.');
    }
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q) => q.eq('userId', ownerId))
      .take(101);
    if (memberships.length > 100) throw new ConvexError('Too many boards for automatic recovery.');
    // A repeated operator invocation must not duplicate the restored board or its scores.
    for (const membership of memberships) {
      const board = await ctx.db.get(membership.boardId);
      if (!board || board.deleting || board.ownerId !== ownerId) continue;
      const firstVisit = await ctx.db
        .query('visits')
        .withIndex('by_boardId_and_importKey', (q) =>
          q.eq('boardId', board._id).eq('importKey', 'bangalore-notes-v1:0'),
        )
        .unique();
      // Match imported content even when the board has been renamed.
      if (!firstVisit && board.name !== 'Visits') continue;
      const partner = await ctx.db
        .query('memberships')
        .withIndex('by_boardId_and_userId', (q) =>
          q.eq('boardId', board._id).eq('userId', mansiUserId),
        )
        .unique();
      if (!firstVisit || !partner)
        throw new ConvexError('An existing board needs inspection before restoring.');
      return { boardId: board._id, ...(await importBangalore(ctx, board._id, mansiUserId)) };
    }
    const boardId = await ctx.db.insert('boards', {
      name: 'Visits',
      description: '',
      accent: 'coral',
      ownerId,
      deleting: false,
    });
    for (const userId of [ownerId, mansiUserId]) {
      await ctx.db.insert('memberships', { boardId, userId });
    }
    await ctx.db.insert('visitTypes', {
      boardId,
      name: 'Food',
      categories: ['Food', 'Ambience', 'Value'],
      showDishes: true,
    });
    await ctx.db.insert('visitTypes', {
      boardId,
      name: 'Adventure',
      categories: ['Experience', 'View'],
      showDishes: false,
    });
    return { boardId, ...(await importBangalore(ctx, boardId, mansiUserId)) };
  },
});
