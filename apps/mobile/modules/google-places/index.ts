import { requireOptionalNativeModule } from 'expo';
import type { Coordinate } from '../../src/mapGeometry';

export type GooglePlace = {
  id: string;
  name: string;
  address: string;
  location: Coordinate;
};
const native = requireOptionalNativeModule<{
  search(query: string, latitude: number | null, longitude: number | null): Promise<GooglePlace[]>;
}>('NicoGooglePlaces');

export async function searchGooglePlaces(query: string, center?: Coordinate) {
  if (!native) throw new Error('Install the latest Android build to search Google Places.');
  return native.search(query, center?.latitude ?? null, center?.longitude ?? null);
}
