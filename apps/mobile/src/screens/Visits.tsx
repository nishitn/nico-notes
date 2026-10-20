import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { Icon, Searchbar } from 'react-native-paper';
import MapView, { Marker } from 'react-native-maps';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboard } from '../useKeyboard';
import { fetch } from 'expo/fetch';
import { useAuthToken } from '@convex-dev/auth/react';
import { useConvex, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, validDate, validScore } from '@nico-notes/backend/shared';
import type { FunctionReturnType } from 'convex/server';
import type { ScreenProps } from '../navigation';
import {
  Avatar,
  Button,
  colors,
  Card,
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
import { localDate } from '../links';
import { PlaceTopBar } from './Places';
import { useCurrentLocation } from '../useCurrentLocation';
import { usePlaceSearch } from '../usePlaceSearch';
import { PlaceSearchResults } from '../PlaceSearchResults';
import { clusterPlaces, nearbyRegion, type MapRegion, type MapSize } from '../mapGeometry';
import { distanceBetween, matchingPlaces } from '../placeSearch';
import type { SavedPlace } from '../BoardPlaces';
import type { GooglePlace } from '../../modules/google-places';
import { ScorePicker } from '../ScorePicker';

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

export function VisitScreen({ route, navigation }: ScreenProps<'Visit'>) {
  const { visitId, promptRating } = route.params;
  const data = useQuery(api.visits.get, { visitId });
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const me = useQuery(api.boards.me);
  const remove = useMutation(api.visits.remove);
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

  const overallRatings = data.ratings.filter(
    (r) => r.kind === 'overall' && r.targetId === visitId,
  );
  const overallScore = overallRatings.length
    ? overallRatings.reduce((sum, r) => sum + r.score, 0) / overallRatings.length
    : null;

  const dishRatings = data.ratings.filter((r) => r.kind === 'dish');
  const dishAvgScore = dishRatings.length
    ? dishRatings.reduce((sum, r) => sum + r.score, 0) / dishRatings.length
    : null;

  const canEdit = !!me?._id;

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

  return (
    <View style={styles.page}>
      <PlaceTopBar
        navigation={navigation}
        boardId={data.board._id}
        boardName={data.board.name}
        boards={boards}
      />
      <Page>
        {/* Main Header (Streamlined, less cards-like) */}
        <View style={summaryStyles.headerSection}>
          {/* Top Row: Title + Type badge + 3-dot Kebab Menu */}
          <View style={summaryStyles.headerTopRow}>
            <View style={summaryStyles.titleWrapper}>
              <Title style={summaryStyles.heroTitle}>{visit.title}</Title>
              {!!visit.typeName && (
                <View style={summaryStyles.typePill}>
                  <Text style={summaryStyles.typeText}>{visit.typeName}</Text>
                </View>
              )}
            </View>

            {/* 3-dot options menu */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Visit options"
              hitSlop={12}
              onPress={() => setOptionsMenuOpen(true)}
              style={({ pressed }) => [
                summaryStyles.menuTriggerBtn,
                pressed && { opacity: 0.7, backgroundColor: colors.peachLight },
              ]}
            >
              <Icon source="dots-horizontal" size={22} color={colors.ink} />
            </Pressable>
          </View>

          {/* Meta Info: Date and Location with prominent Map Icon */}
          <View style={summaryStyles.metaBlock}>
            <View style={summaryStyles.metaItem}>
              <Icon source="calendar-blank-outline" size={16} color={colors.rust} />
              <Text style={summaryStyles.metaText}>
                {visit.date ? formatDisplayDate(visit.date) : 'Undated'}
              </Text>
            </View>
            {!!visit.place && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open in Maps"
                onPress={openInMaps}
                style={({ pressed }) => [
                  summaryStyles.locationRow,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={summaryStyles.locationIconCircle}>
                  <Icon source="map-marker" size={15} color={colors.rust} />
                </View>
                <Text style={summaryStyles.locationText} numberOfLines={1}>
                  {visit.place}
                </Text>
                <Icon source="chevron-right" size={14} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Notes preview if any */}
          {!!visit.notes && (
            <View style={summaryStyles.noteBox}>
              <Icon source="format-quote-open" size={15} color={colors.rust} />
              <Text style={summaryStyles.noteText}>{visit.notes}</Text>
            </View>
          )}

          {/* Experience & Atmosphere: part of the main header */}
          <View style={summaryStyles.headerExperienceBlock}>
            <View style={summaryStyles.experienceBlockHeader}>
              <Text style={summaryStyles.experienceBlockTitle}>EXPERIENCE</Text>
              <Text style={summaryStyles.experienceBlockHint}>Tap to rate in popup</Text>
            </View>

            {/* Overall Experience */}
            <RatingSummaryRow
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
                ratings={data.ratings.filter((r) => r.kind === 'category' && r.targetId === cat._id)}
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

        {/* Dishes Section */}
        {visit.showDishes && (
          <View style={summaryStyles.dishesSection}>
            <View style={summaryStyles.dishesHeader}>
              <View style={summaryStyles.dishesTitleGroup}>
                <Heading>Dishes</Heading>
                {data.dishes.length > 0 && (
                  <View style={summaryStyles.countBadge}>
                    <Text style={summaryStyles.countBadgeText}>{data.dishes.length}</Text>
                  </View>
                )}
                {dishAvgScore !== null && (
                  <View style={summaryStyles.dishAvgBadge}>
                    <Text style={summaryStyles.dishAvgText}>
                      Avg {dishAvgScore.toFixed(1)}/10
                    </Text>
                  </View>
                )}
              </View>

              <View style={summaryStyles.dishesActionsGroup}>
                {data.dishes.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit dishes ratings"
                    onPress={() => setFoodWizardOpen(true)}
                    style={({ pressed }) => [
                      summaryStyles.editDishesBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Icon source="pencil-outline" size={14} color={colors.rust} />
                    <Text style={summaryStyles.editDishesBtnText}>Edit</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add new dish"
                  onPress={() => setAddItemModal({ visible: true, type: 'dish' })}
                  style={({ pressed }) => [
                    summaryStyles.addDishBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Icon source="plus" size={15} color={colors.paper} />
                  <Text style={summaryStyles.addDishBtnText}>Add</Text>
                </Pressable>
              </View>
            </View>

            {data.dishes.length === 0 ? (
              <View style={summaryStyles.emptyDishesBox}>
                <Text style={styles.muted}>No dishes added yet.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAddItemModal({ visible: true, type: 'dish' })}
                  style={summaryStyles.addFirstDishBtn}
                >
                  <Icon source="plus" size={16} color={colors.paper} />
                  <Text style={summaryStyles.addFirstDishBtnText}>Add what you ordered</Text>
                </Pressable>
              </View>
            ) : (
              <View style={summaryStyles.dishesList}>
                {data.dishes.map((dish) => (
                  <DishSummaryRow
                    key={dish._id}
                    dish={dish}
                    ratings={data.ratings.filter(
                      (r) => r.kind === 'dish' && r.targetId === dish._id,
                    )}
                    people={data.people}
                    isAdmin={data.isAdmin}
                    canEdit={canEdit}
                    onPress={() =>
                      setSingleRating({
                        kind: 'dish',
                        targetId: dish._id,
                        label: dish.name,
                        description: dish.description,
                      })
                    }
                    onEdit={() =>
                      setAddItemModal({
                        visible: true,
                        type: 'dish',
                        editItem: dish,
                      })
                    }
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Photos */}
        <PhotoSection
          visitId={visitId}
          photos={data.photos}
          userId={me?._id}
          isAdmin={data.isAdmin}
        />

        <ErrorNote error={task.error} />
      </Page>

      {/* POPUPS & MODALS */}

      {/* 3-Dot Options Menu Modal */}
      {optionsMenuOpen && (
        <VisitOptionsMenuModal
          visible={optionsMenuOpen}
          onClose={() => setOptionsMenuOpen(false)}
          visitTitle={visit.title}
          hasPlaceId={!!visit.placeId}
          isAdmin={data.isAdmin}
          isCreator={visit.creatorId === me?._id}
          onEditVisit={() =>
            navigation.navigate('VisitForm', { visitId, boardId: visit.boardId })
          }
          onOpenInMaps={openInMaps}
          onAllVisits={
            visit.placeId
              ? () =>
                  navigation.navigate('Place', {
                    boardId: visit.boardId,
                    placeId: visit.placeId!,
                    name: visit.title,
                  })
              : undefined
          }
          onAddCategory={
            data.isAdmin
              ? () => setAddItemModal({ visible: true, type: 'category' })
              : undefined
          }
          onDeleteVisit={
            data.isAdmin || visit.creatorId === me?._id
              ? () =>
                  confirm('Delete this visit and its ratings and photos?', () =>
                    void task.run(async () => {
                      await remove({ visitId });
                      navigation.popTo('Board', { boardId: visit.boardId });
                    }),
                  )
              : undefined
          }
        />
      )}

      {/* 1. Food-by-Food Rating Wizard */}
      {foodWizardOpen && (
        <FoodByFoodModal
          visible={foodWizardOpen}
          onClose={() => setFoodWizardOpen(false)}
          data={data}
          userId={me?._id}
          onAddDishRequested={() => {
            setAddItemModal({ visible: true, type: 'dish' });
          }}
        />
      )}

      {/* 2. Single Item Rating Modal */}
      {singleRating && (
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
      {promptOpen && (
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
  visitTitle,
  hasPlaceId,
  isAdmin,
  isCreator,
  onEditVisit,
  onOpenInMaps,
  onAllVisits,
  onAddCategory,
  onDeleteVisit,
}: {
  visible: boolean;
  onClose: () => void;
  visitTitle: string;
  hasPlaceId: boolean;
  isAdmin: boolean;
  isCreator: boolean;
  onEditVisit: () => void;
  onOpenInMaps: () => void;
  onAllVisits?: () => void;
  onAddCategory?: () => void;
  onDeleteVisit?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={optionsMenuStyles.overlay} onPress={onClose}>
        <Pressable style={optionsMenuStyles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <View style={optionsMenuStyles.sheetHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={optionsMenuStyles.sheetTitle} numberOfLines={1}>
                {visitTitle}
              </Text>
              <Text style={optionsMenuStyles.sheetSubtitle}>Visit options</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              onPress={onClose}
              style={optionsMenuStyles.closeBtn}
            >
              <Icon source="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <View style={optionsMenuStyles.menuItems}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onEditVisit();
              }}
              style={({ pressed }) => [
                optionsMenuStyles.menuItem,
                pressed && { backgroundColor: colors.peachLight },
              ]}
            >
              <View style={optionsMenuStyles.iconCircle}>
                <Icon source="pencil-outline" size={20} color={colors.rust} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={optionsMenuStyles.menuItemText}>Edit visit details</Text>
                <Text style={optionsMenuStyles.menuItemSub}>Title, date, address, type</Text>
              </View>
              <Icon source="chevron-right" size={18} color={colors.muted} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onOpenInMaps();
              }}
              style={({ pressed }) => [
                optionsMenuStyles.menuItem,
                pressed && { backgroundColor: colors.peachLight },
              ]}
            >
              <View style={optionsMenuStyles.iconCircle}>
                <Icon source="navigation-variant-outline" size={20} color={colors.rust} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={optionsMenuStyles.menuItemText}>Open in Maps</Text>
                <Text style={optionsMenuStyles.menuItemSub}>Navigate to this location</Text>
              </View>
              <Icon source="chevron-right" size={18} color={colors.muted} />
            </Pressable>

            {hasPlaceId && onAllVisits && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onAllVisits();
                }}
                style={({ pressed }) => [
                  optionsMenuStyles.menuItem,
                  pressed && { backgroundColor: colors.peachLight },
                ]}
              >
                <View style={optionsMenuStyles.iconCircle}>
                  <Icon source="history" size={20} color={colors.rust} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={optionsMenuStyles.menuItemText}>All visits to this place</Text>
                  <Text style={optionsMenuStyles.menuItemSub}>View history and stats</Text>
                </View>
                <Icon source="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            )}

            {isAdmin && onAddCategory && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onAddCategory();
                }}
                style={({ pressed }) => [
                  optionsMenuStyles.menuItem,
                  pressed && { backgroundColor: colors.peachLight },
                ]}
              >
                <View style={optionsMenuStyles.iconCircle}>
                  <Icon source="plus-circle-outline" size={20} color={colors.rust} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={optionsMenuStyles.menuItemText}>Add rating category</Text>
                  <Text style={optionsMenuStyles.menuItemSub}>e.g. Service, Ambiance</Text>
                </View>
                <Icon source="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            )}

            {(isAdmin || isCreator) && onDeleteVisit && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onDeleteVisit();
                }}
                style={({ pressed }) => [
                  optionsMenuStyles.menuItem,
                  pressed && { backgroundColor: '#fee2e2' },
                ]}
              >
                <View style={[optionsMenuStyles.iconCircle, { backgroundColor: '#fee2e2' }]}>
                  <Icon source="trash-can-outline" size={20} color={colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[optionsMenuStyles.menuItemText, { color: colors.error }]}>
                    Delete visit
                  </Text>
                  <Text style={optionsMenuStyles.menuItemSub}>Remove this visit and its ratings</Text>
                </View>
                <Icon source="chevron-right" size={18} color={colors.error} />
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RatingPill({
  name,
  image,
  score,
  canEdit,
  onPress,
}: {
  name?: string;
  image?: string;
  score?: number | null;
  canEdit?: boolean;
  onPress: () => void;
}) {
  if (score === undefined || score === null) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rate for ${name || 'member'}`}
        disabled={!canEdit}
        onPress={onPress}
        style={({ pressed }) => [
          summaryStyles.unratedPill,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Avatar name={name} image={image} size={22} />
        <Text style={summaryStyles.unratedPillText}>+ Rate</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name || 'Member'}: ${score.toFixed(1)} out of 10`}
      disabled={!canEdit}
      onPress={onPress}
      style={({ pressed }) => [
        summaryStyles.ratedPill,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Avatar name={name} image={image} size={22} />
      <Text style={summaryStyles.ratedPillScore}>{score.toFixed(1)}</Text>
    </Pressable>
  );
}

function RatingSummaryRow({
  label,
  ratings,
  people,
  canEdit,
  onPress,
}: {
  label: string;
  ratings: Doc<'ratings'>[];
  people: any[];
  canEdit: boolean;
  onPress: () => void;
}) {
  const avgScore =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ratings`}
      onPress={onPress}
      style={({ pressed }) => [
        summaryStyles.itemRow,
        pressed && { backgroundColor: colors.peachLight },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={summaryStyles.itemRowTitle}>{label}</Text>
        {avgScore !== null && ratings.length > 1 && (
          <Text style={summaryStyles.itemRowSub}>
            Avg {avgScore.toFixed(1)}/10 · {ratings.length} ratings
          </Text>
        )}
      </View>

      <View style={summaryStyles.pillsRow}>
        {ratings.map((r) => {
          const person = people.find((p) => p._id === r.userId);
          const name = person?.name ?? r.importedName ?? 'Member';
          return (
            <RatingPill
              key={r._id}
              name={name}
              image={person?.image}
              score={r.score}
              canEdit={canEdit}
              onPress={onPress}
            />
          );
        })}
        {ratings.length === 0 && (
          <RatingPill
            score={null}
            canEdit={canEdit}
            onPress={onPress}
          />
        )}
        <Icon source="chevron-right" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function DishSummaryRow({
  dish,
  ratings,
  people,
  isAdmin,
  canEdit,
  onPress,
  onEdit,
}: {
  dish: Doc<'dishes'>;
  ratings: Doc<'ratings'>[];
  people: any[];
  isAdmin: boolean;
  canEdit: boolean;
  onPress: () => void;
  onEdit: () => void;
}) {
  const avgScore =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Dish: ${dish.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        summaryStyles.itemRow,
        pressed && { backgroundColor: colors.peachLight },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={summaryStyles.itemRowTitle}>{dish.name}</Text>
        {!!dish.description && (
          <Text style={summaryStyles.itemRowDesc} numberOfLines={2}>
            {dish.description}
          </Text>
        )}
        {avgScore !== null && ratings.length > 1 && (
          <Text style={summaryStyles.itemRowSub}>
            Avg {avgScore.toFixed(1)}/10
          </Text>
        )}
      </View>

      <View style={summaryStyles.pillsRow}>
        {ratings.map((r) => {
          const person = people.find((p) => p._id === r.userId);
          const name = person?.name ?? r.importedName ?? 'Member';
          return (
            <RatingPill
              key={r._id}
              name={name}
              image={person?.image}
              score={r.score}
              canEdit={canEdit}
              onPress={onPress}
            />
          );
        })}
        {ratings.length === 0 && (
          <RatingPill
            score={null}
            canEdit={canEdit}
            onPress={onPress}
          />
        )}
        {isAdmin && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit dish ${dish.name}`}
            onPress={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            hitSlop={8}
            style={summaryStyles.editDishIconBtn}
          >
            <Icon source="pencil-outline" size={16} color={colors.muted} />
          </Pressable>
        )}
        <Icon source="chevron-right" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function FoodByFoodModal({
  visible,
  onClose,
  data,
  userId,
  onAddDishRequested,
}: {
  visible: boolean;
  onClose: () => void;
  data: VisitData;
  userId?: Id<'users'>;
  onAddDishRequested: () => void;
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
  const [drafts, setDrafts] = useState<
    Record<string, { score?: number; note: string; hasChanged: boolean }>
  >({});

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
    setDrafts(initialDrafts);
  }, [currentIndex, currentItem, rateableMembers, data.ratings]);

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={modalStyles.sheetHeader}>
            <View style={{ gap: 4, flex: 1 }}>
              <View style={modalStyles.stepperProgressRow}>
                <View style={modalStyles.kindBadge}>
                  <Text style={modalStyles.kindBadgeText}>
                    {currentItem.kind === 'dish'
                      ? 'DISH'
                      : currentItem.kind === 'category'
                      ? 'CATEGORY'
                      : 'OVERALL'}
                  </Text>
                </View>
                <Text style={modalStyles.stepperProgressText}>
                  {currentIndex + 1} of {items.length}
                </Text>
              </View>
              <Text style={modalStyles.sheetTitle}>{currentItem.name}</Text>
              {!!currentItem.description && (
                <Text style={summaryStyles.itemRowDesc}>{currentItem.description}</Text>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close rating wizard"
              hitSlop={12}
              onPress={onClose}
              style={modalStyles.sheetCloseBtn}
            >
              <Icon source="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          {/* Members rating area (scrollable) */}
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ gap: 14, paddingVertical: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {rateableMembers.map((member) => {
              const draft = drafts[member._id] || { score: undefined, note: '', hasChanged: false };
              return (
                <View key={member._id} style={modalStyles.memberCard}>
                  <View style={modalStyles.memberCardHeader}>
                    <View style={modalStyles.memberInfo}>
                      <Avatar name={member.name} image={member.image} size={32} />
                      <Text style={modalStyles.memberName}>
                        {member.name || 'Member'}
                        {member._id === userId ? ' (You)' : ''}
                      </Text>
                    </View>
                    {draft.score !== undefined && (
                      <Text style={modalStyles.memberCurrentScore}>
                        {draft.score.toFixed(1)} /10
                      </Text>
                    )}
                  </View>

                  <ScorePicker
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
          </ScrollView>

          <ErrorNote error={task.error} />

          {/* Footer Navigation */}
          <View style={modalStyles.footerActions}>
            {currentIndex > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous item"
                disabled={task.busy}
                onPress={handlePrev}
                style={modalStyles.wizardNavBtn}
              >
                <Text style={modalStyles.wizardNavBtnText}>Back</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={onAddDishRequested}
                style={modalStyles.wizardNavBtn}
              >
                <Text style={modalStyles.wizardNavBtnText}>+ Dish</Text>
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
        </Pressable>
      </Pressable>
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
  const task = useTask();

  const rateableMembers = useMemo(() => {
    if (data.isAdmin) return data.members;
    return data.members.filter((m) => m._id === userId);
  }, [data.isAdmin, data.members, userId]);

  const [drafts, setDrafts] = useState<
    Record<string, { score?: number; note: string; hasChanged: boolean }>
  >({});

  useEffect(() => {
    const initialDrafts: Record<string, { score?: number; note: string; hasChanged: boolean }> = {};
    for (const member of rateableMembers) {
      const existing = data.ratings.find(
        (r) =>
          r.kind === item.kind &&
          r.targetId === item.targetId &&
          r.userId === member._id,
      );
      initialDrafts[member._id] = {
        score: existing?.score,
        note: existing?.note || '',
        hasChanged: false,
      };
    }
    setDrafts(initialDrafts);
  }, [item, rateableMembers, data.ratings]);

  function handleSave() {
    void task.run(async () => {
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
        }
      }
      onClose();
    });
  }

  function handleClear() {
    void task.run(async () => {
      for (const member of rateableMembers) {
        await saveRating({
          visitId: data.visit._id,
          kind: item.kind,
          targetId: item.targetId,
          score: null,
          note: '',
          userId: member._id,
        });
      }
      onClose();
    });
  }

  const hasAnyRating = Object.values(drafts).some((d) => d.score !== undefined);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={modalStyles.sheetHeader}>
            <View style={{ gap: 4, flex: 1 }}>
              <View style={modalStyles.kindBadge}>
                <Text style={modalStyles.kindBadgeText}>
                  {item.kind === 'dish'
                    ? 'DISH RATING'
                    : item.kind === 'category'
                    ? 'CATEGORY RATING'
                    : 'OVERALL RATING'}
                </Text>
              </View>
              <Text style={modalStyles.sheetTitle}>{item.label}</Text>
              {!!item.description && (
                <Text style={summaryStyles.itemRowDesc}>{item.description}</Text>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close rating"
              hitSlop={12}
              onPress={onClose}
              style={modalStyles.sheetCloseBtn}
            >
              <Icon source="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          {/* Members rating cards */}
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ gap: 14, paddingVertical: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {rateableMembers.map((member) => {
              const draft = drafts[member._id] || { score: undefined, note: '', hasChanged: false };
              return (
                <View key={member._id} style={modalStyles.memberCard}>
                  <View style={modalStyles.memberCardHeader}>
                    <View style={modalStyles.memberInfo}>
                      <Avatar name={member.name} image={member.image} size={32} />
                      <Text style={modalStyles.memberName}>
                        {member.name || 'Member'}
                        {member._id === userId ? ' (You)' : ''}
                      </Text>
                    </View>
                    {draft.score !== undefined && (
                      <Text style={modalStyles.memberCurrentScore}>
                        {draft.score.toFixed(1)} /10
                      </Text>
                    )}
                  </View>

                  <ScorePicker
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
          </ScrollView>

          <ErrorNote error={task.error} />

          {/* Footer buttons */}
          <View style={modalStyles.footerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              disabled={task.busy}
              style={modalStyles.wizardNavBtn}
            >
              <Text style={modalStyles.wizardNavBtnText}>Cancel</Text>
            </Pressable>

            {hasAnyRating && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear rating"
                disabled={task.busy}
                onPress={handleClear}
                style={[modalStyles.wizardNavBtn, { borderColor: colors.coralBorder }]}
              >
                <Text style={[modalStyles.wizardNavBtnText, { color: colors.rust }]}>Clear</Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save rating"
              disabled={task.busy}
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
        </Pressable>
      </Pressable>
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

  const [itemType, setItemType] = useState<'dish' | 'category'>(
    editItem ? (editItem.description !== undefined ? 'dish' : 'category') : type,
  );
  const [name, setName] = useState(editItem?.name ?? '');
  const [description, setDescription] = useState(editItem?.description ?? '');

  function handleSave() {
    void task.run(async () => {
      const cleanName = name.trim();
      if (!cleanName) return;
      if (itemType === 'dish') {
        await saveDish({
          visitId,
          id: editItem ? (editItem._id as Id<'dishes'>) : undefined,
          name: cleanName,
          description: description.trim(),
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.centerModalOverlay} onPress={onClose}>
        <Pressable style={modalStyles.centerModalDialog} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>
              {editItem
                ? `Edit ${itemType === 'dish' ? 'Dish' : 'Category'}`
                : `Add ${itemType === 'dish' ? 'Dish' : 'Category'}`}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={modalStyles.sheetCloseBtn}>
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
            label={itemType === 'dish' ? 'Dish name' : 'Category name'}
            placeholder={itemType === 'dish' ? 'e.g. Cacio e Pepe' : 'e.g. Service'}
            value={name}
            onChangeText={setName}
            maxLength={120}
          />

          {itemType === 'dish' && (
            <Field
              label="Description (optional)"
              placeholder="e.g. House-made tonnarelli, pecorino romano"
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />
          )}

          <ErrorNote error={task.error} />

          <View style={{ gap: 8, marginTop: 4 }}>
            <Button
              title={editItem ? 'Save changes' : 'Add item'}
              disabled={task.busy || !name.trim()}
              onPress={handleSave}
            />
            {editItem && isAdmin && (
              <Button
                title="Remove item"
                secondary
                disabled={task.busy}
                onPress={handleDelete}
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <View style={modalStyles.centerModalOverlay}>
        <View style={modalStyles.centerModalDialog}>
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
        </View>
      </View>
    </Modal>
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
      types={board.types}
      board={board.board}
      boards={boards}
      navigation={navigation}
      params={route.params}
      onDone={(id) => {
        if (visitId) navigation.goBack();
        else navigation.replace('Visit', { visitId: id, promptRating: true });
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={datePickerStyles.overlay} onPress={onClose}>
        <Pressable style={datePickerStyles.dialog} onPress={(e) => e.stopPropagation()}>
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
            <Text style={datePickerStyles.monthTitle}>
              {monthNames[month]} {year}
            </Text>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function VisitForm({
  initial,
  existingPhotos,
  types,
  board,
  boards,
  navigation,
  params,
  onDone,
}: {
  initial?: Doc<'visits'>;
  existingPhotos?: { _id: Id<'photos'>; caption: string; uploaderId: Id<'users'> }[];
  types: Doc<'visitTypes'>[];
  board: Doc<'boards'>;
  boards: {
    results: any[];
    status: string;
    loadMore: (numItems: number) => void;
  };
  navigation: ScreenProps<'VisitForm'>['navigation'];
  params: ScreenProps<'VisitForm'>['route']['params'];
  onDone: (id: Id<'visits'>) => void;
}) {
  const [step, setStep] = useState<1 | 2>(initial || (params.title && params.placeId) ? 2 : 1);

  const token = useAuthToken();
  const convex = useConvex();
  const reserve = useMutation(api.photos.reserve);
  const removePhoto = useMutation(api.photos.remove);

  const [title, setTitle] = useState(initial?.title ?? params.title ?? '');
  const [place, setPlace] = useState(initial?.place ?? params.place ?? '');
  const [placeId, setPlaceId] = useState<Id<'places'> | undefined>(
    initial?.placeId ?? params.placeId,
  );
  const [googlePlaceId, setGooglePlaceId] = useState<string | undefined>(
    initial?.googlePlaceId ?? params.googlePlaceId,
  );
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(
    initial?.location ?? params.location ?? null,
  );
  const [date, setDate] = useState(initial?.date ?? localDate());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickedPhotos, setPickedPhotos] = useState<{ uri: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [typeId, setTypeId] = useState<Id<'visitTypes'> | undefined>(
    initial
      ? (types.find((entry) => entry.name === initial.typeName)?._id ?? types[0]?._id)
      : types[0]?._id,
  );
  const type = types.find((entry) => entry._id === typeId);
  const [showDishes, setShowDishes] = useState(initial?.showDishes ?? type?.showDishes ?? true);
  const [dishes, setDishes] = useState<string[]>([]);
  const [dishInput, setDishInput] = useState('');

  async function pickPhoto(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission required', 'Allow camera access in settings to take a photo.');
          return;
        }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
            allowsMultipleSelection: true,
          });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const remainingSlots = MAX_PHOTOS - (existingPhotos?.length ?? 0) - pickedPhotos.length;
      if (remainingSlots <= 0) {
        Alert.alert('Limit reached', `You can add up to ${MAX_PHOTOS} photos per visit.`);
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
          Alert.alert('File too large', 'Please choose photos smaller than 10 MB.');
          continue;
        }
        convertedPhotos.push({ uri: converted.uri });
      }

      if (convertedPhotos.length > 0) {
        setPickedPhotos((prev) => [...prev, ...convertedPhotos]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not select photo.');
    }
  }

  function promptPhotoPicker() {
    const currentTotal = (existingPhotos?.length ?? 0) + pickedPhotos.length;
    if (currentTotal >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_PHOTOS} photos per visit.`);
      return;
    }
    Alert.alert('Add photo', 'Take a photo or choose from library', [
      { text: 'Take Photo', onPress: () => void pickPhoto(true) },
      { text: 'Choose from Library', onPress: () => void pickPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function removePickedPhoto(index: number) {
    setPickedPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  // Step 1: Map and search state
  const insets = useSafeAreaInsets();
  const { keyboardHeight } = useKeyboard();
  const keyboardOverlap = Math.max(0, keyboardHeight - insets.bottom);
  const hasMap = Platform.OS === 'ios' || Constants.expoConfig?.extra?.hasAndroidMapsKey;
  const current = useCurrentLocation(!!hasMap);
  const [search, setSearch] = useState(params.title ?? '');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSavedPlace, setSelectedSavedPlace] = useState<SavedPlace | undefined>();
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

  const filtered = useMemo(
    () => matchingPlaces(placesQuery.results, search),
    [placesQuery.results, search],
  );
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

  const clusters = useMemo(
    () => clusterPlaces(located, region, mapSize),
    [located, region, mapSize],
  );

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

  function selectSaved(savedPlace: SavedPlace) {
    setSelectedSavedPlace(savedPlace);
    setSelectedGooglePlace(undefined);
    setTitle(savedPlace.name);
    setPlace(savedPlace.address);
    setPlaceId(savedPlace._id);
    setGooglePlaceId(undefined);
    if (savedPlace.location) {
      setLocation(savedPlace.location);
      map.current?.animateToRegion(nearbyRegion(savedPlace.location, mapSize, 0.8), 350);
    }
    setSearchOpen(false);
    Keyboard.dismiss();
  }

  function selectGoogle(googlePlace: GooglePlace) {
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

  function chooseSavedAndProceed(savedPlace: SavedPlace) {
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
    setSelectedSavedPlace(undefined);
    setSelectedGooglePlace(undefined);
    setTitle(name);
    setSearchOpen(false);
    Keyboard.dismiss();
    setStep(2);
  }

  function selectCluster(cluster: (typeof clusters)[number]) {
    setSearchOpen(false);
    Keyboard.dismiss();
    const first = cluster.places[0].location;
    const samePoint = cluster.places.every(
      (p) =>
        Math.abs(p.location.latitude - first.latitude) < 0.00001 &&
        Math.abs(p.location.longitude - first.longitude) < 0.00001,
    );
    if (samePoint || region.latitudeDelta < 0.0003) {
      selectSaved(cluster.places[0]);
      return;
    }
    map.current?.animateToRegion(
      {
        ...cluster.coordinate,
        latitudeDelta: region.latitudeDelta / 2.5,
        longitudeDelta: region.longitudeDelta / 2.5,
      },
      350,
    );
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
  const task = useTask();

  function save() {
    void task.run(async () => {
      if (date && !validDate(date)) throw new Error('Enter a valid date in YYYY-MM-DD format.');
      const fields = {
        title: title.trim(),
        place: place.trim(),
        date,
        notes,
        showDishes,
        location,
      };
      let targetVisitId: Id<'visits'>;
      if (initial) {
        await update({ ...fields, visitId: initial._id, placeId, googlePlaceId });
        targetVisitId = initial._id;
      } else {
        targetVisitId = await create({
          ...fields,
          boardId: params.boardId,
          typeId,
          placeId,
          googlePlaceId,
          dishes: dishes.map((d) => d.trim()).filter(Boolean),
        });
      }

      // Upload any newly picked photos
      if (pickedPhotos.length > 0) {
        if (!token) throw new Error('Sign in to upload photos.');
        for (let i = 0; i < pickedPhotos.length; i++) {
          const photo = pickedPhotos[i];
          setUploadProgress(`Uploading photo ${i + 1} of ${pickedPhotos.length}…`);
          const ticket = await reserve({ visitId: targetVisitId, caption: '' });
          const provider = await convex.query(api.photos.uploadProvider, { uploadId: ticket });
          const response = await fetch(`${photoOrigin(provider)}/photos/upload?ticket=${ticket}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
            body: new File(photo.uri),
            signal: AbortSignal.timeout(120_000),
          });
          if (!response.ok) {
            throw new Error('Photo upload failed. Check connection and retry.');
          }
        }
        setUploadProgress(null);
      }

      onDone(targetVisitId);
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
          <Title>Add visit</Title>
        </View>

        <View style={formStyles.mapArea}>
          {hasMap ? (
            <MapView
              ref={map}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              onLayout={({ nativeEvent: { layout } }) =>
                setMapSize({ width: layout.width, height: layout.height })
              }
              onMapReady={() => setMapReady(true)}
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
              {clusters.map((cluster) =>
                cluster.places.length > 1 ? (
                  <Marker
                    key={`cluster:${cluster.id}`}
                    coordinate={cluster.coordinate}
                    onPress={() => selectCluster(cluster)}
                    accessibilityLabel={`${cluster.places.length} places`}
                  >
                    <View style={formStyles.cluster}>
                      <Text style={formStyles.clusterCount}>{cluster.places.length}</Text>
                    </View>
                  </Marker>
                ) : (
                  <Marker
                    key={cluster.places[0]._id}
                    coordinate={cluster.places[0].location}
                    onPress={() => selectSaved(cluster.places[0])}
                    accessibilityLabel={cluster.places[0].name}
                  >
                    <View
                      style={[
                        formStyles.pin,
                        selectedSavedPlace?._id === cluster.places[0]._id && formStyles.selectedPin,
                      ]}
                    >
                      <Icon
                        source="heart"
                        size={15}
                        color={
                          selectedSavedPlace?._id === cluster.places[0]._id
                            ? colors.paper
                            : colors.rust
                        }
                      />
                    </View>
                  </Marker>
                ),
              )}
              {selectedGooglePlace && (
                <Marker
                  key={`new:${selectedGooglePlace.id}`}
                  coordinate={selectedGooglePlace.location}
                  onPress={() => selectGoogle(selectedGooglePlace)}
                  accessibilityLabel={selectedGooglePlace.name}
                >
                  <View style={[formStyles.pin, formStyles.selectedPin]}>
                    <Icon source="compass-outline" size={16} color={colors.paper} />
                  </View>
                </Marker>
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
                  query={search}
                  saved={savedWithDistance}
                  loadingSaved={placesQuery.status !== 'Exhausted'}
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
                    {selectedGooglePlace ? (
                      <Text style={formStyles.newBadge}>GOOGLE MAPS PLACE</Text>
                    ) : selectedSavedPlace ? (
                      <Text style={formStyles.savedBadge}>SAVED PLACE</Text>
                    ) : location ? (
                      <Text style={formStyles.savedBadge}>MAP PIN</Text>
                    ) : (
                      <Text style={formStyles.cardEyebrow}>VISIT TITLE</Text>
                    )}
                    <Text style={formStyles.cardInstruction}>
                      {selectedSavedPlace || selectedGooglePlace
                        ? 'Edit title or keep venue name'
                        : 'Enter a manual title or pick on map'}
                    </Text>
                  </View>
                  {(selectedSavedPlace || selectedGooglePlace || location || title) && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reset title and location"
                      onPress={() => {
                        setSelectedSavedPlace(undefined);
                        setSelectedGooglePlace(undefined);
                        setLocation(null);
                        setPlace('');
                        setTitle('');
                        setPlaceId(undefined);
                        setGooglePlaceId(undefined);
                      }}
                      style={formStyles.clearLocationBtn}
                    >
                      <Text style={formStyles.clearLocationText}>Reset</Text>
                    </Pressable>
                  )}
                </View>

                {/* Manual Title TextInput */}
                <View style={formStyles.titleInputRow}>
                  <Icon
                    source="pencil-outline"
                    size={20}
                    color={title.trim() ? colors.rust : colors.muted}
                  />
                  <TextInput
                    placeholder="Enter visit or place title…"
                    placeholderTextColor={colors.muted}
                    value={title}
                    onChangeText={setTitle}
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
                  {!!title && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear title"
                      onPress={() => setTitle('')}
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
                  accessibilityLabel="Add visit"
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
                  <Icon source="plus" size={18} color={colors.paper} />
                  <Text style={formStyles.primaryActionText}>
                    {title.trim() ? 'Add visit' : 'Enter title to continue'}
                  </Text>
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
      <Page>
        {/* Header row: Title on left + pure date text with color in corner */}
        <View style={formStyles.step2HeaderRow}>
          <Title>{initial ? 'Edit visit' : 'Add visit'}</Title>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Date: ${formatDisplayDate(date)}. Tap to choose date.`}
            onPress={() => setDatePickerOpen(true)}
            hitSlop={12}
          >
            <Text style={formStyles.dateCornerText}>{formatDisplayDate(date)}</Text>
          </Pressable>
        </View>

        <DatePickerModal
          key={`${datePickerOpen}:${date}`}
          visible={datePickerOpen}
          value={date}
          onChange={setDate}
          onClose={() => setDatePickerOpen(false)}
        />

        {/* Location snippet: Small map thumbnail and name beside it (logos & toolbar removed) */}
        <View style={formStyles.placeSnippet}>
          {location && hasMap ? (
            <View style={formStyles.snippetMapContainer} pointerEvents="none">
              <MapView
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
                  value={title}
                  onChangeText={setTitle}
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit place name"
                  onPress={() => setEditingTitle(true)}
                  hitSlop={8}
                >
                  <Icon source="pencil-outline" size={15} color={colors.muted} />
                </Pressable>
              </View>
            )}

            {!!place && (
              <Text style={formStyles.snippetAddress} numberOfLines={2}>
                {place}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change location on map"
              onPress={() => setStep(1)}
              style={formStyles.changeOnMapBtn}
            >
              <Icon source="map-marker-radius-outline" size={13} color={colors.rust} />
              <Text style={formStyles.changeOnMapText}>Change on map</Text>
            </Pressable>
          </View>
        </View>

        {/* Visit Type: Sleek pill buttons directly on canvas */}
        {types.length > 0 && (
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
                  <Text style={[formStyles.typePillText, active && formStyles.typePillTextActive]}>
                    {entry.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Photos: Fluid horizontal gallery reel without cards */}
        <View style={formStyles.sectionBlock}>
          <View style={formStyles.sectionLabelRow}>
            <Icon source="camera-outline" size={16} color={colors.rust} />
            <Text style={formStyles.sectionLabel}>
              Photos
              {(existingPhotos?.length ?? 0) + pickedPhotos.length > 0
                ? ` · ${(existingPhotos?.length ?? 0) + pickedPhotos.length}/${MAX_PHOTOS}`
                : ''}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={formStyles.photosScrollContainer}
          >
            {(existingPhotos?.length ?? 0) + pickedPhotos.length < MAX_PHOTOS && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add photo"
                onPress={promptPhotoPicker}
                style={formStyles.addPhotoTile}
              >
                <View style={formStyles.addPhotoIconCircle}>
                  <Icon source="camera-plus-outline" size={20} color={colors.rust} />
                </View>
                <Text style={formStyles.addPhotoText}>Add photo</Text>
              </Pressable>
            )}

            {pickedPhotos.map((photo, index) => (
              <View key={photo.uri} style={formStyles.photoThumbWrapper}>
                <Image
                  source={{ uri: photo.uri }}
                  style={formStyles.photoThumb}
                  contentFit="cover"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
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
                  alt={photo.caption || 'Visit photo'}
                  height={88}
                  style={formStyles.photoThumb}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete photo"
                  onPress={() =>
                    confirm(
                      'Delete this photo?',
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
        </View>

        {/* Dishes & Drinks: Fluid tag input and keepsake cloud */}
        <View style={formStyles.sectionBlock}>
          <View style={formStyles.sectionLabelRow}>
            <Icon source="silverware-fork-knife" size={16} color={colors.rust} />
            <Text style={formStyles.sectionLabel}>Dishes & drinks</Text>
          </View>

          <View style={formStyles.dishInputBar}>
            <TextInput
              placeholder="What did you order? (e.g. Filter Coffee)"
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

        {/* Notes & Memories: Journal notebook canvas */}
        <View style={formStyles.sectionBlock}>
          <View style={formStyles.sectionLabelRow}>
            <Icon source="notebook-outline" size={16} color={colors.rust} />
            <Text style={formStyles.sectionLabel}>Notes & memories</Text>
          </View>
          <View style={formStyles.journalCanvas}>
            <TextInput
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder="What did you love? The table by the window, the conversation, what to order next time..."
              placeholderTextColor={colors.muted}
              style={formStyles.journalInput}
              maxLength={5000}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Save button */}
        <View style={formStyles.saveArea}>
          <ErrorNote error={task.error} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              task.busy ? 'Saving visit' : initial ? 'Save changes' : 'Save visit'
            }
            disabled={!title.trim() || task.busy}
            onPress={save}
            style={[
              formStyles.savePillButton,
              (!title.trim() || task.busy) && formStyles.savePillDisabled,
            ]}
          >
            <Icon source="check" size={18} color={colors.paper} />
            <Text style={formStyles.savePillText}>
              {uploadProgress || (task.busy ? 'Saving…' : initial ? 'Save changes' : 'Save visit')}
            </Text>
          </Pressable>
        </View>
      </Page>
    </View>
  );
}

const formStyles = StyleSheet.create({
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
  newBadge: {
    ...styles.eyebrow,
    color: colors.green,
    fontSize: 9,
    marginBottom: 2,
  },
  cardInstruction: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
  },
  clearLocationBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.coralLight,
    borderWidth: 1,
    borderColor: colors.coralBorder,
  },
  clearLocationText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    color: colors.rust,
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
    color: colors.paper,
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
  cluster: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: colors.rust,
    borderWidth: 2.5,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: {
    fontFamily: 'JakartaSemiBold',
    color: colors.paper,
    fontSize: 13,
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
    paddingBottom: 24,
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
    color: colors.paper,
  },
  photosScrollContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  addPhotoTile: {
    width: 88,
    height: 88,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.coralBorder,
    borderStyle: 'dashed',
    backgroundColor: colors.coralLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
    fontSize: 11,
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27, 26, 23, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.paper,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
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
  headerSection: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroTitle: {
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    letterSpacing: -0.6,
  },
  typePill: {
    backgroundColor: colors.sageLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.sageBorder,
  },
  typeText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.green,
  },
  menuTriggerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaBlock: {
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.muted,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.peachLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.rust,
    flex: 1,
  },
  noteBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.peachBorder,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
    fontStyle: 'italic',
    flex: 1,
  },
  headerExperienceBlock: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
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
  dishesSection: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dishesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dishesTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  countBadge: {
    backgroundColor: colors.peachLight,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    color: colors.rust,
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
  dishesActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.rust,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addDishBtnText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.paper,
  },
  dishesList: {
    gap: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
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

const optionsMenuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27, 26, 23, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
    color: colors.ink,
  },
  sheetSubtitle: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItems: {
    gap: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.peachLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 15,
    color: colors.ink,
  },
  menuItemSub: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
    marginTop: 1,
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
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 10,
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
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberName: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.ink,
  },
  memberCurrentScore: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.rust,
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
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(27, 26, 23, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centerModalDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.paper,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
});

