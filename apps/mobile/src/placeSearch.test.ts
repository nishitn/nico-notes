import { describe, expect, it } from 'vite-plus/test';
import {
  distanceBetween,
  formatDistance,
  matchingPlaces,
  placeSearchError,
  withinSearchRadius,
} from './placeSearch';

const places = [
  {
    name: 'Bistro Claytopia',
    address: 'Koramangala, Bangalore',
    location: { latitude: 12.93, longitude: 77.62 },
  },
  { name: 'Café Élan', address: 'Indiranagar', location: undefined },
  {
    name: 'Uttari Betta',
    address: 'Outside Bengaluru',
    location: { latitude: 12.9, longitude: 77.1 },
  },
];
describe('native place search', () => {
  it('finds saved places outside the visible nearby map', () => {
    expect(matchingPlaces(places, '  UTTARI  ')).toEqual([places[2]]);
  });
  it('searches names and addresses together, regardless of accents or punctuation', () => {
    expect(matchingPlaces(places, 'claytopia, koramangala')).toEqual([places[0]]);
    expect(matchingPlaces(places, 'cafe elan')).toEqual([places[1]]);
  });
  it('includes saved places without pins so they remain selectable', () => {
    expect(matchingPlaces(places, 'indiranagar')).toEqual([places[1]]);
  });
  it('clears to all saved places and returns no false matches', () => {
    expect(matchingPlaces(places, '   ')).toEqual(places);
    expect(matchingPlaces(places, 'unknown restaurant')).toEqual([]);
  });
  it('calculates distance between coordinates accurately', () => {
    const center = { latitude: 12.97, longitude: 77.59 };
    expect(distanceBetween(center, center)).toBe(0);
    const nearbyPoint = { latitude: 13.04, longitude: 77.59 };
    const distance = distanceBetween(nearbyPoint, center);
    expect(distance).toBeGreaterThan(7000);
    expect(distance).toBeLessThan(8500);
  });
  it('formats distance into user-friendly strings', () => {
    expect(formatDistance(50)).toBe('< 100 m');
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(1420)).toBe('1.4 km');
    expect(formatDistance(12400)).toBe('12 km');
  });
  it('supports checking search radius bounds', () => {
    const center = { latitude: 12.97, longitude: 77.59 };
    expect(withinSearchRadius({ latitude: 13.04, longitude: 77.59 }, center, 10000)).toBe(true);
    expect(withinSearchRadius({ latitude: 13.07, longitude: 77.59 }, center, 10000)).toBe(false);
  });
  it('gives actionable errors for a missing Places permission or quota', () => {
    expect(placeSearchError(new Error('Google place search: REQUEST_DENIED'))).toContain(
      'Places API (New)',
    );
    expect(placeSearchError(new Error('Google place search: OVER_QUERY_LIMIT'))).toContain('limit');
    expect(placeSearchError(new Error('request failed'))).toContain('connection');
  });
});
