import { FlatList, Text, View } from 'react-native';
import { usePaginatedQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Button, Loading, Page, SectionHeading, styles, Title } from '../ui';
import { BoardPlaces } from '../BoardPlaces';
import { VisitCard } from './Boards';

export function PlacesScreen({ route, navigation }: ScreenProps<'Places'>) {
  const { boardId } = route.params;
  return (
    <Page>
      <Title>Places worth returning to.</Title>
      <Text style={styles.muted}>Your own little map of memories.</Text>
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
  );
}
export function PlaceScreen({ route, navigation }: ScreenProps<'Place'>) {
  const { boardId, placeId, name } = route.params;
  const { results, status, loadMore } = usePaginatedQuery(
    api.visits.places,
    { boardId },
    { initialNumItems: 100 },
  );
  const visits = results.filter((visit) => visit.placeId === placeId);
  const place = visits[0];
  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      data={visits}
      keyExtractor={(visit) => visit._id}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Title>{name}</Title>
          <Text style={styles.muted}>{place?.place}</Text>
          <Button
            title="Add another visit"
            onPress={() =>
              navigation.navigate('VisitForm', {
                boardId,
                placeId,
                title: name,
                place: place?.place,
                location: place?.location,
              })
            }
          />
          <SectionHeading
            title="Your Visits"
            count={`${visits.length}${status === 'Exhausted' ? '' : '+'}`}
            suffix="here"
          />
        </View>
      }
      renderItem={({ item }) => (
        <VisitCard
          visit={item}
          onPress={() => navigation.navigate('Visit', { visitId: item._id })}
        />
      )}
      ListEmptyComponent={
        status === 'LoadingFirstPage' ? (
          <Loading />
        ) : (
          <Text style={styles.muted}>No visits found in loaded history.</Text>
        )
      }
      ListFooterComponent={
        status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <Button
            title="Load older history"
            secondary
            disabled={status === 'LoadingMore'}
            onPress={() => loadMore(100)}
          />
        ) : null
      }
    />
  );
}
