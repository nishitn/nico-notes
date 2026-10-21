import { PlaceLookupNotice } from './PlaceLookupNotice';
import { isPlacePlaceholder } from '@nico-notes/backend/livePlaces';
import { useLivePlace } from './convexLive';
import { GoogleAttribution } from './GoogleAttribution';
import { useState } from 'react';
import { useUnsavedChanges } from './useUnsavedChanges';
import { useMutation, useQuery } from './convexLive';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  Utensils,
  Heart,
  Navigation,
} from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { average, validScore } from '@nico-notes/backend/shared';
import {
  Back,
  Confirm,
  ErrorNote,
  Field,
  Form,
  Initials,
  Modal,
  Spinner,
  Submit,
  formatDate,
  today,
  useNotice,
  useTask,
} from './ui';
import { DishRatingsToggle } from './RatingCategories';
import { VisitRatingRows, ratingDrafts, type RatingDraft } from './VisitRatingRows';
import { PhotoSection, usePhotoUpload } from './Photos';
import { PhotoPicker, type PhotoSelection } from './PhotoPicker';
import { LocationField } from './LocationField';
import { mapsLink, type MapLocation } from './PlacesMap';
import { safeExternalUrl } from './Wishlist';

export function VisitEditor() {
  const { boardId, visitId } = useParams();
  const me = useQuery(api.boards.me);
  const existing = useQuery(
    api.visits.get,
    visitId ? { visitId: visitId as Id<'visits'> } : 'skip',
  );
  const resolvedBoard = (boardId ?? existing?.visit.boardId) as Id<'boards'> | undefined;
  const board = useQuery(api.boards.get, resolvedBoard ? { boardId: resolvedBoard } : 'skip');
  if (!board || !me || (visitId && !existing)) return <Spinner />;
  return (
    <Editor
      key={visitId ?? boardId}
      boardId={board.board._id}
      boardName={board.board.name}
      types={board.types}
      userId={me._id}
      userName={me.name}
      existing={existing?.visit}
      photoCount={existing?.photos.length ?? 0}
    />
  );
}
function Editor({
  boardId,
  boardName,
  types,
  userId,
  userName,
  existing,
  photoCount,
}: {
  boardId: Id<'boards'>;
  boardName: string;
  types: Doc<'visitTypes'>[];
  userId: Id<'users'>;
  userName: string;
  existing?: Doc<'visits'>;
  photoCount: number;
}) {
  const create = useMutation(api.visits.create);
  const photoUpload = usePhotoUpload();
  const [photos, setPhotos] = useState<PhotoSelection[]>([]);
  const [savedVisitId, setSavedVisitId] = useState<Id<'visits'> | null>(null);
  const update = useMutation(api.visits.update);
  const task = useTask();
  const navigate = useNavigate();
  const notice = useNotice();
  const [searchParams] = useSearchParams();
  const planned = existing?.status === 'planned' || searchParams.get('planned') === '1';
  const wishlistId = searchParams.get('wishlistId') as Id<'wishlist'> | null;
  const [keepWishlist, setKeepWishlist] = useState(true);
  const initialTitle = existing?.title ?? searchParams.get('title') ?? '';
  const initialPlace = existing?.place ?? searchParams.get('place') ?? '';
  const initialLat = searchParams.get('lat');
  const initialLng = searchParams.get('lng');
  const initialLocation: MapLocation | null =
    existing?.location ??
    (initialLat && initialLng
      ? {
          latitude: parseFloat(initialLat),
          longitude: parseFloat(initialLng),
        }
      : null);
  const [titleDraft, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(existing?.date ?? (planned ? '' : today()));
  const [placeDraft, setPlace] = useState(initialPlace);
  const [placeId, setPlaceId] = useState<Id<'places'> | undefined>(
    existing?.placeId ?? ((searchParams.get('placeId') || undefined) as Id<'places'> | undefined),
  );
  const [googlePlaceId, setGooglePlaceId] = useState(
    existing?.googlePlaceId ?? searchParams.get('googlePlaceId') ?? undefined,
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [savedLink, setSavedLink] = useState(existing?.savedLink ?? '');
  const [locationDraft, setLocation] = useState<MapLocation | null>(initialLocation);
  const livePlace = useLivePlace(googlePlaceId);
  const title =
    livePlace && (!titleDraft || isPlacePlaceholder(titleDraft)) ? livePlace.name : titleDraft;
  const place = placeDraft || livePlace?.address || '';
  const location = locationDraft ?? livePlace?.location ?? null;

  const [typeId, setTypeId] = useState<string>(types[0]?._id ?? '');
  const [showDishes, setShowDishes] = useState(
    existing?.showDishes ?? types[0]?.showDishes ?? true,
  );
  const [categories, setCategories] = useState<RatingDraft[]>(() =>
    ratingDrafts(types[0]?.categories ?? []),
  );
  const [dishes, setDishes] = useState<RatingDraft[]>([]);
  const [overallScore, setOverallScore] = useState('');
  const snapshot = JSON.stringify({
    title: googlePlaceId ? undefined : title,
    date,
    place: googlePlaceId ? undefined : place,
    placeId,
    googlePlaceId,
    notes,
    savedLink,
    location: googlePlaceId ? undefined : location,
    typeId,
    showDishes,
    categories,
    dishes,
    overallScore,
    keepWishlist,
  });
  const [initialSnapshot] = useState(snapshot);
  // Keep the version this editor opened with; reactive query updates must not
  // silently promote a stale draft to the latest server revision.
  const [revision] = useState(existing?.revision ?? 0);
  const guard = useUnsavedChanges(snapshot !== initialSnapshot || photos.length > 0, task.busy);
  const toScore = (value: string | undefined) => {
    if (!value) return null;
    const score = Number(value);
    if (!validScore(score)) throw new Error('Use scores from 1–10 in half-point steps.');
    return score;
  };
  async function finishSave(id: Id<'visits'>) {
    if (photos.length) {
      setSavedVisitId(id);
      for (const photo of photos) {
        await photoUpload.send(id, photo.file);
        setPhotos((current) => current.filter((item) => item !== photo));
      }
    }
    guard.allowNavigation();
    notice(existing ? 'Visit updated.' : 'Visit saved.');
    navigate(`/visits/${id}`, { replace: !existing });
  }
  const back = existing ? `/visits/${existing._id}` : `/boards/${boardId}`;
  return (
    <div className="page editor-page">
      <Back to={back}>{existing ? existing.title : boardName}</Back>
      <div className="page-heading visit-editor-heading">
        <div>
          <h1>
            {planned
              ? existing
                ? 'Edit planned visit'
                : 'Plan a visit'
              : existing
                ? 'Edit visit'
                : 'New visit'}
          </h1>
        </div>
        <details className="visit-date-control">
          <summary aria-label={date ? `Change date, ${formatDate(date)}` : 'Add date'}>
            <CalendarDays size={16} />
            <span>{date ? formatDate(date) : 'Add date'}</span>
            <ChevronDown size={16} className="visit-date-chevron" />
          </summary>
          <div className="visit-date-popover">
            <Field label="When was it?">
              <input
                type="date"
                value={date}
                disabled={task.busy || !!savedVisitId}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="text-button small"
              disabled={task.busy || !!savedVisitId}
              onClick={() => setDate('')}
            >
              Leave date blank
            </button>
          </div>
        </details>
      </div>
      <Form
        className="visit-editor-form"
        onSubmit={() =>
          task.run(async () => {
            if (savedVisitId) {
              await finishSave(savedVisitId);
              return;
            }
            if (!title.trim()) throw new Error('Choose a place to name your visit.');
            if (existing) {
              await update({
                visitId: existing._id,
                expectedRevision: revision,
                clearGooglePlace: !googlePlaceId,
                title,
                date,
                place,
                notes,
                savedLink,
                showDishes,
                location,
                placeId,
                googlePlaceId,
              });
              await finishSave(existing._id);
            } else {
              const id = await create({
                boardId,
                planned,
                savedLink,
                ...(wishlistId ? { wishlistId, keepWishlist } : {}),
                title,
                date,
                place,
                notes,
                showDishes,
                location,
                placeId,
                googlePlaceId,
                ...(typeId ? { typeId: typeId as Id<'visitTypes'> } : {}),
                categories: categories.map((category) => category.name.trim()),
                dishes: dishes.map((dish) => dish.name.trim()),
                initialScores: planned
                  ? []
                  : [
                      {
                        userId,
                        overall: toScore(overallScore),
                        categories: categories.map((category) => toScore(category.scores[userId])),
                        dishes: dishes.map((dish) => toScore(dish.scores[userId])),
                      },
                    ].filter((entry) =>
                      [entry.overall, ...entry.categories, ...entry.dishes].some(
                        (score) => score !== null,
                      ),
                    ),
              });
              await finishSave(id);
            }
          })
        }
      >
        <fieldset className="visit-editor-fields" disabled={task.busy || !!savedVisitId}>
          <LocationField
            value={location}
            googlePlaceId={googlePlaceId}
            onChange={(selected) => {
              if (selected.googlePlaceId !== googlePlaceId || selected.title !== title)
                setPlaceId(undefined);
              setGooglePlaceId(selected.googlePlaceId);
              setTitle(selected.title);
              setPlace(selected.place);
              setLocation(selected.location);
            }}
            title={title}
            place={place}
          />
          <Field label="A note to remember (optional)">
            <textarea
              rows={3}
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What made this one special?"
            />
          </Field>
          <Field label="Saved link (optional)">
            <input
              type="url"
              value={savedLink}
              onChange={(event) => setSavedLink(event.target.value)}
              maxLength={500}
              placeholder="https://…"
            />
          </Field>
        </fieldset>
        <PhotoPicker
          value={photos}
          onChange={setPhotos}
          disabled={task.busy}
          max={Math.max(0, 10 - photoCount)}
        />
        {savedVisitId && task.busy && (
          <div className="upload-progress" role="status">
            <progress value={photoUpload.progress} max={100} />
            <span>Saving picture… {photoUpload.progress}%</span>
          </div>
        )}
        <fieldset className="visit-editor-fields" disabled={task.busy || !!savedVisitId}>
          {existing && (
            <Field label="Visit type">
              <input value={existing.typeName} readOnly />
            </Field>
          )}
          {!existing && (
            <>
              <Field label="What kind of visit?">
                <div className="visit-type-select">
                  <select
                    value={typeId}
                    onChange={(e) => {
                      setTypeId(e.target.value);
                      const type = types.find((t) => t._id === e.target.value);
                      setCategories((current) =>
                        (type?.categories ?? []).map(
                          (name) =>
                            current.find(
                              (category) =>
                                category.name.trim().toLowerCase() === name.trim().toLowerCase(),
                            ) ?? ratingDrafts([name])[0],
                        ),
                      );
                      setShowDishes(type?.showDishes ?? false);
                    }}
                  >
                    <option value="">Just a visit · no preset</option>
                    {types.map((type) => (
                      <option key={type._id} value={type._id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} aria-hidden="true" />
                </div>
              </Field>
              {!planned && (
                <fieldset className="visit-draft-ratings" disabled={task.busy}>
                  <VisitRatingRows
                    kind="category"
                    rows={categories}
                    onChange={setCategories}
                    userId={userId}
                    memberName={userName}
                    overall={{
                      value: overallScore,
                      onChange: setOverallScore,
                    }}
                  />
                  <VisitRatingRows
                    kind="dish"
                    rows={dishes}
                    onChange={setDishes}
                    userId={userId}
                    memberName={userName}
                  />
                </fieldset>
              )}
            </>
          )}
          {existing && <DishRatingsToggle checked={showDishes} onChange={setShowDishes} />}
        </fieldset>
        {savedVisitId && task.error && (
          <p className="small muted">
            Your visit is saved. Retry the remaining picture uploads or open the visit.
          </p>
        )}
        {wishlistId && !existing && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={keepWishlist}
              disabled={task.busy || !!savedVisitId}
              onChange={(event) => setKeepWishlist(event.target.checked)}
            />
            Keep this place on the wishlist after logging the visit
          </label>
        )}
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <Link className="button secondary" to={savedVisitId ? `/visits/${savedVisitId}` : back}>
            {savedVisitId ? 'Open visit' : 'Cancel'}
          </Link>
          <Submit busy={task.busy}>
            {savedVisitId
              ? photos.length > 0
                ? 'Retry remaining pictures'
                : 'Finish'
              : existing
                ? 'Save changes'
                : planned
                  ? 'Save planned visit'
                  : 'Create visit'}
          </Submit>
        </div>
      </Form>
    </div>
  );
}
type Person = { _id: Id<'users'>; name: string; image?: string };
function VisitRatingStep({
  visit,
  categories,
  ratings,
  members,
  userId,
  isAdmin,
}: {
  visit: Doc<'visits'>;
  categories: Doc<'categories'>[];
  ratings: Doc<'ratings'>[];
  members: Person[];
  userId: Id<'users'>;
  isAdmin: boolean;
}) {
  const save = useMutation(api.ratings.save);
  const navigate = useNavigate();
  const notice = useNotice();
  const task = useTask();
  const targets = [
    { id: visit._id, kind: 'overall' as const, name: 'Overall' },
    ...categories.map((category) => ({
      id: category._id,
      kind: 'category' as const,
      name: category.name,
    })),
  ];
  const ratingMembers = members.filter((member) => isAdmin || member._id === userId);
  const [selectedUserId, setSelectedUserId] = useState(userId);
  const ratingUserId = ratingMembers.some((member) => member._id === selectedUserId)
    ? selectedUserId
    : userId;
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ratingMembers.flatMap((member) =>
        targets.map((target) => [
          `${member._id}:${target.id}`,
          ratings
            .find(
              (rating) =>
                rating.userId === member._id &&
                rating.kind === target.kind &&
                rating.targetId === target.id,
            )
            ?.score.toString() ?? '',
        ]),
      ),
    ),
  );
  const finish = () => navigate(`/visits/${visit._id}`, { replace: true });
  return (
    <div className="page visit-rating-step">
      <Back to={`/visits/${visit._id}/edit`}>Edit visit</Back>
      <div className="page-heading">
        <div>
          <h1>Rate your visit</h1>
          <p>{visit.title}</p>
        </div>
      </div>
      <Form
        onSubmit={() =>
          task.run(async () => {
            for (const member of ratingMembers) {
              for (const target of targets) {
                const draft = scores[`${member._id}:${target.id}`];
                if (draft && !validScore(Number(draft)))
                  throw new Error(`${member.name} · ${target.name}: use 1–10 in half-point steps.`);
              }
            }
            for (const member of ratingMembers) {
              for (const target of targets) {
                const existing = ratings.find(
                  (rating) =>
                    rating.userId === member._id &&
                    rating.kind === target.kind &&
                    rating.targetId === target.id,
                );
                const draft = scores[`${member._id}:${target.id}`];
                if (draft === undefined) continue;
                const score = draft ? Number(draft) : null;
                if (score === (existing?.score ?? null)) continue;
                await save({
                  visitId: visit._id,
                  userId: member._id,
                  targetId: target.id,
                  kind: target.kind,
                  score,
                  note: existing?.note ?? '',
                });
              }
            }
            notice('Visit saved.');
            finish();
          })
        }
      >
        {isAdmin && ratingMembers.length > 1 && (
          <Field label="Rate for">
            <select
              value={ratingUserId}
              disabled={task.busy}
              onChange={(event) => setSelectedUserId(event.target.value as Id<'users'>)}
            >
              {ratingMembers.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name}
                  {member._id === userId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="visit-rating-fields">
          {targets.map((target) => (
            <Field key={target.id} label={target.name}>
              <div className="score-input">
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  placeholder="Optional"
                  value={scores[`${ratingUserId}:${target.id}`] ?? ''}
                  disabled={task.busy}
                  onChange={(event) =>
                    setScores((current) => ({
                      ...current,
                      [`${ratingUserId}:${target.id}`]: event.target.value,
                    }))
                  }
                />
                <span>/ 10</span>
              </div>
            </Field>
          ))}
        </div>
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={task.busy} onClick={finish}>
            Skip for now
          </button>
          <Submit busy={task.busy}>Finish</Submit>
        </div>
      </Form>
    </div>
  );
}
function RatingCard({
  planned = false,
  name,
  description,
  kind,
  targetId,
  visitId,
  ratings,
  people,
  members,
  isAdmin,
  userId,
  onEdit,
  onRemove,
}: {
  planned?: boolean;
  name: string;
  description?: string;
  kind: 'dish' | 'category' | 'overall';
  targetId: Id<'dishes'> | Id<'categories'> | Id<'visits'>;
  visitId: Id<'visits'>;
  ratings: Doc<'ratings'>[];
  people: Person[];
  members: Person[];
  isAdmin: boolean;
  userId: Id<'users'>;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState<Person | null>(null);
  const mean = average(ratings.map((r) => r.score));
  return (
    <article className={`rating-card ${kind === 'overall' ? 'overall' : ''}`}>
      <div className="rating-card-heading">
        <div className="rating-title">
          {kind === 'dish' ? (
            <span className="dish-icon">
              <Utensils size={18} />
            </span>
          ) : kind === 'overall' ? (
            <span className="dish-icon">
              <Heart size={18} />
            </span>
          ) : null}
          <div>
            <h3>{name}</h3>
            {description && <p className="muted small">{description}</p>}
          </div>
        </div>
        <div className="rating-tools">
          {mean !== null && (
            <div className="average">
              <Star size={14} fill="currentColor" />
              <strong>{mean.toFixed(1)}</strong>
              <span>/10</span>
              <small>average</small>
            </div>
          )}
          {onEdit && (
            <button
              className="icon-button"
              aria-label={kind === 'category' ? `Rename category ${name}` : `Edit ${name}`}
              title={kind === 'category' ? 'Rename category' : 'Edit dish'}
              onClick={onEdit}
            >
              <Pencil size={15} />
            </button>
          )}
          {isAdmin && onRemove && (
            <button className="icon-button" aria-label={`Remove ${name}`} onClick={onRemove}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
      {!planned && (
        <div className="individual-ratings">
          {members.map((person) => {
            const rating = ratings.find((item) => item.userId === person._id);
            const isMe = person._id === userId;
            const canRate = isAdmin || isMe;
            return (
              <div className="person-rating" key={person._id}>
                <Initials name={person.name} image={person.image} small />
                <div>
                  <strong>{isMe ? 'You' : person.name}</strong>
                  {rating?.note && <p>{rating.note}</p>}
                </div>
                <button
                  className={`member-score ${rating ? 'has-rating' : ''}`}
                  disabled={!canRate}
                  aria-label={
                    isMe
                      ? rating
                        ? 'Edit your rating'
                        : 'Add my rating'
                      : `${rating ? 'Edit' : 'Add'} ${person.name}’s rating for ${name}`
                  }
                  aria-expanded={kind !== 'dish' ? editing?._id === person._id : undefined}
                  onClick={() => setEditing(person)}
                >
                  {rating ? (
                    <span className="person-score">
                      {rating.score.toFixed(1)}
                      <small>/10</small>
                    </span>
                  ) : (
                    <>
                      <Plus size={14} /> Rate
                    </>
                  )}
                  {rating && canRate && (
                    <>
                      <Pencil size={12} />
                      {kind !== 'dish' && <span>Edit</span>}
                    </>
                  )}
                </button>
              </div>
            );
          })}
          {ratings
            .filter((rating) => !members.some((person) => person._id === rating.userId))
            .map((rating) => {
              const person = people.find((item) => item._id === rating.userId);
              const name = person?.name ?? rating.importedName ?? 'Former member';
              return (
                <div className="person-rating" key={rating._id}>
                  <Initials name={name} image={person?.image} small />
                  <div>
                    <strong>{name}</strong>
                    {rating.importedName && (
                      <small className="imported-rating-label">From your notes</small>
                    )}
                    {rating.note && <p>{rating.note}</p>}
                  </div>
                  <span className="person-score">
                    {rating.score.toFixed(1)}
                    <small>/10</small>
                  </span>
                </div>
              );
            })}
        </div>
      )}
      {editing && (isAdmin || editing._id === userId) && (
        <RatingEditor
          key={editing._id}
          inline={kind !== 'dish'}
          name={name}
          kind={kind}
          targetId={targetId}
          visitId={visitId}
          existing={ratings.find((rating) => rating.userId === editing._id)}
          userId={editing._id}
          personName={editing._id === userId ? undefined : editing.name}
          onClose={() => setEditing(null)}
        />
      )}
    </article>
  );
}
function RatingEditor({
  name,
  kind,
  targetId,
  visitId,
  existing,
  userId,
  personName,
  inline = false,
  onClose,
}: {
  name: string;
  kind: 'dish' | 'category' | 'overall';
  targetId: Id<'dishes'> | Id<'categories'> | Id<'visits'>;
  visitId: Id<'visits'>;
  existing?: Doc<'ratings'>;
  userId: Id<'users'>;
  personName?: string;
  inline?: boolean;
  onClose: () => void;
}) {
  const save = useMutation(api.ratings.save);
  const task = useTask();
  const notice = useNotice();
  const [score, setScore] = useState(existing?.score.toString() ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const title = `${personName ? `${personName}’s rating` : 'Your rating'} · ${name}`;
  const form = (
    <Form
      onSubmit={() =>
        task.run(async () => {
          await save({ visitId, kind, targetId, userId, score: Number(score), note });
          notice('Rating saved.');
          onClose();
        })
      }
    >
      <Field label={personName ? 'Score' : 'Your score'} hint="1 to 10, in half-point steps.">
        <div className="score-input">
          <input
            autoFocus
            type="number"
            min={1}
            max={10}
            step={0.5}
            required
            disabled={task.busy}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="8.5"
          />
          <span>/ 10</span>
        </div>
      </Field>
      <Field label="A little note (optional)">
        <textarea
          rows={inline ? 2 : 3}
          disabled={task.busy}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you think?"
        />
      </Field>
      <ErrorNote text={task.error} />
      <div className="form-actions">
        {existing && (
          <button
            className="text-button danger-text"
            type="button"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await save({ visitId, kind, targetId, userId, score: null, note: '' });
                notice('Rating cleared.');
                onClose();
              })
            }
          >
            {personName ? 'Clear rating' : 'Clear my rating'}
          </button>
        )}
        {inline && (
          <button type="button" className="button secondary" disabled={task.busy} onClick={onClose}>
            Cancel
          </button>
        )}
        <Submit busy={task.busy}>Save rating</Submit>
      </div>
    </Form>
  );
  return inline ? (
    <section className="inline-rating-editor" aria-label={title}>
      <h4>{title}</h4>
      {form}
    </section>
  ) : (
    <Modal title={title} onClose={onClose}>
      {form}
    </Modal>
  );
}
type ItemEditorState =
  | { kind: 'dish'; item?: Doc<'dishes'> }
  | { kind: 'category'; item?: Doc<'categories'> };
function ItemEditor({
  state,
  visitId,
  onClose,
}: {
  state: ItemEditorState;
  visitId: Id<'visits'>;
  onClose: () => void;
}) {
  const saveDish = useMutation(api.items.saveDish);
  const saveCategory = useMutation(api.items.saveCategory);
  const task = useTask();
  const [name, setName] = useState(state.item?.name ?? '');
  const [description, setDescription] = useState(
    state.kind === 'dish' ? (state.item?.description ?? '') : '',
  );
  return (
    <Modal
      title={`${state.item ? 'Edit' : 'Add'} ${state.kind === 'dish' ? 'a dish' : 'a rating category'}`}
      onClose={onClose}
    >
      <Form
        onSubmit={() =>
          task.run(async () => {
            if (state.kind === 'dish')
              await saveDish({ visitId, id: state.item?._id, name, description });
            else await saveCategory({ visitId, id: state.item?._id, name });
            onClose();
          })
        }
      >
        <Field label={state.kind === 'dish' ? 'Dish name' : 'Category name'}>
          <input
            required
            autoFocus
            maxLength={state.kind === 'dish' ? 120 : 50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={state.kind === 'dish' ? 'e.g. Burrata & heirloom tomatoes' : 'e.g. View'}
          />
        </Field>
        {state.kind === 'dish' && (
          <Field label="Description (optional)">
            <textarea
              maxLength={500}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A detail to remember, or who shared it."
            />
          </Field>
        )}
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <Submit busy={task.busy}>
            {state.item ? 'Save changes' : state.kind === 'dish' ? 'Add dish' : 'Add category'}
          </Submit>
        </div>
      </Form>
    </Modal>
  );
}
export function VisitPage() {
  const { visitId } = useParams();
  const [searchParams] = useSearchParams();
  const id = visitId as Id<'visits'>;
  const data = useQuery(api.visits.get, { visitId: id });
  const me = useQuery(api.boards.me);
  const remove = useMutation(api.visits.remove);
  const markVisited = useMutation(api.visits.markVisited);
  const [completing, setCompleting] = useState(false);
  const [completedDate, setCompletedDate] = useState(today());
  const completionTask = useTask();
  const removeItem = useMutation(api.items.remove);
  const navigate = useNavigate();
  const [editor, setEditor] = useState<ItemEditorState | null>(null);
  const [deleting, setDeleting] = useState<{
    id: Id<'dishes'> | Id<'categories'>;
    name: string;
  } | null>(null);
  const [deleteVisit, setDeleteVisit] = useState(false);
  if (!data || !me) return <Spinner />;
  const { visit, board, ratings, people } = data;
  const planned = visit.status === 'planned';
  if (!planned && searchParams.get('rate') === '1') {
    return (
      <VisitRatingStep
        key={id}
        visit={visit}
        categories={data.categories}
        ratings={ratings}
        members={data.members}
        userId={me._id}
        isAdmin={data.isAdmin}
      />
    );
  }
  const canDelete = visit.creatorId === me._id || data.isAdmin;
  const forTarget = (kind: string, target: string) =>
    ratings.filter((r) => r.kind === kind && r.targetId === target);
  return (
    <div className="page visit-page">
      <Back to={`/boards/${board._id}`}>{board.name}</Back>
      <div className="page-heading">
        <div>
          <span className={`type-pill ${board.accent}`}>
            {planned ? 'Planned' : visit.typeName}
          </span>
          <h1>
            {visit.title}
            {visit.visitNumber && visit.visitNumber > 1 && (
              <span className="visit-number">Visit {visit.visitNumber}</span>
            )}
          </h1>
          {visit.googlePlaceId && <GoogleAttribution placeId={visit.googlePlaceId} />}
          {visit.googlePlaceId && <PlaceLookupNotice placeIds={[visit.googlePlaceId]} />}
          <div className="visit-meta">
            {(!planned || visit.date) && (
              <span>
                <CalendarDays size={16} />
                {formatDate(visit.date)}
              </span>
            )}
            {visit.place && (
              <span>
                <MapPin size={16} />
                {visit.place}
              </span>
            )}
          </div>
        </div>
        <div className="actions">
          {planned && (
            <button type="button" className="button primary" onClick={() => setCompleting(true)}>
              Mark as visited
            </button>
          )}
          <Link
            className="text-button small"
            to={`/boards/${board._id}/safety?visitId=${visit._id}`}
          >
            Report visit
          </Link>
          {visit.location && (
            <a className="button secondary" href={mapsLink(visit)} target="_blank" rel="noreferrer">
              <Navigation size={16} />
              Google Maps
            </a>
          )}
          <Link className="button secondary" to={`/visits/${id}/edit`}>
            <Pencil size={16} /> {planned ? 'Edit planned visit' : 'Edit visit'}
          </Link>
          <button
            className="icon-button danger-text"
            disabled={!canDelete}
            aria-label="Delete visit"
            onClick={() => setDeleteVisit(true)}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {visit.notes && (
        <div className="visit-note">
          <span className="eyebrow">Notes</span>
          <p>{visit.notes}</p>
        </div>
      )}
      {safeExternalUrl(visit.savedLink) && (
        <a
          className="button secondary"
          href={safeExternalUrl(visit.savedLink)}
          target="_blank"
          rel="noreferrer"
        >
          Open saved link
        </a>
      )}
      <div className={`visit-content ${planned ? 'planned' : ''}`}>
        {!planned && (
          <aside className="visit-ratings">
            <div className="section-heading">
              <div>
                <h2>Ratings</h2>
              </div>
            </div>
            <RatingCard
              name="Overall"
              kind="overall"
              targetId={id}
              visitId={id}
              ratings={forTarget('overall', id)}
              people={people}
              members={data.members}
              isAdmin={data.isAdmin}
              userId={me._id}
            />
            <div className="ratings-stack">
              {data.categories.map((category) => (
                <RatingCard
                  key={category._id}
                  name={category.name}
                  kind="category"
                  targetId={category._id}
                  visitId={id}
                  ratings={forTarget('category', category._id)}
                  people={people}
                  members={data.members}
                  isAdmin={data.isAdmin}
                  userId={me._id}
                  onEdit={() => setEditor({ kind: 'category', item: category })}
                  onRemove={() => setDeleting({ id: category._id, name: category.name })}
                />
              ))}
            </div>
            <button
              className="add-category"
              disabled={data.categories.length >= 50}
              onClick={() => setEditor({ kind: 'category' })}
            >
              <Plus size={17} /> Add a category
            </button>
            <p className="rating-help">
              Scores out of 10 · Unrated members aren’t included in averages.
            </p>
          </aside>
        )}
        <div className="visit-main">
          {(visit.showDishes || data.dishes.length > 0) && (
            <section>
              <div className="section-heading">
                <div>
                  <h2>
                    Dishes <span className="count">{data.dishes.length}</span>
                  </h2>
                </div>
                <button
                  className="button primary"
                  onClick={() => setEditor({ kind: 'dish' })}
                  disabled={data.dishes.length >= 50}
                >
                  <Plus size={17} /> Add dish
                </button>
              </div>
              {data.dishes.length === 0 ? (
                <button className="dish-empty" onClick={() => setEditor({ kind: 'dish' })}>
                  <Utensils size={25} />
                  <span>
                    <strong>Add your first dish</strong>
                  </span>
                  <Plus size={19} />
                </button>
              ) : (
                <div className="ratings-stack">
                  {data.dishes.map((dish) => (
                    <RatingCard
                      planned={planned}
                      key={dish._id}
                      name={dish.name}
                      description={dish.description}
                      kind="dish"
                      targetId={dish._id}
                      visitId={id}
                      ratings={forTarget('dish', dish._id)}
                      people={people}
                      members={data.members}
                      isAdmin={data.isAdmin}
                      userId={me._id}
                      onEdit={() => setEditor({ kind: 'dish', item: dish })}
                      onRemove={() => setDeleting({ id: dish._id, name: dish.name })}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          <PhotoSection visitId={id} photos={data.photos} userId={me._id} isAdmin={data.isAdmin} />
        </div>
      </div>
      {completing && (
        <Modal title="Mark as visited" onClose={() => !completionTask.busy && setCompleting(false)}>
          <Form
            onSubmit={() =>
              completionTask.run(async () => {
                await markVisited({
                  visitId: id,
                  date: completedDate,
                  expectedRevision: visit.revision ?? 0,
                });
                setCompleting(false);
              })
            }
          >
            <Field label="Visit date">
              <input
                type="date"
                required
                value={completedDate}
                onChange={(event) => setCompletedDate(event.target.value)}
                disabled={completionTask.busy}
              />
            </Field>
            <ErrorNote text={completionTask.error} />
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={completionTask.busy}
                onClick={() => setCompleting(false)}
              >
                Cancel
              </button>
              <Submit busy={completionTask.busy}>Mark as visited</Submit>
            </div>
          </Form>
        </Modal>
      )}
      {editor && <ItemEditor state={editor} visitId={id} onClose={() => setEditor(null)} />}
      {deleting && (
        <Confirm
          title={`Remove ${deleting.name}?`}
          onClose={() => setDeleting(null)}
          onConfirm={() => removeItem({ visitId: id, target: deleting.id, confirmed: true })}
        >
          This hides the item and everyone’s ratings. Contact support to request recovery after
          verification; recovery is not guaranteed.
        </Confirm>
      )}
      {deleteVisit && (
        <Confirm
          title="Delete this visit?"
          onClose={() => setDeleteVisit(false)}
          onConfirm={async () => {
            await remove({ visitId: id });
            navigate(`/boards/${board._id}`);
          }}
        >
          This hides the visit, dishes, ratings and images for everyone on the board. Contact
          support to request recovery after verification; recovery is not guaranteed.
        </Confirm>
      )}
    </div>
  );
}
