import { FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { Icon } from 'react-native-paper';
import Constants from 'expo-constants';
import MapView, { Marker } from 'react-native-maps';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Button, colors, Loading, Page, SectionHeading, styles, Title } from '../ui';
import { BoardPlaces } from '../BoardPlaces';
import { BoardPicker } from '../BoardPicker';
import { VisitCard } from './Boards';

import type { Id } from '@nico-notes/backend/dataModel';

function PlaceTopBar({
  navigation,
  boardId,
  boardName,
  boards,
}: {
  navigation: { goBack: () => void; navigate: (screen: any, params?: any) => void };
  boardId: Id<'boards'>;
  boardName: string;
  boards: {
    results: any[];
    status: string;
    loadMore: (numItems: number) => void;
  };
}) {
  return (
    <View style={placeScreenStyles.topbar}>
      <View style={placeScreenStyles.brandGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => navigation.goBack()}
          style={placeScreenStyles.backButton}
        >
          <Icon source="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <View style={placeScreenStyles.brand}>
          <Image
            source={require('../../../web/public/favicon.svg')}
            contentFit="contain"
            style={placeScreenStyles.brandMark}
            accessible={false}
          />
          <Text style={placeScreenStyles.wordmark}>
            nico notes<Text style={{ color: colors.primary }}>.</Text>
          </Text>
        </View>
      </View>
      <View style={placeScreenStyles.boardPickerSlot}>
        <BoardPicker
          boards={boards.results}
          boardId={boardId}
          boardName={boardName}
          canLoadMore={boards.status === 'CanLoadMore'}
          loadingMore={boards.status === 'LoadingMore'}
          onLoadMore={() => boards.loadMore(24)}
          onSelect={(id) => navigation.navigate('Board', { boardId: id })}
          onNewBoard={() => navigation.navigate('BoardForm')}
          onJoinBoard={() => navigation.navigate('Join')}
        />
      </View>
    </View>
  );
}

export function PlacesScreen({ route, navigation }: ScreenProps<'Places'>) {
  const { boardId } = route.params;
  const board = useQuery(api.boards.get, { boardId });
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });

  return (
    <View style={styles.page}>
      <PlaceTopBar
        navigation={navigation}
        boardId={boardId}
        boardName={board?.board.name ?? ''}
        boards={boards}
      />
      <Page>
        <BoardPlaces
          boardId={boardId}
          showList
          onOpen={(place) =>
            navigation.navigate('Place', { boardId, placeId: place._id, name: place.name })
          }
          onAdd={(place, title) =>
            navigation.navigate('VisitForm', {
              boardId,
              placeId: place?._id,
              googlePlaceId: place?.googlePlaceId,
              title: place?.name ?? title,
              place: place?.address,
              location: place?.location,
            })
          }
        />
      </Page>
    </View>
  );
}

