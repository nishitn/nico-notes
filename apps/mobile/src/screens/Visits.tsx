import { isPlacePlaceholder } from '@nico-notes/backend/livePlaces';
import { PlaceMapMarker } from '../PlaceMapMarker';
import { useLivePlace } from '../convexLive';
import { GoogleAttribution } from '../GoogleAttribution';
import { useEffect, useMemo, useRef, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Button as MaterialButton,
  Dialog,
  Icon,
  Menu,
  Portal,
  Searchbar,
} from 'react-native-paper';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboard } from '../useKeyboard';
import { fetch } from 'expo/fetch';
import { useAuthToken } from '@convex-dev/auth/react';
import { useConvex, useMutation, usePaginatedQuery, useQuery } from '../convexLive';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, validDate } from '@nico-notes/backend/shared';
import { preferVisitedPlaces } from '@nico-notes/backend/mapMarkers';
import type { FunctionReturnType } from 'convex/server';
import type { ScreenProps } from '../navigation';
import {
  Avatar,
  Button,
  colors,
  confirm,
  ErrorNote,
  Field,
  Heading,
  Loading,
  Page,
  styles,
  Title,
  useTask,
} from '../ui';
import { Photo, PhotoSection, photoOrigin } from '../photos';
import { PhotoSourceDialog } from '../PhotoSourceDialog';
import { launchPhotoPicker, type PhotoSource } from '../photoPicker';
import { showAlert } from '../alertState';
import { MaterialDialog } from '../MaterialDialog';
import { localDate } from '../links';
import { PlaceTopBar } from './Places';
import { PlaceOverview } from '../PlaceOverview';
import { PlaceVisitHistory } from '../PlaceVisitHistory';
import { useCurrentLocation } from '../useCurrentLocation';
import { usePlaceSearch } from '../usePlaceSearch';
import { PlaceSearchResults } from '../PlaceSearchResults';
import { placeMarkers, nearbyRegion, type MapRegion, type MapSize } from '../mapGeometry';
import { distanceBetween, matchingPlaces } from '../placeSearch';
import type { SavedPlace } from '../BoardPlaces';
import type { GooglePlace } from '../../modules/google-places';
import { ScorePicker } from '../ScorePicker';
import { RatingDrawer } from '../RatingDrawer';
import { VerticalScrollView } from '../VerticalScrollView';
import { markRatingSaved, mergeRatingDrafts, type RatingDrafts } from '../ratingDrafts';
import { confirmDiscard, useUnsavedChanges } from '../useUnsavedChanges';
import { saveVisitWithPhotos, type VisitSaveSession } from '../visitSave';
import { resolveUpload, uploadError } from '../photoUpload';

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return 'No date';
  const today = localDate();
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  if (dateStr === today) {
    const parts = dateStr.split('-');
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    return `Today, ${months[m - 1]} ${d}`;
  }
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const nowYear = new Date().getFullYear();
      if (year === nowYear) {
        return `${months[month - 1]} ${day}`;
      }
      return `${months[month - 1]} ${day}, ${year}`;
    }
  }
  return dateStr;
}

type VisitData = FunctionReturnType<typeof api.visits.get>;

type VisitPickerPlace = Omit<SavedPlace, '_id'> & {
  _id: Id<'places'> | Id<'wishlist'>;
  placeId?: Id<'places'>;
  wishlistId?: Id<'wishlist'>;
  googlePlaceId?: string;
};

