import { useCallback, useEffect, useState } from 'react';
import { BackHandler, FlatList, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import {
  BottomNavigation,
  Button as MaterialButton,
  Divider,
  FAB,
  Icon,
  List,
  Menu,
  Searchbar,
  TouchableRipple,
} from 'react-native-paper';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import type { ScreenProps } from './navigation';
import { Card, colors, Heading, Loading, styles, Title } from './ui';
import { VisitCard } from './VisitCard';
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
  const [index, setIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
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
        if (menuOpen) {
          setMenuOpen(false);
          return true;
        }
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
    }, [menuOpen, createOpen, index]),
  );
  const switchTab = (next: number) => {
    setCreateOpen(false);
    setIndex(next);
  };
  const closeThen = (action: () => void) => {
    setMenuOpen(false);
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
      ? visits.results.slice(0, 3)
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
                <Text style={journal.eyebrow}>YOUR SHARED LITTLE WORLD</Text>
                <Title>Hello, {me?.name?.split(' ')[0] ?? 'you'}.</Title>
                <Text style={styles.body}>
                  Good places. Great company. All your memories, together.
                </Text>
                {board && (
                  <View style={journal.boardSummary}>
                    <Text style={journal.eyebrow}>YOUR BOARD</Text>
                    <Heading>{board.board.name}</Heading>
                    {!!board.board.description && (
                      <Text style={styles.muted}>{board.board.description}</Text>
                    )}
                    <Text style={styles.muted}>
                      {board.members.length} {board.members.length === 1 ? 'person' : 'people'} · A
                      place for your memories
                    </Text>
                  </View>
                )}
                {requests?.map((request) => (
                  <Text key={request._id} style={styles.muted}>
                    Waiting for approval · {request.boardName}
                  </Text>
                ))}
                {!!boardId && (
                  <View style={journal.sectionHeading}>
                    <Heading>Recent visits</Heading>
                    <MaterialButton onPress={() => setIndex(1)}>View all</MaterialButton>
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
          !home &&
          boardId &&
          (visits.status === 'CanLoadMore' || visits.status === 'LoadingMore') ? (
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
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchorPosition="bottom"
            anchor={
              <TouchableRipple
                style={journal.boardPicker}
                borderless
                accessibilityRole="button"
                accessibilityLabel={`Switch board, ${boardName}`}
                accessibilityState={{ expanded: menuOpen }}
                onPress={() => setMenuOpen(true)}
              >
                <View style={journal.boardPickerContent}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={journal.boardLabel}>
                    {boardName}
                  </Text>
                  <Icon source="chevron-down" size={20} color={colors.coral} />
                </View>
              </TouchableRipple>
            }
          >
            <ScrollView style={{ maxHeight: 280 }}>
              {boards.results.map((item) => (
                <Menu.Item
                  key={item._id}
                  title={item.name}
                  leadingIcon={item._id === boardId ? 'check' : 'view-dashboard-outline'}
                  onPress={() =>
                    closeThen(() => {
                      setSelectedId(item._id);
                      setSearch('');
                    })
                  }
                />
              ))}
              {(boards.status === 'CanLoadMore' || boards.status === 'LoadingMore') && (
                <Menu.Item
                  title={boards.status === 'LoadingMore' ? 'Loading…' : 'More boards'}
                  disabled={boards.status === 'LoadingMore'}
                  onPress={() => boards.loadMore(24)}
                />
              )}
            </ScrollView>
            <Divider />
            <Menu.Item title="New board" leadingIcon="plus" onPress={newBoard} />
            <Menu.Item
              title="Join board"
              leadingIcon="account-multiple-plus-outline"
              onPress={joinBoard}
            />
          </Menu>
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
              <Title>More</Title>
              <Text style={styles.muted}>Your boards, your people, your preferences.</Text>
              <View style={journal.tools}>
                <List.Item
                  title="Your account"
                  description={me?.name ?? 'Profile and sign-in'}
                  left={(props) => <List.Icon {...props} icon="account-outline" />}
                  onPress={() => navigation.navigate('Account')}
                />
                {boardId && (
                  <>
                    <Divider />
                    <List.Item
                      title="Places"
                      description="Explore the places on this board"
                      left={(props) => <List.Icon {...props} icon="map-marker-outline" />}
                      onPress={() => navigation.navigate('Places', { boardId })}
                    />
                    <Divider />
                    <List.Item
                      title="Board settings"
                      description={board?.board.name}
                      left={(props) => <List.Icon {...props} icon="cog-outline" />}
                      onPress={() => navigation.navigate('Settings', { boardId })}
                    />
                  </>
                )}
                <Divider />
                <List.Item
                  title="New board"
                  left={(props) => <List.Icon {...props} icon="plus" />}
                  onPress={newBoard}
                />
                <Divider />
                <List.Item
                  title="Join board"
                  left={(props) => <List.Icon {...props} icon="account-multiple-plus-outline" />}
                  onPress={joinBoard}
                />
              </View>
            </ScrollView>
          )
        }
        barStyle={{ backgroundColor: colors.primary }}
        activeIndicatorStyle={{ backgroundColor: colors.navHighlight }}
        activeColor={colors.ink}
        inactiveColor={colors.onNavMuted}
        renderIcon={({ route, focused }) => (
          <Icon
            source={focused ? route.focusedIcon : route.unfocusedIcon}
            size={24}
            color={focused ? colors.paper : colors.onNavMuted}
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
              color: colors.paper,
              style: { backgroundColor: colors.ink },
            },
            ...(boardId
              ? [
                  {
                    icon: 'book-plus-outline',
                    label: 'New visit',
                    onPress: newVisit,
                    color: colors.paper,
                    style: { backgroundColor: colors.ink },
                  },
                ]
              : []),
          ]}
          onStateChange={({ open }) => setCreateOpen(open)}
          style={journal.createActions}
          fabStyle={{ backgroundColor: colors.ink }}
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
  boardPickerSlot: { flex: 1, minWidth: 100, maxWidth: 180 },
  boardPicker: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, overflow: 'hidden' },
  boardPickerContent: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  boardLabel: { flexShrink: 1, color: colors.ink, fontSize: 14, fontWeight: '600' },
  content: { padding: 20, paddingTop: 24, gap: 18, paddingBottom: 112 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.4, color: colors.muted },
  boardSummary: { backgroundColor: colors.sage, padding: 20, borderRadius: 24, gap: 10 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { backgroundColor: '#F0EBE4' },
  tools: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  createActions: { position: 'absolute', left: 0, right: 0, bottom: 80, paddingBottom: 0 },
});
