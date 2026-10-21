import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapLocation } from './googleMaps';

let cached: { location: MapLocation; time: number } | null = null;
let pending: Promise<MapLocation> | null = null;

function locate(): Promise<MapLocation> {
  if (!window.isSecureContext)
    return Promise.reject(new Error('Location needs HTTPS or localhost.'));
  if (!navigator.geolocation)
    return Promise.reject(new Error('This browser doesn’t support location.'));
  if (cached && Date.now() - cached.time < 60_000) return Promise.resolve(cached.location);
  if (pending) return pending;
  pending = new Promise<MapLocation>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        cached = { location, time: Date.now() };
        resolve(location);
      },
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? 'Location is blocked. Allow location in your browser, then try again.'
              : error.code === 3
                ? 'Finding your location took too long. Try again.'
                : 'Your location is unavailable. You can still browse the map.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }).finally(() => {
    pending = null;
  });
  return pending;
}

export function useCurrentLocation(automatic: boolean) {
  const [location, setLocation] = useState<MapLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const request = useCallback(async () => {
    setLocating(true);
    setError('');
    try {
      const next = await locate();
      if (mounted.current) setLocation({ ...next });
    } catch (error) {
      if (mounted.current)
        setError(error instanceof Error ? error.message : 'Location unavailable.');
    } finally {
      if (mounted.current) setLocating(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (automatic)
      void Promise.resolve().then(() => {
        if (mounted.current) return request();
      });
    return () => {
      mounted.current = false;
    };
  }, [automatic, request]);
  return { location, locating, error, request };
}
