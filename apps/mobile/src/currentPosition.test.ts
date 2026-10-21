import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import * as Location from 'expo-location';
import { currentPosition } from './currentPosition';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  getLastKnownPositionAsync: vi.fn(),
  watchPositionAsync: vi.fn(),
}));

const cached = vi.mocked(Location.getLastKnownPositionAsync);
const watch = vi.mocked(Location.watchPositionAsync);
const remove = vi.fn();
const position: Location.LocationObject = {
  coords: {
    latitude: 12.9,
    longitude: 77.6,
    accuracy: 3000,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
  cached.mockResolvedValue(null);
  watch.mockResolvedValue({ remove });
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('uses a recent approximate fix without starting another native request', async () => {
  cached.mockResolvedValue(position);
  await expect(currentPosition(false)).resolves.toEqual({ latitude: 12.9, longitude: 77.6 });
  expect(cached).toHaveBeenCalledWith({ maxAge: 300_000, requiredAccuracy: 5000 });
  expect(watch).not.toHaveBeenCalled();
});

it('requires a fresher cached fix when the user taps the location button', async () => {
  cached.mockResolvedValue(position);
  await currentPosition(true);
  expect(cached).toHaveBeenCalledWith({ maxAge: 60_000, requiredAccuracy: 5000 });
});

it('gets a GPS-capable fix and stops watching after the first result', async () => {
  const result = currentPosition(false);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(watch.mock.calls[0][0]).toMatchObject({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: false,
  });
  watch.mock.calls[0][1](position);
  await expect(result).resolves.toEqual({ latitude: 12.9, longitude: 77.6 });
  expect(remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('stops a timed-out watch so a retry can request a fresh fix', async () => {
  const result = currentPosition(true);
  const rejected = expect(result).rejects.toThrow('took too long');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(remove).toHaveBeenCalledTimes(1);
  // A late native event must not revive the timed-out request.
  watch.mock.calls[0][1](position);
  const retry = currentPosition(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(watch.mock.calls[1][0].mayShowUserSettingsDialog).toBe(true);
  watch.mock.calls[1][1](position);
  await expect(retry).resolves.toEqual({ latitude: 12.9, longitude: 77.6 });
  expect(remove).toHaveBeenCalledTimes(2);
});

it('removes a subscription that finishes starting after the request times out', async () => {
  let started!: (subscription: Location.LocationSubscription) => void;
  watch.mockImplementation(() => new Promise((resolve) => (started = resolve)));
  const result = currentPosition(false);
  const rejected = expect(result).rejects.toThrow('took too long');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  started({ remove });
  await vi.advanceTimersByTimeAsync(0);
  expect(remove).toHaveBeenCalledTimes(1);
});

it('cleans up if a fix arrives before the subscription handle', async () => {
  watch.mockImplementation(async (_options, callback) => {
    callback(position);
    return { remove };
  });
  await expect(currentPosition(false)).resolves.toEqual({ latitude: 12.9, longitude: 77.6 });
  await vi.advanceTimersByTimeAsync(0);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans up a native error without waiting for the timeout', async () => {
  const result = currentPosition(false);
  await vi.advanceTimersByTimeAsync(0);
  watch.mock.calls[0][2]?.('Location unavailable');
  await expect(result).rejects.toThrow('Location unavailable');
  expect(remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
