import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import {
  BottomNavigation,
  Button as MaterialButton,
  Divider,
  FAB,
  Icon,
  IconButton,
  List,
  Searchbar,
} from 'react-native-paper';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import type { ScreenProps } from './navigation';
import { Card, colors, Heading, Loading, SectionHeading, styles, Title } from './ui';
import { BoardPlaces } from './BoardPlaces';
import { VisitCard } from './VisitCard';
import { BoardPicker } from './BoardPicker';
import { journalTabs as tabs } from './journalNavigation';

type Props = {
  navigation: ScreenProps<'Boards'>['navigation'] | ScreenProps<'Board'>['navigation'];
  initialBoardId?: Id<'boards'>;
};

export function JournalScreen({ navigation, initialBoardId }: Props) {
  const me = useQuery(api.boards.me);
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const requests = useQuery(api.boards.myOutgoingRequests);
  const [selectedId, setSelectedId] = useState(initialBoardId);
  // An explicit board may be beyond the loaded page; keep it until it is switched.
  const boardId = selectedId ?? boards.results[0]?._id;
  const board = useQuery(api.boards.get, boardId ? { boardId } : 'skip');
  const visits = usePaginatedQuery(api.visits.list, boardId ? { boardId } : 'skip', {
    initialNumItems: 24,
  });
  const pending = useQuery(
    api.boards.pendingRequests,
    board?.isAdmin && boardId ? { boardId } : 'skip',
  );
  const [index, setIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (createOpen) {
          setCreateOpen(false);
          return true;
        }
        if (index !== 0) {
          setIndex(0);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [createOpen, index]),
  );
  const switchTab = (next: number) => {
    setCreateOpen(false);
    setIndex(next);
  };
  const closeThen = (action: () => void) => {
    setCreateOpen(false);
    action();
  };
  const newBoard = () => closeThen(() => navigation.navigate('BoardForm'));
  const joinBoard = () => closeThen(() => navigation.navigate('Join'));
  const newVisit = () => boardId && closeThen(() => navigation.navigate('VisitForm', { boardId }));
  const boardName =
    board?.board.name ?? boards.results.find((item) => item._id === boardId)?.name ?? 'Boards';
  const emptyBoards = boards.status !== 'LoadingFirstPage' && !boardId;

  function renderVisits(home: boolean) {
    const filtered = home
      ? visits.results
      : visits.results.filter((visit) =>
          `${visit.title} ${visit.place} ${visit.notes}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        );
    return (
      <FlatList
        style={styles.page}
        contentContainerStyle={journal.content}
        data={emptyBoards ? [] : filtered}
        keyExtractor={(visit) => visit._id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18 }}>
            {home ? (
              <>
                {board ? (
                  <View style={journal.boardHeader}>
                    <View style={journal.boardTitleRow}>
                      <Text accessibilityRole="header" style={journal.boardTitle}>
                        {board.board.name}
                      </Text>
                      <IconButton
                        icon="tune-variant"
                        accessibilityLabel="Board settings"
                        iconColor={colors.rust}
                        style={journal.settingsButton}
                        onPress={() =>
                          navigation.navigate('Settings', { boardId: board.board._id })
                        }
                      />
                    </View>
                    <View style={styles.row}>
                      <View style={journal.avatars}>
                        {board.members.slice(0, 5).map((person, i) => (
                          <View
                            key={person._id}
                            style={[journal.avatar, { marginLeft: i ? -8 : 0 }]}
                          >
                            {person.image ? (
                              <Image
                                source={{ uri: person.image }}
                                style={{ width: 28, height: 28, borderRadius: 14 }}
                              />
                            ) : (
                              <Text style={journal.initials}>
                                {person.name
                                  ?.trim()
                                  .split(/\s+/)
                                  .map((p) => p[0])
                                  .slice(0, 2)
                                  .join('') || '?'}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                      <Text style={styles.muted}>
                        {board.members.length} {board.members.length === 1 ? 'member' : 'members'}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          navigation.navigate('Settings', { boardId: board.board._id })
                        }
                        style={styles.textButton}
                      >
                        <Icon source="account-plus-outline" size={15} color={colors.rust} />
                        <Text style={[styles.link, { textDecorationLine: 'underline' }]}>
                          Invite
                        </Text>
                      </Pressable>
                    </View>
                    {!!board.board.description && (
                      <Text style={styles.muted}>{board.board.description}</Text>
                    )}
                  </View>
                ) : (
                  <Title>Your shared journal.</Title>
                )}
                {!!pending?.length && boardId && (
                  <Card>
                    <Text style={styles.label}>
                      {pending.length} pending join {pending.length === 1 ? 'request' : 'requests'}
                    </Text>
                    <MaterialButton
                      textColor={colors.rust}
                      onPress={() => navigation.navigate('Settings', { boardId })}
                    >
                      Review requests
                    </MaterialButton>
                  </Card>
                )}
                {boardId && (
                  <BoardPlaces
                    key={boardId}
                    boardId={boardId}
                    onOpen={(place) =>
                      navigation.navigate('Place', {
                        boardId,
                        placeId: place._id,
                        name: place.name,
                      })
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
                    onViewAll={() => navigation.navigate('Places', { boardId })}
                  />
                )}
                {requests?.map((request) => (
                  <Text key={request._id} style={styles.muted}>
                    Waiting for approval · {request.boardName}
                  </Text>
                ))}
                {!!boardId && (
                  <View style={{ paddingTop: 20 }}>
                    <SectionHeading
                      title="Your Visits"
                      count={`${visits.results.length}${visits.status === 'Exhausted' ? '' : '+'}`}
                      suffix="so far"
                    />
                  </View>
                )}
              </>
            ) : (
              <>
                <Title>Visits</Title>
                <Text style={styles.muted}>
                  {board?.board.name ?? 'Your shared journal'} · Latest first
                </Text>
                {!!boardId && (
                  <Searchbar
                    placeholder="Search loaded visits…"
                    accessibilityLabel="Find a visit"
                    value={search}
                    onChangeText={setSearch}
                    style={journal.search}
                  />
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <VisitCard
            visit={item}
            members={board?.members}
            number={
              visits.status === 'Exhausted'
                ? visits.results.length - visits.results.indexOf(item)
                : undefined
            }
            onPress={() => navigation.navigate('Visit', { visitId: item._id })}
          />
        )}
        ListEmptyComponent={
          boards.status === 'LoadingFirstPage' ||
          (boardId && visits.status === 'LoadingFirstPage') ? (
            <Loading />
          ) : (
            <Card>
              <Heading>
                {emptyBoards
                  ? 'A little world of your own.'
                  : search && !home
                    ? 'No matching visits.'
                    : 'Your next adventure starts here.'}
              </Heading>
              <Text style={styles.muted}>
                {emptyBoards
                  ? 'Create a board or join your people to start saving memories together.'
                  : search && !home
                    ? 'Search applies to loaded visits. Load more to include older memories.'
                    : 'Save a place, a photo, and the little details you want to remember.'}
              </Text>
              {emptyBoards ? (
                <View style={styles.row}>
                  <MaterialButton mode="contained" onPress={newBoard}>
                    New board
                  </MaterialButton>
                  <MaterialButton onPress={joinBoard}>Join board</MaterialButton>
                </View>
              ) : (
                (home || !search) && (
                  <MaterialButton mode="text" onPress={newVisit}>
                    Add your first visit
                  </MaterialButton>
                )
              )}
            </Card>
          )
        }
        ListFooterComponent={
          boardId && (visits.status === 'CanLoadMore' || visits.status === 'LoadingMore') ? (
            <MaterialButton
              loading={visits.status === 'LoadingMore'}
              disabled={visits.status === 'LoadingMore'}
              onPress={() => visits.loadMore(24)}
            >
              Load more visits
            </MaterialButton>
          ) : null
        }
      />
    );
  }

  return (
    <View style={styles.page}>
      <View style={journal.topbar}>
        <View style={journal.brand}>
          <Image
            source={require('../../web/public/favicon.svg')}
            contentFit="contain"
            style={journal.brandMark}
            accessible={false}
          />
          <Text style={journal.wordmark}>
            nico notes<Text style={{ color: colors.primary }}>.</Text>
          </Text>
        </View>
        <View style={journal.boardPickerSlot}>
          <BoardPicker
            boards={boards.results}
            boardId={boardId}
            boardName={boardName}
            canLoadMore={boards.status === 'CanLoadMore'}
            loadingMore={boards.status === 'LoadingMore'}
            onLoadMore={() => boards.loadMore(24)}
            onSelect={(id) => {
              setSelectedId(id);
              setSearch('');
            }}
            onNewBoard={newBoard}
            onJoinBoard={joinBoard}
          />
        </View>
      </View>
      <BottomNavigation
        navigationState={{ index, routes: tabs }}
        onIndexChange={switchTab}
        renderScene={({ route }) =>
          route.key === 'home' ? (
            renderVisits(true)
          ) : route.key === 'visits' ? (
            renderVisits(false)
          ) : (
            <ScrollView contentContainerStyle={journal.content}>
              <Title>Your little world.</Title>
              <Text style={styles.muted}>Your boards, your people, your preferences.</Text>
              <View style={journal.tools}>
                <List.Item
                  title="Your account"
                  description={me?.name ?? 'Profile and sign-in'}
                  left={(props) => (
                    <List.Icon {...props} icon="account-outline" color={colors.primary} />
                  )}
                  onPress={() => navigation.navigate('Account')}
                />
                {boardId && (
                  <>
                    <Divider />
                    <List.Item
                      title="Places"
                      description="Explore the places on this board"
                      left={(props) => (
                        <List.Icon {...props} icon="map-marker-outline" color={colors.primary} />
                      )}
                      onPress={() => navigation.navigate('Places', { boardId })}
                    />
                    <Divider />
                    <List.Item
                      title="Board settings"
                      description={board?.board.name}
                      left={(props) => (
                        <List.Icon {...props} icon="cog-outline" color={colors.primary} />
                      )}
                      onPress={() => navigation.navigate('Settings', { boardId })}
                    />
                  </>
                )}
                <Divider />
                <List.Item
                  title="New board"
                  left={(props) => <List.Icon {...props} icon="plus" color={colors.primary} />}
                  onPress={newBoard}
                />
                <Divider />
                <List.Item
                  title="Join board"
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon="account-multiple-plus-outline"
                      color={colors.primary}
                    />
                  )}
                  onPress={joinBoard}
                />
              </View>
            </ScrollView>
          )
        }
        barStyle={{
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
        activeIndicatorStyle={{ backgroundColor: colors.coralLight }}
        activeColor={colors.primary}
        inactiveColor={colors.muted}
        renderIcon={({ route, focused }) => (
          <Icon
            source={focused ? route.focusedIcon : route.unfocusedIcon}
            size={24}
            color={focused ? colors.primary : colors.muted}
          />
        )}
        safeAreaInsets={{ bottom: 0 }}
        sceneAnimationEnabled
        sceneAnimationType="shifting"
        keyboardHidesNavigationBar
        labeled
        shifting={false}
      />
      {index === 0 && (
        <FAB.Group
          open={createOpen}
          visible={!keyboardOpen}
          icon={createOpen ? 'close' : 'plus'}
          label={createOpen ? undefined : 'New'}
          accessibilityLabel="Create a new visit or board"
          actions={[
            {
              icon: 'view-dashboard-outline',
              label: 'New board',
              onPress: newBoard,
              color: colors.primary,
              style: { backgroundColor: colors.paper },
            },
            ...(boardId
              ? [
                  {
                    icon: 'book-plus-outline',
                    label: 'New visit',
                    onPress: newVisit,
                    color: colors.primary,
                    style: { backgroundColor: colors.paper },
                  },
                ]
              : []),
          ]}
          onStateChange={({ open }) => setCreateOpen(open)}
          style={journal.createActions}
          fabStyle={{ backgroundColor: colors.primary }}
          color={colors.paper}
        />
      )}
    </View>
  );
}

const journal = StyleSheet.create({
  topbar: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  brandMark: { width: 30, height: 30, transform: [{ rotate: '-6deg' }] },
  wordmark: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -1.1,
    flexShrink: 1,
  },
  boardPickerSlot: { flex: 1, minWidth: 100, maxWidth: 180, alignItems: 'flex-end' },
  content: {
    padding: 22,
    paddingTop: 24,
    gap: 22,
    paddingBottom: 112,
    width: '100%',
    maxWidth: 840,
    alignSelf: 'center',
  },
  boardHeader: { gap: 8, paddingBottom: 24, borderBottomWidth: 1, borderColor: colors.border },
  boardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  boardTitle: {
    fontFamily: 'EpilogueItalic',
    fontSize: 36,
    lineHeight: 45,
    letterSpacing: -1.5,
    color: colors.rust,
    flex: 1,
  },
  settingsButton: { backgroundColor: '#F3E8DE', borderRadius: 16, margin: 0 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { fontFamily: 'JakartaSemiBold', fontSize: 10, color: colors.rust },
  search: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tools: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  createActions: { position: 'absolute', left: 0, right: 0, bottom: 80, paddingBottom: 0 },
});
