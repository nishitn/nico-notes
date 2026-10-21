import { expect, it } from 'vite-plus/test';
import { comparePlacesByLatestVisit, latestBoardVisitsByPlace } from './placeSort';

it('uses board history numbers across places and repeated undated visits', () => {
  const history = [
    { _id: 'dated', _creationTime: 100, placeId: 'cafe', date: '2026-10-21' },
    { _id: 'repeat', _creationTime: 90, placeId: 'park', date: '' },
    { _id: 'other', _creationTime: 80, placeId: 'museum', date: '' },
    { _id: 'first', _creationTime: 70, placeId: 'park', date: '' },
  ];
  const latest = latestBoardVisitsByPlace(history, true);
  expect(latest.get('park')).toMatchObject({ id: 'repeat', date: '', number: 3 });
  expect(latest.get('museum')?.number).toBe(2);
  expect(latest.get('cafe')).toMatchObject({ date: '2026-10-21', number: 4 });
  // Visit numbers change when history changes, including removal of another place.
  expect(
    latestBoardVisitsByPlace(
      history.filter((v) => v._id !== 'other'),
      true,
    ).get('park')?.number,
  ).toBe(2);
});

it('waits for complete history before assigning numbers and ignores unlinked visits', () => {
  const history = [
    { _id: 'newer', _creationTime: 100, placeId: 'cafe', date: '' },
    { _id: 'unlinked', _creationTime: 90, date: '' },
    { _id: 'older', _creationTime: 80, placeId: 'cafe', date: '' },
  ];
  expect(latestBoardVisitsByPlace(history.slice(0, 1), false).get('cafe')).toMatchObject({
    id: 'newer',
    number: undefined,
  });
  const complete = latestBoardVisitsByPlace(history, true);
  expect(complete.get('cafe')?.number).toBe(3);
  expect(complete.size).toBe(1);
});

it('follows board visit order across backdated, same-day and undated visits', () => {
  const places = [
    { name: 'Backdated', latestVisit: { date: '2026-09-01', creationTime: 900, id: 'a' } },
    { name: 'Undated newer', latestVisit: { date: '', creationTime: 800, id: 'b' } },
    { name: 'Latest day', latestVisit: { date: '2026-10-20', creationTime: 100, id: 'c' } },
    { name: 'Same day earlier', latestVisit: { date: '2026-10-19', creationTime: 200, id: 'd' } },
    { name: 'Same day later', latestVisit: { date: '2026-10-19', creationTime: 300, id: 'e' } },
    { name: 'Undated older', latestVisit: { date: '', creationTime: 400, id: 'f' } },
    { name: 'Missing visit', latestVisit: null },
  ];
  expect(places.sort(comparePlacesByLatestVisit).map((place) => place.name)).toEqual([
    'Latest day',
    'Same day later',
    'Same day earlier',
    'Backdated',
    'Undated newer',
    'Undated older',
    'Missing visit',
  ]);
});

it('breaks timestamp ties by visit ID and missing-visit ties by name', () => {
  const visit = { date: '2026-10-20', creationTime: 100 };
  expect(
    comparePlacesByLatestVisit(
      { name: 'Z', latestVisit: { ...visit, id: 'a' } },
      { name: 'A', latestVisit: { ...visit, id: 'b' } },
    ),
  ).toBeGreaterThan(0);
  expect(
    comparePlacesByLatestVisit({ name: 'A', latestVisit: null }, { name: 'Z', latestVisit: null }),
  ).toBeLessThan(0);
});
