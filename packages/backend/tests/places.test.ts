import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { safeRedirect } from '../redirect';
import { textValue } from '../shared';

const modules = import.meta.glob('../convex/**/*.*s');
const fields = {
  title: 'Café Table',
  place: '12 Main Street',
  date: '2026-09-20',
  notes: '',
  showDishes: true,
};
async function setup() {
  const t = convexTest(schema, modules);
  const [adminId, memberId, outsiderId] = await t.run(async (ctx) =>
    Promise.all(['Admin', 'Member', 'Outsider'].map((name) => ctx.db.insert('users', { name }))),
  );
  const admin = t.withIdentity({ subject: `${adminId}|session` });
  const member = t.withIdentity({ subject: `${memberId}|session` });
  const outsider = t.withIdentity({ subject: `${outsiderId}|session` });
  const boardId = await admin.mutation(api.boards.create, {
    name: 'Visits',
    description: '',
    accent: 'coral',
  });
  await t.run((ctx) => ctx.db.insert('memberships', { boardId, userId: memberId, role: 'member' }));
  const create = (
    overrides: Partial<Parameters<typeof admin.mutation<typeof api.visits.create>>[1]> = {},
  ) => admin.mutation(api.visits.create, { boardId, ...fields, ...overrides });
  const get = async (visitId: Id<'visits'>) =>
    (await admin.query(api.visits.get, { visitId })).visit;
  return { t, admin, member, outsider, adminId, memberId, boardId, create, get };
}
afterEach(() => vi.useRealTimers());

