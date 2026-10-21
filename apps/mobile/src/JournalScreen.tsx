import { PlaceLookupNotice } from './PlaceLookupNotice';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Button as MaterialButton, Divider, FAB, Icon, IconButton, List } from 'react-native-paper';
import { usePaginatedQuery } from './convexLive';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from './navigation';
import { Avatar, Card, colors, Heading, Loading, SectionHeading, styles, Title } from './ui';
import { BoardPlaces } from './BoardPlaces';
import { useKeyboard } from './useKeyboard';
import { VisitCard } from './VisitCard';
import { Notifications } from './Notifications';
import { BoardPicker } from './BoardPicker';
import { useJournal } from './JournalContext';
import { distanceBetween, formatDistance } from './placeSearch';
import { useCurrentLocation } from './useCurrentLocation';
import { PlaceTopBar } from './screens/Places';
import { SearchField } from './SearchField';
import { VerticalScrollView, renderVerticalScrollView } from './VerticalScrollView';

type Props = {
  navigation: ScreenProps<'Boards'>['navigation'] | ScreenProps<'Board'>['navigation'];
  tab?: 'home' | 'notifications' | 'settings';
  section?: 'visits' | 'wishlist';
};

export function JournalScreen({ navigation, tab = 'home', section }: Props) {
  const { me, boards, summaries, requests, boardId, board, pending, setSelectedId } = useJournal();
  const focused = useIsFocused();
  const visits = usePaginatedQuery(
    api.visits.list,
    boardId && section === 'visits' ? { boardId } : 'skip',
    {
      initialNumItems: 24,
    },
  );
  const wishlist = usePaginatedQuery(
    api.wishlist.list,
    boardId && section === 'wishlist' ? { boardId } : 'skip',
    {
      initialNumItems: 50,
    },
  );
  const current = useCurrentLocation(focused && section === 'wishlist');
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [wishlistSearch, setWishlistSearch] = useState('');
  const { isOpen: keyboardOpen } = useKeyboard();
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (createOpen) {
          setCreateOpen(false);
          return true;
        }
        if (section) {
          navigation.goBack();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [createOpen, section, navigation]),
  );
  useFocusEffect(useCallback(() => () => setCreateOpen(false), []));
  const openSection = (next: 'visits' | 'wishlist') => {
    setCreateOpen(false);
    if (boardId) {
      navigation.navigate(next === 'visits' ? 'JournalVisits' : 'JournalWishlist', { boardId });
    }
  };
  const closeThen = (action: () => void) => {
    setCreateOpen(false);
    action();
  };
  const newBoard = () => closeThen(() => navigation.navigate('BoardForm'));
  const joinBoard = () => closeThen(() => navigation.navigate('Join'));
  const newVisit = () => boardId && closeThen(() => navigation.navigate('VisitForm', { boardId }));
  const newWishlist = () =>
    boardId && closeThen(() => navigation.navigate('WishlistForm', { boardId }));
  const boardName =
    board?.board.name ?? boards.results.find((item) => item._id === boardId)?.name ?? 'Boards';
  const emptyBoards = boards.status !== 'LoadingFirstPage' && !boardId;

  const { loadMore: loadMoreVisits, status: visitsStatus } = visits;
  useEffect(() => {
    if (search.trim() && visitsStatus === 'CanLoadMore') {
      loadMoreVisits(100);
    }
  }, [search, visitsStatus, loadMoreVisits]);

  const { loadMore: loadMoreWishlist, status: wishlistStatus } = wishlist;
  useEffect(() => {
    if (wishlistSearch.trim() && wishlistStatus === 'CanLoadMore') loadMoreWishlist(50);
  }, [wishlistSearch, wishlistStatus, loadMoreWishlist]);

  function renderHome() {
    return (
      <VerticalScrollView
        containerStyle={styles.page}
        contentContainerStyle={journal.homeContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flex: 1, gap: 14 }}>
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
          {boardId && (
            <View style={journal.boardActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Browse completed visits"
                onPress={() => openSection('visits')}
                style={({ pressed }) => [
                  journal.boardAction,
                  pressed && { backgroundColor: colors.coralLight },
                ]}
              >
                <Icon source="book-open-outline" size={21} color={colors.rust} />
                <Text style={journal.boardActionText}>Visits</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Browse planned visits"
                onPress={() => openSection('wishlist')}
                style={({ pressed }) => [
                  journal.boardAction,
                  pressed && { backgroundColor: colors.coralLight },
                ]}
              >
                <Icon source="bookmark-outline" size={21} color={colors.rust} />
                <Text style={journal.boardActionText}>Wishlist</Text>
              </Pressable>
            </View>
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
              fillMap
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
                  wishlistId: place?.wishlistId,
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
            <View key={request._id} style={{ gap: 8 }}>
              <Text style={styles.muted}>
                {request.status === 'pending'
                  ? 'Waiting for approval'
                  : request.status === 'accepted'
                    ? 'Request approved'
                    : 'Request declined'}{' '}
                · {request.boardName}
              </Text>
              {request.status === 'accepted' && (
                <MaterialButton
                  onPress={() => navigation.navigate('Board', { boardId: request.boardId })}
                >
                  Open board
                </MaterialButton>
              )}
            </View>
          ))}
        </View>
      </VerticalScrollView>
    );
  }

  function renderVisits() {
    const totalVisits =
      visits.status === 'Exhausted'
        ? visits.results.length
        : (board?.board.visitCount ??
          summaries?.find((summary) => summary._id === boardId)?.visitCount);
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
        renderScrollComponent={renderVerticalScrollView}
        style={styles.page}
        contentContainerStyle={journal.content}
        data={emptyBoards ? [] : filtered}
        keyExtractor={(visit) => visit._id}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (boardId && !query && visits.status === 'CanLoadMore') visits.loadMore(24);
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={{ gap: 18 }}>
            <Title>Visits</Title>
            {!!boardId && (
              <SearchField
                placeholder="Search visits…"
                accessibilityLabel="Search visits"
                value={search}
                onChangeText={setSearch}
              />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <VisitCard
            visit={item}
            members={board?.members}
            number={totalVisits != null ? totalVisits - visits.results.indexOf(item) : undefined}
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
                    : 'Save a place, an image, and the little details you want to remember.'}
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
          boardId && visits.status === 'LoadingMore' ? (
            <ActivityIndicator
              accessibilityLabel="Loading more visits"
              color={colors.rust}
              style={{ marginVertical: 12 }}
            />
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
        renderScrollComponent={renderVerticalScrollView}
        style={styles.page}
        contentContainerStyle={journal.content}
        data={emptyBoards ? [] : filtered}
        keyExtractor={(item) => item._id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={{ gap: 4 }}>
              <Title>Wishlist</Title>
              <Text style={styles.muted}>
                {wishlist.results.length}
                {wishlist.status === 'Exhausted' ? '' : '+'}{' '}
                {wishlist.results.length === 1 ? 'place' : 'places'} to visit
              </Text>
            </View>
            <PlaceLookupNotice
              placeIds={wishlist.results.flatMap((item) =>
                item.googlePlaceId ? [item.googlePlaceId] : [],
              )}
            />
            {wishlist.results.length > 0 && (
              <SearchField
                placeholder="Search wishlist…"
                accessibilityLabel="Search wishlist"
                value={wishlistSearch}
                onChangeText={setWishlistSearch}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              onPress={() =>
                item.visitId
                  ? navigation.navigate('Visit', { visitId: item.visitId })
                  : navigation.navigate('Wishlist', { id: item._id })
              }
              style={({ pressed }) => [journal.wishlistCard, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={journal.wishlistHeader}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={journal.wishlistTitle}>{item.title}</Text>
                  {!!(distance || item.place) && (
                    <Text style={styles.muted} numberOfLines={1}>
                      {[distance, item.place].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {!!item.notes && (
                    <Text style={journal.wishlistNotesText} numberOfLines={2}>
                      {item.notes}
                    </Text>
                  )}
                </View>
                <Icon source="chevron-right" size={22} color={colors.muted} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          wishlist.status === 'LoadingFirstPage' && boardId ? (
            <Loading />
          ) : (
            <View style={journal.emptyWishlist}>
              <Icon source="bookmark-outline" size={40} color={colors.rust} />
              <Heading>
                {wishlistSearch.trim()
                  ? wishlist.status === 'LoadingMore' || wishlist.status === 'CanLoadMore'
                    ? 'Searching wishlist…'
                    : 'No matching places'
                  : 'Your wishlist is empty'}
              </Heading>
              <Text style={[styles.muted, { textAlign: 'center', maxWidth: 280 }]}>
                {wishlistSearch.trim()
                  ? 'Try another name or area.'
                  : 'Save places you’d like to try next.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          boardId && (wishlist.status === 'CanLoadMore' || wishlist.status === 'LoadingMore') ? (
            <MaterialButton
              loading={wishlist.status === 'LoadingMore'}
              disabled={wishlist.status === 'LoadingMore'}
              onPress={() => wishlist.loadMore(50)}
            >
              {wishlistSearch.trim() ? 'Searching more places…' : 'Load more places'}
            </MaterialButton>
          ) : null
        }
      />
    );
  }

  return (
    <View style={styles.page}>
      {section ? (
        <PlaceTopBar
          navigation={navigation}
          boardId={boardId}
          boardName={boardName}
          boards={boards}
          onBack={() => navigation.goBack()}
        />
      ) : (
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
          {tab !== 'settings' && (
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
      )}
      {section ? (
        section === 'visits' ? (
          renderVisits()
        ) : (
          renderWishlist()
        )
      ) : tab === 'home' ? (
        renderHome()
      ) : tab === 'notifications' ? (
        <Notifications
          key={boardId ?? 'none'}
          boardId={boardId}
          onOpen={(visitId) => navigation.navigate('Visit', { visitId })}
        />
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
              right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.muted} />}
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
                <List.Icon {...props} icon="account-multiple-plus-outline" color={colors.primary} />
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
                    router.navigate('/');
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
                          {b.visitCount ?? '—'} {b.visitCount === 1 ? 'visit' : 'visits'}
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
      )}

      {section && boardId && focused && (
        <FAB
          icon="plus"
          label={section === 'wishlist' ? 'Add to Wishlist' : 'Add Visit'}
          accessibilityLabel={section === 'wishlist' ? 'Add to Wishlist' : 'Add Visit'}
          visible={!keyboardOpen}
          onPress={section === 'wishlist' ? newWishlist : newVisit}
          style={journal.addVisit}
          color={colors.paper}
        />
      )}

      {tab === 'home' && focused && !section && (
        <FAB.Group
          open={createOpen}
          visible={!keyboardOpen}
          icon={createOpen ? 'close' : 'plus'}
          accessibilityLabel="Create a new visit or wishlist place"
          actions={
            boardId
              ? [
                  {
                    icon: 'book-plus-outline',
                    label: 'Add Visit',
                    onPress: newVisit,
                    color: colors.primary,
                    style: { backgroundColor: colors.paper },
                  },
                  {
                    icon: 'bookmark-outline',
                    label: 'Add to Wishlist',
                    onPress: newWishlist,
                    color: colors.primary,
                    style: { backgroundColor: colors.paper },
                  },
                ]
              : []
          }
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
  homeContent: {
    flexGrow: 1,
    padding: 22,
    paddingTop: 16,
    paddingBottom: 20,
    width: '100%',
    maxWidth: 840,
    alignSelf: 'center',
  },
  content: {
    padding: 22,
    paddingTop: 24,
    gap: 22,
    paddingBottom: 112,
    width: '100%',
    maxWidth: 840,
    alignSelf: 'center',
  },
  boardHeader: { gap: 8, paddingBottom: 12 },
  boardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  boardAction: {
    flex: 1,
    minWidth: 120,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.rust,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  boardActionText: { fontFamily: 'JakartaSemiBold', fontSize: 15, color: colors.rust },
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
  wishlistNotesText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
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
  createActions: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 0 },
  addVisit: { position: 'absolute', right: 22, bottom: 22, backgroundColor: colors.primary },
});