export function PlaceScreen({ route, navigation }: ScreenProps<'Place'>) {
  const { boardId, placeId, name } = route.params;
  const board = useQuery(api.boards.get, { boardId });
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const placeDoc = useQuery(api.places.get, { placeId });
  const visits = usePaginatedQuery(api.visits.list, { boardId, placeId }, { initialNumItems: 24 });
  const address = placeDoc?.address ?? visits.results[0]?.place ?? '';
  const location = placeDoc?.location ?? visits.results.find((v) => v.location)?.location;
  const googlePlaceId = placeDoc?.googlePlaceId ?? visits.results[0]?.googlePlaceId;
  const hasMap = Platform.OS === 'ios' || Constants.expoConfig?.extra?.hasAndroidMapsKey;

  const openGoogleMaps = () => {
    const query = location ? `${location.latitude},${location.longitude}` : `${name} ${address}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${
      googlePlaceId ? `&query_place_id=${encodeURIComponent(googlePlaceId)}` : ''
    }`;
    void Linking.openURL(url);
  };

  return (
    <View style={styles.page}>
      <PlaceTopBar
        navigation={navigation}
        boardId={boardId}
        boardName={board?.board.name ?? ''}
        boards={boards}
      />

      <FlatList
        style={styles.page}
        contentContainerStyle={styles.content}
        data={visits.results}
        keyExtractor={(visit) => visit._id}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <View style={placeScreenStyles.titleBlock}>
              <Title style={placeScreenStyles.titleText}>{name}</Title>
              <View style={placeScreenStyles.locationRow}>
                <View style={placeScreenStyles.locationLeft}>
                  <Icon source="map-marker-outline" size={16} color={colors.rust} />
                  <Text numberOfLines={2} style={placeScreenStyles.locationText}>
                    {address || 'Location not recorded'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${name} in Google Maps`}
                  hitSlop={8}
                  onPress={openGoogleMaps}
                  style={placeScreenStyles.mapsButton}
                >
                  <Icon source="google-maps" size={17} color={colors.rust} />
                  <Text style={placeScreenStyles.mapsButtonText}>Maps</Text>
                  <Icon source="open-in-new" size={13} color={colors.rust} />
                </Pressable>
              </View>
            </View>

            {location && hasMap ? (
              <View style={placeScreenStyles.mapContainer}>
                <MapView
                  style={placeScreenStyles.map}
                  initialRegion={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.007,
                    longitudeDelta: 0.007,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={true}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                >
                  <Marker coordinate={location} title={name} description={address}>
                    <View style={placeScreenStyles.pin}>
                      <Icon source="heart" size={16} color={colors.paper} />
                    </View>
                  </Marker>
                </MapView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open in Google Maps"
                  style={placeScreenStyles.mapOverlayButton}
                  onPress={openGoogleMaps}
                >
                  <Icon source="google-maps" size={15} color={colors.rust} />
                  <Text style={placeScreenStyles.mapOverlayText}>Open in Google Maps</Text>
                  <Icon source="open-in-new" size={13} color={colors.rust} />
                </Pressable>
              </View>
            ) : address ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open address in Google Maps"
                style={placeScreenStyles.mapFallbackCard}
                onPress={openGoogleMaps}
              >
                <Icon source="map-marker-outline" size={28} color={colors.rust} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={placeScreenStyles.mapFallbackTitle}>Find on Google Maps</Text>
                  <Text numberOfLines={1} style={styles.muted}>
                    Tap to search for this place and get directions.
                  </Text>
                </View>
                <Icon source="open-in-new" size={18} color={colors.rust} />
              </Pressable>
            ) : null}

            <Button
              title="Add another visit"
              onPress={() =>
                navigation.navigate('VisitForm', {
                  boardId,
                  placeId,
                  title: name,
                  place: address,
                  location,
                  googlePlaceId,
                })
              }
            />
            <SectionHeading
              title="Your Visits"
              count={`${visits.results.length}${visits.status === 'Exhausted' ? '' : '+'}`}
              suffix="here"
            />
          </View>
        }
        renderItem={({ item, index }) => (
          <VisitCard
            visit={item}
            members={board?.members}
            number={
              item.visitNumber ??
              (visits.status === 'Exhausted' ? visits.results.length - index : undefined)
            }
            onPress={() => navigation.navigate('Visit', { visitId: item._id })}
          />
        )}
        ListEmptyComponent={
          visits.status === 'LoadingFirstPage' ? (
            <Loading />
          ) : (
            <Text style={styles.muted}>No visits found in loaded history.</Text>
          )
        }
        ListFooterComponent={
          visits.status === 'CanLoadMore' || visits.status === 'LoadingMore' ? (
            <Button
              title="Load older history"
              secondary
              disabled={visits.status === 'LoadingMore'}
              onPress={() => visits.loadMore(24)}
            />
          ) : null
        }
      />
    </View>
  );
}

const placeScreenStyles = StyleSheet.create({
  topbar: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 28,
    height: 28,
    transform: [{ rotate: '-6deg' }],
  },
  wordmark: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -1,
  },
  boardPickerSlot: {
    flexShrink: 0,
  },
  titleBlock: {
    gap: 6,
  },
  titleText: {
    marginBottom: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  locationText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.muted,
    flex: 1,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: colors.coralLight,
    borderWidth: 1,
    borderColor: '#F2D4C9',
  },
  mapsButtonText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
  mapContainer: {
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    position: 'relative',
    marginVertical: 4,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.rust,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.paper,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  mapOverlayButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  mapOverlayText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
  mapFallbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.coralLight,
    borderWidth: 1,
    borderColor: '#F2D4C9',
    marginVertical: 4,
  },
  mapFallbackTitle: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.rust,
  },
});