describe('Canonical places', () => {
  it('matches normalized names and addresses, then prefers Google identity and canonical snapshots', async () => {
    const { t, create, get } = await setup();
    const first = await create({ location: { latitude: 12, longitude: 77 } });
    const second = await create({
      title: '  CAFE   TABLE ',
      place: '12, MAIN street',
      googlePlaceId: 'google-1',
    });
    const third = await create({
      title: 'A different display name',
      place: 'A stale address',
      googlePlaceId: 'google-1',
      location: { latitude: 1, longitude: 2 },
    });
    const visits = await Promise.all([first, second, third].map(get));
    expect(new Set(visits.map((visit) => visit.placeId)).size).toBe(1);
    expect(visits.map((visit) => visit.visitNumber)).toEqual([1, 2, 3]);
    for (const visit of visits) {
      expect(visit.place).toBe('12 Main Street');
      expect(visit.location).toEqual({ latitude: 12, longitude: 77 });
      expect(visit.googlePlaceId).toBe('google-1');
    }
    const different = await create({ googlePlaceId: 'google-2' });
    expect((await get(different)).placeId).not.toBe(visits[0].placeId);
    expect(await t.run((ctx) => ctx.db.query('places').collect())).toHaveLength(2);
  });

  it('renumbers on backdated creation, date edits, place moves and deletion', async () => {
    const { create, get, admin } = await setup();
    const later = await create();
    const earlier = await create({ date: '2026-09-01' });
    expect((await get(later)).visitNumber).toBe(2);
    expect((await get(earlier)).visitNumber).toBe(1);
    await admin.mutation(api.visits.update, { visitId: later, ...fields, date: '2026-08-01' });
    expect((await get(later)).visitNumber).toBe(1);
    expect((await get(earlier)).visitNumber).toBe(2);
    await admin.mutation(api.visits.update, { visitId: later, ...fields, title: 'Another place' });
    expect((await get(earlier)).visitNumber).toBe(1);
    const third = await create();
    await admin.mutation(api.visits.remove, { visitId: earlier });
    expect((await get(third)).visitNumber).toBe(1);
  });

  it('propagates canonical address/pin edits, including removing a pin', async () => {
    const { create, get, admin, t } = await setup();
    const first = await create();
    const second = await create();
    await admin.mutation(api.visits.update, {
      visitId: first,
      ...fields,
      place: 'Correct address',
      location: { latitude: 20, longitude: 80 },
    });
    for (const id of [first, second])
      expect(await get(id)).toMatchObject({
        place: 'Correct address',
        location: { latitude: 20, longitude: 80 },
      });
    const updated = await get(first);
    expect(await t.run((ctx) => ctx.db.get(updated.placeId!))).toMatchObject({
      address: 'Correct address',
    });
    await admin.mutation(api.visits.update, {
      visitId: first,
      ...fields,
      place: 'Correct address',
      location: null,
    });
    expect((await get(second)).location).toBeUndefined();
  });

  it('merges matching canonical records after a manual address correction', async () => {
    const { create, get, admin, t } = await setup();
    const first = await create({ place: 'Typo address', date: '2026-09-01' });
    const second = await create();
    const oldPlace = (await get(first)).placeId!;
    await admin.mutation(api.visits.update, { visitId: first, ...fields, date: '2026-09-01' });
    expect((await get(first)).placeId).toBe((await get(second)).placeId);
    expect((await get(first)).visitNumber).toBe(1);
    expect((await get(second)).visitNumber).toBe(2);
    expect(await t.run((ctx) => ctx.db.get(oldPlace))).toBeNull();
  });

  it('merges a matched legacy place into an existing Google place and preserves ratings', async () => {
    const { create, get, member, admin, t } = await setup();
    const first = await create({ place: '', date: '2026-09-01' });
    const second = await create({ googlePlaceId: 'known' });
    const source = (await get(first)).placeId!;
    const target = (await get(second)).placeId!;
    await member.mutation(api.ratings.save, {
      visitId: first,
      kind: 'overall',
      targetId: first,
      score: 8,
      note: '',
    });
    const result = await member.mutation(api.places.match, {
      placeId: source,
      name: 'Verified Café',
      address: 'Verified street',
      googlePlaceId: 'known',
      location: { latitude: 10, longitude: 11 },
    });
    expect(result).toBe(target);
    expect(await t.run((ctx) => ctx.db.get(source))).toBeNull();
    expect(await get(first)).toMatchObject({
      placeId: target,
      place: 'Verified street',
      visitNumber: 1,
    });
    expect(await get(second)).toMatchObject({
      placeId: target,
      place: 'Verified street',
      visitNumber: 2,
    });
    expect((await admin.query(api.visits.get, { visitId: first })).ratings).toHaveLength(1);
  });

  it('links legacy visits automatically, is idempotent, and supports the all-board backfill', async () => {
    vi.useFakeTimers();
    const { t, adminId, boardId, member, get, create } = await setup();
    const old = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 3; i++)
        ids.push(
          await ctx.db.insert('visits', {
            ...fields,
            boardId,
            creatorId: adminId,
            typeName: 'Food',
            visitNumber: 99,
          }),
        );
      return ids;
    });
    await Promise.all([
      member.mutation(api.places.ensureLinked, { boardId }),
      member.mutation(api.places.ensureLinked, { boardId }),
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await Promise.all(old.map(get))).map((visit) => visit.visitNumber)).toEqual([1, 2, 3]);
    await member.mutation(api.places.ensureLinked, { boardId });
    await t.mutation(internal.places.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query('places').collect())).toHaveLength(1);
    const next = await create();
    expect((await get(next)).visitNumber).toBe(4);
  });

  it('backfills unopened boards and removes their places during board deletion', async () => {
    vi.useFakeTimers();
    const { t, admin, boardId, adminId, get } = await setup();
    const legacy = await t.run((ctx) =>
      ctx.db.insert('visits', { ...fields, boardId, creatorId: adminId, typeName: 'Food' }),
    );
    await t.mutation(internal.places.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await get(legacy)).placeId).toBeDefined();
    await admin.mutation(api.boards.remove, { boardId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query('places').collect())).toEqual([]);
  });

  it('prevents a match from splitting a legacy group while linking is still in progress', async () => {
    vi.useFakeTimers();
    const { create, get, t, admin, boardId, adminId } = await setup();
    const linked = await create();
    const placeId = (await get(linked)).placeId!;
    const legacy = await t.run((ctx) =>
      ctx.db.insert('visits', { ...fields, boardId, creatorId: adminId, typeName: 'Food' }),
    );
    const selection = {
      placeId,
      name: 'Verified cafe',
      address: 'Verified address',
      googlePlaceId: 'known',
      location: { latitude: 1, longitude: 2 },
    };
    await expect(admin.mutation(api.places.match, selection)).rejects.toThrow(/still being linked/);
    await admin.mutation(api.places.ensureLinked, { boardId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await admin.mutation(api.places.match, selection);
    expect((await get(linked)).placeId).toBe((await get(legacy)).placeId);
    expect((await get(legacy)).place).toBe('Verified address');
  });

  it('isolates board identities and rejects cross-board links and unauthorized matches/backfills', async () => {
    const { admin, outsider, boardId, create, get } = await setup();
    const first = await create({ googlePlaceId: 'known' });
    const placeId = (await get(first)).placeId!;
    const otherBoard = await outsider.mutation(api.boards.create, {
      name: 'Private',
      description: '',
      accent: 'sage',
    });
    const other = await outsider.mutation(api.visits.create, {
      boardId: otherBoard,
      ...fields,
      googlePlaceId: 'known',
    });
    const otherPlace = (await outsider.query(api.visits.get, { visitId: other })).visit.placeId!;
    expect(otherPlace).not.toBe(placeId);
    await expect(create({ placeId: otherPlace })).rejects.toThrow(/this board/);
    await expect(
      outsider.mutation(api.places.match, {
        placeId,
        name: 'Bad',
        address: '',
        googlePlaceId: 'known',
        location: { latitude: 0, longitude: 0 },
      }),
    ).rejects.toThrow(/access/);
    await expect(outsider.mutation(api.places.ensureLinked, { boardId })).rejects.toThrow(/access/);
    await expect(
      admin.mutation(api.places.match, {
        placeId,
        name: 'Bad',
        address: '',
        googlePlaceId: 'known',
        location: { latitude: 91, longitude: 0 },
      }),
    ).rejects.toThrow(/valid map/);
  });

  it('returns every photo ID for the carousel', async () => {
    const { create, t, adminId, admin, boardId } = await setup();
    const visitId = await create();
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++)
        await ctx.db.insert('photos', {
          visitId,
          uploaderId: adminId,
          caption: '',
          contentType: 'image/png',
        });
    });
    const result = await admin.query(api.visits.list, {
      boardId,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(result.page[0].photoIds).toHaveLength(10);
  });
});

