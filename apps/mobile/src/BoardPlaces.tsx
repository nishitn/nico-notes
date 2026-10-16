import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Constants from 'expo-constants';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { Icon, Menu, Searchbar } from 'react-native-paper';
import { clusterPlaces, nearbyRegion, type MapRegion, type MapSize } from './mapGeometry';
import { PlacePreview } from './PlacePreview';
import { PlaceSearchResults } from './PlaceSearchResults';
import { distanceBetween, formatDistance, matchingPlaces } from './placeSearch';
import { usePlaceSearch } from './usePlaceSearch';
import type { GooglePlace } from '../modules/google-places';
import { useCurrentLocation } from './useCurrentLocation';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import { Button, Card, colors, ErrorNote, Heading, SectionHeading, styles, useTask } from './ui';

export type VisitPlace = {
  _id?: Id<'places'>;
  name: string;
  address: string;
  googlePlaceId?: string;
  location?: { latitude: number; longitude: number };
};

export type PlaceSortOption = 'visits' | 'distance' | 'recent' | 'name_asc' | 'name_desc';

export const PLACE_SORT_OPTIONS: { value: PlaceSortOption; label: string; icon: string }[] = [
  { value: 'visits', label: 'Most visits', icon: 'book-open-outline' },
  { value: 'distance', label: 'Nearest to you', icon: 'navigation-variant-outline' },
  { value: 'recent', label: 'Recently added', icon: 'clock-outline' },
  { value: 'name_asc', label: 'Name (A to Z)', icon: 'sort-alphabetical-ascending' },
  { value: 'name_desc', label: 'Name (Z to A)', icon: 'sort-alphabetical-descending' },
];

export type SavedPlace = {
  _id: Id<'places'>;
  name: string;
  address: string;
  location?: { latitude: number; longitude: number };
  distance?: number;
};

