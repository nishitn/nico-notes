import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePaginatedQuery, useQuery } from '../convexLive';
import { Image } from 'expo-image';
import { Icon } from 'react-native-paper';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Button, colors, Page, styles, Title } from '../ui';
import { BoardPlaces } from '../BoardPlaces';
import { BoardPicker } from '../BoardPicker';
import { PlaceVisitHistory } from '../PlaceVisitHistory';
import { LinkPlaceModal } from '../LinkPlaceModal';
import { PlaceOverview } from '../PlaceOverview';

import type { Id } from '@nico-notes/backend/dataModel';

export function PlaceTopBar({
  navigation,
  boardId,
  boardName,
  boards,
  onBack,
}: {
  navigation: { goBack: () => void; navigate: (screen: any, params?: any) => void };
  boardId?: Id<'boards'>;
  boardName?: string;
  boards?: {
    results: any[];
    status: string;
    loadMore: (numItems: number) => void;
  };
  onBack?: () => void;
}) {
  return (
    <View style={placeScreenStyles.topbar}>
      <View style={placeScreenStyles.brandGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={onBack ?? (() => navigation.goBack())}
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
      {boardId && boards && boardName ? (
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
      ) : null}
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
        <Title>Visited Places</Title>
        <BoardPlaces
          boardId={boardId}
          showHeading={false}
          showMap={false}
          showList
          onOpen={(place) =>
            navigation.navigate('Place', { boardId, placeId: place._id, name: place.name })
          }
          onAdd={(place, title) =>
            navigation.navigate('VisitForm', {
              boardId,
              placeId: place?._id,
              wishlistId: place?.wishlistId,
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
  const [linkOpen, setLinkOpen] = useState(false);
  const board = useQuery(api.boards.get, { boardId });
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const placeDoc = useQuery(api.places.get, { placeId });
  const address = placeDoc?.address ?? '';
  const location = placeDoc?.location;
  const googlePlaceId = placeDoc?.googlePlaceId;
  const canAddLocation = !!placeDoc && !googlePlaceId && !location;

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

      <PlaceVisitHistory
        boardId={boardId}
        placeId={placeId}
        members={board?.members ?? []}
        onOpen={(id) => navigation.navigate('Visit', { visitId: id })}
        header={
          <View style={{ gap: 14 }}>
            <PlaceOverview
              name={placeDoc?.name ?? name}
              address={address}
              location={location}
              googlePlaceId={googlePlaceId}
              showGoogleMaps={false}
              openGoogleMaps={openGoogleMaps}
              onAddLocation={canAddLocation ? () => setLinkOpen(true) : undefined}
            />

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
          </View>
        }
      />
      {linkOpen && canAddLocation && (
        <LinkPlaceModal
          placeId={placeId}
          name={placeDoc?.name ?? name}
          address={address}
          location={location}
          onClose={() => setLinkOpen(false)}
          onLinked={(linkedId, linkedName) => {
            setLinkOpen(false);
            navigation.replace('Place', { boardId, placeId: linkedId, name: linkedName });
          }}
        />
      )}
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
});
