import { describe, expect, it } from 'vite-plus/test';
import { placeMarkers, nearbyRegion, type MapRegion } from './mapGeometry';

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

describe('individual native map markers', () => {
  it('keeps nearby places as separate markers at their original locations', () => {
    const points = [
      place('a', 12.97, 77.59),
      place('b', 12.9701, 77.5901),
      place('c', 13.04, 77.69),
    ];
    const markers = placeMarkers(points, nearbyRegion(center, size), size);
    expect(markers.map(({ place }) => place)).toEqual(points);
    expect(markers[0].diameter).toBe(8);
    expect(markers[1].diameter).toBe(8);
    expect(markers[2].diameter).toBe(30);
  });

  it('restores full icons when zoom separates close places', () => {
    const points = [place('a', 12.97, 77.59), place('b', 12.97, 77.6)];
    const zoomedOut = placeMarkers(points, nearbyRegion(center, size), size);
    expect(zoomedOut).toHaveLength(2);
    expect(zoomedOut.every(({ diameter }) => diameter < 30)).toBe(true);
    const zoomedIn = placeMarkers(
      points,
      { ...center, longitude: 77.595, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      size,
    );
    expect(zoomedIn.map(({ diameter }) => diameter)).toEqual([30, 30]);
  });

  it('shrinks again when zooming back out and restores sizes over repeated zoom cycles', () => {
    const points = [place('a', 12.97, 77.59), place('b', 12.97, 77.6)];
    const close = { ...center, longitude: 77.595, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    const far = nearbyRegion(center, size);
    const farSizes = placeMarkers(points, far, size).map(({ diameter }) => diameter);
    for (const region of [close, far, close, far]) {
      const markers = placeMarkers(points, region, size);
      expect(markers.map(({ diameter }) => diameter)).toEqual(
        region === close ? [30, 30] : farSizes,
      );
      expect(markers.map(({ place }) => place._id)).toEqual(['a', 'b']);
    }
  });

  it('keeps one small marker per place even at identical coordinates', () => {
    const points = [place('a', 12.97, 77.59), place('b', 12.97, 77.59)];
    const markers = placeMarkers(
      points,
      { ...center, latitudeDelta: 0.0001, longitudeDelta: 0.0001 },
      size,
    );
    expect(markers.map(({ place }) => place)).toEqual(points);
    expect(markers.map(({ diameter }) => diameter)).toEqual([8, 8]);
  });

  it('keeps offscreen places mounted so camera movement never inserts or removes native markers', () => {
    const points = [place('a', 12.97, 77.59), place('b', 28.61, 77.2)];
    for (const region of [nearbyRegion(center, size), nearbyRegion(points[1].location, size)]) {
      expect(placeMarkers(points, region, size).map(({ place }) => place._id)).toEqual(['a', 'b']);
    }
  });

  it('shrinks neighbours across spatial-cell boundaries', () => {
    const region: MapRegion = { latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 };
    const points = [place('a', 0, -0.025), place('b', 0, -0.015)];
    expect(placeMarkers(points, region, size).map(({ diameter }) => diameter)).toEqual([8, 8]);
  });

  it('shrinks nearby places across the date line', () => {
    const points = [place('a', 0, 179.999), place('b', 0, -179.999)];
    const markers = placeMarkers(
      points,
      { latitude: 0, longitude: 180, latitudeDelta: 0.2, longitudeDelta: 0.2 },
      size,
    );
    expect(markers.map(({ place }) => place)).toEqual(points);
    expect(markers.map(({ diameter }) => diameter)).toEqual([8, 8]);
  });

  it('waits for a measured viewport', () => {
    expect(
      placeMarkers([place('a', 12.97, 77.59)], nearbyRegion(center, size), {
        width: 0,
        height: 300,
      }),
    ).toEqual([]);
  });
});
