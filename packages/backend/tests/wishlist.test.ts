import { describe, expect, it } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';

const modules = import.meta.glob('../convex/**/*.*s');

async function setup() {
  const t = convexTest(schema, modules);
  const [adminId, memberId, outsiderId] = await t.run(async (ctx) =>
    Promise.all(['Admin', 'Member', 'Outsider'].map((name) => ctx.db.insert('users', { name }))),
  );
  const admin = t.withIdentity({ subject: `${adminId}|session` });
  const member = t.withIdentity({ subject: `${memberId}|session` });
  const outsider = t.withIdentity({ subject: `${outsiderId}|session` });
  const boardId = await admin.mutation(api.boards.create, {
    name: 'Dates',
    description: '',
    accent: 'coral',
  });
  await t.run((ctx) => ctx.db.insert('memberships', { boardId, userId: memberId, role: 'member' }));
  return { t, admin, member, outsider, boardId };
}

describe('board wishlist', () => {
  it('allows members to add and list wishlist places', async () => {
    const { member, boardId } = await setup();
    const id = await member.mutation(api.wishlist.add, {
      boardId,
      title: 'Toit Brewpub',
      place: 'Indiranagar, Bangalore',
      location: { latitude: 12.979, longitude: 77.64 },
      googlePlaceId: 'ChIJtoit',
      notes: 'Try the Basmati Blonde',
    });
    expect(id).toBeDefined();

    const list = await member.query(api.wishlist.list, {
      boardId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page).toHaveLength(1);
    expect(list.page[0].title).toBe('Toit Brewpub');
    expect(list.page[0].notes).toBe('Try the Basmati Blonde');

    const savedIds = await member.query(api.wishlist.savedPlaceIds, { boardId });
    expect(savedIds).toEqual(['ChIJtoit']);
  });

  it('deduplicates places with the same googlePlaceId and updates notes', async () => {
    const { member, boardId } = await setup();
    const id1 = await member.mutation(api.wishlist.add, {
      boardId,
      title: 'Toit',
      googlePlaceId: 'ChIJtoit',
      notes: 'First note',
    });
    const id2 = await member.mutation(api.wishlist.add, {
      boardId,
      title: 'Toit Brewpub',
      googlePlaceId: 'ChIJtoit',
      notes: 'Updated note',
    });
    expect(id1).toBe(id2);

    const list = await member.query(api.wishlist.list, {
      boardId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page).toHaveLength(1);
    expect(list.page[0].notes).toBe('Updated note');
  });

  it('prevents outsiders from viewing or adding to wishlist', async () => {
    const { outsider, boardId } = await setup();
    await expect(
      outsider.mutation(api.wishlist.add, {
        boardId,
        title: 'Secret Place',
      }),
    ).rejects.toThrow();

    await expect(
      outsider.query(api.wishlist.list, {
        boardId,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
  });

  it('allows members to remove a wishlist place', async () => {
    const { member, boardId } = await setup();
    const id = await member.mutation(api.wishlist.add, {
      boardId,
      title: 'Truffles',
    });
    await member.mutation(api.wishlist.remove, { id, confirmed: true });

    const list = await member.query(api.wishlist.list, {
      boardId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page).toHaveLength(0);
  });
});
