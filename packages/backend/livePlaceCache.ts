import type { LivePlace } from './livePlaces';

export type PlaceLookupError = { code: string; message: string };
export type PlaceLookupState =
  | { status: 'loading' }
  | { status: 'ready'; place: LivePlace }
  | { status: 'error'; error: PlaceLookupError };
export const loadingPlace: PlaceLookupState = { status: 'loading' };

/** Only expose known codes and our own copy, never SDK URLs or credentials. */
export function placeLookupError(error: unknown): PlaceLookupError {
  const message = error instanceof Error ? error.message : String(error);
  if (/NATIVE_MODULE_UNAVAILABLE|latest Android build|fetchPlace.*not a function/i.test(message))
    return { code: 'APP_UPDATE_REQUIRED', message: 'Update the app to load Google place details.' };
  if (/NOT_FOUND|INVALID_REQUEST|INVALID_ARGUMENT/i.test(message))
    return {
      code: 'PLACE_NOT_FOUND',
      message:
        'Google could not find this saved place. Try again, or choose the place again in Edit.',
    };
  if (/INCOMPLETE_PLACE_DETAILS/i.test(message))
    return {
      code: 'INCOMPLETE_DETAILS',
      message: 'Google returned incomplete details for this place. Please try again.',
    };
  if (
    /PERMISSION_DENIED|REQUEST_DENIED|API_KEY|API_NOT_ACTIVATED|not configured|isn’t configured/i.test(
      message,
    )
  )
    return {
      code: 'ACCESS_DENIED',
      message: 'Google rejected the request for place details. Please try again later.',
    };
  if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT/i.test(message))
    return {
      code: 'LIMIT_REACHED',
      message: 'Google place lookups have reached their limit. Try again later.',
    };
  if (/TIMEOUT|timed out/i.test(message))
    return {
      code: 'TIMEOUT',
      message: 'Google took too long to respond. Check your connection and try again.',
    };
  if (/NETWORK|offline|connection/i.test(message))
    return {
      code: 'NETWORK_ERROR',
      message: 'Couldn’t reach Google. Check your connection and try again.',
    };
  return {
    code: 'LOOKUP_FAILED',
    message: 'Couldn’t load this place from Google. Please try again.',
  };
}

/** Shared by every screen so a successful retry restores both details and map pins. */
export function createLivePlaceCache(
  fetchPlace: (id: string) => Promise<LivePlace>,
  reportError?: (id: string, error: PlaceLookupError) => void,
) {
  type Entry = { state: PlaceLookupState; expires: number; pending?: Promise<void> };
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let published: ReadonlyMap<string, PlaceLookupState> = new Map();
  function notify() {
    published = new Map([...entries].map(([id, entry]) => [id, entry.state]));
    for (const listener of listeners) listener();
  }
  function resolve(id: string, force = false): Promise<void> {
    const previous = entries.get(id);
    if (previous?.pending) return previous.pending;
    if (!force && previous && previous.expires > Date.now()) return Promise.resolve();
    for (const [key, entry] of entries)
      if (!entry.pending && entry.expires <= Date.now()) entries.delete(key);
    if (entries.size >= 200) {
      const oldest = [...entries].find(([, entry]) => !entry.pending);
      if (oldest) entries.delete(oldest[0]);
    }
    const entry: Entry = { state: loadingPlace, expires: 0 };
    entries.set(id, entry);
    let timer: ReturnType<typeof setTimeout>;
    // Deferring also catches missing native methods that throw synchronously.
    const request = Promise.resolve().then(() => fetchPlace(id));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), 20_000);
    });
    entry.pending = Promise.race([request, timeout])
      .then((place) => {
        if (
          !place.name ||
          place.name === 'Saved Google place' ||
          !place.location ||
          !Number.isFinite(place.location.latitude) ||
          !Number.isFinite(place.location.longitude)
        )
          throw new Error('INCOMPLETE_PLACE_DETAILS');
        entry.state = { status: 'ready', place };
        entry.expires = Date.now() + 5 * 60_000;
      })
      .catch((error: unknown) => {
        const safe = placeLookupError(error);
        entry.state = { status: 'error', error: safe };
        entry.expires = Date.now() + 30_000;
        reportError?.(id, safe);
      })
      .finally(() => {
        clearTimeout(timer);
        entry.pending = undefined;
        notify();
      });
    notify();
    return entry.pending;
  }
  return {
    resolve,
    getSnapshot: () => published,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
