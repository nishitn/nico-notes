import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createLivePlaceCache, placeLookupError } from '../livePlaceCache';
import { projectLivePlaces } from '../livePlaces';

const isiri = {
  id: 'isiri',
  name: 'ISIRI Resto Bar - Theme Restaurant',
  address: 'Mahadevapura, Bengaluru',
  location: { latitude: 12.977, longitude: 77.696 },
};
afterEach(() => vi.useRealTimers());

describe('live Google place recovery', () => {
  it('publishes the error, respects automatic backoff, and immediately retries for every subscriber', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
      .mockResolvedValue(isiri);
    const report = vi.fn();
    const cache = createLivePlaceCache(fetch, report);
    const detail = vi.fn();
    const home = vi.fn();
    cache.subscribe(detail);
    cache.subscribe(home);
    await cache.resolve(isiri.id);
    expect(cache.getSnapshot().get(isiri.id)).toMatchObject({
      status: 'error',
      error: { code: 'NETWORK_ERROR' },
    });
    expect(report).toHaveBeenCalledWith(
      isiri.id,
      expect.objectContaining({ code: 'NETWORK_ERROR' }),
    );
    await cache.resolve(isiri.id);
    expect(fetch).toHaveBeenCalledTimes(1);
    const retry = cache.resolve(isiri.id, true);
    expect(cache.getSnapshot().get(isiri.id)?.status).toBe('loading');
    await retry;
    const state = cache.getSnapshot().get(isiri.id);
    expect(state).toEqual({ status: 'ready', place: isiri });
    expect(detail).toHaveBeenCalledTimes(4);
    expect(home).toHaveBeenCalledTimes(4);
    // Both the detail title and Home map's coordinates recover from the same result.
    const persisted = { title: 'Saved Google place', place: '', googlePlaceId: isiri.id };
    const view = projectLivePlaces(persisted, () =>
      state?.status === 'ready' ? state.place : undefined,
    );
    expect(view).toMatchObject({
      title: isiri.name,
      place: isiri.address,
      location: isiri.location,
    });
    expect(persisted).toEqual({ title: 'Saved Google place', place: '', googlePlaceId: isiri.id });
  });

  it('deduplicates simultaneous lookups and retries across the map and detail screen', async () => {
    let finish!: (place: typeof isiri) => void;
    const fetch = vi.fn(
      () =>
        new Promise<typeof isiri>((resolve) => {
          finish = resolve;
        }),
    );
    const cache = createLivePlaceCache(fetch);
    const first = cache.resolve(isiri.id);
    const second = cache.resolve(isiri.id, true);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(isiri);
    await first;
  });

  it('turns a synchronous native-module failure into a recoverable error', async () => {
    const cache = createLivePlaceCache(() => {
      throw new Error('native.fetchPlace is not a function');
    });
    await expect(cache.resolve(isiri.id)).resolves.toBeUndefined();
    expect(cache.getSnapshot().get(isiri.id)).toMatchObject({
      status: 'error',
      error: { code: 'APP_UPDATE_REQUIRED' },
    });
  });

  it('times out a hung lookup and ignores its late result after a successful retry', async () => {
    vi.useFakeTimers();
    let late!: (place: typeof isiri) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            late = resolve;
          }),
      )
      .mockResolvedValue(isiri);
    const cache = createLivePlaceCache(fetch);
    const pending = cache.resolve(isiri.id);
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(cache.getSnapshot().get(isiri.id)).toMatchObject({
      status: 'error',
      error: { code: 'TIMEOUT' },
    });
    await cache.resolve(isiri.id, true);
    late({ ...isiri, name: 'Late old result' });
    await Promise.resolve();
    expect(cache.getSnapshot().get(isiri.id)).toEqual({ status: 'ready', place: isiri });
  });

  it('expires live coordinates and exposes refresh failures instead of a false missing-location state', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(isiri)
      .mockRejectedValue(new Error('REQUEST_DENIED'));
    const cache = createLivePlaceCache(fetch);
    await cache.resolve(isiri.id);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await cache.resolve(isiri.id);
    const state = cache.getSnapshot().get(isiri.id);
    expect(state).toMatchObject({ status: 'error', error: { code: 'ACCESS_DENIED' } });
    const view = projectLivePlaces(
      {
        googlePlaceId: isiri.id,
        title: isiri.name,
        place: isiri.address,
        location: isiri.location,
      },
      () => undefined,
      () => 'Place details unavailable',
    );
    expect(view.title).toBe('Place details unavailable');
    expect(view.place).toBe('');
    expect(view.location).toBeUndefined();
  });

  it('rejects incomplete details rather than reporting success while the map pin is missing', async () => {
    const cache = createLivePlaceCache(async () => ({ ...isiri, location: undefined }));
    await cache.resolve(isiri.id);
    expect(cache.getSnapshot().get(isiri.id)).toMatchObject({
      status: 'error',
      error: { code: 'INCOMPLETE_DETAILS' },
    });
  });

  it.each([
    ['Google place details: NOT_FOUND', 'PLACE_NOT_FOUND'],
    ['Google place details: OVER_QUERY_LIMIT', 'LIMIT_REACHED'],
    ['Google place details: REQUEST_DENIED key=secret', 'ACCESS_DENIED'],
    ['https://provider.example/details?key=secret', 'LOOKUP_FAILED'],
  ])('classifies %s without exposing SDK messages or credentials', (message, code) => {
    const error = placeLookupError(new Error(message));
    expect(error.code).toBe(code);
    expect(error.message).not.toContain('secret');
    expect(error.message).not.toContain('https://');
  });
});