export function VisitScreen({ route, navigation }: ScreenProps<'Visit'>) {
  const { visitId, promptRating } = route.params;
  const data = useQuery(api.visits.get, { visitId });
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const me = useQuery(api.boards.me);
  const remove = useMutation(api.visits.remove);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [optionsAnchor, setOptionsAnchor] = useState({ x: 0, y: 0 });
  const task = useTask();

  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(!!promptRating);
  const [foodWizardOpen, setFoodWizardOpen] = useState(false);
  const [singleRating, setSingleRating] = useState<{
    kind: 'overall' | 'category' | 'dish';
    targetId: Id<'visits'> | Id<'categories'> | Id<'dishes'>;
    label: string;
    description?: string;
  } | null>(null);

  const [addItemModal, setAddItemModal] = useState<{
    visible: boolean;
    type: 'dish' | 'category';
    editItem?: { _id: Id<'dishes'> | Id<'categories'>; name: string; description?: string };
  }>({ visible: false, type: 'dish' });

  if (!data) return <Loading />;
  const { visit } = data;
  const planned = visit.status === 'planned';

  const overallRatings = data.ratings.filter((r) => r.kind === 'overall' && r.targetId === visitId);
  const canEdit = !!me?._id;
  const openPlace = visit.placeId
    ? () =>
        navigation.navigate('Place', {
          boardId: visit.boardId,
          placeId: visit.placeId!,
          name: visit.title,
        })
    : undefined;

  const openInMaps = () => {
    void task.run(() =>
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          visit.location
            ? `${visit.location.latitude},${visit.location.longitude}`
            : `${visit.title} ${visit.place}`,
        )}${visit.googlePlaceId ? `&query_place_id=${encodeURIComponent(visit.googlePlaceId)}` : ''}`,
      ),
    );
  };

  const optionsButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={planned ? 'Place options' : 'Visit options'}
      hitSlop={12}
      onPress={(event) => {
        setOptionsAnchor({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
        setOptionsMenuOpen(true);
      }}
      style={({ pressed }) => [
        summaryStyles.menuTriggerBtn,
        pressed && { opacity: 0.7, backgroundColor: colors.peachLight },
      ]}
    >
      <Icon source="dots-horizontal" size={20} color={colors.ink} />
    </Pressable>
  );

  const content = (
    <View style={summaryStyles.content}>
      <View style={summaryStyles.headerSection}>
        {planned ? (
          <PlaceOverview
            eyebrow="WISHLIST"
            name={visit.title}
            address={visit.place}
            location={visit.location}
            googlePlaceId={visit.googlePlaceId}
            openGoogleMaps={openInMaps}
            action={optionsButton}
            showGoogleMaps={false}
          />
        ) : (
          <>
            <View style={summaryStyles.visitLabelRow}>
              <Text style={styles.eyebrow}>VISIT</Text>
              {!!visit.date && (
                <View style={summaryStyles.metaItem}>
                  <View style={summaryStyles.dateIcon}>
                    <Icon source="calendar-blank-outline" size={14} color={colors.muted} />
                  </View>
                  <Text style={summaryStyles.metaText}>{formatDisplayDate(visit.date)}</Text>
                </View>
              )}
            </View>
            <View style={summaryStyles.headerTopRow}>
              {openPlace ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${visit.title} place page`}
                  accessibilityHint="View place details and all visits"
                  onPress={openPlace}
                  style={({ pressed }) => [
                    summaryStyles.placeTitleLink,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Title style={summaryStyles.heroTitle}>{visit.title}</Title>
                </Pressable>
              ) : (
                <Title style={summaryStyles.heroTitle}>{visit.title}</Title>
              )}
              {optionsButton}
            </View>
            {!!visit.place && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open in Maps"
                onPress={openInMaps}
                style={({ pressed }) => [summaryStyles.locationRow, pressed && { opacity: 0.75 }]}
              >
                <Icon source="map-marker-outline" size={16} color={colors.rust} />
                <Text style={summaryStyles.locationText} numberOfLines={2}>
                  {visit.place}
                </Text>
              </Pressable>
            )}
            {visit.googlePlaceId && (
              <GoogleAttribution placeId={visit.googlePlaceId} showGoogleMaps={false} />
            )}
          </>
        )}
      </View>

      {!planned && (
        <PhotoSection
          visitId={visitId}
          photos={data.photos}
          userId={me?._id}
          isAdmin={data.isAdmin}
        />
      )}

      {!planned && (
        <View style={summaryStyles.detailSection}>
          <Heading>Visit Rating</Heading>
          <View style={summaryStyles.sectionBox}>
            {!!visit.typeName && (
              <View style={[summaryStyles.itemRow, { borderTopWidth: 0 }]}>
                <Text style={summaryStyles.itemRowTitle}>Type</Text>
                <Text style={summaryStyles.typeText}>{visit.typeName}</Text>
              </View>
            )}
            {/* Overall Experience */}
            <RatingSummaryRow
              first={!visit.typeName}
              label="Overall"
              ratings={overallRatings}
              people={data.people}
              canEdit={canEdit}
              onPress={() =>
                setSingleRating({
                  kind: 'overall',
                  targetId: visitId,
                  label: 'Overall Experience',
                })
              }
            />

            {/* Categories */}
            {data.categories.map((cat) => (
              <RatingSummaryRow
                key={cat._id}
                label={cat.name}
                ratings={data.ratings.filter(
                  (r) => r.kind === 'category' && r.targetId === cat._id,
                )}
                people={data.people}
                canEdit={canEdit}
                onPress={() =>
                  setSingleRating({
                    kind: 'category',
                    targetId: cat._id,
                    label: cat.name,
                  })
                }
              />
            ))}
          </View>
        </View>
      )}
      {planned && (
        <Button
          title="Mark as visited"
          disabled={task.busy}
          onPress={() =>
            navigation.navigate('VisitForm', {
              boardId: visit.boardId,
              visitId,
              completePlanned: true,
            })
          }
        />
      )}
      {!planned && !!visit.savedLink && /^https?:\/\//i.test(visit.savedLink) && (
        <MaterialButton
          icon="link-variant"
          textColor={colors.rust}
          style={{ alignSelf: 'flex-start' }}
          onPress={() => void task.run(() => Linking.openURL(visit.savedLink!))}
        >
          Open saved link
        </MaterialButton>
      )}

      {/* Dishes Section */}
      {!planned && visit.showDishes && (
        <View style={summaryStyles.detailSection}>
          <View style={summaryStyles.dishesHeader}>
            <Text accessibilityRole="header" style={summaryStyles.sectionTitle}>
              Dishes
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add new dish"
              hitSlop={4}
              onPress={() => setAddItemModal({ visible: true, type: 'dish' })}
              style={({ pressed }) => [summaryStyles.addDishBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={summaryStyles.addDishBtnText}>+ Add</Text>
            </Pressable>
          </View>

          <View style={summaryStyles.sectionBox}>
            {data.dishes.length === 0 ? (
              <View style={summaryStyles.emptyDishesBox}>
                <Text style={styles.muted}>Add a dish to remember what you tried.</Text>
              </View>
            ) : (
              <View style={summaryStyles.dishesList}>
                {data.dishes.map((dish, index) => (
                  <DishSummaryRow
                    first={index === 0}
                    key={dish._id}
                    dish={dish}
                    ratings={data.ratings.filter(
                      (r) => r.kind === 'dish' && r.targetId === dish._id,
                    )}
                    people={data.people}
                    canEdit={canEdit}
                    onPress={() =>
                      setSingleRating({
                        kind: 'dish',
                        targetId: dish._id,
                        label: dish.name,
                        description: dish.description,
                      })
                    }
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      <View style={summaryStyles.detailSection}>
        <View style={summaryStyles.dishesHeader}>
          <Text accessibilityRole="header" style={summaryStyles.sectionTitle}>
            Notes
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visit.notes ? 'Edit notes' : 'Add notes'}
            hitSlop={4}
            onPress={() => navigation.navigate('VisitForm', { visitId, boardId: visit.boardId })}
            style={({ pressed }) => [summaryStyles.addDishBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={summaryStyles.addDishBtnText}>{visit.notes ? 'Edit' : '+ Add'}</Text>
          </Pressable>
        </View>
        <View style={[summaryStyles.sectionBox, summaryStyles.notesBody]}>
          <Text style={visit.notes ? styles.body : styles.muted}>
            {visit.notes || 'No notes added yet.'}
          </Text>
        </View>
      </View>

      <ErrorNote error={task.error} />
    </View>
  );

  return (
    <View style={styles.page}>
      <PlaceTopBar
        navigation={navigation}
        boardId={data.board._id}
        boardName={data.board.name}
        boards={boards}
      />
      {planned ? (
        <PlaceVisitHistory
          header={content}
          boardId={visit.boardId}
          placeId={data.historyPlaceId}
          members={data.members}
          onOpen={(id) => navigation.navigate('Visit', { visitId: id })}
        />
      ) : (
        <Page>{content}</Page>
      )}

      <Portal>
        <Dialog
          visible={deleteOpen}
          dismissable={!task.busy}
          onDismiss={() => !task.busy && setDeleteOpen(false)}
          style={{ backgroundColor: colors.paper }}
        >
          <Dialog.Title>{planned ? 'Remove from Wishlist?' : 'Delete visit?'}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.body}>
              This removes its notes, dishes and images for everyone on the board.
            </Text>
            <ErrorNote error={task.error} />
          </Dialog.Content>
          <Dialog.Actions>
            <MaterialButton
              textColor={colors.muted}
              disabled={task.busy}
              onPress={() => setDeleteOpen(false)}
            >
              Cancel
            </MaterialButton>
            <MaterialButton
              loading={task.busy}
              disabled={task.busy}
              textColor={colors.error}
              onPress={() =>
                void task.run(async () => {
                  await remove({ visitId });
                  setDeleteOpen(false);
                  if (navigation.canGoBack()) navigation.goBack();
                  else navigation.popTo('Board', { boardId: visit.boardId });
                })
              }
            >
              {planned ? 'Remove' : 'Delete'}
            </MaterialButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      {/* POPUPS & MODALS */}

      {/* 3-Dot Options Menu Modal */}
      {optionsMenuOpen && (
        <VisitOptionsMenuModal
          visible={optionsMenuOpen}
          onClose={() => setOptionsMenuOpen(false)}
          anchor={optionsAnchor}
          planned={planned}
          hasPlaceId={!!visit.placeId}
          isAdmin={data.isAdmin}
          isCreator={visit.creatorId === me?._id}
          onEditVisit={() => navigation.navigate('VisitForm', { visitId, boardId: visit.boardId })}
          onOpenInMaps={openInMaps}
          onAllVisits={openPlace}
          onRateAll={() => setFoodWizardOpen(true)}
          onAddCategory={
            data.isAdmin && !planned
              ? () => setAddItemModal({ visible: true, type: 'category' })
              : undefined
          }
          onDeleteVisit={
            data.isAdmin || visit.creatorId === me?._id ? () => setDeleteOpen(true) : undefined
          }
        />
      )}

      {/* 1. Food-by-Food Rating Wizard */}
      {foodWizardOpen && !planned && (
        <FoodByFoodModal
          visible={foodWizardOpen}
          onClose={() => setFoodWizardOpen(false)}
          data={data}
          userId={me?._id}
        />
      )}

      {/* 2. Single Item Rating Modal */}
      {singleRating && !planned && (
        <SingleRatingModal
          visible={!!singleRating}
          onClose={() => setSingleRating(null)}
          data={data}
          userId={me?._id}
          item={singleRating}
        />
      )}

      {/* 3. Add / Edit Dish or Category Modal */}
      {addItemModal.visible && (
        <AddItemModal
          visible={addItemModal.visible}
          type={addItemModal.type}
          editItem={addItemModal.editItem}
          visitId={visitId}
          isAdmin={data.isAdmin}
          onClose={() => setAddItemModal({ visible: false, type: 'dish' })}
        />
      )}

      {/* 4. Post-Creation Rating Prompt Modal */}
      {promptOpen && !planned && (
        <PromptRatingModal
          visible={promptOpen}
          placeName={visit.title}
          onStartRating={() => {
            setPromptOpen(false);
            setFoodWizardOpen(true);
          }}
          onLater={() => setPromptOpen(false)}
        />
      )}
    </View>
  );
}

function VisitOptionsMenuModal({
  visible,
  onClose,
  anchor,
  planned,
  hasPlaceId,
  isAdmin,
  isCreator,
  onEditVisit,
  onOpenInMaps,
  onAllVisits,
  onAddCategory,
  onRateAll,
  onDeleteVisit,
}: {
  visible: boolean;
  onClose: () => void;
  anchor: { x: number; y: number };
  planned: boolean;
  hasPlaceId: boolean;
  isAdmin: boolean;
  isCreator: boolean;
  onEditVisit: () => void;
  onOpenInMaps: () => void;
  onAllVisits?: () => void;
  onAddCategory?: () => void;
  onRateAll: () => void;
  onDeleteVisit?: () => void;
}) {
  const choose = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <Menu
      visible={visible}
      onDismiss={onClose}
      anchor={anchor}
      statusBarHeight={0}
      contentStyle={{ backgroundColor: colors.paper, borderRadius: 16 }}
    >
      <Menu.Item
        leadingIcon="pencil-outline"
        title={planned ? 'Edit Wishlist Place' : 'Edit visit'}
        onPress={() => choose(onEditVisit)}
      />
      {!planned && (
        <Menu.Item
          leadingIcon="navigation-variant-outline"
          title="Directions"
          onPress={() => choose(onOpenInMaps)}
        />
      )}
      {!planned && (
        <Menu.Item leadingIcon="star-outline" title="Rate all" onPress={() => choose(onRateAll)} />
      )}
      {hasPlaceId && onAllVisits && (
        <Menu.Item
          leadingIcon="history"
          title="All visits to this place"
          onPress={() => choose(onAllVisits)}
        />
      )}
      {isAdmin && onAddCategory && (
        <Menu.Item
          leadingIcon="plus-circle-outline"
          title="Add rating category"
          onPress={() => choose(onAddCategory)}
        />
      )}
      {(isAdmin || isCreator) && onDeleteVisit && (
        <Menu.Item
          leadingIcon={({ size }) => (
            <Icon source="trash-can-outline" size={size} color={colors.error} />
          )}
          title={planned ? 'Remove from Wishlist' : 'Delete visit'}
          titleStyle={{ color: colors.error }}
          onPress={() => choose(onDeleteVisit)}
        />
      )}
    </Menu>
  );
}

type RatingPerson = VisitData['people'][number];

function RatingSummaryRow({
  first = false,
  label,
  ratings,
  people,
  canEdit,
  onPress,
}: {
  first?: boolean;
  label: string;
  ratings: Doc<'ratings'>[];
  people: RatingPerson[];
  canEdit: boolean;
  onPress: () => void;
}) {
  const scoreDescription = ratings
    .map((rating) => {
      const person = people.find((entry) => entry._id === rating.userId);
      return `${person?.name ?? rating.importedName ?? 'Member'} ${rating.score.toFixed(1)} out of 10`;
    })
    .join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${scoreDescription || 'Not rated'}`}
      accessibilityHint="View and edit ratings"
      disabled={!canEdit}
      onPress={onPress}
      style={({ pressed }) => [
        summaryStyles.itemRow,
        first && { borderTopWidth: 0 },
        pressed && { backgroundColor: colors.peachLight },
      ]}
    >
      <Text style={[summaryStyles.itemRowTitle, { flex: 1 }]}>{label}</Text>
      <View style={summaryStyles.pillsRow}>
        {ratings.slice(0, 2).map((rating) => {
          const person = people.find((entry) => entry._id === rating.userId);
          return (
            <View key={rating._id} style={summaryStyles.ratedPill}>
              <Avatar
                name={person?.name ?? rating.importedName ?? 'Member'}
                image={person?.image}
                size={22}
              />
              <Text style={summaryStyles.ratedPillScore}>{rating.score.toFixed(1)}</Text>
            </View>
          );
        })}
        {ratings.length > 2 && <Text style={styles.muted}>+{ratings.length - 2}</Text>}
        {!ratings.length && <Text style={styles.link}>Rate</Text>}
        <Icon source="chevron-right" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function DishSummaryRow({
  first = false,
  dish,
  ratings,
  people,
  canEdit,
  onPress,
}: {
  first?: boolean;
  dish: Doc<'dishes'>;
  ratings: Doc<'ratings'>[];
  people: RatingPerson[];
  canEdit: boolean;
  onPress: () => void;
}) {
  return (
    <View>
      <RatingSummaryRow
        first={first}
        label={dish.name}
        ratings={ratings}
        people={people}
        canEdit={canEdit}
        onPress={onPress}
      />
    </View>
  );
}

function FoodByFoodModal({
  visible,
  onClose,
  data,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  data: VisitData;
  userId?: Id<'users'>;
}) {
  const saveRating = useMutation(api.ratings.save);
  const task = useTask();

  // Sequence: Dishes -> Categories -> Overall
  const items = useMemo(() => {
    const list: {
      kind: 'dish' | 'category' | 'overall';
      targetId: Id<'visits'> | Id<'dishes'> | Id<'categories'>;
      name: string;
      description?: string;
    }[] = [];

    data.dishes.forEach((d) => {
      list.push({ kind: 'dish', targetId: d._id, name: d.name, description: d.description });
    });
    data.categories.forEach((c) => {
      list.push({ kind: 'category', targetId: c._id, name: c.name });
    });
    list.push({ kind: 'overall', targetId: data.visit._id, name: 'Overall Experience' });
    return list;
  }, [data.dishes, data.categories, data.visit._id]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Members to rate: if admin, all members of board. If not admin, just current user.
  const rateableMembers = useMemo(() => {
    if (data.isAdmin) return data.members;
    return data.members.filter((m) => m._id === userId);
  }, [data.isAdmin, data.members, userId]);

  const currentItem = items[currentIndex] || items[0];

  // Draft ratings for each member for current item
  const [drafts, setDrafts] = useState<RatingDrafts>({});
  const draftIdentity = useRef('');

  // When currentItem changes, populate drafts from existing ratings
  useEffect(() => {
    if (!currentItem) return;
    const initialDrafts: Record<string, { score?: number; note: string; hasChanged: boolean }> = {};
    for (const member of rateableMembers) {
      const existing = data.ratings.find(
        (r) =>
          r.kind === currentItem.kind &&
          r.targetId === currentItem.targetId &&
          r.userId === member._id,
      );
      initialDrafts[member._id] = {
        score: existing?.score,
        note: existing?.note || '',
        hasChanged: false,
      };
    }
    const identity = `${currentItem.kind}:${currentItem.targetId}`;
    const reset = draftIdentity.current !== identity;
    draftIdentity.current = identity;
    setDrafts((previous) => (reset ? initialDrafts : mergeRatingDrafts(previous, initialDrafts)));
  }, [currentItem, rateableMembers, data.ratings]);

  async function saveCurrentDrafts() {
    for (const member of rateableMembers) {
      const draft = drafts[member._id];
      if (draft && draft.hasChanged) {
        await saveRating({
          visitId: data.visit._id,
          kind: currentItem.kind,
          targetId: currentItem.targetId,
          score: draft.score !== undefined ? draft.score : null,
          note: draft.note || '',
          userId: member._id,
        });
        setDrafts((previous) => markRatingSaved(previous, member._id, draft));
      }
    }
  }

  function handleNext() {
    void task.run(async () => {
      await saveCurrentDrafts();
      if (currentIndex < items.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        onClose();
      }
    });
  }

  function handlePrev() {
    void task.run(async () => {
      await saveCurrentDrafts();
      if (currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
    });
  }

  const close = () =>
    confirmDiscard(
      Object.values(drafts).some((draft) => draft.hasChanged),
      task.busy,
      onClose,
    );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss rating wizard"
          onPress={close}
        />
        <RatingDrawer style={modalStyles.sheetContainer} onClose={close}>
          {/* Header */}
          <View style={modalStyles.sheetHeader}>
            <View style={{ gap: 4, flex: 1 }}>
              <View style={modalStyles.stepperProgressRow}>
                <View style={modalStyles.kindBadge}>
                  <Text style={modalStyles.kindBadgeText}>
                    {currentItem.kind === 'dish'
                      ? 'DISH'
                      : currentItem.kind === 'category'
                        ? 'VISIT RATING'
                        : 'OVERALL'}
                  </Text>
                </View>
                <Text style={modalStyles.stepperProgressText}>
                  {currentIndex + 1} of {items.length}
                </Text>
              </View>
              <Text style={modalStyles.sheetTitle}>{currentItem.name}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close rating wizard"
              hitSlop={12}
              onPress={close}
              style={modalStyles.sheetCloseBtn}
            >
              <Icon source="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          {/* Members rating area (scrollable) */}
          <VerticalScrollView
            containerStyle={modalStyles.membersScroll}
            contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
            nestedScrollEnabled
            directionalLockEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {rateableMembers.map((member) => {
              const draft = drafts[member._id] || { score: undefined, note: '', hasChanged: false };
              return (
                <View key={member._id} style={modalStyles.memberCard}>
                  <ScorePicker
                    compact
                    header={
                      <View style={modalStyles.memberInfo}>
                        <Avatar name={member.name} image={member.image} size={24} />
                        <Text style={modalStyles.memberName} numberOfLines={2}>
                          {member.name || 'Member'}
                          {member._id === userId ? ' (You)' : ''}
                        </Text>
                      </View>
                    }
                    disabled={task.busy}
                    value={draft.score}
                    onChange={(score) => {
                      setDrafts((prev) => ({
                        ...prev,
                        [member._id]: {
                          ...prev[member._id],
                          score,
                          hasChanged: true,
                        },
                      }));
                    }}
                  />

                  <TextInput
                    accessibilityLabel={`${member.name || 'Member'} rating note`}
                    editable={!task.busy}
                    placeholder="Add an optional note…"
                    placeholderTextColor={colors.muted}
                    value={draft.note}
                    onChangeText={(text) => {
                      setDrafts((prev) => ({
                        ...prev,
                        [member._id]: {
                          ...prev[member._id],
                          note: text,
                          hasChanged: true,
                        },
                      }));
                    }}
                    style={modalStyles.noteInput}
                    maxLength={1000}
                  />
                </View>
              );
            })}
          </VerticalScrollView>

          <ErrorNote error={task.error} />

          {/* Footer Navigation */}
          <View style={modalStyles.footerActions}>
            {currentIndex > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous item"
                disabled={task.busy}
                onPress={handlePrev}
                style={modalStyles.wizardNavBtn}
              >
                <Text style={modalStyles.wizardNavBtnText}>Back</Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={currentIndex === items.length - 1 ? 'Finish rating' : 'Next item'}
              disabled={task.busy}
              onPress={handleNext}
              style={modalStyles.wizardNextBtn}
            >
              {task.busy ? (
                <ActivityIndicator color={colors.paper} size="small" />
              ) : (
                <Text style={modalStyles.wizardNextBtnText}>
                  {currentIndex === items.length - 1
                    ? 'Finish & Save 🎉'
                    : currentItem.kind === 'dish'
                      ? 'Next Dish ➔'
                      : 'Next ➔'}
                </Text>
              )}
            </Pressable>
          </View>
        </RatingDrawer>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SingleRatingModal({
  visible,
  onClose,
  data,
  userId,
  item,
}: {
  visible: boolean;
  onClose: () => void;
  data: VisitData;
  userId?: Id<'users'>;
  item: {
    kind: 'overall' | 'category' | 'dish';
    targetId: Id<'visits'> | Id<'categories'> | Id<'dishes'>;
    label: string;
    description?: string;
  };
}) {
  const saveRating = useMutation(api.ratings.save);
  const saveDish = useMutation(api.items.saveDish);
  const removeItem = useMutation(api.items.remove);
  const task = useTask();
  const dish =
    item.kind === 'dish' ? data.dishes.find((entry) => entry._id === item.targetId) : undefined;
  const title = dish?.name ?? item.label;
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(title);
  const nameChanged = editingName && name.trim() !== title;

  async function saveName() {
    if (!editingName || !dish) return;
    if (nameChanged) {
      await saveDish({
        visitId: data.visit._id,
        id: dish._id,
        name: name.trim(),
        description: dish.description,
      });
    }
    setEditingName(false);
    Keyboard.dismiss();
  }

  const rateableMembers = useMemo(() => {
    if (data.isAdmin) return data.members;
    return data.members.filter((m) => m._id === userId);
  }, [data.isAdmin, data.members, userId]);

  const [drafts, setDrafts] = useState<RatingDrafts>({});
  const draftIdentity = useRef('');

  useEffect(() => {
    const initialDrafts: Record<string, { score?: number; note: string; hasChanged: boolean }> = {};
    for (const member of rateableMembers) {
      const existing = data.ratings.find(
        (r) => r.kind === item.kind && r.targetId === item.targetId && r.userId === member._id,
      );
      initialDrafts[member._id] = {
        score: existing?.score,
        note: existing?.note || '',
        hasChanged: false,
      };
    }
    const identity = `${item.kind}:${item.targetId}`;
    const reset = draftIdentity.current !== identity;
    draftIdentity.current = identity;
    setDrafts((previous) => (reset ? initialDrafts : mergeRatingDrafts(previous, initialDrafts)));
  }, [item, rateableMembers, data.ratings]);

  function handleSave() {
    void task.run(async () => {
      await saveName();
      for (const member of rateableMembers) {
        const draft = drafts[member._id];
        if (draft && draft.hasChanged) {
          await saveRating({
            visitId: data.visit._id,
            kind: item.kind,
            targetId: item.targetId,
            score: draft.score !== undefined ? draft.score : null,
            note: draft.note || '',
            userId: member._id,
          });
          setDrafts((previous) => markRatingSaved(previous, member._id, draft));
        }
      }
      onClose();
    });
  }

  function handleDeleteDish() {
    if (!dish || !data.isAdmin || task.busy) return;
    confirm(`Delete ${title} and its ratings?`, () => {
      void task.run(async () => {
        await removeItem({
          visitId: data.visit._id,
          target: dish._id,
          confirmed: true,
        });
        onClose();
      });
    });
  }

  const close = () =>
    confirmDiscard(
      nameChanged || Object.values(drafts).some((draft) => draft.hasChanged),
      task.busy,
      onClose,
    );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss rating"
          onPress={close}
        />
        <RatingDrawer style={modalStyles.sheetContainer} onClose={close}>
          {/* Header */}
          <View style={modalStyles.sheetHeader}>
            <View style={{ gap: 4, flex: 1 }}>
              <View style={modalStyles.kindBadge}>
                <Text style={modalStyles.kindBadgeText}>
                  {item.kind === 'dish'
                    ? 'DISH RATING'
                    : item.kind === 'category'
                      ? 'VISIT RATING'
                      : 'OVERALL RATING'}
                </Text>
              </View>
              <View style={modalStyles.sheetTitleRow}>
                {editingName ? (
                  <>
                    <TextInput
                      autoFocus
                      selectTextOnFocus
                      accessibilityLabel="Dish name"
                      value={name}
                      onChangeText={setName}
                      editable={!task.busy}
                      style={modalStyles.dishNameInput}
                      maxLength={120}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (name.trim() && !task.busy) void task.run(saveName);
                      }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Save dish name"
                      disabled={task.busy || !name.trim()}
                      onPress={() => void task.run(saveName)}
                      style={styles.iconButton}
                    >
                      <Icon source="check" size={20} color={colors.rust} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cancel dish name edit"
                      disabled={task.busy}
                      onPress={() => setEditingName(false)}
                      style={styles.iconButton}
                    >
                      <Icon source="close" size={20} color={colors.muted} />
                    </Pressable>
                  </>
                ) : (
                  <Text style={[modalStyles.sheetTitle, { flexShrink: 1 }]}>{title}</Text>
                )}
                {dish && !editingName && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit dish"
                    disabled={task.busy}
                    onPress={() => {
                      setName(title);
                      setEditingName(true);
                    }}
                    style={styles.iconButton}
                  >
                    <Icon source="pencil-outline" size={20} color={colors.rust} />
                  </Pressable>
                )}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close rating"
              hitSlop={12}
              onPress={close}
              style={modalStyles.sheetCloseBtn}
            >
              <Icon source="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          {/* Members rating cards */}
          <VerticalScrollView
            containerStyle={modalStyles.membersScroll}
            contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
            nestedScrollEnabled
            directionalLockEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {rateableMembers.map((member) => {
              const draft = drafts[member._id] || { score: undefined, note: '', hasChanged: false };
              return (
                <View key={member._id} style={modalStyles.memberCard}>
                  <ScorePicker
                    compact
                    header={
                      <View style={modalStyles.memberInfo}>
                        <Avatar name={member.name} image={member.image} size={24} />
                        <Text style={modalStyles.memberName} numberOfLines={2}>
                          {member.name || 'Member'}
                          {member._id === userId ? ' (You)' : ''}
                        </Text>
                      </View>
                    }
                    disabled={task.busy}
                    value={draft.score}
                    onChange={(score) => {
                      setDrafts((prev) => ({
                        ...prev,
                        [member._id]: {
                          ...prev[member._id],
                          score,
                          hasChanged: true,
                        },
                      }));
                    }}
                  />

                  <TextInput
                    accessibilityLabel={`${member.name || 'Member'} rating note`}
                    editable={!task.busy}
                    placeholder="Add an optional note…"
                    placeholderTextColor={colors.muted}
                    value={draft.note}
                    onChangeText={(text) => {
                      setDrafts((prev) => ({
                        ...prev,
                        [member._id]: {
                          ...prev[member._id],
                          note: text,
                          hasChanged: true,
                        },
                      }));
                    }}
                    style={modalStyles.noteInput}
                    maxLength={1000}
                  />
                </View>
              );
            })}
          </VerticalScrollView>

          <ErrorNote error={task.error} />

          {/* Footer buttons */}
          <View style={modalStyles.footerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dish && data.isAdmin ? 'Delete Dish' : 'Cancel'}
              onPress={dish && data.isAdmin ? handleDeleteDish : close}
              disabled={task.busy}
              style={modalStyles.wizardNavBtn}
            >
              <Text
                style={[
                  modalStyles.wizardNavBtnText,
                  dish && data.isAdmin && { color: colors.error },
                ]}
              >
                {dish && data.isAdmin ? 'Delete Dish' : 'Cancel'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save rating"
              disabled={task.busy || (editingName && !name.trim())}
              onPress={handleSave}
              style={modalStyles.wizardNextBtn}
            >
              {task.busy ? (
                <ActivityIndicator color={colors.paper} size="small" />
              ) : (
                <Text style={modalStyles.wizardNextBtnText}>Save Rating</Text>
              )}
            </Pressable>
          </View>
        </RatingDrawer>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddItemModal({
  visible,
  type,
  editItem,
  visitId,
  isAdmin,
  onClose,
}: {
  visible: boolean;
  type: 'dish' | 'category';
  editItem?: { _id: Id<'dishes'> | Id<'categories'>; name: string; description?: string };
  visitId: Id<'visits'>;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const saveCategory = useMutation(api.items.saveCategory);
  const saveDish = useMutation(api.items.saveDish);
  const removeItem = useMutation(api.items.remove);
  const task = useTask();

  const [itemType, setItemType] = useState<'dish' | 'category'>(type);
  const [name, setName] = useState(editItem?.name ?? '');

  function handleSave() {
    void task.run(async () => {
      const cleanName = name.trim();
      if (!cleanName) return;
      if (itemType === 'dish') {
        await saveDish({
          visitId,
          id: editItem ? (editItem._id as Id<'dishes'>) : undefined,
          name: cleanName,
          description: editItem?.description ?? '',
        });
      } else {
        await saveCategory({
          visitId,
          id: editItem ? (editItem._id as Id<'categories'>) : undefined,
          name: cleanName,
        });
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!editItem) return;
    confirm(`Remove ${editItem.name} and its ratings?`, () => {
      void task.run(async () => {
        await removeItem({
          visitId,
          target: editItem._id,
          confirmed: true,
        });
        onClose();
      });
    });
  }

  const close = () => confirmDiscard(name !== (editItem?.name ?? ''), task.busy, onClose);

  return (
    <MaterialDialog visible={visible} dismissable={!task.busy} onDismiss={close}>
      <Dialog.Content style={{ gap: 16 }}>
        <View style={modalStyles.sheetHeader}>
          <Text style={modalStyles.sheetTitle}>
            {editItem
              ? `Edit ${itemType === 'dish' ? 'Dish' : 'Category'}`
              : `Add ${itemType === 'dish' ? 'Dish' : 'Category'}`}
          </Text>
          <Pressable accessibilityRole="button" onPress={close} style={modalStyles.sheetCloseBtn}>
            <Icon source="close" size={20} color={colors.ink} />
          </Pressable>
        </View>

        {!editItem && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setItemType('dish')}
              style={[
                summaryStyles.typePillBtn,
                itemType === 'dish' && summaryStyles.typePillBtnSelected,
              ]}
            >
              <Text
                style={[
                  summaryStyles.typePillBtnText,
                  itemType === 'dish' && summaryStyles.typePillBtnTextSelected,
                ]}
              >
                Dish
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setItemType('category')}
              style={[
                summaryStyles.typePillBtn,
                itemType === 'category' && summaryStyles.typePillBtnSelected,
              ]}
            >
              <Text
                style={[
                  summaryStyles.typePillBtnText,
                  itemType === 'category' && summaryStyles.typePillBtnTextSelected,
                ]}
              >
                Category
              </Text>
            </Pressable>
          </View>
        )}

        <Field
          editable={!task.busy}
          label={itemType === 'dish' ? 'Dish name' : 'Category name'}
          placeholder={itemType === 'dish' ? 'e.g. Cacio e Pepe' : 'e.g. Service'}
          value={name}
          onChangeText={setName}
          maxLength={120}
        />

        <ErrorNote error={task.error} />

        <View style={{ gap: 8, marginTop: 4 }}>
          <Button
            title={editItem ? 'Save changes' : 'Add item'}
            disabled={task.busy || !name.trim()}
            onPress={handleSave}
          />
          {editItem && isAdmin && (
            <Button title="Remove item" secondary disabled={task.busy} onPress={handleDelete} />
          )}
        </View>
      </Dialog.Content>
    </MaterialDialog>
  );
}

function PromptRatingModal({
  visible,
  placeName,
  onStartRating,
  onLater,
}: {
  visible: boolean;
  placeName: string;
  onStartRating: () => void;
  onLater: () => void;
}) {
  return (
    <MaterialDialog visible={visible} onDismiss={onLater}>
      <Dialog.Content style={{ gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: colors.peachLight,
              borderWidth: 1,
              borderColor: colors.peachBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon source="silverware-fork-knife" size={28} color={colors.rust} />
          </View>

          <View style={{ gap: 4, alignItems: 'center' }}>
            <Text
              style={{
                fontFamily: 'EpilogueSemiBold',
                fontSize: 20,
                color: colors.ink,
                textAlign: 'center',
              }}
            >
              Visit Saved! 🎉
            </Text>
            <Text style={[styles.muted, { textAlign: 'center' }]}>
              Ready to rate {placeName} together? Go food by food and rate dishes on this phone.
            </Text>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Button title="Rate Food by Food ➔" onPress={onStartRating} />
          <Button title="Maybe later" secondary onPress={onLater} />
        </View>
      </Dialog.Content>
    </MaterialDialog>
  );
}

export function VisitFormScreen({ route, navigation }: ScreenProps<'VisitForm'>) {
  const { boardId, visitId } = route.params;
  const board = useQuery(api.boards.get, { boardId });
  const data = useQuery(api.visits.get, visitId ? { visitId } : 'skip');
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  if (!board || (visitId && !data)) return <Loading />;
  return (
    <VisitForm
      key={visitId ?? 'new'}
      initial={data?.visit}
      existingPhotos={data?.photos}
      existingDishes={data?.dishes}
      types={board.types}
      board={board.board}
      boards={boards}
      navigation={navigation}
      params={route.params}
      onDone={(id) => {
        if (visitId) navigation.goBack();
        else navigation.replace('Visit', { visitId: id, promptRating: !route.params.planned });
      }}
    />
  );
}

function DatePickerModal({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (date: string) => void;
  onClose: () => void;
}) {
  const initialDate = useMemo(() => {
    if (value && validDate(value)) {
      const parts = value.split('-');
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date();
  }, [value]);

  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );

  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpYear, setJumpYear] = useState(String(initialDate.getFullYear()));
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = localDate();

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }

  function selectDay(day: number) {
    const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    onClose();
  }

  function pickToday() {
    onChange(localDate());
    onClose();
  }

  if (!visible) return null;

  return (
    <MaterialDialog visible={visible} onDismiss={onClose} style={{ maxWidth: 340 }}>
      <Dialog.Content>
        {/* Calendar Header with Navigation */}
        <View style={datePickerStyles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={prevMonth}
            hitSlop={8}
            style={datePickerStyles.navBtn}
          >
            <Icon source="chevron-left" size={22} color={colors.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose month and year"
            onPress={() => {
              setJumpYear(String(year));
              setJumpOpen((open) => !open);
            }}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={datePickerStyles.monthTitle}>
              {monthNames[month]} {year}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={nextMonth}
            hitSlop={8}
            style={datePickerStyles.navBtn}
          >
            <Icon source="chevron-right" size={22} color={colors.ink} />
          </Pressable>
        </View>

        {jumpOpen && (
          <View style={{ gap: 8, paddingVertical: 12 }}>
            <Field
              label="Year"
              value={jumpYear}
              onChangeText={setJumpYear}
              keyboardType="number-pad"
              maxLength={4}
            />
            <View style={[styles.row, { gap: 4 }]}>
              {monthNames.map((name, index) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={`Jump to ${name} ${jumpYear}`}
                  disabled={
                    !/^\d{4}$/.test(jumpYear) || Number(jumpYear) < 1900 || Number(jumpYear) > 2100
                  }
                  onPress={() => {
                    setCurrentMonth(new Date(Number(jumpYear), index, 1));
                    setJumpOpen(false);
                  }}
                  style={{
                    minWidth: '23%',
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={styles.link}>{name.slice(0, 3)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.muted}>Choose a year from 1900 to 2100, then a month.</Text>
          </View>
        )}
        {/* Weekday Labels */}
        <View style={datePickerStyles.weekDaysRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName, idx) => (
            <Text key={`${dayName}-${idx}`} style={datePickerStyles.weekDayLabel}>
              {dayName}
            </Text>
          ))}
        </View>

        {/* Day Grid */}
        <View style={datePickerStyles.daysGrid}>
          {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
            <View key={`empty-${idx}`} style={datePickerStyles.dayCell} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = dateString === value;
            const isToday = dateString === todayStr;

            return (
              <Pressable
                key={`day-${day}`}
                accessibilityRole="button"
                accessibilityLabel={`${monthNames[month]} ${day}, ${year}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => selectDay(day)}
                style={[
                  datePickerStyles.dayCell,
                  isSelected && datePickerStyles.selectedDayCell,
                  isToday && !isSelected && datePickerStyles.todayDayCell,
                ]}
              >
                <Text
                  style={[
                    datePickerStyles.dayText,
                    isSelected && datePickerStyles.selectedDayText,
                    isToday && !isSelected && datePickerStyles.todayDayText,
                  ]}
                >
                  {day}
                </Text>
                {isToday && !isSelected && <View style={datePickerStyles.todayDot} />}
              </Pressable>
            );
          })}
        </View>

        {/* Footer Actions */}
        <View style={datePickerStyles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onChange('');
              onClose();
            }}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={styles.link}>No date</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set to today"
            onPress={pickToday}
            style={datePickerStyles.todayActionBtn}
          >
            <Text style={datePickerStyles.todayActionText}>Today</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close date picker"
            onPress={onClose}
            style={datePickerStyles.closeActionBtn}
          >
            <Text style={datePickerStyles.closeActionText}>Done</Text>
          </Pressable>
        </View>
      </Dialog.Content>
    </MaterialDialog>
  );
}

