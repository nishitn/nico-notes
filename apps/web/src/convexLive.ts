import type { FunctionReference, FunctionReturnType } from 'convex/server';
import type {
  OptionalRestArgsOrSkip,
  PaginatedQueryReference,
  PaginatedQueryArgs,
  UsePaginatedQueryReturnType,
} from 'convex/react';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery as useBaseQuery, usePaginatedQuery as useBasePaginatedQuery } from 'convex/react';
import { googlePlaceIds, projectLivePlaces, type LivePlace } from '@nico-notes/backend/livePlaces';
import { fetchGooglePlace } from './googleMaps';
export * from 'convex/react';

const entries = new Map<string, { place?: LivePlace; expires: number; pending?: Promise<void> }>();
const listeners = new Set<() => void>();
let published = new Map<string, LivePlace>();
const empty = new Map<string, LivePlace>();
function notify() {
  published = new Map(
    [...entries].flatMap(([id, entry]) =>
      entry.place && entry.expires > Date.now() ? [[id, entry.place] as const] : [],
    ),
  );
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function snapshot() {
  return published;
}
const serverSnapshot = () => empty;
async function resolve(id: string) {
  const previous = entries.get(id);
  if (previous?.pending) return previous.pending;
  if (previous && previous.expires > Date.now()) return;
  for (const [key, entry] of entries)
    if (!entry.pending && entry.expires <= Date.now()) entries.delete(key);
  if (entries.size >= 200) {
    const oldest = [...entries].find(([, entry]) => !entry.pending);
    if (oldest) entries.delete(oldest[0]);
  }
  const entry: { place?: LivePlace; expires: number; pending?: Promise<void> } = { expires: 0 };
  entries.set(id, entry);
  entry.pending = fetchGooglePlace(id)
    .then(
      (place) => {
        entry.place = place;
        entry.expires = Date.now() + 5 * 60_000;
      },
      () => {
        entry.expires = Date.now() + 30_000;
      },
    )
    .finally(() => {
      entry.pending = undefined;
      notify();
    });
  return entry.pending;
}
export function useLivePlace(id: string | undefined) {
  const places = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!id) return;
    void resolve(id);
    const timer = setInterval(() => {
      void resolve(id);
      notify();
    }, 30_000);
    return () => clearInterval(timer);
  }, [id]);
  return id ? places.get(id) : undefined;
}
function useLivePlaces<T>(value: T): T {
  const ids = [...googlePlaceIds(value)].sort().join('|');
  const places = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!ids) return;
    const refresh = () => {
      for (const id of ids.split('|')) void resolve(id);
    };
    refresh();
    const timer = setInterval(() => {
      refresh();
      notify();
    }, 30_000);
    return () => clearInterval(timer);
  }, [ids]);
  return useMemo(
    () => (ids ? projectLivePlaces(value, (id) => places.get(id)) : value),
    [value, ids, places],
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
