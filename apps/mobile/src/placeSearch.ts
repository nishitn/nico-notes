import type { Coordinate } from './mapGeometry';

export function normalizeSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function matchingPlaces<T extends { name: string; address: string }>(
  places: T[],
  query: string,
): T[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return places.filter((place) => {
    const text = normalizeSearch(`${place.name} ${place.address}`);
    return words.every((word) => text.includes(word));
  });
}
export function withinSearchRadius(point: Coordinate, center: Coordinate) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((point.latitude - center.latitude) * rad) / 2) ** 2 +
    Math.cos(point.latitude * rad) *
      Math.cos(center.latitude * rad) *
      Math.sin(((point.longitude - center.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) <= 10000;
}
export function placeSearchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/REQUEST_DENIED|PERMISSION_DENIED|API_KEY|API_NOT|not configured/i.test(message))
    return 'Nearby search needs Places API (New) enabled and allowed for this Android key.';
  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED/i.test(message))
    return 'Place search has reached its limit. Please try again later.';
  if (/latest Android build/i.test(message)) return message;
  return 'Couldn’t search Google Places. Check your connection and try again.';
}
