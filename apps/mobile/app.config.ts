import type { ExpoConfig } from 'expo/config';

const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID?.trim();
if (
  googleIosClientId &&
  !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleIosClientId)
)
  throw new Error('GOOGLE_IOS_CLIENT_ID must be an iOS OAuth client ID from Google Cloud.');

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
    package: 'com.nishitnagar.notes',
    versionCode: Number(process.env.ANDROID_VERSION_CODE || 1),
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon.png',
      backgroundColor: '#E06D53',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  ios: {
    bundleIdentifier: 'com.nishitnagar.notes',
    supportsTablet: true,
    ...(googleIosClientId
      ? {
          scheme: googleIosClientId.split('.').reverse().join('.'),
          infoPlist: { GIDClientID: googleIosClientId },
        }
      : {}),
  },
  plugins: [
    'expo-router',
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
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '',
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY ?? '',
      },
    ],
  ],
  extra: {
    hasAndroidMapsKey: Boolean(process.env.GOOGLE_MAPS_ANDROID_API_KEY),
    hasIosMapsKey: Boolean(process.env.GOOGLE_MAPS_IOS_API_KEY),
    ...(process.env.EXPO_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PROJECT_ID } } : {}),
  },
};
export default config;
