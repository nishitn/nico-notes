import type { LivePlace } from '@nico-notes/backend/livePlaces';
import { requireOptionalNativeModule } from 'expo';
import type { Coordinate } from '../../src/mapGeometry';

export type GooglePlace = {
  id: string;
  name: string;
  address: string;
  location: Coordinate;
  distance?: number;
  attributions?: string[];
};
const native = requireOptionalNativeModule<{
  fetchPlace(id: string): Promise<LivePlace>;
  search(query: string, latitude: number | null, longitude: number | null): Promise<GooglePlace[]>;
}>('NicoGooglePlaces');

export async function searchGooglePlaces(query: string, center?: Coordinate) {
  if (!native) throw new Error('Install the latest Android build to search Google Places.');
  return native.search(query, center?.latitude ?? null, center?.longitude ?? null);
}

export async function fetchGooglePlace(id: string): Promise<LivePlace> {
  if (typeof native?.fetchPlace !== 'function')
    throw new Error(
      'NATIVE_MODULE_UNAVAILABLE: Install the latest Android build to load Google place details.',
    );
  return native.fetchPlace(id);
}
