import { expect, it } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

const modules = import.meta.glob('../convex/**/*.*s');

it('restores the notes once with both existing accounts and editable Mansi ratings', async () => {
  const t = convexTest(schema, modules);
  const accounts = await t.run(async (ctx) => ({
    ownerId: await ctx.db.insert('users', { name: 'Nishit Nagar' }),
    mansiUserId: await ctx.db.insert('users', { name: 'mansi goyal' }),
  }));
  const restored = await t.mutation(internal.importNotes.restoreBangalore, accounts);
  expect(restored).toMatchObject({ inserted: 22, ratings: 92 });
  await t.run((ctx) => ctx.db.patch(restored.boardId, { name: 'Our memories' }));
  const retry = await t.mutation(internal.importNotes.restoreBangalore, accounts);
  expect(retry).toEqual({ boardId: restored.boardId, inserted: 0, ratings: 0, skipped: 22 });
  const mansi = t.withIdentity({ subject: `${accounts.mansiUserId}|mansi-session` });
  const board = await mansi.query(api.boards.get, { boardId: restored.boardId });
  expect(board.members.map((m) => m._id).sort()).toEqual(Object.values(accounts).sort());
  const places = await mansi.query(api.visits.places, {
    boardId: restored.boardId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(places.page).toHaveLength(22);
  const amudham = places.page.find((p) => p.title === 'Amudham')!;
  const details = await mansi.query(api.visits.get, { visitId: amudham._id });
  const rating = details.ratings.find((r) => r.userId === accounts.mansiUserId)!;
  expect(rating.score).toBe(8.5);
  expect(rating.importedName).toBeUndefined();
  expect(rating.note).toContain('8.59');
  await mansi.mutation(api.ratings.save, {
    visitId: amudham._id,
    kind: 'dish',
    targetId: rating.targetId as Id<'dishes'>,
    score: 9,
    note: rating.note,
  });
  const updated = await mansi.query(api.visits.get, { visitId: amudham._id });
  expect(updated.ratings).toHaveLength(details.ratings.length);
  expect(updated.ratings.find((r) => r._id === rating._id)?.score).toBe(9);
});
