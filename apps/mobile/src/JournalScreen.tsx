import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Keyboard,
  Linking,
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
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import type { ScreenProps } from './navigation';
import {
  Avatar,
  Card,
  colors,
  confirm,
  Heading,
  Loading,
  SectionHeading,
  styles,
  Title,
} from './ui';
import { BoardPlaces } from './BoardPlaces';
import { VisitCard } from './VisitCard';
import { BoardPicker } from './BoardPicker';
import { journalTabs as tabs } from './journalNavigation';
import { distanceBetween, formatDistance } from './placeSearch';
import { useCurrentLocation } from './useCurrentLocation';

type Props = {
  navigation: ScreenProps<'Boards'>['navigation'] | ScreenProps<'Board'>['navigation'];
  initialBoardId?: Id<'boards'>;
};

export function JournalScreen({ navigation, initialBoardId }: Props) {
  const me = useQuery(api.boards.me);
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const summaries = useQuery(api.boards.summaries);
  const requests = useQuery(api.boards.myOutgoingRequests);
  const [selectedId, setSelectedId] = useState(initialBoardId);
  // An explicit board may be beyond the loaded page; keep it until it is switched.
  const boardId = selectedId ?? boards.results[0]?._id;
  const board = useQuery(api.boards.get, boardId ? { boardId } : 'skip');
  const visits = usePaginatedQuery(api.visits.list, boardId ? { boardId } : 'skip', {
    initialNumItems: 24,
  });
  const wishlist = usePaginatedQuery(api.wishlist.list, boardId ? { boardId } : 'skip', {
    initialNumItems: 50,
  });
  const removeWishlist = useMutation(api.wishlist.remove);
  const current = useCurrentLocation(true);
  const pending = useQuery(
    api.boards.pendingRequests,
    board?.isAdmin && boardId ? { boardId } : 'skip',
  );
  const [index, setIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [wishlistSearch, setWishlistSearch] = useState('');
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

  const { loadMore: loadMoreVisits, status: visitsStatus } = visits;
  useEffect(() => {
    if (search.trim() && visitsStatus === 'CanLoadMore') {
      loadMoreVisits(100);
    }
  }, [search, visitsStatus, loadMoreVisits]);

  function renderHome() {
    return (
      <ScrollView
        style={styles.page}
        contentContainerStyle={journal.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 18 }}>
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
                  onPress={() => navigation.navigate('Settings', { boardId: board.board._id })}
                />
              </View>
              <View style={styles.row}>
                <View style={journal.avatars}>
                  {board.members.slice(0, 5).map((person, i) => (
                    <View key={person._id} style={[journal.avatar, { marginLeft: i ? -8 : 0 }]}>
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
                  onPress={() => navigation.navigate('Settings', { boardId: board.board._id })}
                  style={styles.textButton}
                >
                  <Icon source="account-plus-outline" size={15} color={colors.rust} />
                  <Text style={[styles.link, { textDecorationLine: 'underline' }]}>Invite</Text>
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
          {boardId ? (
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
          ) : emptyBoards ? (
            <Card>
              <Heading>A little world of your own.</Heading>
              <Text style={styles.muted}>
                Create a board or join your people to start saving memories together.
              </Text>
              <View style={styles.row}>
                <MaterialButton mode="contained" onPress={newBoard}>
                  New board
                </MaterialButton>
                <MaterialButton onPress={joinBoard}>Join board</MaterialButton>
              </View>
            </Card>
          ) : null}
          {requests?.map((request) => (
            <Text key={request._id} style={styles.muted}>
              Waiting for approval · {request.boardName}
            </Text>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderVisits() {
    const query = search.trim().toLowerCase();
    const filtered = !query
      ? visits.results
      : visits.results.filter((visit) => {
          const dishes = visit.dishes?.map((d) => d.name).join(' ') ?? '';
          const highlights = visit.highlights?.join(' ') ?? '';
          const haystack =
            `${visit.title} ${visit.place} ${visit.notes} ${dishes} ${highlights}`.toLowerCase();
          return haystack.includes(query);
        });
    return (
      <FlatList
        style={styles.page}
        contentContainerStyle={journal.content}
        data={emptyBoards ? [] : filtered}
        keyExtractor={(visit) => visit._id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18 }}>
            <Title>Visits</Title>
            {!!boardId && (
              <Searchbar
                placeholder="Search visits…"
                accessibilityLabel="Search visits"
                value={search}
                onChangeText={setSearch}
                style={journal.search}
              />
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
                  : search
                    ? 'No matching visits.'
                    : 'Your next adventure starts here.'}
              </Heading>
              <Text style={styles.muted}>
                {emptyBoards
                  ? 'Create a board or join your people to start saving memories together.'
                  : search
                    ? visits.status === 'LoadingMore'
                      ? 'Searching visits…'
                      : 'No visits found matching your search.'
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
                !search && (
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

  function renderWishlist() {
    const filtered = wishlist.results.filter((item) =>
      `${item.title} ${item.place ?? ''} ${item.notes ?? ''}`
        .toLowerCase()
        .includes(wishlistSearch.toLowerCase()),
    );
    return (
      <FlatList
        style={styles.page}
        contentContainerStyle={journal.content}
        data={emptyBoards ? [] : filtered}
        keyExtractor={(item) => item._id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={journal.boardTitleRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Title>Wishlist</Title>
                <Text style={styles.muted}>
                  {board?.board.name ?? 'Your shared board'} · {wishlist.results.length}{' '}
                  {wishlist.results.length === 1 ? 'place' : 'places'} to visit
                </Text>
              </View>
              {boardId && (
                <MaterialButton
                  mode="contained"
                  buttonColor={colors.rust}
                  textColor={colors.paper}
                  icon="plus"
                  onPress={() => navigation.navigate('WishlistForm', { boardId })}
                >
                  Add place
                </MaterialButton>
              )}
            </View>
            {wishlist.results.length > 0 && (
              <Searchbar
                placeholder="Search wishlist…"
                value={wishlistSearch}
                onChangeText={setWishlistSearch}
                style={journal.search}
                inputStyle={styles.body}
                iconColor={colors.rust}
              />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const distance =
            item.location && current.location
              ? formatDistance(distanceBetween(item.location, current.location))
              : null;
          return (
            <Card style={journal.wishlistCard}>
              <View style={{ gap: 8 }}>
                <View style={journal.wishlistHeader}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={journal.wishlistTitle}>{item.title}</Text>
                    <Text style={styles.muted} numberOfLines={2}>
                      {distance ? `${distance} · ` : ''}
                      {item.place || 'Address not recorded'}
                    </Text>
                  </View>
                  <IconButton
                    icon="delete-outline"
                    iconColor={colors.muted}
                    size={20}
                    onPress={() =>
                      confirm(
                        `Remove “${item.title}” from your wishlist?`,
                        () => void removeWishlist({ id: item._id, confirmed: true }),
                      )
                    }
                  />
                </View>
                {!!item.notes && (
                  <View style={journal.wishlistNotes}>
                    <Text style={journal.wishlistNotesText}>{item.notes}</Text>
                  </View>
                )}
                {!!item.link && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void Linking.openURL(item.link!)}
                    style={journal.wishlistLink}
                  >
                    <Icon source="link-variant" size={14} color={colors.rust} />
                    <Text style={journal.wishlistLinkText} numberOfLines={1}>
                      {item.link}
                    </Text>
                  </Pressable>
                )}
                <View style={journal.wishlistActions}>
                  {boardId && (
                    <MaterialButton
                      mode="contained"
                      buttonColor={colors.rust}
                      textColor={colors.paper}
                      icon="plus"
                      onPress={() =>
                        navigation.navigate('VisitForm', {
                          boardId,
                          title: item.title,
                          place: item.place,
                          location: item.location,
                          googlePlaceId: item.googlePlaceId,
                        })
                      }
                    >
                      Log visit
                    </MaterialButton>
                  )}
                  <MaterialButton
                    mode="outlined"
                    textColor={colors.rust}
                    style={{ borderColor: colors.border }}
                    icon="navigation-variant-outline"
                    onPress={() =>
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          item.location
                            ? `${item.location.latitude},${item.location.longitude}`
                            : `${item.title} ${item.place ?? ''}`,
                        )}${item.googlePlaceId ? `&query_place_id=${encodeURIComponent(item.googlePlaceId)}` : ''}`,
                      )
                    }
                  >
                    Maps
                  </MaterialButton>
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={journal.emptyWishlist}>
            <Icon source="bookmark-outline" size={48} color={colors.rust} />
            <Heading>Your wishlist is empty</Heading>
            <Text style={[styles.muted, { textAlign: 'center', maxWidth: 280 }]}>
              Save spots you’re excited to try next. Find them on the map or tap “Add place”.
            </Text>
            {boardId && (
              <MaterialButton
                mode="contained"
                buttonColor={colors.rust}
                textColor={colors.paper}
                icon="plus"
                style={{ marginTop: 8 }}
                onPress={() => navigation.navigate('WishlistForm', { boardId })}
              >
                Add to wishlist
              </MaterialButton>
            )}
          </View>
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
        {tabs[index]?.key !== 'settings' && (
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
        )}
      </View>
      <BottomNavigation
        navigationState={{ index, routes: tabs }}
        onIndexChange={switchTab}
        renderScene={({ route }) =>
          route.key === 'home' ? (
            renderHome()
          ) : route.key === 'visits' ? (
            renderVisits()
          ) : route.key === 'wishlist' ? (
            renderWishlist()
          ) : (
            <ScrollView contentContainerStyle={journal.content}>
              <Title>Settings</Title>
              <Text style={styles.muted}>Your account, your boards, and your preferences.</Text>
              <View style={journal.tools}>
                <List.Item
                  title="Your account"
                  description={me?.name ?? 'Profile and sign-in'}
                  left={(props) => (
                    <List.Icon {...props} icon="account-outline" color={colors.primary} />
                  )}
                  right={(props) => (
                    <List.Icon {...props} icon="chevron-right" color={colors.muted} />
                  )}
                  onPress={() => navigation.navigate('Account')}
                />
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

              {!!summaries && summaries.length > 0 && (
                <View style={{ gap: 14 }}>
                  <SectionHeading title="Your Boards" count={summaries.length} />
                  {summaries.map((b) => (
                    <Pressable
                      key={b._id}
                      onPress={() => {
                        setSelectedId(b._id);
                        setSearch('');
                        switchTab(0);
                      }}
                    >
                      <Card style={{ gap: 12 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <View style={{ flex: 1, gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text
                                style={{
                                  fontFamily: 'EpilogueSemiBold',
                                  fontSize: 18,
                                  lineHeight: 24,
                                  color: colors.ink,
                                  letterSpacing: -0.4,
                                }}
                              >
                                {b.name}
                              </Text>
                              {b._id === boardId && (
                                <View
                                  style={{
                                    backgroundColor: colors.coralLight,
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                    borderRadius: 10,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontFamily: 'JakartaSemiBold',
                                      fontSize: 11,
                                      color: colors.rust,
                                    }}
                                  >
                                    Active
                                  </Text>
                                </View>
                              )}
                            </View>
                            {!!b.description && (
                              <Text numberOfLines={2} style={styles.muted}>
                                {b.description}
                              </Text>
                            )}
                          </View>
                          <Icon source="chevron-right" size={20} color={colors.rust} />
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Icon source="book-open-outline" size={16} color={colors.rust} />
                            <Text
                              style={{
                                fontFamily: 'JakartaSemiBold',
                                fontSize: 13,
                                color: colors.rust,
                              }}
                            >
                              {b.visitCount} {b.visitCount === 1 ? 'visit' : 'visits'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Icon source="account-group-outline" size={16} color={colors.rust} />
                            <Text
                              style={{
                                fontFamily: 'JakartaSemiBold',
                                fontSize: 13,
                                color: colors.rust,
                              }}
                            >
                              {b.memberCount} {b.memberCount === 1 ? 'member' : 'members'}
                            </Text>
                          </View>
                        </View>

                        {b.members.length > 0 && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingTop: 6,
                              borderTopWidth: 1,
                              borderTopColor: colors.border,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {b.members.map((m, i) => (
                                <View
                                  key={m._id}
                                  style={{
                                    borderRadius: 14,
                                    borderWidth: 2,
                                    borderColor: colors.paper,
                                    marginLeft: i ? -8 : 0,
                                  }}
                                >
                                  <Avatar name={m.name} image={m.image} size={28} />
                                </View>
                              ))}
                            </View>
                            <Text
                              numberOfLines={1}
                              style={{
                                fontFamily: 'Jakarta',
                                fontSize: 12,
                                color: colors.muted,
                                flex: 1,
                              }}
                            >
                              {b.members.map((m) => m.name || 'Member').join(', ')}
                            </Text>
                          </View>
                        )}
                      </Card>
                    </Pressable>
                  ))}
                </View>
              )}
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
      {(index === 0 || index === 2) && (
        <FAB.Group
          open={createOpen}
          visible={!keyboardOpen}
          icon={createOpen ? 'close' : 'plus'}
          label={createOpen ? undefined : 'New'}
          accessibilityLabel="Create a new visit, wishlist place, or board"
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
                  {
                    icon: 'bookmark-outline',
                    label: 'Add to wishlist',
                    onPress: () =>
                      closeThen(() => navigation.navigate('WishlistForm', { boardId })),
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
  wishlistCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  wishlistHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  wishlistTitle: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  wishlistNotes: {
    backgroundColor: colors.peachLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.peachBorder,
  },
  wishlistNotesText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  wishlistLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  wishlistLinkText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
    textDecorationLine: 'underline',
  },
  wishlistActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  emptyWishlist: {
    padding: 36,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.paper,
    marginTop: 12,
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
