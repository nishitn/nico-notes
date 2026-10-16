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

// Cluster in screen space so pins separate naturally as the user zooms in.
// Neighbouring cells keep the comparison local even after loading many places.
export function clusterPlaces<T extends { _id: string; location: Coordinate }>(
  places: T[],
  region: MapRegion,
  size: MapSize,
  separation = 48,
): { id: string; coordinate: Coordinate; places: T[] }[] {
  if (!size.width || !size.height || !region.latitudeDelta || !region.longitudeDelta) return [];
  const north = mercatorY(region.latitude + region.latitudeDelta / 2);
  const south = mercatorY(region.latitude - region.latitudeDelta / 2);
  const spanY = Math.max(1e-9, north - south);
  const points = places
    .map((place) => ({
      place,
      x:
        (0.5 + wrapLongitude(place.location.longitude - region.longitude) / region.longitudeDelta) *
        size.width,
      y: ((north - mercatorY(place.location.latitude)) / spanY) * size.height,
    }))
    .filter(
      (p) =>
        p.x >= -separation &&
        p.x <= size.width + separation &&
        p.y >= -separation &&
        p.y <= size.height + separation,
    );
  const parents = points.map((_, index) => index);
  function root(index: number): number {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }
  const cells = new Map<string, number[]>();
  points.forEach((point, index) => {
    const x = Math.floor(point.x / separation),
      y = Math.floor(point.y / separation);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${x + dx}:${y + dy}`) ?? []) {
          if (Math.hypot(point.x - points[other].x, point.y - points[other].y) < separation)
            parents[root(index)] = root(other);
        }
      }
    const key = `${x}:${y}`;
    cells.set(key, [...(cells.get(key) ?? []), index]);
  });
  const groups = new Map<number, typeof points>();
  points.forEach((point, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  });
  return [...groups.values()].map((group) => {
    const x = group.reduce((sum, p) => sum + p.x, 0) / group.length;
    const y = group.reduce((sum, p) => sum + p.y, 0) / group.length;
    return {
      id: group
        .map((p) => p.place._id)
        .sort()
        .join(':'),
      coordinate: {
        latitude:
          ((Math.atan(Math.exp(north - (y / size.height) * spanY)) * 2 - Math.PI / 2) * 180) /
          Math.PI,
        longitude: wrapLongitude(region.longitude + (x / size.width - 0.5) * region.longitudeDelta),
      },
      places: group.map((p) => p.place),
    };
  });
}
