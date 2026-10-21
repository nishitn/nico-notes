import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import type { Coordinate } from './mapGeometry';
import { currentPosition } from './currentPosition';

type LocationState = {
  location?: Coordinate;
  locating: boolean;
  error: string;
  settingsRequired: boolean;
};
let state: LocationState = { locating: false, error: '', settingsRequired: false };
let pending: Promise<Coordinate | undefined> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(next: Partial<LocationState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

async function locate(prompt: boolean): Promise<Coordinate | undefined> {
  const permission = prompt
    ? await Location.requestForegroundPermissionsAsync()
    : await Location.getForegroundPermissionsAsync();
  if (!permission.granted) {
    if (prompt)
      publish({
        settingsRequired: !permission.canAskAgain,
        error: permission.canAskAgain
          ? 'Location wasn’t shared. You can still search or enter a place manually.'
          : 'Location access is off. Open settings to allow it, or enter a place manually.',
      });
    return undefined;
  }
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('Turn on location services, then tap the location button to retry.');
  return currentPosition(prompt);
}

function requestLocation(prompt: boolean) {
  if (pending) return pending;
  publish({ locating: true, error: '', settingsRequired: false });
  pending = locate(prompt)
    .then((location) => {
      if (location) publish({ location });
      return location ?? state.location;
    })
    .catch((error: unknown) => {
      publish({
        error:
          error instanceof Error
            ? error.message
            : 'Location is unavailable. You can still enter a place manually.',
      });
      return state.location;
    })
    .finally(() => {
      pending = undefined;
      publish({ locating: false });
    });
  return pending;
}

export function useCurrentLocation(enabled: boolean) {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  // Opening a screen may reuse an already granted location, never raise a new permission prompt.
  useEffect(() => {
    if (enabled && !state.location) void requestLocation(false);
  }, [enabled]);
  const request = useCallback(() => requestLocation(true), []);
  return { ...snapshot, request, openSettings: () => Linking.openSettings() };
}
