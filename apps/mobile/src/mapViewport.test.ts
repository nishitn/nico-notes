import { describe, expect, it } from 'vite-plus/test';
import { createMapViewport, mapViewportReducer } from './mapViewport';
import { placeMarkers } from './mapGeometry';
import { mapMarkerAppearance } from './mapMarkerAppearance';

const close = { latitude: 12.97, longitude: 77.595, latitudeDelta: 0.02, longitudeDelta: 0.02 };
const far = { ...close, latitudeDelta: 0.2, longitudeDelta: 0.2 };
const places = [
  { _id: 'a', location: { latitude: 12.97, longitude: 77.59 } },
  { _id: 'b', location: { latitude: 12.97, longitude: 77.6 } },
];

describe('fullscreen native map lifecycle', () => {
  it('preserves the last camera but resets readiness and dimensions when replacing a map', () => {
    let state = createMapViewport(close);
    state = mapViewportReducer(state, { type: 'ready', instance: 0 });
    state = mapViewportReducer(state, {
      type: 'resize',
      instance: 0,
      size: { width: 400, height: 300 },
    });
    state = mapViewportReducer(state, { type: 'replace' });
    expect(state).toEqual({
      instance: 1,
      ready: false,
      size: { width: 0, height: 0 },
      region: close,
    });
  });

  it('ignores queued camera, size and ready events from any previous inline or fullscreen map', () => {
    let state = createMapViewport(close);
    state = mapViewportReducer(state, { type: 'replace' });
    state = mapViewportReducer(state, { type: 'replace' });
    for (const instance of [0, 1]) {
      expect(mapViewportReducer(state, { type: 'region', instance, region: far })).toBe(state);
      expect(
        mapViewportReducer(state, { type: 'resize', instance, size: { width: 10, height: 10 } }),
      ).toBe(state);
      expect(mapViewportReducer(state, { type: 'ready', instance })).toBe(state);
    }
  });

  it('changes dot textures in both zoom directions after repeated fullscreen transitions', () => {
    let state = createMapViewport(close);
    for (let transition = 0; transition < 4; transition++) {
      const instance = state.instance;
      state = mapViewportReducer(state, {
        type: 'resize',
        instance,
        size: { width: 400, height: transition % 2 ? 700 : 300 },
      });
      state = mapViewportReducer(state, { type: 'ready', instance });
      for (const region of [close, far, close, far]) {
        state = mapViewportReducer(state, { type: 'region', instance, region });
        const images = placeMarkers(places, state.region, state.size).map(
          ({ diameter }) => mapMarkerAppearance(diameter, false).asset,
        );
        expect(images).toEqual(region === close ? ['heart-30', 'heart-30'] : ['dot-12', 'dot-12']);
      }
      state = mapViewportReducer(state, { type: 'replace' });
    }
  });
});
