import type { FunctionReference, FunctionReturnType } from 'convex/server';
import type {
  OptionalRestArgsOrSkip,
  PaginatedQueryReference,
  PaginatedQueryArgs,
  UsePaginatedQueryReturnType,
} from 'convex/react';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery as useBaseQuery, usePaginatedQuery as useBasePaginatedQuery } from 'convex/react';
import { googlePlaceIds, projectLivePlaces } from '@nico-notes/backend/livePlaces';
import { fetchGooglePlace } from './googleMaps';
import {
  createLivePlaceCache,
  loadingPlace,
  type PlaceLookupState,
} from '@nico-notes/backend/livePlaceCache';
export * from 'convex/react';

const cache = createLivePlaceCache(fetchGooglePlace, (id, error) => {
  console.warn('Google place lookup failed', id, error.code);
});
const empty = new Map<string, PlaceLookupState>();
const serverSnapshot = () => empty;
export function usePlaceLookups(placeIds: Iterable<string>) {
  const ids = [...new Set(placeIds)].sort().join('|');
  const states = useSyncExternalStore(cache.subscribe, cache.getSnapshot, serverSnapshot);
  useEffect(() => {
    if (!ids) return;
    const refresh = () => {
      for (const id of ids.split('|')) void cache.resolve(id);
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [ids]);
  const retry = useCallback(
    () =>
      Promise.all(
        ids
          ? ids
              .split('|')
              .filter((id) => states.get(id)?.status !== 'ready')
              .map((id) => cache.resolve(id, true))
          : [],
      ),
    [ids, states],
  );
  return { states, retry };
}
export function usePlaceLookup(id: string | undefined) {
  const { states, retry } = usePlaceLookups(id ? [id] : []);
  return { state: id ? (states.get(id) ?? loadingPlace) : undefined, retry };
}
export function useLivePlace(id: string | undefined) {
  const { state } = usePlaceLookup(id);
  return state?.status === 'ready' ? state.place : undefined;
}
function useLivePlaces<T>(value: T): T {
  const ids = googlePlaceIds(value);
  const { states } = usePlaceLookups(ids);
  return useMemo(
    () =>
      ids.size
        ? projectLivePlaces(
            value,
            (id) => {
              const state = states.get(id);
              return state?.status === 'ready' ? state.place : undefined;
            },
            (id) =>
              states.get(id)?.status === 'error' ? 'Place details unavailable' : 'Loading place…',
          )
        : value,
    [value, states, ids.size],
  );
}
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  return useLivePlaces(useBaseQuery(query, ...args));
}
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | 'skip',
  options: { initialNumItems: number },
): UsePaginatedQueryReturnType<Query> {
  const result = useBasePaginatedQuery(query, args, options);
  const results = useLivePlaces(result.results);
  return useMemo(() => ({ ...result, results }), [result, results]);
}
