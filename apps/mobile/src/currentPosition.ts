import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { Coordinate } from './mapGeometry';

export async function currentPosition(prompt: boolean): Promise<Coordinate> {
  const recent = await Location.getLastKnownPositionAsync({
    maxAge: prompt ? 60_000 : 5 * 60_000,
    // Approximate permission is enough to browse nearby places.
    requiredAccuracy: 5000,
  });
  if (recent) return coordinate(recent);

  return new Promise((resolve, reject) => {
    let subscription: Location.LocationSubscription | undefined;
    let settled = false;
    const timeout = setTimeout(
      () =>
        finish(
          undefined,
          new Error('Finding your location took too long. Tap the location button to retry.'),
        ),
      30_000,
    );
    function finish(position?: Location.LocationObject, error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription?.remove();
      if (position) resolve(coordinate(position));
      else reject(error);
    }

    // High accuracy lets Android use GPS when its network provider has no fix.
    // Stop after one result rather than leaving a native request running after timeout.
    void Location.watchPositionAsync(
      {
        accuracy: Platform.OS === 'android' ? Location.Accuracy.High : Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: prompt,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (position) => finish(position),
      (message) => finish(undefined, new Error(message)),
    ).then(
      (watch) => {
        if (settled) watch.remove();
        else subscription = watch;
      },
      (error: unknown) => finish(undefined, error),
    );
  });
}

function coordinate(position: Location.LocationObject): Coordinate {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