export function BoardPlaces({
  boardId,
  onOpen,
  onAdd,
  onViewAll,
  showList = false,
}: {
  boardId: Id<'boards'>;
  onOpen: (place: SavedPlace) => void;
  onAdd: (place?: VisitPlace, title?: string) => void;
  onViewAll?: () => void;
  showList?: boolean;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.places.list,
    { boardId },
    { initialNumItems: 100 },
  );
  const link = useMutation(api.places.ensureLinked);
  const wishlistPlaceIds = useQuery(api.wishlist.savedPlaceIds, { boardId });
  const addToWishlist = useMutation(api.wishlist.add);
  const { run, error } = useTask();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortBy, setSortBy] = useState<PlaceSortOption>('visits');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [newPlace, setNewPlace] = useState<GooglePlace>();
  const [selectedId, setSelectedId] = useState<Id<'places'>>();
  const map = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapSize, setMapSize] = useState<MapSize>({ width: 0, height: 300 });
  const [region, setRegion] = useState<MapRegion>({
    latitude: 20.5937,
    longitude: 78.9629,
    latitudeDelta: 25,
    longitudeDelta: 25,
  });
  const [selectedClusterIds, setSelectedClusterIds] = useState<string[]>([]);
  const fallbackApplied = useRef(false);
  const initialCenterApplied = useRef(false);
  useEffect(() => {
    void run(() => link({ boardId }));
  }, [boardId, link, run]);
  const filtered = useMemo(() => matchingPlaces(results, search), [results, search]);
  useEffect(() => {
    if (search.trim() && status === 'CanLoadMore') loadMore(100);
  }, [search, status, loadMore]);
  const located = useMemo(
    () =>
      filtered.filter(
        (p): p is typeof p & { location: NonNullable<typeof p.location> } => !!p.location,
      ),
    [filtered],
  );
  const selected = results.find((p) => p._id === selectedId);
  const hasMap = Platform.OS === 'ios' || Constants.expoConfig?.extra?.hasAndroidMapsKey;
  const current = useCurrentLocation(!!hasMap);
  const savedWithDistance = useMemo(
    () =>
      filtered.map((p) => ({
        ...p,
        distance:
          p.location && current.location
            ? distanceBetween(p.location, current.location)
            : undefined,
      })),
    [filtered, current.location],
  );
  const sortedPlaces = useMemo(() => {
    const list = [...savedWithDistance];
    return list.sort((a, b) => {
      switch (sortBy) {
        case 'visits': {
          const countA = a.visitCount ?? 1;
          const countB = b.visitCount ?? 1;
          if (countB !== countA) return countB - countA;
          return a.name.localeCompare(b.name);
        }
        case 'distance': {
          const distA = a.distance !== undefined ? a.distance : Infinity;
          const distB = b.distance !== undefined ? b.distance : Infinity;
          if (distA !== distB) return distA - distB;
          return a.name.localeCompare(b.name);
        }
        case 'recent': {
          const timeA = a._creationTime ?? 0;
          const timeB = b._creationTime ?? 0;
          if (timeB !== timeA) return timeB - timeA;
          return a.name.localeCompare(b.name);
        }
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });
  }, [savedWithDistance, sortBy]);
  const currentSort =
    PLACE_SORT_OPTIONS.find((opt) => opt.value === sortBy) ?? PLACE_SORT_OPTIONS[0];
  const nearby = usePlaceSearch(search, current.location, searchOpen);
  const clusters = useMemo(
    () => clusterPlaces(located, region, mapSize),
    [located, region, mapSize],
  );
  const selectedCluster = located.filter((p) => selectedClusterIds.includes(p._id));
  useEffect(() => {
    if (!mapReady || !mapSize.width || !current.location || initialCenterApplied.current) return;
    initialCenterApplied.current = true;
    map.current?.animateToRegion(nearbyRegion(current.location, mapSize), 450);
  }, [mapReady, mapSize, current.location]);
  // A saved place is a useful fallback when permission or GPS is unavailable.
  // Data updates never override a pan, zoom, or the current-location view.
  useEffect(() => {
    if (
      !mapReady ||
      !mapSize.width ||
      current.locating ||
      current.location ||
      fallbackApplied.current ||
      !located.length
    )
      return;
    fallbackApplied.current = true;
    map.current?.animateToRegion(nearbyRegion(located[0].location, mapSize), 450);
  }, [mapReady, mapSize, current.locating, current.location, located]);
  function selectSaved(place: SavedPlace) {
    setNewPlace(undefined);
    setSelectedId(place._id);
    setSelectedClusterIds([]);
    setSearchOpen(false);
    Keyboard.dismiss();
    if (place.location)
      map.current?.animateToRegion(nearbyRegion(place.location, mapSize, 0.8), 350);
  }
  function selectNew(place: GooglePlace) {
    setSelectedId(undefined);
    setSelectedClusterIds([]);
    setSearchOpen(false);
    setNewPlace(place);
    Keyboard.dismiss();
    map.current?.animateToRegion(nearbyRegion(place.location, mapSize, 0.8), 350);
  }
  function add(place?: VisitPlace, title?: string) {
    setSearchOpen(false);
    Keyboard.dismiss();
    onAdd(place, title);
  }
  function openMaps(place: VisitPlace) {
    void run(() =>
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}${place.googlePlaceId ? `&query_place_id=${encodeURIComponent(place.googlePlaceId)}` : ''}`,
      ),
    );
  }
  function selectCluster(cluster: (typeof clusters)[number]) {
    setSearchOpen(false);
    setNewPlace(undefined);
    Keyboard.dismiss();
    setSelectedId(undefined);
    const first = cluster.places[0].location;
    const samePoint = cluster.places.every(
      (p) =>
        Math.abs(p.location.latitude - first.latitude) < 0.00001 &&
        Math.abs(p.location.longitude - first.longitude) < 0.00001,
    );
    if (samePoint || region.latitudeDelta < 0.0003) {
      setSelectedClusterIds(cluster.places.map((p) => p._id));
      return;
    }
    setSelectedClusterIds([]);
    map.current?.animateToRegion(
      {
        ...cluster.coordinate,
        latitudeDelta: region.latitudeDelta / 2.5,
        longitudeDelta: region.longitudeDelta / 2.5,
      },
      350,
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <SectionHeading
        title="Your Places"
        count={`${results.length}${status !== 'Exhausted' ? '+' : ''}`}
        suffix="explored"
      />
      <View style={placeStyles.searchContainer}>
        <Searchbar
          placeholder="Search places…"
          accessibilityLabel="Search places"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setSearchOpen(!!value.trim());
            setNewPlace(undefined);
            setSelectedId(undefined);
            setSelectedClusterIds([]);
          }}
          onFocus={() => setSearchOpen(!!search.trim())}
          onSubmitEditing={() => {
            if (filtered.length === 1) selectSaved(filtered[0]);
            else Keyboard.dismiss();
          }}
          returnKeyType="search"
          autoCorrect={false}
          style={placeStyles.search}
          inputStyle={styles.body}
          iconColor={colors.rust}
        />
        {searchOpen && !!search.trim() && (
          <View style={placeStyles.dropdown}>
            <PlaceSearchResults
              query={search}
              saved={savedWithDistance}
              loadingSaved={status !== 'Exhausted'}
              nearby={nearby.places}
              loading={nearby.loading}
              error={nearby.error}
              hasLocation={!!current.location}
              onRetry={nearby.retry}
              onSaved={selectSaved}
              onNew={selectNew}
              onAddSaved={(place) => add(place)}
              onAddNew={(place) => add({ ...place, googlePlaceId: place.id })}
              onManual={() => add(undefined, search.trim())}
            />
          </View>
        )}
      </View>
      <ErrorNote error={error || current.error} />
      <View style={placeStyles.mapShell}>
        {hasMap ? (
          <MapView
            ref={map}
            style={placeStyles.map}
            initialRegion={region}
            onLayout={({ nativeEvent: { layout } }) =>
              setMapSize({ width: layout.width, height: layout.height })
            }
            onMapReady={() => setMapReady(true)}
            onRegionChangeComplete={setRegion}
            onPress={() => {
              if (searchOpen) {
                setSearchOpen(false);
                Keyboard.dismiss();
              }
            }}
            onPanDrag={() => {
              if (searchOpen) {
                setSearchOpen(false);
                Keyboard.dismiss();
              }
            }}
            showsUserLocation={!!current.location}
            showsMyLocationButton={false}
            toolbarEnabled={false}
            moveOnMarkerPress={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {clusters.map((cluster) =>
              cluster.places.length > 1 ? (
                <Marker
                  key={`cluster:${cluster.id}`}
                  coordinate={cluster.coordinate}
                  onPress={() => selectCluster(cluster)}
                  accessibilityLabel={`${cluster.places.length} places, tap to explore`}
                >
                  <View style={placeStyles.cluster}>
                    <Text style={placeStyles.clusterCount}>{cluster.places.length}</Text>
                  </View>
                </Marker>
              ) : (
                <Marker
                  key={cluster.places[0]._id}
                  coordinate={cluster.places[0].location}
                  onPress={() => {
                    selectSaved(cluster.places[0]);
                  }}
                  accessibilityLabel={cluster.places[0].name}
                >
                  <View
                    style={[
                      placeStyles.pin,
                      selectedId === cluster.places[0]._id && placeStyles.selectedPin,
                    ]}
                  >
                    <Icon
                      source="heart"
                      size={18}
                      color={selectedId === cluster.places[0]._id ? colors.paper : colors.rust}
                    />
                  </View>
                </Marker>
              ),
            )}
            {newPlace && (
              <Marker
                key={`new:${newPlace.id}`}
                coordinate={newPlace.location}
                onPress={() => selectNew(newPlace)}
                accessibilityLabel={newPlace.name}
              >
                <View style={[placeStyles.pin, placeStyles.selectedPin]}>
                  <Icon source="compass-outline" size={20} color={colors.paper} />
                </View>
              </Marker>
            )}
          </MapView>
        ) : (
          <View style={placeStyles.mapFallback}>
            <Icon source="map-marker-outline" size={42} color={colors.rust} />
            <Heading>Your places, together.</Heading>
            <Text style={[styles.muted, { textAlign: 'center' }]}>
              Open View All Places to browse your saved places and get directions.
            </Text>
          </View>
        )}
        {hasMap && (
          <>
            <View pointerEvents="none" style={placeStyles.radiusLabel}>
              <Text style={placeStyles.hintText}>
                {current.locating ? 'Finding your location…' : 'Explore nearby'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show current location within 10 kilometers"
              accessibilityState={{ disabled: current.locating, busy: current.locating }}
              disabled={current.locating}
              onPress={() => {
                setSearch('');
                setSearchOpen(false);
                setNewPlace(undefined);
                setSelectedId(undefined);
                setSelectedClusterIds([]);
                void current.request();
              }}
              style={({ pressed }) => [
                placeStyles.locateButton,
                { opacity: pressed || current.locating ? 0.7 : 1 },
              ]}
            >
              {current.locating ? (
                <ActivityIndicator size="small" color={colors.rust} />
              ) : (
                <Icon source="crosshairs-gps" size={24} color={colors.rust} />
              )}
            </Pressable>
            {located.length > 0 && (
              <View pointerEvents="none" style={placeStyles.hint}>
                <Icon source="heart-outline" size={14} color={colors.rust} />
                <Text style={placeStyles.hintText}>Tap a pin or count to explore</Text>
              </View>
            )}
          </>
        )}
      </View>
      {selectedCluster.length > 1 && (
        <Card>
          <View style={styles.sectionRow}>
            <Heading>{selectedCluster.length} places here</Heading>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close selected group"
              onPress={() => setSelectedClusterIds([])}
              style={styles.iconButton}
            >
              <Icon source="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          {selectedCluster.map((place) => {
            const placeDist = current.location
              ? distanceBetween(place.location, current.location)
              : undefined;
            const visitCount = place.visitCount ?? 1;
            return (
              <Pressable
                key={place._id}
                accessibilityRole="button"
                onPress={() => {
                  selectSaved(place);
                }}
                style={placeStyles.placeRow}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={placeStyles.placeName}>
                    {place.name}
                  </Text>
                  <Text numberOfLines={1} style={placeStyles.placeMeta}>
                    {place.address ? `${place.address} · ` : ''}
                    <Text style={placeStyles.metaHighlight}>
                      {visitCount} {visitCount === 1 ? 'visit' : 'visits'}
                    </Text>
                    {placeDist !== undefined ? ` · ${formatDistance(placeDist)}` : ''}
                  </Text>
                </View>
                <Icon source="chevron-right" size={18} color={colors.rust} />
              </Pressable>
            );
          })}
        </Card>
      )}
      {newPlace ? (
        <PlacePreview
          name={newPlace.name}
          address={newPlace.address}
          isNew
          isWishlisted={wishlistPlaceIds?.includes(newPlace.id)}
          onClose={() => setNewPlace(undefined)}
          onMaps={() => openMaps({ ...newPlace, googlePlaceId: newPlace.id })}
          onAdd={() => add({ ...newPlace, googlePlaceId: newPlace.id })}
          onWishlist={() =>
            void addToWishlist({
              boardId,
              title: newPlace.name,
              place: newPlace.address,
              location: newPlace.location,
              googlePlaceId: newPlace.id,
            })
          }
        />
      ) : (
        selected && (
          <PlacePreview
            name={selected.name}
            address={selected.address}
            isWishlisted={
              !!selected.googlePlaceId && wishlistPlaceIds?.includes(selected.googlePlaceId)
            }
            onClose={() => setSelectedId(undefined)}
            onOpen={() => onOpen(selected)}
            onMaps={() => openMaps(selected)}
            onAdd={() => add(selected)}
            onWishlist={() =>
              void addToWishlist({
                boardId,
                title: selected.name,
                place: selected.address,
                location: selected.location,
                googlePlaceId: selected.googlePlaceId,
              })
            }
          />
        )
      )}
      {showList && (
        <>
          {savedWithDistance.length > 0 && (
            <View style={placeStyles.listHeaderRow}>
              <View style={placeStyles.listHeaderTitleGroup}>
                <Text style={placeStyles.listHeaderTitle}>All Places</Text>
                <View style={placeStyles.countPill}>
                  <Text style={placeStyles.countPillText}>{sortedPlaces.length}</Text>
                </View>
              </View>
              <Menu
                visible={sortMenuVisible}
                onDismiss={() => setSortMenuVisible(false)}
                anchorPosition="bottom"
                contentStyle={placeStyles.sortMenuContent}
                anchor={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Sort places by ${currentSort.label}`}
                    onPress={() => setSortMenuVisible(true)}
                    style={({ pressed }) => [placeStyles.sortButton, pressed && { opacity: 0.8 }]}
                  >
                    <Icon source="sort-variant" size={16} color={colors.rust} />
                    <Text style={placeStyles.sortButtonText}>{currentSort.label}</Text>
                    <Icon
                      source={sortMenuVisible ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.rust}
                    />
                  </Pressable>
                }
              >
                {PLACE_SORT_OPTIONS.map((option) => {
                  const selected = sortBy === option.value;
                  return (
                    <Menu.Item
                      key={option.value}
                      onPress={() => {
                        setSortBy(option.value);
                        setSortMenuVisible(false);
                      }}
                      title={option.label}
                      titleStyle={[
                        placeStyles.menuItemText,
                        selected && placeStyles.menuItemTextActive,
                      ]}
                      leadingIcon={option.icon}
                      trailingIcon={selected ? 'check' : undefined}
                      dense
                      style={[placeStyles.menuItem, selected && placeStyles.menuItemActive]}
                    />
                  );
                })}
              </Menu>
            </View>
          )}
          {sortedPlaces.map((p) => {
            const visitCount = p.visitCount ?? 1;
            return (
              <Pressable
                key={p._id}
                accessibilityRole="button"
                onPress={() => onOpen(p)}
                style={placeStyles.placeRow}
              >
                <View style={placeStyles.placeIcon}>
                  <Icon source="map-marker-outline" size={18} color={colors.rust} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={placeStyles.placeName}>
                    {p.name}
                  </Text>
                  <Text numberOfLines={1} style={placeStyles.placeMeta}>
                    {p.address ? `${p.address} · ` : ''}
                    <Text style={placeStyles.metaHighlight}>
                      {visitCount} {visitCount === 1 ? 'visit' : 'visits'}
                    </Text>
                    {p.distance !== undefined ? ` · ${formatDistance(p.distance)}` : ''}
                  </Text>
                </View>
                <Icon source="chevron-right" size={18} color={colors.rust} />
              </Pressable>
            );
          })}
        </>
      )}
      {status === 'LoadingFirstPage' ? (
        <Text style={styles.muted}>Loading your places…</Text>
      ) : (
        !search.trim() &&
        filtered.length === 0 && (
          <Card>
            <Heading>{search ? 'No matching saved places' : 'A world of places awaits'}</Heading>
            <Text style={styles.muted}>
              Save a visit and start your own little map of memories.
            </Text>
            <Button
              secondary
              title={search.trim() ? `Add “${search.trim()}” manually` : 'Add your first visit'}
              onPress={() => add(undefined, search.trim())}
            />
          </Card>
        )
      )}
      <View style={styles.sectionRow}>
        {onViewAll && (
          <Pressable accessibilityRole="button" onPress={onViewAll} style={styles.textButton}>
            <Icon source="format-list-bulleted" size={17} color={colors.rust} />
            <Text style={styles.link}>View All Places</Text>
            <Icon source="arrow-right" size={16} color={colors.rust} />
          </Pressable>
        )}
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <Button
            secondary
            title={status === 'LoadingMore' ? 'Loading…' : 'Load more places'}
            disabled={status === 'LoadingMore'}
            onPress={() => loadMore(100)}
          />
        ) : null}
      </View>
    </View>
  );
}
const placeStyles = StyleSheet.create({
  searchContainer: {
    position: 'relative',
    zIndex: 100,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    zIndex: 1000,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  search: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    elevation: 0,
  },
  mapShell: {
    marginHorizontal: -22,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.sageLight,
  },
  map: { width: '100%', aspectRatio: 1.15 },
  mapFallback: {
    minHeight: 220,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.coralBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedPin: { backgroundColor: colors.rust },
  cluster: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: colors.rust,
    borderWidth: 3,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: { fontFamily: 'JakartaSemiBold', color: colors.paper, fontSize: 15 },
  radiusLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: colors.paper,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  locateButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  hint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.paper,
    borderRadius: 24,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  hintText: { fontFamily: 'Jakarta', fontSize: 11, color: colors.rust },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  placeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.peachLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeName: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
  placeMeta: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  metaHighlight: {
    fontFamily: 'JakartaSemiBold',
    color: colors.rust,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 4,
  },
  listHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listHeaderTitle: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  countPill: {
    backgroundColor: colors.coralLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countPillText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.rust,
  },
  sortMenuContent: {
    backgroundColor: colors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  menuItem: {
    minHeight: 42,
    paddingHorizontal: 8,
  },
  menuItemActive: {
    backgroundColor: colors.coralLight,
  },
  menuItemText: {
    fontFamily: 'Jakarta',
    fontSize: 14,
    color: colors.ink,
  },
  menuItemTextActive: {
    fontFamily: 'JakartaSemiBold',
    color: colors.rust,
  },
});
