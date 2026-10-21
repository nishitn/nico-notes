import { markerSizes } from '@nico-notes/backend/mapMarkers';

export type Coordinate = { latitude: number; longitude: number };
export type MapRegion = Coordinate & { latitudeDelta: number; longitudeDelta: number };
export type MapSize = { width: number; height: number };

const KM_PER_DEGREE = 111.32;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const wrapLongitude = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180;
const mercatorY = (latitude: number) => {
  const angle = radians(Math.max(-85, Math.min(85, latitude)));
  return Math.log(Math.tan(Math.PI / 4 + angle / 2));
};

// Fit a circle of the requested radius within both dimensions of the map.
export function nearbyRegion(location: Coordinate, size: MapSize, radiusKm = 10): MapRegion {
  const aspect = Math.max(1, size.width) / Math.max(1, size.height);
  const latitudeDelta = (radiusKm * 2) / KM_PER_DEGREE;
  return {
    ...location,
    latitudeDelta: latitudeDelta * Math.max(1, 1 / aspect),
    longitudeDelta: Math.min(
      360,
      (latitudeDelta / Math.max(0.01, Math.cos(radians(location.latitude)))) * Math.max(1, aspect),
    ),
  };
}

// Keep each place mounted at its own coordinate and shrink crowded markers.
// Google Maps handles offscreen culling. Changing this list while panning/zooming
// can leave orphan SDK markers in react-native-maps' indexed native feature list.
export function placeMarkers<T extends { _id: string; location: Coordinate }>(
  places: T[],
  region: MapRegion,
  size: MapSize,
): { place: T; diameter: number }[] {
  if (!size.width || !size.height || !region.latitudeDelta || !region.longitudeDelta) return [];
  const north = mercatorY(region.latitude + region.latitudeDelta / 2);
  const south = mercatorY(region.latitude - region.latitudeDelta / 2);
  const spanY = Math.max(1e-9, north - south);
  const points = places.map((place) => ({
    place,
    id: place._id,
    x:
      (0.5 + wrapLongitude(place.location.longitude - region.longitude) / region.longitudeDelta) *
      size.width,
    y: ((north - mercatorY(place.location.latitude)) / spanY) * size.height,
  }));
  const sizes = markerSizes(points);
  return points.map(({ place }) => ({ place, diameter: sizes.get(place._id)! }));
}
