import { describe, expect, it } from 'vite-plus/test';
import { markerSizes, preferVisitedPlaces } from '../mapMarkers';

describe('visited and wishlist map places', () => {
  const visited = {
    name: 'Third Wave Coffee',
    address: 'EcoWorld, Bangalore',
    googlePlaceId: 'third-wave-ecoworld',
    wishlist: false,
  };
  const identity = (place: typeof visited) => place;

  it('keeps the visited record when a wishlist item has the same Google place ID', () => {
    const wish = { ...visited, name: 'Coffee date', wishlist: true };
    expect(preferVisitedPlaces([wish, visited], identity)).toEqual([visited]);
  });

  it('matches manual places by normalized name and address', () => {
    const wish = {
      name: ' third wave  coffee ',
      address: ' ECOWORLD, BANGALORE ',
      googlePlaceId: '',
      wishlist: true,
    };
    expect(preferVisitedPlaces([visited, wish], identity)).toEqual([visited]);
  });

  it('keeps other branches and wishlist-only places separate', () => {
    const otherBranch = { ...visited, googlePlaceId: 'third-wave-hsr', wishlist: true };
    const manualBranch = { ...visited, googlePlaceId: '', address: 'HSR', wishlist: true };
    expect(preferVisitedPlaces([visited, otherBranch, manualBranch], identity)).toEqual([
      visited,
      otherBranch,
      manualBranch,
    ]);
    expect(preferVisitedPlaces([otherBranch], identity)).toEqual([otherBranch]);
  });

  it('matches a manual pin at the same location without matching nearby unrelated places', () => {
    const location = { latitude: 12.97, longitude: 77.59 };
    const visit = { ...visited, location };
    const wish = { ...visited, googlePlaceId: '', address: '', location, wishlist: true };
    const unrelated = { ...wish, name: 'Another cafe' };
    expect(preferVisitedPlaces([wish, visit, unrelated], (place) => place)).toEqual([
      visit,
      unrelated,
    ]);
  });
});

describe('map marker density', () => {
  it('shrinks smoothly with screen distance while keeping isolated icons full size', () => {
    const sizes = markerSizes([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 25, y: 0 },
      { id: 'isolated', x: 200, y: 0 },
    ]);
    expect([...sizes]).toEqual([
      ['a', 19],
      ['b', 19],
      ['isolated', 30],
    ]);
  });

  it('uses the nearest neighbour regardless of input order or cell boundary', () => {
    const points = [
      { id: 'a', x: -2, y: 39 },
      { id: 'b', x: 2, y: 41 },
      { id: 'c', x: 30, y: 41 },
    ];
    expect(markerSizes(points)).toEqual(markerSizes([...points].reverse()));
    expect(markerSizes(points).get('a')).toBe(8);
    expect(markerSizes(points).get('c')).toBe(22);
  });

  it('preserves every coincident place with a visible minimum dot', () => {
    expect([
      ...markerSizes([
        { id: 'a', x: 10, y: 10 },
        { id: 'b', x: 10, y: 10 },
      ]),
    ]).toEqual([
      ['a', 8],
      ['b', 8],
    ]);
  });
});
