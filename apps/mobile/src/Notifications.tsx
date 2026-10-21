import { FlatList, Text, View } from 'react-native';
import { Button, Icon } from 'react-native-paper';
import { useMutation, usePaginatedQuery } from './convexLive';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import { Card, colors, ErrorNote, Heading, Loading, styles, Title, useTask } from './ui';

export function Notifications({
  boardId,
  onOpen,
}: {
  boardId?: Id<'boards'>;
  onOpen: (visitId: Id<'visits'>) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.list,
    boardId ? { boardId } : 'skip',
    { initialNumItems: 30 },
  );
  const markRead = useMutation(api.notifications.markRead);
  const task = useTask();
  const newest = results[0];
  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}
      data={boardId ? results : []}
      keyExtractor={(item) => item._id}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Title>Notifications</Title>
          <Text style={styles.muted}>What’s changed on your board, newest first.</Text>
          {!!boardId && !!newest && (
            <Button
              icon="check-all"
              textColor={colors.rust}
              loading={task.busy}
              disabled={!newest.unread || task.busy}
              onPress={() => void task.run(() => markRead({ boardId, throughId: newest._id }))}
            >
              Mark all as read
            </Button>
          )}
          <ErrorNote error={task.error} />
        </View>
      }
      renderItem={({ item }) => (
        <Card
          style={item.unread ? { borderLeftWidth: 4, borderLeftColor: colors.primary } : undefined}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Icon source="bell-outline" size={22} color={colors.rust} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={styles.body}>
                <Text style={styles.label}>{item.actorName}</Text> {item.summary}
              </Text>
              <Text style={styles.muted}>{new Date(item.createdAt).toLocaleString()}</Text>
              {item.unread && <Text style={styles.link}>New</Text>}
              {!!item.visitId && (
                <Button textColor={colors.rust} onPress={() => onOpen(item.visitId!)}>
                  View visit
                </Button>
              )}
            </View>
          </View>
        </Card>
      )}
      ListEmptyComponent={
        boardId && status === 'LoadingFirstPage' ? (
          <Loading />
        ) : (
          <Card>
            <Icon source="bell-outline" size={36} color={colors.rust} />
            <Heading>{boardId ? 'No changes yet' : 'Choose a board'}</Heading>
            <Text style={styles.muted}>
              {boardId
                ? 'New visits, ratings, photos, and other board changes will appear here.'
                : 'Create or join a board to see what’s changed.'}
            </Text>
          </Card>
        )
      }
      ListFooterComponent={
        boardId && (status === 'CanLoadMore' || status === 'LoadingMore') ? (
          <Button
            loading={status === 'LoadingMore'}
            disabled={status === 'LoadingMore'}
            onPress={() => loadMore(30)}
          >
            Older notifications
          </Button>
        ) : null
      }
    />
  );
}
