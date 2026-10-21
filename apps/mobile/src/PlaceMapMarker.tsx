import { Platform } from 'react-native';
import { Marker } from 'react-native-maps';
import type { Coordinate } from './mapGeometry';
import { mapMarkerAppearance, type MapMarkerSymbol } from './mapMarkerAppearance';
import { mapMarkerImages } from './mapMarkerImages';

export function PlaceMapMarker({
  coordinate,
  title,
  diameter,
  selected,
  wishlist = false,
  symbol = wishlist ? 'bookmark' : 'heart',
  onPress,
}: {
  coordinate: Coordinate;
  title: string;
  diameter: number;
  selected: boolean;
  wishlist?: boolean;
  symbol?: MapMarkerSymbol;
  onPress: () => void;
}) {
  const appearance = mapMarkerAppearance(diameter, selected, symbol);
  const image = mapMarkerImages[appearance.asset];
  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      accessibilityLabel={selected ? `${title}, selected` : title}
      anchor={{ x: 0.5, y: 0.5 }}
      // Keep Fabric's child order stable. Changing zIndex reattaches Android map
      // features and can leave their previous Google Maps marker behind.
      zIndex={1}
      // These are native image textures, with no custom views or layout-driven snapshots.
      {...(Platform.OS === 'ios' ? { icon: image } : { image })}
      tracksViewChanges={false}
      stopPropagation
    />
  );
}
