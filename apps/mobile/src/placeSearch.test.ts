import { describe, expect, it } from 'vite-plus/test';
import { matchingPlaces, placeSearchError, withinSearchRadius } from './placeSearch';

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
  it('restricts new Google results to 10 km rather than the bounding-box corners', () => {
    const center = { latitude: 12.97, longitude: 77.59 };
    expect(withinSearchRadius({ latitude: 13.04, longitude: 77.59 }, center)).toBe(true);
    expect(withinSearchRadius({ latitude: 13.05, longitude: 77.67 }, center)).toBe(false);
    expect(withinSearchRadius({ latitude: 13.07, longitude: 77.59 }, center)).toBe(false);
  });
  it('gives actionable errors for a missing Places permission or quota', () => {
    expect(placeSearchError(new Error('Google place search: REQUEST_DENIED'))).toContain(
      'Places API (New)',
    );
    expect(placeSearchError(new Error('Google place search: OVER_QUERY_LIMIT'))).toContain('limit');
    expect(placeSearchError(new Error('request failed'))).toContain('connection');
  });
});