function VisitForm({
  initial,
  existingPhotos,
  existingDishes,
  types,
  board,
  boards,
  navigation,
  params,
  onDone,
}: {
  initial?: Doc<'visits'>;
  existingPhotos?: { _id: Id<'photos'>; caption: string; uploaderId: Id<'users'> }[];
  existingDishes?: Pick<Doc<'dishes'>, '_id' | 'name'>[];
  types: Doc<'visitTypes'>[];
  board: Doc<'boards'>;
  boards: {
    results: Doc<'boards'>[];
    status: string;
    loadMore: (numItems: number) => void;
  };
  navigation: ScreenProps<'VisitForm'>['navigation'];
  params: ScreenProps<'VisitForm'>['route']['params'];
  onDone: (id: Id<'visits'>) => void;
}) {
  const [completing] = useState(!!params.completePlanned);
  const planned = !completing && (initial?.status === 'planned' || !!params.planned);
  const [wishlistReference] = useState(() =>
    completing
      ? { notes: initial?.notes ?? '', dishes: existingDishes?.map((dish) => dish.name) ?? [] }
      : null,
  );
  const [step, setStep] = useState<1 | 2>(initial || (params.title && params.placeId) ? 2 : 1);

  const token = useAuthToken();
  const convex = useConvex();
  const reserve = useMutation(api.photos.reserve);
  const removePhoto = useMutation(api.photos.remove);

  const [titleDraft, setTitle] = useState(initial?.title ?? params.title ?? '');
  const [placeDraft, setPlace] = useState(initial?.place ?? params.place ?? '');
  const [placeId, setPlaceId] = useState<Id<'places'> | undefined>(
    initial?.placeId ?? params.placeId,
  );
  const [googlePlaceId, setGooglePlaceId] = useState<string | undefined>(
    initial?.googlePlaceId ?? params.googlePlaceId,
  );
  const [locationDraft, setLocation] = useState<{ latitude: number; longitude: number } | null>(
    initial?.location ?? params.location ?? null,
  );
  const livePlace = useLivePlace(googlePlaceId);
  const title =
    livePlace && (!titleDraft || isPlacePlaceholder(titleDraft)) ? livePlace.name : titleDraft;
  const place = placeDraft || livePlace?.address || '';
  const location = locationDraft ?? livePlace?.location ?? null;
  const [date, setDate] = useState(
    completing ? localDate() : (initial?.date ?? (planned ? '' : localDate())),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickedPhotos, setPickedPhotos] = useState<{ uri: string }[]>([]);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const [keepWishlist, setKeepWishlist] = useState(params.keepWishlist ?? false);
  const [wishlistId, setWishlistId] = useState(params.wishlistId);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [notes, setNotes] = useState(completing ? '' : (initial?.notes ?? params.notes ?? ''));
  const [savedLink] = useState(initial?.savedLink ?? params.savedLink ?? '');
  const [typeId, setTypeId] = useState<Id<'visitTypes'> | undefined>(
    initial
      ? (types.find((entry) => entry.name === initial.typeName)?._id ?? types[0]?._id)
      : types[0]?._id,
  );
  const type = types.find((entry) => entry._id === typeId);
  const [showDishes, setShowDishes] = useState(initial?.showDishes ?? type?.showDishes ?? true);
  const [dishes, setDishes] = useState<string[]>([]);
  const [dishInput, setDishInput] = useState('');

  async function pickPhoto(source: PhotoSource) {
    if (task.busy) return;
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showAlert(
            'Camera access is off',
            'Allow camera access in settings, or choose an image from your library.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open settings', onPress: () => void Linking.openSettings() },
            ],
          );
          return;
        }
      }
      const result = await launchPhotoPicker(source, { allowsMultipleSelection: true });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const remainingSlots = MAX_PHOTOS - (existingPhotos?.length ?? 0) - pickedPhotos.length;
      if (remainingSlots <= 0) {
        showAlert('Limit reached', `You can add up to ${MAX_PHOTOS} images per visit.`);
        return;
      }

      const assetsToAdd = result.assets.slice(0, remainingSlots);
      const convertedPhotos: { uri: string }[] = [];

      for (const asset of assetsToAdd) {
        const converted = await manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width || 2400, 2400) } }],
          { compress: 0.85, format: SaveFormat.JPEG },
        );
        if (new File(converted.uri).size > MAX_PHOTO_BYTES) {
          showAlert('File too large', 'Please choose images smaller than 10 MB.');
          continue;
        }
        convertedPhotos.push({ uri: converted.uri });
      }

      if (convertedPhotos.length > 0) {
        setPickedPhotos((prev) => [...prev, ...convertedPhotos]);
      }
    } catch (err: any) {
      showAlert('Error', err?.message || 'Could not select image.');
    }
  }

  function promptPhotoPicker() {
    const currentTotal = (existingPhotos?.length ?? 0) + pickedPhotos.length;
    if (currentTotal >= MAX_PHOTOS) {
      showAlert('Limit reached', `You can add up to ${MAX_PHOTOS} images per visit.`);
      return;
    }
    Keyboard.dismiss();
    setPhotoSourceOpen(true);
  }

  function removePickedPhoto(index: number) {
    setPickedPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  // Step 1: Map and search state
  const insets = useSafeAreaInsets();
  const { keyboardHeight } = useKeyboard();
  const keyboardOverlap = Math.max(0, keyboardHeight - insets.bottom);
  const hasMap = Boolean(
    Platform.OS === 'ios'
      ? Constants.expoConfig?.extra?.hasIosMapsKey
      : Constants.expoConfig?.extra?.hasAndroidMapsKey,
  );
  const current = useCurrentLocation(!!hasMap);
  const [search, setSearch] = useState(params.title ?? '');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSavedPlace, setSelectedSavedPlace] = useState<VisitPickerPlace | undefined>();
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<GooglePlace | undefined>();

  const map = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapSize, setMapSize] = useState<MapSize>({ width: 0, height: 300 });
  const [region, setRegion] = useState<MapRegion>({
    latitude: location?.latitude ?? 20.5937,
    longitude: location?.longitude ?? 78.9629,
    latitudeDelta: location ? 0.02 : 25,
    longitudeDelta: location ? 0.02 : 25,
  });

  const placesQuery = usePaginatedQuery(
    api.places.list,
    { boardId: params.boardId },
    { initialNumItems: 100 },
  );
  const wishlistQuery = usePaginatedQuery(
    api.wishlist.list,
    !planned ? { boardId: params.boardId } : 'skip',
    { initialNumItems: 100 },
  );
  const { status: placesStatus, loadMore: loadPlaces } = placesQuery;
  const { status: wishlistStatus, loadMore: loadWishlist } = wishlistQuery;
  useEffect(() => {
    if (step === 1 && placesStatus === 'CanLoadMore') loadPlaces(100);
  }, [step, placesStatus, loadPlaces]);
  useEffect(() => {
    if (step === 1 && !planned && wishlistStatus === 'CanLoadMore') loadWishlist(100);
  }, [step, planned, wishlistStatus, loadWishlist]);

  const filtered = useMemo(() => {
    const saved: VisitPickerPlace[] = placesQuery.results.map((item) => ({
      ...item,
      placeId: item._id,
    }));
    const wishes: VisitPickerPlace[] = wishlistQuery.results.map((item) => ({
      _id: item._id,
      wishlistId: item._id,
      name: item.title,
      address: item.place ?? '',
      googlePlaceId: item.googlePlaceId,
      location: item.location,
    }));
    return matchingPlaces(
      preferVisitedPlaces([...saved, ...wishes], (item) => ({
        ...item,
        wishlist: !!item.wishlistId,
      })),
      search,
    );
  }, [placesQuery.results, wishlistQuery.results, search]);
  const savedWithDistance = useMemo(
    () =>
      filtered.map((p) => ({
        ...p,
        distance:
          p.location && current.location
            ? distanceBetween(p.location, current.location)
            : undefined,
      })),
    [filtered, current.location],
  );

  const located = useMemo(
    () =>
      filtered.filter(
        (p): p is typeof p & { location: NonNullable<typeof p.location> } => !!p.location,
      ),
    [filtered],
  );

  const markers = useMemo(() => placeMarkers(located, region, mapSize), [located, region, mapSize]);

  const nearby = usePlaceSearch(search, current.location, searchOpen);

  const initialCenterApplied = useRef(false);
  const savedCenterApplied = useRef(false);
  useEffect(() => {
    if (!mapReady || !mapSize.width) return;
    if (location && !initialCenterApplied.current) {
      initialCenterApplied.current = true;
      map.current?.animateToRegion(nearbyRegion(location, mapSize, 0.8), 450);
    } else if (current.location && !initialCenterApplied.current) {
      initialCenterApplied.current = true;
      map.current?.animateToRegion(nearbyRegion(current.location, mapSize), 450);
    } else if (located.length > 0 && !savedCenterApplied.current && !initialCenterApplied.current) {
      savedCenterApplied.current = true;
      map.current?.animateToRegion(nearbyRegion(located[0].location, mapSize), 450);
    }
  }, [mapReady, mapSize, location, current.location, located]);

  function selectSaved(savedPlace: VisitPickerPlace) {
    setSelectedSavedPlace(savedPlace);
    setSelectedGooglePlace(undefined);
    setTitle(savedPlace.name);
    setPlace(savedPlace.address);
    setPlaceId(savedPlace.placeId);
    setWishlistId(savedPlace.wishlistId);
    setGooglePlaceId(savedPlace.googlePlaceId);
    setLocation(savedPlace.location ?? null);
    if (savedPlace.location) {
      map.current?.animateToRegion(nearbyRegion(savedPlace.location, mapSize, 0.8), 350);
    }
    setSearchOpen(false);
    Keyboard.dismiss();
  }

  function selectGoogle(googlePlace: GooglePlace) {
    setWishlistId(undefined);
    setSelectedGooglePlace(googlePlace);
    setSelectedSavedPlace(undefined);
    setTitle(googlePlace.name);
    setPlace(googlePlace.address);
    setPlaceId(undefined);
    setGooglePlaceId(googlePlace.id);
    setLocation(googlePlace.location);
    map.current?.animateToRegion(nearbyRegion(googlePlace.location, mapSize, 0.8), 350);
    setSearchOpen(false);
    Keyboard.dismiss();
  }

  function chooseSavedAndProceed(savedPlace: VisitPickerPlace) {
    selectSaved(savedPlace);
    setStep(2);
  }

  function centerOnCurrentLocation() {
    setSearch('');
    setSearchOpen(false);
    setSelectedSavedPlace(undefined);
    setSelectedGooglePlace(undefined);
    Keyboard.dismiss();

    if (current.location && mapSize.width) {
      map.current?.animateToRegion(nearbyRegion(current.location, mapSize), 350);
    }

    void current.request().then((next) => {
      if (next && mapSize.width) {
        map.current?.animateToRegion(nearbyRegion(next, mapSize), 350);
      }
    });
  }

  function chooseGoogleAndProceed(googlePlace: GooglePlace) {
    selectGoogle(googlePlace);
    setStep(2);
  }

  function chooseManual(name: string) {
    setWishlistId(undefined);
    setSelectedSavedPlace(undefined);
    setSelectedGooglePlace(undefined);
    setTitle(name);
    setPlaceId(undefined);
    setGooglePlaceId(undefined);
    setPlace('');
    setLocation(null);
    setSearchOpen(false);
    Keyboard.dismiss();
    setStep(2);
  }

  function addDish() {
    const trimmed = dishInput.trim();
    if (!trimmed) return;
    if (!dishes.includes(trimmed)) {
      setDishes((prev) => [...prev, trimmed]);
    }
    setDishInput('');
  }

  function removeDish(index: number) {
    setDishes((prev) => prev.filter((_, i) => i !== index));
  }

  const create = useMutation(api.visits.create);
  const update = useMutation(api.visits.update);
  const markVisited = useMutation(api.visits.markVisited);
  const task = useTask();
  const fields = {
    title: title.trim(),
    place: place.trim(),
    date,
    notes,
    savedLink,
    showDishes: showDishes || dishes.length > 0,
    location,
  };
  const fingerprint = JSON.stringify({
    ...fields,
    ...(googlePlaceId ? { title: undefined, place: undefined, location: undefined } : {}),
    placeId,
    googlePlaceId,
    typeId,
    dishes,
    wishlistId,
    keepWishlist,
  });
  const [firstFingerprint] = useState(fingerprint);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(
    initial && !completing ? fingerprint : undefined,
  );
  const [savedVisitId, setSavedVisitId] = useState(completing ? undefined : initial?._id);
  const saveSession = useRef<VisitSaveSession<Id<'visits'>>>({
    id: completing ? undefined : initial?._id,
    revision: (initial as (Doc<'visits'> & { revision?: number }) | undefined)?.revision ?? 0,
    fingerprint: initial && !completing ? fingerprint : undefined,
    completedPhotos: new Set(),
  });
  const photoTickets = useRef(new Map<string, Id<'uploads'>>());
  const allowExit = useUnsavedChanges(
    pickedPhotos.length > 0 || fingerprint !== (lastSavedFingerprint ?? firstFingerprint),
    task.busy,
  );

  function finish(id: Id<'visits'>) {
    allowExit();
    onDone(id);
  }

  function save() {
    void task.run(async () => {
      if (date && !validDate(date)) throw new Error('Enter a valid date in YYYY-MM-DD format.');
      try {
        const id = await saveVisitWithPhotos({
          session: saveSession.current,
          fingerprint,
          photos: pickedPhotos.map((photo) => photo.uri),
          saveDetails: async (savedId, revision) => {
            if (savedId) {
              const changes = {
                ...fields,
                visitId: savedId,
                placeId,
                googlePlaceId,
                expectedRevision: revision,
                clearGooglePlace: !googlePlaceId,
              };
              await update(changes);
              setLastSavedFingerprint(fingerprint);
              return { id: savedId, revision: revision + 1 };
            }
            if (completing && initial) {
              const visitId = await markVisited({
                visitId: initial._id,
                date,
                expectedRevision: revision,
                details: { notes, dishes, savedLink },
              });
              setSavedVisitId(visitId);
              setLastSavedFingerprint(fingerprint);
              return { id: visitId, revision: revision + 1 };
            }
            const newId = await create({
              ...fields,
              boardId: params.boardId,
              planned,
              typeId,
              placeId,
              googlePlaceId,
              dishes: planned ? [] : dishes.map((dish) => dish.trim()).filter(Boolean),
              wishlistId,
              keepWishlist,
            });
            setSavedVisitId(newId);
            setLastSavedFingerprint(fingerprint);
            return { id: newId, revision: 0 };
          },
          upload: async (targetVisitId, uri, index) => {
            if (!token) throw new Error('Sign in to upload images.');
            setUploadProgress(`Uploading image ${index + 1} of ${pickedPhotos.length}…`);
            const { ticket, provider } = await resolveUpload(
              photoTickets.current.get(uri),
              async () => {
                const next = await reserve({ visitId: targetVisitId, caption: '' });
                photoTickets.current.set(uri, next);
                return next;
              },
              (uploadId) => convex.query(api.photos.uploadProvider, { uploadId }),
            );
            const response = await fetch(
              `${photoOrigin(provider)}/photos/upload?ticket=${ticket}`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
                body: new File(uri),
                signal: AbortSignal.timeout(120_000),
              },
            );
            if (!response.ok) throw new Error(uploadError(response.status));
          },
          uploaded: (uri) =>
            setPickedPhotos((photos) => photos.filter((photo) => photo.uri !== uri)),
        });
        finish(id);
      } finally {
        setUploadProgress(null);
      }
    });
  }

  if (step === 1) {
    return (
      <View style={formStyles.container}>
        <PlaceTopBar
          navigation={navigation}
          boardId={params.boardId}
          boardName={board.name}
          boards={boards}
          onBack={() => navigation.goBack()}
        />

        <View style={formStyles.headerBlock}>
          <Title>{planned ? 'Add Place to Wishlist' : 'Add Visit'}</Title>
        </View>

        <View style={formStyles.mapArea}>
          {hasMap ? (
            <MapView
              provider={PROVIDER_GOOGLE}
              ref={map}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              onLayout={({ nativeEvent: { layout } }) =>
                setMapSize({ width: layout.width, height: layout.height })
              }
              onMapReady={() => setMapReady(true)}
              onRegionChange={setRegion}
              onRegionChangeComplete={setRegion}
              onPress={() => {
                if (searchOpen) setSearchOpen(false);
                Keyboard.dismiss();
              }}
              onPanDrag={() => {
                if (searchOpen) setSearchOpen(false);
                Keyboard.dismiss();
              }}
              showsUserLocation={!!current.location}
              showsMyLocationButton={false}
              toolbarEnabled={false}
              moveOnMarkerPress={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {markers.map(({ place, diameter }) => (
                <PlaceMapMarker
                  key={place._id}
                  coordinate={place.location}
                  title={place.name}
                  diameter={diameter}
                  selected={selectedSavedPlace?._id === place._id}
                  wishlist={!!place.wishlistId}
                  onPress={() => selectSaved(place)}
                />
              ))}
              {selectedGooglePlace && (
                <PlaceMapMarker
                  key={`new:${selectedGooglePlace.id}`}
                  coordinate={selectedGooglePlace.location}
                  onPress={() => selectGoogle(selectedGooglePlace)}
                  title={selectedGooglePlace.name}
                  diameter={30}
                  selected
                  symbol="compass"
                />
              )}
            </MapView>
          ) : (
            <View style={formStyles.mapFallback}>
              <Icon source="map-marker-outline" size={48} color={colors.rust} />
              <Heading>Search or enter place</Heading>
              <Text style={[styles.muted, { textAlign: 'center' }]}>
                Search Google Places or enter the place name below to continue.
              </Text>
            </View>
          )}

          {/* Floating Search Bar */}
          <View style={formStyles.searchContainer}>
            <Searchbar
              placeholder="Search places or enter name…"
              accessibilityLabel="Search places or enter name"
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setSearchOpen(!!value.trim());
              }}
              onFocus={() => setSearchOpen(!!search.trim())}
              onSubmitEditing={() => {
                if (search.trim()) chooseManual(search.trim());
                else Keyboard.dismiss();
              }}
              returnKeyType="done"
              autoCorrect={false}
              style={formStyles.searchBar}
              inputStyle={styles.body}
              iconColor={colors.rust}
            />

            {searchOpen && !!search.trim() && (
              <View style={formStyles.dropdown}>
                <PlaceSearchResults
                  mode={planned ? 'wishlist' : 'visit'}
                  query={search}
                  saved={savedWithDistance}
                  loadingSaved={
                    placesStatus !== 'Exhausted' || (!planned && wishlistStatus !== 'Exhausted')
                  }
                  nearby={nearby.places}
                  loading={nearby.loading}
                  error={nearby.error}
                  hasLocation={!!current.location}
                  onRetry={nearby.retry}
                  onSaved={selectSaved}
                  onNew={selectGoogle}
                  onAddSaved={chooseSavedAndProceed}
                  onAddNew={chooseGoogleAndProceed}
                  onManual={() => chooseManual(search.trim())}
                />
              </View>
            )}
          </View>

          {/* GPS Locate Button */}
          {hasMap && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Center on current location"
              disabled={current.locating}
              onPress={centerOnCurrentLocation}
              style={({ pressed }) => [
                formStyles.locateButton,
                { opacity: pressed || current.locating ? 0.7 : 1 },
              ]}
            >
              {current.locating ? (
                <ActivityIndicator size="small" color={colors.rust} />
              ) : (
                <Icon source="crosshairs-gps" size={22} color={colors.rust} />
              )}
            </Pressable>
          )}

          {/* Bottom Card for Manual Title & Location */}
          {!searchOpen && (
            <View
              style={[
                formStyles.bottomSheet,
                keyboardOverlap > 0 && {
                  bottom: keyboardOverlap + 12,
                },
              ]}
            >
              <View
                style={[
                  formStyles.bottomCard,
                  keyboardOverlap > 0 && {
                    padding: 12,
                    gap: 8,
                  },
                ]}
              >
                <View style={formStyles.cardHeaderRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    {!selectedGooglePlace &&
                      (selectedSavedPlace ? (
                        <Text style={formStyles.savedBadge}>
                          {selectedSavedPlace.wishlistId ? 'WISHLIST' : 'SAVED PLACE'}
                        </Text>
                      ) : location ? (
                        <Text style={formStyles.savedBadge}>MAP PIN</Text>
                      ) : (
                        <Text style={formStyles.cardEyebrow}>VISIT TITLE</Text>
                      ))}
                    <Text style={formStyles.cardInstruction}>
                      {selectedSavedPlace || selectedGooglePlace
                        ? 'Edit title or keep venue name'
                        : 'Enter a manual title or pick on map'}
                    </Text>
                  </View>
                </View>

                {/* Manual Title TextInput */}
                <View style={formStyles.titleInputRow}>
                  <Icon
                    source="pencil-outline"
                    size={20}
                    color={title.trim() ? colors.rust : colors.muted}
                  />
                  <TextInput
                    editable={!task.busy}
                    caretHidden={keyboardHeight === 0}
                    placeholder="Enter visit or place title…"
                    placeholderTextColor={colors.muted}
                    value={title}
                    onChangeText={(value) => {
                      setTitle(value);
                      if (googlePlaceId) {
                        setWishlistId(undefined);
                        setSelectedSavedPlace(undefined);
                        setSelectedGooglePlace(undefined);
                        setGooglePlaceId(undefined);
                        setPlaceId(undefined);
                        setPlace('');
                        setLocation(null);
                      }
                    }}
                    onSubmitEditing={() => {
                      if (title.trim()) {
                        Keyboard.dismiss();
                        setStep(2);
                      }
                    }}
                    returnKeyType="next"
                    autoCorrect={false}
                    style={formStyles.manualTitleInput}
                  />
                  {!!(title || place || location || selectedSavedPlace || selectedGooglePlace) && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reset title and location"
                      onPress={() => {
                        setSelectedSavedPlace(undefined);
                        setWishlistId(undefined);
                        setSelectedGooglePlace(undefined);
                        setLocation(null);
                        setPlace('');
                        setTitle('');
                        setPlaceId(undefined);
                        setGooglePlaceId(undefined);
                        setSearch('');
                        setSearchOpen(false);
                      }}
                      hitSlop={8}
                      style={formStyles.clearBtn}
                    >
                      <Icon source="close-circle" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </View>

                {/* Place address row if location is set */}
                {!!place && (
                  <View style={formStyles.addressRow}>
                    <Icon source="map-marker" size={14} color={colors.rust} />
                    <Text style={formStyles.addressText} numberOfLines={1}>
                      {place}
                    </Text>
                  </View>
                )}

                {/* Continue button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                  accessibilityState={{ disabled: !title.trim() }}
                  disabled={!title.trim()}
                  style={[
                    formStyles.primaryActionButton,
                    !title.trim() && formStyles.primaryActionDisabled,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setStep(2);
                  }}
                >
                  <Text style={formStyles.primaryActionText}>Continue</Text>
                  <MaterialCommunityIcons
                    name="arrow-right"
                    size={18}
                    color={colors.paper}
                    style={formStyles.primaryActionIcon}
                  />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Step 2: Dishes, notes & visit details (inventive journal layout, no cards)
  return (
    <View style={formStyles.container}>
      <PhotoSourceDialog
        visible={photoSourceOpen}
        onDismiss={() => setPhotoSourceOpen(false)}
        onSelect={(source) => void pickPhoto(source)}
      />
      <PlaceTopBar
        navigation={navigation}
        boardId={params.boardId}
        boardName={board.name}
        boards={boards}
        onBack={() => {
          if (!initial) setStep(1);
          else navigation.goBack();
        }}
      />
      <Page contentContainerStyle={formStyles.pageContent}>
        <ErrorNote error={current.error} />
        {current.settingsRequired && (
          <Button
            secondary
            title="Open location settings"
            onPress={() => void current.openSettings()}
          />
        )}
        {/* Header row: Title on left + pure date text with color in corner */}
        <View style={formStyles.step2HeaderRow}>
          <Title>
            {planned
              ? initial
                ? 'Edit Wishlist Place'
                : 'Add Place to Wishlist'
              : initial && !completing
                ? 'Edit visit'
                : 'Add visit'}
          </Title>
          {!planned && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Date: ${formatDisplayDate(date)}. Tap to choose date.`}
              onPress={() => setDatePickerOpen(true)}
              hitSlop={12}
            >
              <Text style={formStyles.dateCornerText}>{formatDisplayDate(date)}</Text>
            </Pressable>
          )}
        </View>

        {!planned && (
          <DatePickerModal
            key={`${datePickerOpen}:${date}`}
            visible={datePickerOpen}
            value={date}
            onChange={setDate}
            onClose={() => setDatePickerOpen(false)}
          />
        )}

        {/* Location snippet: Small map thumbnail and name beside it. */}
        <View style={formStyles.placeSnippet}>
          {location && hasMap ? (
            <View style={formStyles.snippetMapContainer} pointerEvents="none">
              <MapView
                provider={PROVIDER_GOOGLE}
                style={formStyles.snippetMap}
                initialRegion={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.006,
                  longitudeDelta: 0.006,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                toolbarEnabled={false}
                showsCompass={false}
                showsMyLocationButton={false}
              >
                <Marker coordinate={location}>
                  <View style={formStyles.snippetPin}>
                    <Icon source="map-marker" size={13} color={colors.paper} />
                  </View>
                </Marker>
              </MapView>
            </View>
          ) : (
            <View style={formStyles.snippetMapFallback}>
              <Icon source="map-marker-outline" size={26} color={colors.rust} />
            </View>
          )}

          <View style={formStyles.snippetContent}>
            {editingTitle ? (
              <View style={formStyles.inlineTitleRow}>
                <TextInput
                  editable={!task.busy}
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    if (googlePlaceId) {
                      setWishlistId(undefined);
                      setGooglePlaceId(undefined);
                      setPlaceId(undefined);
                      setPlace('');
                      setLocation(null);
                    }
                  }}
                  autoFocus
                  style={formStyles.inlineTitleInput}
                  placeholder="Place name"
                  placeholderTextColor={colors.muted}
                  onSubmitEditing={() => setEditingTitle(false)}
                  returnKeyType="done"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Done editing name"
                  onPress={() => setEditingTitle(false)}
                  hitSlop={8}
                  style={formStyles.inlineTitleDoneBtn}
                >
                  <Icon source="check" size={15} color={colors.paper} />
                </Pressable>
              </View>
            ) : (
              <View style={formStyles.snippetTitleRow}>
                <Text style={formStyles.snippetTitle} numberOfLines={1}>
                  {title || 'Untitled place'}
                </Text>
                {!completing && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit place name"
                    onPress={() => setEditingTitle(true)}
                    hitSlop={8}
                  >
                    <Icon source="pencil-outline" size={15} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            )}

            {!!place && (
              <Text style={formStyles.snippetAddress} numberOfLines={2}>
                {place}
              </Text>
            )}

            {!completing && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change location on map"
                onPress={() => setStep(1)}
                style={formStyles.changeOnMapBtn}
              >
                <Icon source="map-marker-radius-outline" size={13} color={colors.rust} />
                <Text style={formStyles.changeOnMapText}>Change on map</Text>
              </Pressable>
            )}
          </View>
        </View>

        {wishlistId && !savedVisitId && (
          <View style={styles.row}>
            <Switch
              accessibilityLabel="Keep this place on the wishlist after logging"
              value={keepWishlist}
              onValueChange={setKeepWishlist}
              disabled={task.busy}
              trackColor={{ false: colors.border, true: colors.rust }}
              thumbColor={colors.paper}
              ios_backgroundColor={colors.border}
            />
            <Text style={[styles.body, { flex: 1 }]}>Keep on wishlist</Text>
          </View>
        )}

        {wishlistReference && (wishlistReference.dishes.length > 0 || wishlistReference.notes) && (
          <View style={styles.card}>
            <Heading>From your wishlist</Heading>
            {wishlistReference.dishes.length > 0 && (
              <View style={{ gap: 4 }}>
                <Text style={styles.label}>Dishes</Text>
                {wishlistReference.dishes.map((name, index) => (
                  <Text key={index} style={styles.muted}>
                    {name}
                  </Text>
                ))}
              </View>
            )}
            {!!wishlistReference.notes && (
              <View style={{ gap: 4 }}>
                <Text style={styles.label}>Notes</Text>
                <Text style={styles.muted}>{wishlistReference.notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Photos: Fluid horizontal gallery reel without cards */}
        {!planned && (
          <View style={formStyles.sectionBlock}>
            <View style={formStyles.sectionLabelRow}>
              <Icon source="camera-outline" size={16} color={colors.rust} />
              <Text style={formStyles.sectionLabel}>
                Images
                {(existingPhotos?.length ?? 0) + pickedPhotos.length > 0
                  ? ` · ${(existingPhotos?.length ?? 0) + pickedPhotos.length}/${MAX_PHOTOS}`
                  : ''}
              </Text>
            </View>
            {(existingPhotos?.length ?? 0) + pickedPhotos.length < MAX_PHOTOS && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add image"
                accessibilityState={{ disabled: task.busy }}
                disabled={task.busy}
                onPress={promptPhotoPicker}
                style={formStyles.addPhotoTile}
              >
                <View style={formStyles.addPhotoIconCircle}>
                  <Icon source="camera-plus-outline" size={20} color={colors.rust} />
                </View>
                <Text style={formStyles.addPhotoText}>Add image</Text>
              </Pressable>
            )}
            {(existingPhotos?.length ?? 0) + pickedPhotos.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={formStyles.photosScrollContainer}
              >
                {pickedPhotos.map((photo, index) => (
                  <View key={photo.uri} style={formStyles.photoThumbWrapper}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={formStyles.photoThumb}
                      contentFit="cover"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove image"
                      onPress={() => removePickedPhoto(index)}
                      style={formStyles.removePhotoBtn}
                      hitSlop={6}
                    >
                      <Icon source="close" size={12} color={colors.paper} />
                    </Pressable>
                  </View>
                ))}

                {existingPhotos?.map((photo) => (
                  <View key={photo._id} style={formStyles.photoThumbWrapper}>
                    <Photo
                      id={photo._id}
                      alt={photo.caption || 'Visit image'}
                      height={88}
                      style={formStyles.photoThumb}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete image"
                      onPress={() =>
                        confirm(
                          'Delete this image?',
                          () => void task.run(() => removePhoto({ photoId: photo._id })),
                        )
                      }
                      style={formStyles.removePhotoBtn}
                      hitSlop={6}
                    >
                      <Icon source="close" size={12} color={colors.paper} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {!planned && (initial || types.length > 0) && (
          <View style={formStyles.sectionBlock}>
            <View style={formStyles.sectionLabelRow}>
              <Icon source="tag-outline" size={16} color={colors.rust} />
              <Text style={formStyles.sectionLabel}>Type</Text>
            </View>
            {initial ? (
              <Text style={styles.body}>{initial.typeName}</Text>
            ) : (
              <View style={formStyles.typeRow}>
                {types.map((entry) => {
                  const active = typeId === entry._id;
                  return (
                    <Pressable
                      key={entry._id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setTypeId(entry._id);
                        setShowDishes(entry.showDishes);
                      }}
                      style={[formStyles.typePill, active && formStyles.typePillActive]}
                    >
                      <Text
                        style={[formStyles.typePillText, active && formStyles.typePillTextActive]}
                      >
                        {entry.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {!planned && (!initial || completing) && (
          <>
            {/* Dishes & Drinks: Fluid tag input and keepsake cloud */}
            <View style={formStyles.sectionBlock}>
              <View style={formStyles.sectionLabelRow}>
                <Icon source="silverware-fork-knife" size={16} color={colors.rust} />
                <Text style={formStyles.sectionLabel}>Dishes & drinks</Text>
              </View>

              <View style={formStyles.dishInputBar}>
                <TextInput
                  editable={!task.busy}
                  placeholder="What did you order?"
                  placeholderTextColor={colors.muted}
                  value={dishInput}
                  onChangeText={setDishInput}
                  onSubmitEditing={addDish}
                  returnKeyType="done"
                  style={formStyles.dishInputField}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add dish"
                  onPress={addDish}
                  disabled={!dishInput.trim()}
                  style={[formStyles.dishAddButton, !dishInput.trim() && { opacity: 0.35 }]}
                >
                  <Icon source="plus" size={18} color={colors.paper} />
                </Pressable>
              </View>

              {dishes.length > 0 && (
                <View style={formStyles.dishChipsCloud}>
                  {dishes.map((dishName, index) => (
                    <View key={`${dishName}-${index}`} style={formStyles.dishTag}>
                      <Text style={formStyles.dishTagText} numberOfLines={1}>
                        {dishName}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${dishName}`}
                        onPress={() => removeDish(index)}
                        hitSlop={8}
                        style={formStyles.dishTagRemove}
                      >
                        <Icon source="close" size={13} color={colors.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* Notes & Memories: Journal notebook canvas */}
        <View style={formStyles.sectionBlock}>
          <View style={formStyles.sectionLabelRow}>
            <Icon source="notebook-outline" size={16} color={colors.rust} />
            <Text style={formStyles.sectionLabel}>{planned ? 'Notes' : 'Notes & memories'}</Text>
          </View>
          <View style={formStyles.journalCanvas}>
            <TextInput
              editable={!task.busy}
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder={
                planned
                  ? 'Save what you want to do'
                  : 'What did you love? The table by the window, the conversation, what to order next time...'
              }
              placeholderTextColor={colors.muted}
              style={formStyles.journalInput}
              maxLength={5000}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Save button */}
        <View style={formStyles.saveArea}>
          {task.error && savedVisitId && (!initial || completing) && (
            <View style={{ gap: 8 }}>
              <Text style={styles.muted}>
                Your visit is saved. Retry the remaining images or open the visit.
              </Text>
              <Button
                secondary
                title="Open saved visit"
                disabled={task.busy}
                onPress={() =>
                  confirmDiscard(pickedPhotos.length > 0, task.busy, () => finish(savedVisitId!))
                }
              />
            </View>
          )}
          <ErrorNote error={task.error} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              task.busy
                ? 'Saving visit'
                : initial && !completing
                  ? 'Save changes'
                  : planned
                    ? 'Add to Wishlist'
                    : 'Save visit'
            }
            disabled={!title.trim() || task.busy}
            onPress={save}
            style={[
              formStyles.savePillButton,
              (!title.trim() || task.busy) && formStyles.savePillDisabled,
            ]}
          >
            <MaterialCommunityIcons
              name="check"
              size={18}
              color={colors.paper}
              style={formStyles.savePillIcon}
            />
            <Text style={formStyles.savePillText}>
              {uploadProgress ||
                (task.busy
                  ? 'Saving…'
                  : initial && !completing
                    ? 'Save changes'
                    : planned
                      ? 'Add to Wishlist'
                      : 'Save visit')}
            </Text>
          </Pressable>
        </View>
      </Page>
    </View>
  );
}