describe('Removal and leaving permissions', () => {
  it('members cannot delete dishes, categories or types, or remove preset categories by editing', async () => {
    const { admin, member, create, boardId } = await setup();
    const visitId = await create();
    const dish = await member.mutation(api.items.saveDish, {
      visitId,
      name: 'Soup',
      description: '',
    });
    const category = await member.mutation(api.items.saveCategory, { visitId, name: 'View' });
    const typeId = await member.mutation(api.visitTypes.save, {
      boardId,
      name: 'Walk',
      categories: ['View'],
      showDishes: false,
    });
    for (const target of [dish, category])
      await expect(
        member.mutation(api.items.remove, { visitId, target, confirmed: true }),
      ).rejects.toThrow(/admin/);
    await expect(member.mutation(api.visitTypes.remove, { id: typeId })).rejects.toThrow(/admin/);
    await expect(
      member.mutation(api.visitTypes.save, {
        boardId,
        id: typeId,
        name: 'Walk',
        categories: [],
        showDishes: false,
      }),
    ).rejects.toThrow(/admin/);
    for (const target of [dish, category])
      await admin.mutation(api.items.remove, { visitId, target, confirmed: true });
    await admin.mutation(api.visitTypes.remove, { id: typeId });
  });

  it('members can leave, contributions remain, and the last admin must stay', async () => {
    const { admin, member, boardId, memberId } = await setup();
    const visitId = await member.mutation(api.visits.create, { boardId, ...fields });
    await member.mutation(api.boards.leave, { boardId });
    await expect(member.query(api.visits.get, { visitId })).rejects.toThrow(/access/);
    expect((await admin.query(api.visits.get, { visitId })).visit.creatorId).toBe(memberId);
    await expect(admin.mutation(api.boards.leave, { boardId })).rejects.toThrow(
      /at least one admin/,
    );
  });
});

describe('User errors and sign-in redirects', () => {
  it('uses Convex errors for user input validation', () => {
    expect(() => textValue(' ', 'Name')).toThrow(ConvexError);
    try {
      textValue(' ', 'Name');
    } catch (error) {
      expect((error as ConvexError<string>).data).toBe(
        'Name must be between 1 and 120 characters.',
      );
    }
  });
  it('preserves internal paths and same-origin legacy URLs', () => {
    expect(safeRedirect('/invite/abc?x=1#join', 'https://notes.example')).toBe(
      'https://notes.example/invite/abc?x=1#join',
    );
    expect(safeRedirect('https://notes.example/boards', 'https://notes.example')).toBe(
      'https://notes.example/boards',
    );
  });
  it.each([
    'https://notes.example.evil.test/steal',
    'https://notes.example@evil.test/',
    '//evil.test/',
    '/\\evil.test/',
    'javascript:alert(1)',
    'data:text/html,test',
    'https://evil.test/',
    'http://notes.example/',
    'https://notes.example:444/',
    '/\n/evil.test/',
    'https://user:pass@notes.example/',
    'boards',
  ])('rejects unsafe redirect %s', (url) => {
    expect(safeRedirect(url, 'https://notes.example')).toBe('https://notes.example/');
  });
  it('fails closed without a configured site', () => {
    expect(() => safeRedirect('https://evil.test/')).toThrow(ConvexError);
  });
});
