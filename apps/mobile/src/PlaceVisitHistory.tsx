import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { api } from '@nico-notes/backend/api';
import type { ReactNode } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { renderVerticalScrollView } from './VerticalScrollView';
import { usePaginatedQuery } from './convexLive';
import { VisitCard } from './VisitCard';
import { Button, colors, SectionHeading, styles } from './ui';

export function PlaceVisitHistory({
  header,
  boardId,
  placeId,
  members,
  onOpen,
}: {
  header: ReactNode;
  boardId: Id<'boards'>;
  placeId: Id<'places'> | null | undefined;
  members: Pick<Doc<'users'>, '_id' | 'name' | 'image'>[];
  onOpen: (visitId: Id<'visits'>) => void;
}) {
  const visits = usePaginatedQuery(api.visits.list, placeId ? { boardId, placeId } : 'skip', {
    initialNumItems: 24,
  });
  const completed = visits.results.filter((visit) => visit.status !== 'planned');
  const unavailable = placeId === undefined;
  const loading = !!placeId && visits.status === 'LoadingFirstPage';
  return (
    <FlatList
      renderScrollComponent={renderVerticalScrollView}
      style={styles.page}
      contentContainerStyle={[styles.content, historyStyles.content]}
      data={completed}
      keyExtractor={(visit) => visit._id}
      ListHeaderComponent={
        <View style={historyStyles.header}>
          {header}
          <SectionHeading
            title="Your Visits"
            count={
              loading || unavailable
                ? undefined
                : `${completed.length}${placeId && visits.status !== 'Exhausted' ? '+' : ''}`
            }
            suffix={completed.length === 1 ? 'visit' : 'visits'}
          />
        </View>
      }
      renderItem={({ item, index }) => (
        <VisitCard
          visit={item}
          members={members}
          number={
            item.visitNumber ??
            (visits.status === 'Exhausted' ? completed.length - index : undefined)
          }
          onPress={() => onOpen(item._id)}
        />
      )}
      ListEmptyComponent={
        unavailable ? (
          <Text accessibilityRole="alert" style={styles.muted}>
            Visit history is temporarily unavailable.
          </Text>
        ) : loading ? (
          <View style={historyStyles.loading} accessibilityRole="progressbar">
            <ActivityIndicator color={colors.rust} />
            <Text style={styles.muted}>Loading visits…</Text>
          </View>
        ) : (
          <Text style={styles.muted}>No visits here yet.</Text>
        )
      }
      ListFooterComponent={
        placeId && (visits.status === 'CanLoadMore' || visits.status === 'LoadingMore') ? (
          <Button
            secondary
            title="Load older history"
            disabled={visits.status === 'LoadingMore'}
            onPress={() => visits.loadMore(24)}
          />
        ) : null
      }
    />
  );
}

const historyStyles = StyleSheet.create({
  content: { gap: 16 },
  header: { gap: 16 },
  loading: { paddingVertical: 16, alignItems: 'center', gap: 8 },
});
