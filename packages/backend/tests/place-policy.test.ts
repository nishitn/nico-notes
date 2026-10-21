import { describe, expect, it } from 'vite-plus/test';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import { POLICY_VERSION } from '../legal';
import { projectLivePlaces, googlePlaceIds } from '../livePlaces';
import { attributionParts } from '../attributions';
const modules = import.meta.glob('../convex/**/*.*s');
const sdk = {
  title: 'Google venue',
  place: 'Google address',
  location: { latitude: 12, longitude: 77 },
  googlePlaceId: 'google-reference',
};
async function setup() {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => ctx.db.insert('users', { termsVersion: POLICY_VERSION }));
  const user = t.withIdentity({ subject: `${id}|session` });
  const boardId = await user.mutation(api.boards.create, {
    name: 'Journal',
    description: '',
    accent: 'coral',
  });
  return { t, user, boardId };
}
function referenceOnly(value: {
  title: string;
  place: string;
  location?: unknown;
  googlePlaceId?: string;
}) {
  expect(value).toMatchObject({
    title: 'Saved Google place',
    place: '',
    googlePlaceId: sdk.googlePlaceId,
  });
  expect(value.location).toBeUndefined();
}
describe('Google place content lifecycle', () => {
  it('discards SDK snapshots on creation, repeated visit editing, planned editing and wishlist updates', async () => {
    const { t, user, boardId } = await setup();
    for (const planned of [false, true]) {
      const visitId = await user.mutation(api.visits.create, {
        boardId,
        planned,
        ...sdk,
        date: '',
        notes: 'My journal note',
        showDishes: true,
      });
      referenceOnly((await user.query(api.visits.get, { visitId })).visit);
      await user.mutation(api.visits.update, {
        visitId,
        ...sdk,
        date: '',
        notes: 'My edited note',
        showDishes: true,
      });
      const visit = (await user.query(api.visits.get, { visitId })).visit;
      referenceOnly(visit);
      expect(visit.notes).toBe('My edited note');
      if (visit.wishlistId) {
        await user.mutation(api.wishlist.update, {
          id: visit.wishlistId,
          title: 'SDK label again',
          place: 'SDK address again',
          notes: 'Personal plan',
        });
        const wish = await user.query(api.wishlist.get, { id: visit.wishlistId });
        referenceOnly({ ...wish!, place: wish!.place ?? '' });
        expect(wish!.notes).toBe('Personal plan');
      }
    }
    const place = await t.run((ctx) => ctx.db.query('places').first());
    expect(place).toMatchObject({
      name: 'Saved Google place',
      address: '',
      googlePlaceId: sdk.googlePlaceId,
    });
    expect(place!.location).toBeUndefined();
  });
  it('allows an explicit change from a Google reference to a manually entered place', async () => {
    const { user, boardId } = await setup();
    const visitId = await user.mutation(api.visits.create, {
      boardId,
      ...sdk,
      date: '',
      notes: '',
      showDishes: false,
    });
    await user.mutation(api.visits.update, {
      visitId,
      clearGooglePlace: true,
      title: 'My own place',
      place: 'My own address',
      location: { latitude: 20, longitude: 80 },
      date: '',
      notes: '',
      showDishes: false,
    });
    const visit = (await user.query(api.visits.get, { visitId })).visit;
    expect(visit.googlePlaceId).toBeUndefined();
    expect(visit).toMatchObject({
      title: 'My own place',
      place: 'My own address',
      location: { latitude: 20, longitude: 80 },
    });
  });
  it('cleans legacy Google snapshots without changing manual places or personal notes', async () => {
    const { t, user, boardId } = await setup();
    const visitId = await user.mutation(api.visits.create, {
      boardId,
      ...sdk,
      date: '',
      notes: 'Keep me',
      showDishes: false,
    });
    await t.run((ctx) => ctx.db.patch(visitId, sdk));
    await t.mutation(internal.releaseMigrations.convexOnlyAndPlaceReferences, {
      phase: 'visits',
      cursor: null,
    });
    const visit = (await user.query(api.visits.get, { visitId })).visit;
    referenceOnly(visit);
    expect(visit.notes).toBe('Keep me');
  });
  it('hydrates a nested view without mutating the persisted response and hides stale details after lookup failure', () => {
    const saved = { page: [{ ...sdk, notes: 'Mine' }] };
    expect([...googlePlaceIds(saved)]).toEqual([sdk.googlePlaceId]);
    const live = {
      id: sdk.googlePlaceId,
      name: 'Live name',
      address: 'Live address',
      location: { latitude: 1, longitude: 2 },
    };
    expect(projectLivePlaces(saved, () => live).page[0]).toMatchObject({
      title: 'Live name',
      place: 'Live address',
      notes: 'Mine',
      location: live.location,
    });
    expect(saved.page[0].title).toBe(sdk.title);
    const missing = projectLivePlaces(saved, () => undefined);
    expect(missing.page[0].title).toBe('Saved Google place');
    expect(missing.page[0].place).toBe('');
    expect(missing.page[0].location).toBeUndefined();
  });
  it('keeps provider attribution links and emphasis while rejecting unsafe link protocols', () => {
    expect(
      attributionParts(
        'Listings by <a href="https://example.com/?a=1&amp;b=2"><b>Provider</b></a>',
      ),
    ).toContainEqual({
      text: 'Provider',
      href: 'https://example.com/?a=1&b=2',
      bold: true,
      italic: false,
    });
    expect(attributionParts('<a href="javascript:alert(1)">Provider</a>')[0].href).toBeUndefined();
  });
});
