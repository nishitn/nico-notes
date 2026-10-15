import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'nico notes',
  slug: 'nico-notes',
  version: '1.0.0',
  scheme: 'niconotes',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: '#FAF7F2',
  icon: './assets/icon.png',
  android: {
    package: 'com.nishitnagar.niconotes',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon.png',
      backgroundColor: '#E06D53',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  ios: { bundleIdentifier: 'com.nishitnagar.niconotes', supportsTablet: true },
  plugins: [
    'expo-dev-client',
    'expo-secure-store',
    'expo-web-browser',
    'expo-status-bar',
    'expo-image',
    [
      'expo-image-picker',
      {
        photosPermission: 'Choose pictures for your visits.',
        cameraPermission: 'Take pictures for your visits.',
        microphonePermission: false,
      },
    ],
    ['expo-location', { locationWhenInUsePermission: 'Add your current location to a visit.' }],
    [
      'react-native-maps',
      { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '' },
    ],
  ],
  extra: { hasAndroidMapsKey: Boolean(process.env.GOOGLE_MAPS_ANDROID_API_KEY) },
};
export default config;
