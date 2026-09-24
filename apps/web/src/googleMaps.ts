/// <reference types="google.maps" />
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export type MapLocation = { latitude: number; longitude: number; source?: string };
export const NEARBY_RADIUS_METERS = 10_000;
export const DEFAULT_MAP_LOCATION: MapLocation = { latitude: 12.95, longitude: 77.65 };
export const googleMapsConfigured = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());
let configured = false;
declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

export async function loadGoogleMaps() {
  if (!googleMapsConfigured) throw new Error('Google Maps isn’t configured yet.');
  if (!configured) {
    setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim(), v: 'weekly' });
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      window.dispatchEvent(new Event('date-notes:maps-auth-error'));
      previousAuthFailure?.();
    };
    configured = true;
  }
  const [maps, marker] = await Promise.all([importLibrary('maps'), importLibrary('marker')]);
  return { maps, marker };
}

export const latLng = (location: MapLocation) => ({
  lat: location.latitude,
  lng: location.longitude,
});

export function nearbyBounds(location: MapLocation): google.maps.LatLngBoundsLiteral {
  const latitudeDelta = NEARBY_RADIUS_METERS / 111_320;
  const longitudeDelta =
    latitudeDelta / Math.max(0.01, Math.cos((location.latitude * Math.PI) / 180));
  const wrap = (longitude: number) => ((longitude + 540) % 360) - 180;
  return {
    north: Math.min(90, location.latitude + latitudeDelta),
    south: Math.max(-90, location.latitude - latitudeDelta),
    east: wrap(location.longitude + longitudeDelta),
    west: wrap(location.longitude - longitudeDelta),
  };
}

function distanceMeters(a: MapLocation, b: MapLocation) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLng = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function placeSearchErrorMessage(error: unknown) {
  const message = String(error);
  if (/PERMISSION_DENIED|REQUEST_DENIED|not configured|isn’t configured/i.test(message)) {
    return 'Location search isn’t enabled for this app yet. You can still add a visit by name.';
  }
  if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT/i.test(message)) {
    return 'Location search has reached its limit. Please try again later.';
  }
  return 'Couldn’t search locations. Check your connection and try again.';
}

export async function searchNearbyPlaces(query: string, center?: MapLocation) {
  await loadGoogleMaps();
  const { Place } = await importLibrary('places');
  const { places } = await Place.searchByText({
    textQuery: query,
    fields: ['id', 'displayName', 'formattedAddress', 'location'],
    // Without a device location, let Google use its default bias instead of
    // restricting searches to an unrelated saved visit.
    ...(center ? { locationRestriction: nearbyBounds(center) } : {}),
    maxResultCount: 20,
  });
  return places
    .flatMap((place) => {
      if (!place.location) return [];
      const location = { latitude: place.location.lat(), longitude: place.location.lng() };
      if (center && distanceMeters(center, location) > NEARBY_RADIUS_METERS) return [];
      return [
        {
          id: place.id,
          title: place.displayName || 'Place',
          place: place.formattedAddress || '',
          location,
        },
      ];
    })
    .slice(0, 5);
}
