import { afterEach, expect, it, vi } from 'vite-plus/test';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('registers the iOS OAuth client and its reversed callback scheme alongside app links', async () => {
  vi.stubEnv('GOOGLE_IOS_CLIENT_ID', '123456789-iosclient.apps.googleusercontent.com');
  const { default: config } = await import('./app.config');
  expect(config.ios?.infoPlist?.GIDClientID).toBe('123456789-iosclient.apps.googleusercontent.com');
  expect(config.ios?.scheme).toBe('com.googleusercontent.apps.123456789-iosclient');
  expect(config.scheme).toBe('niconotes');
  expect(config.ios?.bundleIdentifier).toBe('com.nishitnagar.notes');
});

it('allows Android builds before an iOS OAuth client has been created', async () => {
  vi.stubEnv('GOOGLE_IOS_CLIENT_ID', '');
  const { default: config } = await import('./app.config');
  expect(config.ios?.scheme).toBeUndefined();
  expect(config.ios?.infoPlist?.GIDClientID).toBeUndefined();
  expect(config.android?.package).toBe('com.nishitnagar.notes');
});

it('rejects an invalid iOS client ID before generating a broken callback scheme', async () => {
  vi.stubEnv('GOOGLE_IOS_CLIENT_ID', 'https://accounts.google.com');
  await expect(import('./app.config')).rejects.toThrow('GOOGLE_IOS_CLIENT_ID');
});

it('configures separate Google Maps keys for the native iOS and Android builds', async () => {
  vi.stubEnv('GOOGLE_MAPS_IOS_API_KEY', 'ios-maps-key');
  vi.stubEnv('GOOGLE_MAPS_ANDROID_API_KEY', 'android-maps-key');
  const { default: config } = await import('./app.config');
  expect(config.plugins).toContainEqual([
    'react-native-maps',
    { iosGoogleMapsApiKey: 'ios-maps-key', androidGoogleMapsApiKey: 'android-maps-key' },
  ]);
  expect(config.extra?.hasIosMapsKey).toBe(true);
  expect(config.extra?.hasAndroidMapsKey).toBe(true);
});

it('keeps iOS maps disabled without an iOS key even when Android maps are configured', async () => {
  vi.stubEnv('GOOGLE_MAPS_IOS_API_KEY', '');
  vi.stubEnv('GOOGLE_MAPS_ANDROID_API_KEY', 'android-maps-key');
  const { default: config } = await import('./app.config');
  expect(config.extra?.hasIosMapsKey).toBe(false);
  expect(config.extra?.hasAndroidMapsKey).toBe(true);
});
