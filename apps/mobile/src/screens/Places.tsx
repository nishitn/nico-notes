import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Constants from 'expo-constants';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Button, Card, ErrorNote, Field, Heading, Loading, styles, Title, useTask } from '../ui';
import { VisitCard } from './Boards';

export function PlacesScreen({ route, navigation }: ScreenProps<'Places'>) {
  const { boardId } = route.params;
  const { results, status, loadMore } = usePaginatedQuery(
    api.places.list,
    { boardId },
    { initialNumItems: 100 },
  );
  const link = useMutation(api.places.ensureLinked);
  const task = useTask();
  const { run } = task;
  const [search, setSearch] = useState('');
  const map = useRef<MapView>(null);
  useEffect(() => {
    void run(() => link({ boardId }));
  }, [boardId, link, run]);
  const filtered = results.filter((place) =>
    `${place.name} ${place.address}`.toLowerCase().includes(search.toLowerCase()),
  );
  const located = filtered.filter((place) => place.location);
  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      data={filtered}
      keyExtractor={(place) => place._id}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Title>Places worth returning to.</Title>
          <Field
            label="Find a place"
            value={search}
            onChangeText={setSearch}
            placeholder="Search loaded places…"
          />
          <ErrorNote error={task.error} />
          {Constants.expoConfig?.extra?.hasAndroidMapsKey && located.length ? (
            <View style={{ borderRadius: 20, overflow: 'hidden' }}>
              <MapView
                ref={map}
                style={{ height: 300, width: '100%' }}
                initialRegion={{
                  ...located[0].location!,
                  latitudeDelta: 0.08,
                  longitudeDelta: 0.08,
                }}
                onMapReady={() =>
                  map.current?.fitToCoordinates(
                    located.map((place) => place.location!),
                    { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false },
                  )
                }
              >
                {located.map((place) => (
                  <Marker
                    key={place._id}
                    coordinate={place.location!}
                    title={place.name}
                    description={place.address}
                    onCalloutPress={() =>
                      navigation.navigate('Place', {
                        boardId,
                        placeId: place._id,
                        name: place.name,
                      })
                    }
                  />
                ))}
              </MapView>
            </View>
          ) : (
            <Text style={styles.muted}>Open a place to see its visits and directions.</Text>
          )}
          <Text style={styles.muted}>
            {results.length} places loaded · Load more to include all places on the map.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}`}
          onPress={() =>
            navigation.navigate('Place', { boardId, placeId: item._id, name: item.name })
          }
        >
          <Card>
            <Heading>{item.name}</Heading>
            <Text style={styles.muted}>{item.address || 'No address saved'}</Text>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        status === 'LoadingFirstPage' ? (
          <Loading />
        ) : (
          <Text style={styles.body}>No matching places yet.</Text>
        )
      }
      ListFooterComponent={
        status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <Button
            title="Load more places"
            secondary
            disabled={status === 'LoadingMore'}
            onPress={() => loadMore(100)}
          />
        ) : null
      }
    />
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
          <Text style={styles.muted}>
            {visits.length} visits found
            {status !== 'Exhausted' ? ' in loaded history. Load more for older visits.' : '.'}
          </Text>
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
