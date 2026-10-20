import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { Coordinate } from './mapGeometry';

async function locate(): Promise<Coordinate> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new Error('Allow location access in your device settings to center the map around you.');
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('Turn on your device’s location services, then try again.');
  const recent = await Location.getLastKnownPositionAsync({
    maxAge: 60_000,
    requiredAccuracy: 1000,
  });
  if (recent) return recent.coords;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error('Finding your location took too long. Tap the location button to retry.'),
            ),
          15_000,
        );
      }),
    ]);
    return position.coords;
  } finally {
    clearTimeout(timeout);
  }
}

export function useCurrentLocation(enabled: boolean) {
  const [location, setLocation] = useState<Coordinate>();
  const [locating, setLocating] = useState(enabled);
  const [error, setError] = useState('');
  const locationRef = useRef<Coordinate | undefined>(undefined);
  const mounted = useRef(false);
  const pending = useRef(false);

  const request = useCallback(async (): Promise<Coordinate | undefined> => {
    if (!mounted.current) return undefined;
    if (pending.current) return locationRef.current;
    pending.current = true;
    setLocating(true);
    setError('');
    try {
      const next = await locate();
      const coord = { latitude: next.latitude, longitude: next.longitude };
      locationRef.current = coord;
      if (mounted.current) setLocation(coord);
      return coord;
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : 'Your location is unavailable. You can still browse the map.',
        );
      return locationRef.current;
    } finally {
      pending.current = false;
      if (mounted.current) setLocating(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (enabled) void Promise.resolve().then(request);
    return () => {
      mounted.current = false;
    };
  }, [enabled, request]);

  return { location, locating, error, request };
}
