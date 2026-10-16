import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from 'react-native-paper';
import type { GooglePlace } from '../modules/google-places';
import type { SavedPlace } from './BoardPlaces';
import { formatDistance } from './placeSearch';
import { colors, styles } from './ui';

export function PlaceSearchResults({
  query,
  saved,
  loadingSaved,
  nearby,
  loading,
  error,
  onRetry,
  onSaved,
  onNew,
  onAddSaved,
  onAddNew,
  onManual,
  hasLocation: _hasLocation,
}: {
  query: string;
  saved: SavedPlace[];
  loadingSaved: boolean;
  nearby: GooglePlace[];
  loading: boolean;
  error: string;
  hasLocation?: boolean;
  onRetry: () => void;
  onSaved: (place: SavedPlace) => void;
  onNew: (place: GooglePlace) => void;
  onAddSaved: (place: SavedPlace) => void;
  onAddNew: (place: GooglePlace) => void;
  onManual: () => void;
}) {
  function row(
    place: { name: string; address: string; location?: unknown; distance?: number },
    key: string,
    onSelect: () => void,
    onAdd: () => void,
    icon: string,
  ) {
    const distanceText = place.distance !== undefined ? formatDistance(place.distance) : null;
    return (
      <View key={key} style={searchStyles.row}>
        <Pressable
          onPress={onSelect}
          accessibilityRole="button"
          accessibilityLabel={`Select ${place.name}`}
          style={searchStyles.result}
        >
          <Icon source={icon} size={18} color={colors.rust} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text numberOfLines={2} style={styles.label}>
              {place.name}
            </Text>
            <Text numberOfLines={1} style={searchStyles.address}>
              {distanceText ? `${distanceText} · ` : ''}
              {place.address || 'Address not recorded'}
              {!place.location ? ' · No map pin' : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add visit to ${place.name}`}
          onPress={onAdd}
          style={searchStyles.add}
        >
          <Icon source="plus" size={20} color={colors.rust} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={searchStyles.panel} accessibilityLabel="Place search results">
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: 260 }}
      >
        {saved.length > 0 && (
          <>
            <View style={searchStyles.heading}>
              <Text style={styles.eyebrow}>SAVED PLACES · {saved.length}</Text>
              {loadingSaved && <ActivityIndicator size="small" color={colors.rust} />}
            </View>
            {saved.slice(0, 5).map((p) =>
              row(
                p,
                p._id,
                () => onSaved(p),
                () => onAddSaved(p),
                'map-marker-outline',
              ),
            )}
          </>
        )}
        {!saved.length && (
          <Text style={searchStyles.message}>
            {loadingSaved ? 'Searching your board…' : 'No matching saved places.'}
          </Text>
        )}
        <View style={searchStyles.heading}>
          <View style={styles.row}>
            <Image
              source={require('../assets/google/g-logo.png')}
              style={{ width: 16, height: 16 }}
            />
            <Text style={styles.eyebrow}>GOOGLE MAPS</Text>
          </View>
          {loading && <ActivityIndicator size="small" color={colors.rust} />}
        </View>
        {nearby.map((p) =>
          row(
            p,
            p.id,
            () => onNew(p),
            () => onAddNew(p),
            'compass-outline',
          ),
        )}
        {!nearby.length && (
          <Text accessibilityLiveRegion="polite" style={searchStyles.message}>
            {query.trim().length < 2
              ? 'Type at least two characters to find a new place.'
              : loading
                ? 'Searching Google Places…'
                : error || 'No matching places found on Google Maps.'}
          </Text>
        )}
        {!!error && (
          <Pressable onPress={onRetry} accessibilityRole="button" style={searchStyles.retry}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        )}
      </ScrollView>
      <Pressable onPress={onManual} accessibilityRole="button" style={searchStyles.manual}>
        <Icon source="plus" size={18} color={colors.rust} />
        <Text style={[styles.link, { flex: 1 }]} numberOfLines={2}>
          Add “{query.trim()}” manually
        </Text>
      </Pressable>
    </View>
  );
}
const searchStyles = StyleSheet.create({
  panel: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 0,
  },
  heading: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  result: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 52,
  },
  add: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  address: { fontFamily: 'Jakarta', color: colors.muted, fontSize: 11, lineHeight: 17 },
  message: { ...styles.muted, paddingHorizontal: 14, paddingVertical: 10, fontSize: 12 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  manual: {
    minHeight: 48,
    padding: 14,
    borderTopWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
});
