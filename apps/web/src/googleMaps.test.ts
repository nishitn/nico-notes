import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

const { search, load } = vi.hoisted(() => ({ search: vi.fn(), load: vi.fn() }));
vi.mock('@googlemaps/js-api-loader', () => ({ setOptions: vi.fn(), importLibrary: load }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  load.mockImplementation(async (library: string) =>
    library === 'places' ? { Place: { searchByText: search } } : {},
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('restricts Google search to a local area and excludes places outside the 10 km circle', async () => {
  const { searchNearbyPlaces } = await import('./googleMaps');
  const makePlace = (id: string, lat: number, lng: number) => ({
    id,
    displayName: id,
    formattedAddress: 'Address',
    location: { lat: () => lat, lng: () => lng },
  });
  search.mockResolvedValue({
    places: [
      makePlace('nearby', 12.96, 77.65),
      makePlace('just-inside', 13.039, 77.65),
      makePlace('just-outside', 13.041, 77.65),
      makePlace('distant', 13.1, 77.65),
      makePlace('outside-circle-but-in-bounds', 13.03, 77.73),
      { id: 'no-coordinates' },
    ],
  });
  const results = await searchNearbyPlaces('coffee', { latitude: 12.95, longitude: 77.65 });
  expect(results.map((place) => place.id)).toEqual(['nearby', 'just-inside']);
  const request = search.mock.calls[0][0];
  expect(request.textQuery).toBe('coffee');
  expect(request.locationRestriction.north).toBeGreaterThan(13.03);
  expect(request.locationRestriction.north).toBeLessThan(13.04);
  expect(request.locationRestriction.south).toBeGreaterThan(12.86);
  expect(request.locationRestriction.south).toBeLessThan(12.87);
});

it('reports missing configuration without attempting to load Google Maps', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
  const { loadGoogleMaps } = await import('./googleMaps');
  await expect(loadGoogleMaps()).rejects.toThrow('isn’t configured');
  expect(load).not.toHaveBeenCalled();
});

it('can search without a device location instead of restricting to an old saved pin', async () => {
  const { searchNearbyPlaces } = await import('./googleMaps');
  search.mockResolvedValue({
    places: [
      {
        id: 'venue',
        displayName: 'Venue',
        formattedAddress: 'Bengaluru',
        location: { lat: () => 12.96, lng: () => 77.65 },
      },
    ],
  });
  const results = await searchNearbyPlaces('Venue Bengaluru');
  expect(search.mock.calls[0][0]).not.toHaveProperty('locationRestriction');
  expect(results[0]).toEqual({
    id: 'venue',
    title: 'Venue',
    place: 'Bengaluru',
    location: { latitude: 12.96, longitude: 77.65 },
  });
});

it('distinguishes configuration, quota, and transient search failures', async () => {
  const { placeSearchErrorMessage } = await import('./googleMaps');
  expect(placeSearchErrorMessage(new Error('PERMISSION_DENIED'))).toContain('isn’t enabled');
  expect(placeSearchErrorMessage(new Error('RESOURCE_EXHAUSTED'))).toContain('limit');
  expect(placeSearchErrorMessage(new Error('Network error'))).toContain('connection');
});
