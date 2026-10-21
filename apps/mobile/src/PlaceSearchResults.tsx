import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GoogleAttribution, GoogleSearchInfo } from './GoogleAttribution';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GooglePlace } from '../modules/google-places';
import type { SavedPlace } from './BoardPlaces';
import { formatDistance } from './placeSearch';
import { colors, styles } from './ui';
import { useKeyboard } from './useKeyboard';

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
  const { height: windowHeight } = useWindowDimensions();
  const { keyboardHeight } = useKeyboard();
  const insets = useSafeAreaInsets();
  const maxScrollHeight =
    keyboardHeight > 0
      ? Math.max(90, Math.min(280, windowHeight - keyboardHeight - insets.top - 180))
      : 280;
  function row(
    place: {
      name: string;
      address: string;
      location?: unknown;
      distance?: number;
      attributions?: string[];
    },
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
            {place.attributions?.length ? (
              <GoogleAttribution attributions={place.attributions} />
            ) : null}
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
        style={{ maxHeight: maxScrollHeight }}
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
          <View>
            <GoogleAttribution />
            <GoogleSearchInfo />
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
