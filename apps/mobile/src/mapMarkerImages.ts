import type { ImageRequireSource } from 'react-native';

// Literal requires let Metro bundle every texture and choose its @2x/@3x density.
export const mapMarkerImages: Record<string, ImageRequireSource> = {
  'dot-8': require('../assets/map-markers/dot-8.png'),
  'dot-12': require('../assets/map-markers/dot-12.png'),
  'dot-16': require('../assets/map-markers/dot-16.png'),
  'dot-20': require('../assets/map-markers/dot-20.png'),
  'wishlist-dot-8': require('../assets/map-markers/wishlist-dot-8.png'),
  'wishlist-dot-12': require('../assets/map-markers/wishlist-dot-12.png'),
  'wishlist-dot-16': require('../assets/map-markers/wishlist-dot-16.png'),
  'wishlist-dot-20': require('../assets/map-markers/wishlist-dot-20.png'),
  'heart-24': require('../assets/map-markers/heart-24.png'),
  'heart-30': require('../assets/map-markers/heart-30.png'),
  'bookmark-24': require('../assets/map-markers/bookmark-24.png'),
  'bookmark-30': require('../assets/map-markers/bookmark-30.png'),
  'compass-24': require('../assets/map-markers/compass-24.png'),
  'compass-30': require('../assets/map-markers/compass-30.png'),
  'heart-selected': require('../assets/map-markers/heart-selected.png'),
  'bookmark-selected': require('../assets/map-markers/bookmark-selected.png'),
  'compass-selected': require('../assets/map-markers/compass-selected.png'),
};
