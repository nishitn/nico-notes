import { useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';
import * as Location from 'expo-location';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { validDate, validScore } from '@nico-notes/backend/shared';
import type { FunctionReturnType } from 'convex/server';
import type { ScreenProps } from '../navigation';
import {
  Avatar,
  Button,
  colors,
  SectionCard,
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
import { PhotoSection } from '../photos';
import { localDate } from '../links';

type VisitData = FunctionReturnType<typeof api.visits.get>;
export function VisitScreen({ route, navigation }: ScreenProps<'Visit'>) {
  const { visitId } = route.params;
  const data = useQuery(api.visits.get, { visitId });
  const me = useQuery(api.boards.me);
  const remove = useMutation(api.visits.remove);
  const task = useTask();
  if (!data) return <Loading />;
  const { visit } = data;
  return (
    <Page>
      <View
        style={{ gap: 14, paddingBottom: 24, borderBottomWidth: 1, borderColor: colors.border }}
      >
        <Text style={styles.eyebrow}>{data.board.name.toUpperCase()}</Text>
        <Title>{visit.title}</Title>
        <View style={styles.row}>
          <Text
            style={{
              ...styles.muted,
              backgroundColor: colors.sageLight,
              color: colors.green,
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            {visit.typeName}
          </Text>
          <Text style={styles.muted}>{visit.date || 'Undated'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
          <Icon source="map-marker-outline" size={18} color={colors.muted} />
          <Text style={[styles.muted, { flex: 1 }]}>{visit.place || 'Location not recorded'}</Text>
        </View>
      </View>
      {!!visit.notes && (
        <Card>
          <Text style={styles.body}>{visit.notes}</Text>
        </Card>
      )}
      <View style={styles.row}>
        <Button
          title="Edit visit"
          secondary
          onPress={() => navigation.navigate('VisitForm', { visitId, boardId: visit.boardId })}
        />
        <Button
          title="Open in Maps"
          secondary
          onPress={() =>
            void task.run(() =>
              Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.location ? `${visit.location.latitude},${visit.location.longitude}` : `${visit.title} ${visit.place}`)}${visit.googlePlaceId ? `&query_place_id=${encodeURIComponent(visit.googlePlaceId)}` : ''}`,
              ),
            )
          }
        />
        {visit.placeId && (
          <Button
            secondary
            title="All visits here"
            onPress={() =>
              navigation.navigate('Place', {
                boardId: visit.boardId,
                placeId: visit.placeId!,
                name: visit.title,
              })
            }
          />
        )}
      </View>
      <Heading>Your ratings</Heading>
      <RatingEditor
        key={`${visitId}:overall`}
        data={data}
        userId={me?._id}
        kind="overall"
        targetId={visitId}
        label="Overall"
      />
      {data.categories.map((category) => (
        <RatingEditor
          key={category._id}
          data={data}
          userId={me?._id}
          kind="category"
          targetId={category._id}
          label={category.name}
        />
      ))}
      {visit.showDishes && (
        <>
          <Heading>Dishes</Heading>
          {data.dishes.map((dish) => (
            <RatingEditor
              key={dish._id}
              data={data}
              userId={me?._id}
              kind="dish"
              targetId={dish._id}
              label={dish.name}
            />
          ))}
        </>
      )}
      <ItemEditor
        visitId={visitId}
        isAdmin={data.isAdmin}
        categories={data.categories}
        dishes={data.dishes}
        showDishes={visit.showDishes}
      />
      <PhotoSection
        visitId={visitId}
        photos={data.photos}
        userId={me?._id}
        isAdmin={data.isAdmin}
      />
      {(data.isAdmin || visit.creatorId === me?._id) && (
        <Button
          title="Delete visit"
          secondary
          disabled={task.busy}
          onPress={() =>
            confirm(
              'Delete this visit and its ratings and photos?',
              () =>
                void task.run(async () => {
                  await remove({ visitId });
                  navigation.popTo('Board', { boardId: visit.boardId });
                }),
            )
          }
        />
      )}
      <ErrorNote error={task.error} />
    </Page>
  );
}
function RatingEditor({
  data,
  userId,
  kind,
  targetId,
  label,
}: {
  data: VisitData;
  userId?: Id<'users'>;
  kind: 'overall' | 'category' | 'dish';
  targetId: Id<'visits'> | Id<'categories'> | Id<'dishes'>;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [forUser, setForUser] = useState<Id<'users'>>();
  const selectedUser = forUser ?? userId;
  const ratings = data.ratings.filter(
    (rating) => rating.kind === kind && rating.targetId === targetId,
  );
  const mine = ratings.find((rating) => rating.userId === selectedUser);
  const [score, setScore] = useState<string>();
  const [note, setNote] = useState<string>();
  const save = useMutation(api.ratings.save);
  const task = useTask();
  return (
    <Card>
      <View style={styles.sectionRow}>
        <Heading>{label}</Heading>
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing(!editing)}
          style={styles.textButton}
        >
          <Icon source={editing ? 'close' : 'pencil-outline'} size={17} color={colors.rust} />
          <Text style={styles.link}>{editing ? 'Close' : 'Rate'}</Text>
        </Pressable>
      </View>
      {ratings.length === 0 && (
        <Text style={styles.muted}>No ratings yet. Add the first little note.</Text>
      )}
      {ratings.map((rating) => {
        const person = data.people.find((p) => p._id === rating.userId);
        const name = person?.name ?? rating.importedName ?? 'Member';
        const canEdit = !!rating.userId && (data.isAdmin || rating.userId === userId);
        return (
          <View
            key={rating._id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingTop: 12,
              borderTopWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Avatar name={name} size={34} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.label}>{name}</Text>
              {!!rating.note && <Text style={styles.muted}>{rating.note}</Text>}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${rating.score} out of 10${canEdit ? ', edit rating' : ''}`}
              disabled={!canEdit}
              onPress={() => {
                setForUser(rating.userId);
                setScore(undefined);
                setNote(undefined);
                setEditing(true);
              }}
              style={{
                backgroundColor: colors.peachLight,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                minHeight: 44,
              }}
            >
              <Text style={styles.link}>{rating.score.toFixed(1)} /10</Text>
            </Pressable>
          </View>
        );
      })}
      {editing && (
        <>
          {data.isAdmin && (
            <ScrollView horizontal>
              <View style={styles.row}>
                {data.members.map((person) => (
                  <Button
                    key={person._id}
                    secondary={selectedUser !== person._id}
                    title={person.name}
                    disabled={task.busy}
                    onPress={() => {
                      setForUser(person._id);
                      setScore(undefined);
                      setNote(undefined);
                    }}
                  />
                ))}
              </View>
            </ScrollView>
          )}
          <Field
            label={
              data.isAdmin
                ? 'Selected member’s score (1–10, half points)'
                : 'Your score (1–10, half points)'
            }
            keyboardType="decimal-pad"
            value={score ?? (mine ? String(mine.score) : '')}
            onChangeText={setScore}
            placeholder="8.5"
          />
          <Field
            label="Rating note"
            value={note ?? mine?.note ?? ''}
            onChangeText={setNote}
            maxLength={1000}
          />
          <ErrorNote error={task.error} />
          <View style={styles.row}>
            <Button
              title="Save rating"
              disabled={task.busy || !selectedUser}
              onPress={() =>
                void task.run(async () => {
                  const value = Number(score ?? mine?.score ?? '');
                  if (!validScore(value))
                    throw new Error('Use a score from 1 to 10 in half-point steps.');
                  await save({
                    visitId: data.visit._id,
                    kind,
                    targetId,
                    score: value,
                    note: note ?? mine?.note ?? '',
                    userId: selectedUser,
                  });
                  setScore(undefined);
                  setNote(undefined);
                  setEditing(false);
                })
              }
            />
            {mine && (
              <Button
                secondary
                title="Clear rating"
                disabled={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    await save({
                      visitId: data.visit._id,
                      kind,
                      targetId,
                      score: null,
                      note: '',
                      userId: selectedUser,
                    });
                    setScore(undefined);
                    setNote(undefined);
                  })
                }
              />
            )}
          </View>
        </>
      )}
    </Card>
  );
}
function ItemEditor({
  visitId,
  isAdmin,
  categories,
  dishes,
  showDishes,
}: {
  visitId: Id<'visits'>;
  isAdmin: boolean;
  categories: Doc<'categories'>[];
  dishes: Doc<'dishes'>[];
  showDishes: boolean;
}) {
  const saveCategory = useMutation(api.items.saveCategory);
  const saveDish = useMutation(api.items.saveDish);
  const remove = useMutation(api.items.remove);
  const [name, setName] = useState('');
  const [dish, setDish] = useState(false);
  const [editId, setEditId] = useState<Id<'categories'> | Id<'dishes'>>();
  const [description, setDescription] = useState('');
  const task = useTask();
  return (
    <Card>
      <Heading>Categories & dishes</Heading>
      {[
        ...categories.map((item) => ({ ...item, dish: false, description: '' })),
        ...dishes.map((item) => ({ ...item, dish: true })),
      ].map((item) => (
        <View key={item._id} style={{ gap: 6 }}>
          <Text style={styles.body}>
            {item.name}
            {item.description ? ` · ${item.description}` : ''}
          </Text>
          <View style={styles.row}>
            <Button
              secondary
              title="Rename"
              disabled={task.busy}
              onPress={() => {
                setEditId(item._id);
                setName(item.name);
                setDish(item.dish);
                setDescription(item.description);
              }}
            />
            {isAdmin && (
              <Button
                secondary
                title="Remove"
                disabled={task.busy}
                onPress={() =>
                  confirm(
                    `Remove ${item.name} and its ratings?`,
                    () =>
                      void task.run(() => remove({ visitId, target: item._id, confirmed: true })),
                  )
                }
              />
            )}
          </View>
        </View>
      ))}
      <Field
        label={editId ? 'Edit item name' : 'New item name'}
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      {showDishes && !editId && (
        <View style={styles.row}>
          <Text style={styles.body}>Add as dish</Text>
          <Switch value={dish} onValueChange={setDish} />
        </View>
      )}
      {dish && (
        <Field
          label="Dish description"
          value={description}
          onChangeText={setDescription}
          maxLength={500}
        />
      )}
      <ErrorNote error={task.error} />
      <Button
        title={editId ? 'Save item' : 'Add item'}
        disabled={task.busy || !name.trim()}
        onPress={() =>
          void task.run(async () => {
            if (dish)
              await saveDish({
                visitId,
                id: editId as Id<'dishes'> | undefined,
                name,
                description,
              });
            else await saveCategory({ visitId, id: editId as Id<'categories'> | undefined, name });
            setName('');
            setDescription('');
            setEditId(undefined);
          })
        }
      />
      {editId && (
        <Button
          secondary
          title="Cancel editing"
          onPress={() => {
            setEditId(undefined);
            setName('');
          }}
        />
      )}
    </Card>
  );
}
export function VisitFormScreen({ route, navigation }: ScreenProps<'VisitForm'>) {
  const { boardId, visitId } = route.params;
  const board = useQuery(api.boards.get, { boardId });
  const data = useQuery(api.visits.get, visitId ? { visitId } : 'skip');
  if (!board || (visitId && !data)) return <Loading />;
  return (
    <VisitForm
      key={visitId ?? 'new'}
      initial={data?.visit}
      types={board.types}
      params={route.params}
      onDone={(id) => {
        if (visitId) navigation.goBack();
        else navigation.replace('Visit', { visitId: id });
      }}
    />
  );
}
function VisitForm({
  initial,
  types,
  params,
  onDone,
}: {
  initial?: Doc<'visits'>;
  types: Doc<'visitTypes'>[];
  params: ScreenProps<'VisitForm'>['route']['params'];
  onDone: (id: Id<'visits'>) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? params.title ?? '');
  const [place, setPlace] = useState(initial?.place ?? params.place ?? '');
  const [date, setDate] = useState(initial?.date ?? localDate());
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [typeId, setTypeId] = useState<Id<'visitTypes'> | undefined>(types[0]?._id);
  const type = types.find((entry) => entry._id === typeId);
  const [showDishes, setShowDishes] = useState(initial?.showDishes ?? type?.showDishes ?? true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(
    initial?.location ?? params.location ?? null,
  );
  const create = useMutation(api.visits.create);
  const update = useMutation(api.visits.update);
  const task = useTask();
  return (
    <Page>
      <Title>{initial ? 'A memory, refined.' : 'Make a little memory.'}</Title>
      <SectionCard title="The visit" icon="notebook-outline">
        <Field label="Place / visit name" value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Address" value={place} onChangeText={setPlace} maxLength={250} />
        <Field
          label="Date (YYYY-MM-DD, or leave empty)"
          value={date}
          onChangeText={setDate}
          placeholder="2026-10-15"
          autoCapitalize="none"
          maxLength={10}
        />
        {!initial && (
          <>
            <Heading>Visit type</Heading>
            <View style={styles.row}>
              {types.map((entry) => (
                <Button
                  key={entry._id}
                  title={entry.name}
                  secondary={typeId !== entry._id}
                  onPress={() => {
                    setTypeId(entry._id);
                    setShowDishes(entry.showDishes);
                  }}
                />
              ))}
            </View>
            <Text style={styles.muted}>
              Categories: {type?.categories.join(', ') || 'Add categories after saving.'}
            </Text>
          </>
        )}
        <Field label="Notes" multiline value={notes} onChangeText={setNotes} maxLength={5000} />
        <View style={styles.row}>
          <Text style={styles.body}>Track dishes</Text>
          <Switch value={showDishes} onValueChange={setShowDishes} />
        </View>
      </SectionCard>
      <SectionCard title="Location" icon="map-marker-outline">
        {initial?.placeId && (
          <Text style={styles.muted}>
            Address and location changes update this shared place across its visits.
          </Text>
        )}
        <Text style={styles.muted}>
          {location
            ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
            : 'No coordinates saved. Your address can still open in Maps.'}
        </Text>
        <Button
          secondary
          title="Use current location"
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              const permission = await Location.requestForegroundPermissionsAsync();
              if (!permission.granted)
                throw new Error('Allow location access in Android settings, or enter an address.');
              const position = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              setLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            })
          }
        />
        {location && (
          <Button
            secondary
            title="Remove coordinates"
            disabled={task.busy}
            onPress={() => setLocation(null)}
          />
        )}
      </SectionCard>
      <Text style={styles.muted}>Save the visit to add pictures and ratings.</Text>
      <ErrorNote error={task.error} />
      <Button
        title={task.busy ? 'Saving…' : 'Save visit'}
        disabled={!title.trim() || task.busy}
        onPress={() =>
          void task.run(async () => {
            if (date && !validDate(date))
              throw new Error('Enter a valid date in YYYY-MM-DD format.');
            const fields = { title, place, date, notes, showDishes, location };
            if (initial) {
              await update({ ...fields, visitId: initial._id });
              onDone(initial._id);
            } else {
              const id = await create({
                ...fields,
                boardId: params.boardId,
                typeId,
                placeId: params.placeId,
                googlePlaceId: params.googlePlaceId,
              });
              onDone(id);
            }
          })
        }
      />
    </Page>
  );
}
