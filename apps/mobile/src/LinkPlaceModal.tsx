import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Icon } from 'react-native-paper';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import type { GooglePlace } from '../modules/google-places';
import { useMutation } from './convexLive';
import { GoogleAttribution } from './GoogleAttribution';
import { PlaceSearchResults } from './PlaceSearchResults';
import { SearchField } from './SearchField';
import { useCurrentLocation } from './useCurrentLocation';
import { usePlaceSearch } from './usePlaceSearch';
import { useKeyboard } from './useKeyboard';
import { Button, colors, ErrorNote, styles, Title, useTask } from './ui';

export function LinkPlaceModal({
  placeId,
  name,
  address,
  location,
  onClose,
  onLinked,
}: {
  placeId: Id<'places'>;
  name: string;
  address: string;
  location?: { latitude: number; longitude: number };
  onClose: () => void;
  onLinked: (placeId: Id<'places'>, name: string) => void;
}) {
  const [query, setQuery] = useState([name, address].filter(Boolean).join(' '));
  const [searchOpen, setSearchOpen] = useState(true);
  const [selected, setSelected] = useState<GooglePlace>();
  const { isOpen: keyboardOpen } = useKeyboard();
  const map = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasMap = Boolean(
    Platform.OS === 'ios'
      ? Constants.expoConfig?.extra?.hasIosMapsKey
      : Constants.expoConfig?.extra?.hasAndroidMapsKey,
  );
  const current = useCurrentLocation(true);
  const center = location ?? current.location;
  const search = usePlaceSearch(query, center, true);
  const initialRegion = useRef(
    center
      ? { ...center, latitudeDelta: 0.08, longitudeDelta: 0.08 }
      : { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 25, longitudeDelta: 25 },
  ).current;
  useEffect(() => {
    if (!mapReady) return;
    const focus =
      selected?.location ?? (search.places.length === 1 ? search.places[0].location : undefined);
    if (focus) {
      map.current?.animateToRegion({ ...focus, latitudeDelta: 0.007, longitudeDelta: 0.007 }, 300);
    } else if (search.places.length > 1) {
      map.current?.fitToCoordinates(
        search.places.map((place) => place.location),
        {
          edgePadding: { top: 40, right: 40, bottom: 60, left: 40 },
          animated: true,
        },
      );
    } else if (center) {
      map.current?.animateToRegion({ ...center, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 300);
    }
  }, [mapReady, selected, search.places, center]);
  const match = useMutation(api.places.match);
  const task = useTask();
  const close = () => {
    if (!task.busy) onClose();
  };

  function link() {
    if (!selected) return;
    const choice = selected;
    void task.run(async () => {
      const linkedId = await match({
        placeId,
        name: choice.name,
        address: choice.address,
        googlePlaceId: choice.id,
        location: choice.location,
      });
      onLinked(linkedId, choice.name);
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.page}>
        <KeyboardAvoidingView
          style={styles.page}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[linkStyles.content, keyboardOpen && linkStyles.compactContent]}>
            <View style={linkStyles.header}>
              <Title style={linkStyles.title}>Add Location from Map</Title>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close place search"
                disabled={task.busy}
                onPress={close}
                style={linkStyles.close}
              >
                <Icon source="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <View style={linkStyles.searchContainer}>
              <SearchField
                placeholder="Search Google Maps…"
                accessibilityLabel="Search Google Maps"
                value={query}
                editable={!task.busy}
                onFocus={() => setSearchOpen(true)}
                onChangeText={(value) => {
                  setQuery(value);
                  setSelected(undefined);
                  setSearchOpen(true);
                }}
              />
              {searchOpen && (
                <View style={linkStyles.dropdown}>
                  <PlaceSearchResults
                    mode="select"
                    query={query}
                    nearby={search.loading ? [] : search.places}
                    loading={search.loading}
                    error={search.error}
                    onRetry={search.retry}
                    selectedId={selected?.id}
                    disabled={task.busy}
                    onNew={(place) => {
                      setSelected(place);
                      setSearchOpen(false);
                      Keyboard.dismiss();
                    }}
                  />
                </View>
              )}
            </View>
            <View style={linkStyles.mapContainer}>
              {hasMap ? (
                <MapView
                  ref={map}
                  accessibilityLabel="Map of place search results"
                  provider={PROVIDER_GOOGLE}
                  style={StyleSheet.absoluteFill}
                  initialRegion={initialRegion}
                  onMapReady={() => setMapReady(true)}
                  onPress={() => {
                    setSearchOpen(false);
                    Keyboard.dismiss();
                  }}
                  onPanDrag={() => {
                    setSearchOpen(false);
                    Keyboard.dismiss();
                  }}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                  showsMyLocationButton={false}
                >
                  {selected && (
                    <Marker
                      key={selected.id}
                      coordinate={selected.location}
                      title={selected.name}
                      description={selected.address}
                      pinColor={colors.rust}
                    />
                  )}
                </MapView>
              ) : (
                <Text style={styles.muted}>
                  Select a result to open its location in Google Maps.
                </Text>
              )}
              {selected && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${selected.name} in Google Maps`}
                  onPress={() => {
                    const coordinates = `${selected.location.latitude},${selected.location.longitude}`;
                    void Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}&query_place_id=${encodeURIComponent(selected.id)}`,
                    );
                  }}
                  style={linkStyles.openMaps}
                >
                  <Text style={styles.link}>Open in Google Maps</Text>
                  <Icon source="open-in-new" size={16} color={colors.rust} />
                </Pressable>
              )}
            </View>
            {selected && !keyboardOpen && (
              <View style={linkStyles.selection}>
                <Text style={styles.label}>{selected.name}</Text>
                <Text style={styles.muted} numberOfLines={2}>
                  {selected.address}
                </Text>
                {!!selected.attributions?.length && (
                  <GoogleAttribution attributions={selected.attributions} />
                )}
              </View>
            )}
            <ErrorNote error={task.error} />
            {!keyboardOpen && (
              <Button
                title={task.busy ? 'Adding…' : 'Add Location'}
                disabled={!selected || task.busy}
                onPress={link}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const linkStyles = StyleSheet.create({
  content: { flex: 1, padding: 20, gap: 14 },
  compactContent: { paddingVertical: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 24, lineHeight: 32 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  searchContainer: { position: 'relative', zIndex: 100 },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  selection: { gap: 3 },
  mapContainer: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  openMaps: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
