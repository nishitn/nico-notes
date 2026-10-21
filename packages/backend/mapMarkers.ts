export type ScreenPlace = { id: string; x: number; y: number };

type MapPlaceIdentity = {
  name: string;
  address?: string;
  googlePlaceId?: string;
  location?: { latitude: number; longitude: number };
  wishlist: boolean;
};

const normalized = (value = '') => value.trim().replace(/\s+/g, ' ').toLowerCase();

function samePlace(a: MapPlaceIdentity, b: MapPlaceIdentity) {
  if (a.googlePlaceId && b.googlePlaceId) return a.googlePlaceId === b.googlePlaceId;
  if (!normalized(a.name) || normalized(a.name) !== normalized(b.name)) return false;
  if (normalized(a.address) && normalized(a.address) === normalized(b.address)) return true;
  return Boolean(
    a.location &&
    b.location &&
    Math.abs(a.location.latitude - b.location.latitude) < 0.0001 &&
    Math.abs(a.location.longitude - b.location.longitude) < 0.0001,
  );
}

// Preserve the visited record (and its click target) when both lists contain a place.
export function preferVisitedPlaces<T>(places: T[], identity: (place: T) => MapPlaceIdentity): T[] {
  const entries = places.map((place) => ({ place, identity: identity(place) }));
  const visited = entries.filter((entry) => !entry.identity.wishlist);
  return entries
    .filter(
      (entry) =>
        !entry.identity.wishlist ||
        !visited.some((visit) => samePlace(visit.identity, entry.identity)),
    )
    .map((entry) => entry.place);
}

export const FULL_MARKER_SIZE = 30;
export const MIN_MARKER_SIZE = 8;
const NEIGHBOUR_DISTANCE = 40;

// Compare neighbouring screen cells so density follows zoom, not geographic distance.
// Every place keeps its own marker, even when coordinates coincide.
export function markerSizes(points: ScreenPlace[]): Map<string, number> {
  const sizes = new Map(points.map((point) => [point.id, FULL_MARKER_SIZE]));
  const cells = new Map<string, ScreenPlace[]>();
  for (const point of points) {
    const x = Math.floor(point.x / NEIGHBOUR_DISTANCE);
    const y = Math.floor(point.y / NEIGHBOUR_DISTANCE);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${x + dx}:${y + dy}`) ?? []) {
          const distance = Math.hypot(point.x - other.x, point.y - other.y);
          const diameter = Math.max(MIN_MARKER_SIZE, Math.min(FULL_MARKER_SIZE, distance - 6));
          sizes.set(point.id, Math.min(sizes.get(point.id)!, diameter));
          sizes.set(other.id, Math.min(sizes.get(other.id)!, diameter));
        }
      }
    }
    const key = `${x}:${y}`;
    const cell = cells.get(key);
    if (cell) cell.push(point);
    else cells.set(key, [point]);
  }
  return sizes;
}
