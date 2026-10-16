import { describe, expect, it } from 'vite-plus/test';
import { clusterPlaces, nearbyRegion, type MapRegion } from './mapGeometry';

const size = { width: 400, height: 300 };
const center = { latitude: 12.97, longitude: 77.59 };
const place = (_id: string, latitude: number, longitude: number) => ({
  _id,
  location: { latitude, longitude },
});

describe('native map viewport', () => {
  it.each([
    { width: 400, height: 300 },
    { width: 300, height: 500 },
  ])('fits 10 km around the location at aspect ratio %o', (dimensions) => {
    const region = nearbyRegion(center, dimensions);
    const heightKm = region.latitudeDelta * 111.32;
    const widthKm = region.longitudeDelta * 111.32 * Math.cos((center.latitude * Math.PI) / 180);
    expect(region.latitude).toBe(center.latitude);
    expect(region.longitude).toBe(center.longitude);
    expect(Math.min(heightKm, widthKm)).toBeCloseTo(20);
    expect(widthKm / heightKm).toBeCloseTo(dimensions.width / dimensions.height);
  });
});

describe('native map clusters', () => {
  it('groups overlapping pins, preserving every place and keeping distant pins separate', () => {
    const points = [
      place('a', 12.97, 77.59),
      place('b', 12.9701, 77.5901),
      place('c', 13.04, 77.69),
    ];
    const groups = clusterPlaces(points, nearbyRegion(center, size), size);
    expect(groups.map((group) => group.places.length).sort()).toEqual([1, 2]);
    expect(groups.flatMap((group) => group.places.map((p) => p._id)).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
  it('separates close places when zooming in', () => {
    const points = [place('a', 12.97, 77.59), place('b', 12.97, 77.6)];
    expect(clusterPlaces(points, nearbyRegion(center, size), size)).toHaveLength(1);
    expect(
      clusterPlaces(
        points,
        { ...center, longitude: 77.595, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        size,
      ),
    ).toHaveLength(2);
  });
  it('keeps exactly coincident places accessible as one counted group at maximum zoom', () => {
    const points = [place('a', 12.97, 77.59), place('b', 12.97, 77.59)];
    const groups = clusterPlaces(
      points,
      { ...center, latitudeDelta: 0.0001, longitudeDelta: 0.0001 },
      size,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].places).toHaveLength(2);
    expect(groups[0].coordinate.latitude).toBeCloseTo(center.latitude);
    expect(groups[0].coordinate.longitude).toBeCloseTo(center.longitude);
  });
  it('does not include places far outside the viewport in visible counts', () => {
    const points = [place('a', 12.97, 77.59), place('b', 28.61, 77.2)];
    expect(
      clusterPlaces(points, nearbyRegion(center, size), size)
        .flatMap((g) => g.places)
        .map((p) => p._id),
    ).toEqual(['a']);
  });
  it('groups neighbours across spatial-cell boundaries', () => {
    const region: MapRegion = { latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 };
    const points = [place('a', 0, -0.025), place('b', 0, -0.015)];
    expect(clusterPlaces(points, region, size)).toHaveLength(1);
  });
  it('groups nearby places across the date line without centering on Greenwich', () => {
    const points = [place('a', 0, 179.999), place('b', 0, -179.999)];
    const groups = clusterPlaces(
      points,
      { latitude: 0, longitude: 180, latitudeDelta: 0.2, longitudeDelta: 0.2 },
      size,
    );
    expect(groups).toHaveLength(1);
    expect(Math.abs(groups[0].coordinate.longitude)).toBeCloseTo(180);
  });
  it('waits for a measured viewport', () => {
    expect(
      clusterPlaces([place('a', 12.97, 77.59)], nearbyRegion(center, size), {
        width: 0,
        height: 300,
      }),
    ).toEqual([]);
  });
});