const formStyles = StyleSheet.create({
  pageContent: {
    paddingBottom: 16,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapArea: {
    flex: 1,
    position: 'relative',
  },
  searchContainer: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    zIndex: 100,
  },
  searchBar: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    zIndex: 1000,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  locateButton: {
    position: 'absolute',
    top: 80,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 20,
    left: 14,
    right: 14,
    zIndex: 50,
  },
  bottomCard: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardEyebrow: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.rust,
  },
  savedBadge: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.rust,
  },
  cardInstruction: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
  },
  titleInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  manualTitleInput: {
    flex: 1,
    fontFamily: 'JakartaSemiBold',
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 10,
  },
  clearBtn: {
    padding: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  addressText: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  primaryActionButton: {
    backgroundColor: colors.rust,
    borderRadius: 999,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionDisabled: {
    opacity: 0.5,
  },
  primaryActionText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.paper,
  },
  primaryActionIcon: {
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  headerBlock: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  mapFallback: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.coralBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedPin: {
    backgroundColor: colors.rust,
  },
  step2HeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateCornerText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.rust,
    letterSpacing: 0.1,
  },
  placeSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  snippetMapContainer: {
    width: 76,
    height: 76,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.coralLight,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  snippetMap: {
    position: 'absolute',
    top: -24,
    left: -24,
    width: 124,
    height: 124,
  },
  snippetMapFallback: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: colors.coralLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.coralBorder,
  },
  snippetPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.rust,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.paper,
  },
  snippetContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  snippetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  snippetTitle: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  inlineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineTitleInput: {
    flex: 1,
    fontFamily: 'JakartaSemiBold',
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.rust,
    paddingVertical: 2,
  },
  inlineTitleDoneBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.rust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snippetAddress: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  changeOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  changeOnMapText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
    textDecorationLine: 'underline',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  typePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typePillActive: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  typePillText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.ink,
  },
  typePillTextActive: {
    color: colors.paper,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  dishInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 6,
    height: 48,
  },
  dishInputField: {
    flex: 1,
    fontFamily: 'Jakarta',
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 0,
  },
  dishAddButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.rust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishChipsCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  dishTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coralLight,
    borderWidth: 1,
    borderColor: colors.coralBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dishTagText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.ink,
    maxWidth: 220,
  },
  dishTagRemove: {
    padding: 2,
  },
  journalCanvas: {
    backgroundColor: colors.paper,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    minHeight: 120,
  },
  journalInput: {
    fontFamily: 'Jakarta',
    fontSize: 15,
    lineHeight: 24,
    color: colors.ink,
    padding: 0,
    minHeight: 90,
  },
  saveArea: {
    paddingTop: 8,
    gap: 10,
  },
  savePillButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.rust,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  savePillDisabled: {
    opacity: 0.5,
  },
  savePillText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 16,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.paper,
  },
  savePillIcon: {
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  photosScrollContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  addPhotoTile: {
    width: '100%',
    height: 88,
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.coralBorder,
    borderStyle: 'dashed',
    backgroundColor: colors.coralLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  addPhotoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.rust,
  },
  photoThumbWrapper: {
    position: 'relative',
    width: 88,
    height: 88,
    borderRadius: 16,
    overflow: 'hidden',
  },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 16,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(27, 26, 23, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const datePickerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthTitle: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 16,
    color: colors.ink,
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekDayLabel: {
    width: '14.285%',
    textAlign: 'center',
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.muted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: '14.285%',
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
    position: 'relative',
    marginVertical: 2,
  },
  selectedDayCell: {
    backgroundColor: colors.rust,
  },
  todayDayCell: {
    borderWidth: 1,
    borderColor: colors.rust,
  },
  dayText: {
    fontFamily: 'Jakarta',
    fontSize: 14,
    color: colors.ink,
  },
  selectedDayText: {
    fontFamily: 'JakartaSemiBold',
    color: colors.paper,
  },
  todayDayText: {
    fontFamily: 'JakartaSemiBold',
    color: colors.rust,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.rust,
    position: 'absolute',
    bottom: 3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  todayActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  todayActionText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.rust,
  },
  closeActionBtn: {
    backgroundColor: colors.rust,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  closeActionText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.paper,
  },
});

