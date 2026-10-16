import { useEffect, useState } from 'react';
import { searchGooglePlaces, type GooglePlace } from '../modules/google-places';
import type { Coordinate } from './mapGeometry';
import { distanceBetween, placeSearchError } from './placeSearch';

type SearchState = {
  query: string;
  key: string;
  places: GooglePlace[];
  error: string;
  loading: boolean;
};

export function usePlaceSearch(query: string, center: Coordinate | undefined, active: boolean) {
  const trimmed = query.trim();
  const latitude = center?.latitude;
  const longitude = center?.longitude;
  const key = `${trimmed}|${latitude}|${longitude}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>();

  useEffect(() => {
    if (!active || trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState({ query: trimmed, key, places: [], error: '', loading: true });
      try {
        const centerCoord =
          latitude === undefined || longitude === undefined ? undefined : { latitude, longitude };
        const rawPlaces = await searchGooglePlaces(trimmed, centerCoord);
        const places: GooglePlace[] = rawPlaces.map((p) => ({
          ...p,
          distance: centerCoord ? distanceBetween(p.location, centerCoord) : undefined,
        }));
        if (!cancelled) setState({ query: trimmed, key, places, error: '', loading: false });
      } catch (error) {
        if (!cancelled)
          setState({
            query: trimmed,
            key,
            places: [],
            error: placeSearchError(error),
            loading: false,
          });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, latitude, longitude, active, key, attempt]);

  const current = state?.key === key ? state : undefined;
  return {
    places: current?.places ?? [],
    loading: active && trimmed.length >= 2 && (current?.loading ?? true),
    error: current?.error ?? '',
    retry: () => {
      setState(undefined);
      setAttempt((value) => value + 1);
    },
  };
}
