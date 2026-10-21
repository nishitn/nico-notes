import type { MapRegion, MapSize } from './mapGeometry';

type MapViewport = { instance: number; ready: boolean; size: MapSize; region: MapRegion };
type ViewportAction =
  | { type: 'replace' }
  | { type: 'ready'; instance: number }
  | { type: 'resize'; instance: number; size: MapSize }
  | { type: 'region'; instance: number; region: MapRegion };

export function createMapViewport(region: MapRegion): MapViewport {
  return { instance: 0, ready: false, size: { width: 0, height: 0 }, region };
}

export function mapViewportReducer(state: MapViewport, action: ViewportAction): MapViewport {
  if (action.type === 'replace') {
    return { ...state, instance: state.instance + 1, ready: false, size: { width: 0, height: 0 } };
  }
  // A fullscreen transition replaces the native map. Discard its predecessor's queued events.
  if (action.instance !== state.instance) return state;
  if (action.type === 'ready') return { ...state, ready: true };
  if (action.type === 'resize') return { ...state, size: action.size };
  return { ...state, region: action.region };
}