const summaryStyles = StyleSheet.create({
  content: { gap: 16 },
  headerSection: { gap: 6 },
  visitLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  placeTitleLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 6,
  },
  heroTitle: {
    flex: 1,
    fontSize: 26,
    lineHeight: 34,
  },
  typeText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.muted,
  },
  menuTriggerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
  },
  dateIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: 1 }],
  },
  metaText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.muted,
    flexShrink: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.muted,
    flex: 1,
  },
  detailSection: {
    gap: 8,
  },
  notesBody: {
    paddingVertical: 12,
  },
  sectionBox: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  experienceBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  experienceBlockTitle: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  experienceBlockHint: {
    fontFamily: 'Jakarta',
    fontSize: 11,
    color: colors.muted,
  },
  dishesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    ...styles.subtitle,
    includeFontPadding: false,
    flexShrink: 1,
  },
  dishAvgBadge: {
    backgroundColor: colors.sageLight,
    borderWidth: 1,
    borderColor: colors.sageBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dishAvgText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    color: colors.green,
  },
  editDishesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editDishesBtnText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.rust,
  },
  addDishBtn: {
    minHeight: 36,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addDishBtnText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    lineHeight: 26,
    includeFontPadding: false,
    color: colors.rust,
  },
  dishesList: {
    gap: 0,
  },
  itemRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  itemRowTitle: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 15,
    color: colors.ink,
  },
  itemRowDesc: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  itemRowSub: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  pillsRow: {
    maxWidth: '58%',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.peachLight,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
  },
  ratedPillScore: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.rust,
  },
  unratedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderStyle: 'dashed',
  },
  unratedPillText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.muted,
  },
  editDishIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  emptyDishesBox: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  addFirstDishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.rust,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addFirstDishBtnText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.paper,
  },
  manageItemsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  manageItemsPillText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.muted,
  },
  typePillBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePillBtnSelected: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  typePillBtnText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.ink,
  },
  typePillBtnTextSelected: {
    color: colors.paper,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27, 26, 23, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 600,
    flexShrink: 1,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    padding: 20,
    paddingBottom: 36,
    gap: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  membersScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 420,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dishNameInput: {
    ...styles.input,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
  },
  sheetTitle: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  sheetCloseBtn: {
    padding: 4,
    borderRadius: 8,
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.sageLight,
    alignSelf: 'flex-start',
  },
  kindBadgeText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.green,
  },
  memberCard: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    flexShrink: 1,
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.ink,
  },
  noteInput: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.ink,
    minHeight: 40,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  wizardNavBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardNavBtnText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.ink,
  },
  wizardNextBtn: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.rust,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  wizardNextBtnText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.paper,
  },
  stepperProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 2,
  },
  stepperProgressText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.muted,
  },
});
