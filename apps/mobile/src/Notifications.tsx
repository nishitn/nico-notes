import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, Icon } from 'react-native-paper';
import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { api } from '@nico-notes/backend/api';
import { nextNotificationTimeUpdate, notificationTime } from '@nico-notes/backend/notificationTime';
import { notificationText } from '@nico-notes/backend/notificationText';
import { GoogleAttribution } from './GoogleAttribution';
import type { Id } from '@nico-notes/backend/dataModel';
import { Card, colors, confirm, ErrorNote, Heading, Loading, styles, Title, useTask } from './ui';

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
  const markOneRead = useMutation(api.notifications.markOneRead);
  const deleteAll = useMutation(api.notifications.deleteAll);
  const hasUnread = useQuery(api.notifications.hasUnread, boardId ? { boardId } : 'skip');
  const task = useTask();
  const newest = results[0];
  const [now, setNow] = useState(Date.now);
  const nextUpdate = (boardId ? results : []).reduce(
    (next, item) => Math.min(next, nextNotificationTimeUpdate(item.createdAt, now) ?? Infinity),
    Infinity,
  );
  useEffect(() => {
    if (!Number.isFinite(nextUpdate)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextUpdate - Date.now()));
    return () => clearTimeout(timer);
  }, [nextUpdate]);
  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={{ padding: 16, gap: 6, paddingBottom: 32 }}
      data={boardId ? results : []}
      keyExtractor={(item) => item._id}
      ListHeaderComponent={
        <View style={{ gap: 6, marginBottom: 6 }}>
          <View style={notificationStyles.heading}>
            <Title>Notifications</Title>
            {!!boardId && !!newest && (
              <View style={notificationStyles.toolbar}>
                <Button
                  compact
                  icon="check-all"
                  textColor={colors.rust}
                  disabled={!(hasUnread ?? results.some((item) => item.unread)) || task.busy}
                  onPress={() => void task.run(() => markRead({ boardId, throughId: newest._id }))}
                  labelStyle={notificationStyles.actionLabel}
                >
                  Mark all as read
                </Button>
                <Button
                  compact
                  icon="delete-outline"
                  textColor={colors.rust}
                  disabled={task.busy}
                  onPress={() =>
                    confirm(
                      'Delete all notifications?',
                      () => void task.run(() => deleteAll({ boardId })),
                      'This clears your feed for this board only. New notifications will still appear.',
                    )
                  }
                  labelStyle={notificationStyles.actionLabel}
                >
                  Delete all notifications
                </Button>
              </View>
            )}
          </View>
          <ErrorNote error={task.error} />
        </View>
      }
      renderItem={({ item }) => (
        <Card style={[notificationStyles.card, item.unread && notificationStyles.unread]}>
          <View style={notificationStyles.row}>
            <View style={{ paddingTop: 2 }}>
              <Icon source="bell-outline" size={16} color={colors.rust} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={notificationStyles.row}>
                <Text style={notificationStyles.body}>
                  <Text style={notificationStyles.actor}>{item.actorName}</Text>{' '}
                  {notificationText(item)}
                </Text>
                <Text
                  style={notificationStyles.time}
                  accessibilityLabel={new Date(item.createdAt).toLocaleString()}
                >
                  {notificationTime(item.createdAt, now)}
                </Text>
              </View>
              {item.message?.googlePlaceId && (
                <GoogleAttribution placeId={item.message.googlePlaceId} />
              )}
              <View style={notificationStyles.actions}>
                {!!item.visitId && (
                  <Button
                    compact
                    textColor={colors.rust}
                    labelStyle={notificationStyles.actionLabel}
                    onPress={() => onOpen(item.visitId!)}
                  >
                    {item.visitStatus === 'planned' ? 'View wishlist item' : 'View visit'}
                  </Button>
                )}
                {item.unread && !!boardId && (
                  <Button
                    compact
                    icon="check"
                    textColor={colors.rust}
                    labelStyle={notificationStyles.actionLabel}
                    disabled={task.busy}
                    onPress={() =>
                      void task.run(() => markOneRead({ boardId, notificationId: item._id }))
                    }
                  >
                    Mark as read
                  </Button>
                )}
              </View>
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
                ? 'Visits, wishlist updates, photos, and board changes will appear here.'
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

const notificationStyles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  card: {
    padding: 10,
    borderRadius: 10,
    gap: 0,
    // Restore the left edge explicitly when the unread override is removed.
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 },
  unread: { borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: '#fff8f1' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  body: { ...styles.body, flex: 1, fontSize: 13, lineHeight: 19 },
  actor: { fontFamily: 'JakartaSemiBold' },
  time: { ...styles.muted, fontSize: 11, lineHeight: 19, textAlign: 'right', flexShrink: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  actionLabel: { fontSize: 12, marginVertical: 6, marginHorizontal: 0 },
});
