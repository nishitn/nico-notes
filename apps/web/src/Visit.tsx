import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  Utensils,
  Heart,
  Navigation,
} from 'lucide-react';
import { api } from '@date-notes/backend/api';
import type { Doc, Id } from '@date-notes/backend/dataModel';
import { average } from '@date-notes/backend/shared';
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
import { PhotoSection } from './Photos';
import { LocationField } from './LocationField';
import { mapsLink, type MapLocation } from './PlacesMap';

export function VisitEditor() {
  const { boardId, visitId } = useParams();
  const existing = useQuery(
    api.visits.get,
    visitId ? { visitId: visitId as Id<'visits'> } : 'skip',
  );
  const resolvedBoard = (boardId ?? existing?.visit.boardId) as Id<'boards'> | undefined;
  const board = useQuery(api.boards.get, resolvedBoard ? { boardId: resolvedBoard } : 'skip');
  if (!board || (visitId && !existing)) return <Spinner />;
  return (
    <Editor
      key={visitId ?? boardId}
      boardId={board.board._id}
      boardName={board.board.name}
      types={board.types}
      existing={existing?.visit}
    />
  );
}
function Editor({
  boardId,
  boardName,
  types,
  existing,
}: {
  boardId: Id<'boards'>;
  boardName: string;
  types: Doc<'visitTypes'>[];
  existing?: Doc<'visits'>;
}) {
  const create = useMutation(api.visits.create);
  const update = useMutation(api.visits.update);
  const task = useTask();
  const navigate = useNavigate();
  const notice = useNotice();
  const [searchParams] = useSearchParams();
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
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(existing?.date ?? today());
  const [place, setPlace] = useState(initialPlace);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [location, setLocation] = useState<MapLocation | null>(initialLocation);
  const [typeId, setTypeId] = useState<string>(types[0]?._id ?? '');
  const [showDishes, setShowDishes] = useState(
    existing?.showDishes ?? types[0]?.showDishes ?? true,
  );
  const [categories, setCategories] = useState(types[0]?.categories.join(', ') ?? '');
  const back = existing ? `/visits/${existing._id}` : `/boards/${boardId}`;
  return (
    <div className="page editor-page">
      <Back to={back}>{existing ? existing.title : boardName}</Back>
      <div className="page-heading">
        <div>
          <h1>{existing ? 'Edit visit' : 'New visit'}</h1>
        </div>
      </div>
      <Form
        className="visit-editor-form"
        onSubmit={() =>
          task.run(async () => {
            if (!title.trim()) throw new Error('Choose a place to name your visit.');
            if (existing) {
              await update({
                visitId: existing._id,
                title,
                date,
                place,
                notes,
                showDishes,
                location,
              });
              navigate(back);
            } else {
              const id = await create({
                boardId,
                title,
                date,
                place,
                notes,
                showDishes,
                location,
                ...(typeId ? { typeId: typeId as Id<'visitTypes'> } : {}),
                categories: categories
                  .split(',')
                  .map((c) => c.trim())
                  .filter(Boolean),
              });
              navigate(`/visits/${id}`);
            }
            notice(existing ? 'Visit updated.' : 'Your new memory is ready for the details.');
          })
        }
      >
        <LocationField
          value={location}
          onChange={(selected) => {
            setTitle(selected.title);
            setPlace(selected.place);
            setLocation(selected.location);
          }}
          title={title}
          place={place}
        />
        <div className="visit-date-row">
          <details className="visit-date-control">
            <summary>
              <CalendarDays size={15} /> {date ? formatDate(date) : 'Add date'}
            </summary>
            <div className="visit-date-popover">
              <Field label="When was it?">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <button type="button" className="text-button small" onClick={() => setDate('')}>
                Leave date blank
              </button>
            </div>
          </details>
        </div>
        <Field label="A note to remember (optional)">
          <textarea
            rows={3}
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What made this one special?"
          />
        </Field>
        {!existing && (
          <>
            <Field label="What kind of date?">
              <select
                value={typeId}
                onChange={(e) => {
                  setTypeId(e.target.value);
                  const type = types.find((t) => t._id === e.target.value);
                  setCategories(type?.categories.join(', ') ?? '');
                  setShowDishes(type?.showDishes ?? false);
                }}
              >
                <option value="">Just a date · no preset</option>
                {types.map((type) => (
                  <option key={type._id} value={type._id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Rating categories (optional)"
              hint="Separate names with commas. You can add more later. These are copied into this visit only."
            >
              <input
                maxLength={2500}
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                placeholder="View, Experience, Value"
              />
            </Field>
          </>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDishes}
            onChange={(e) => setShowDishes(e.target.checked)}
          />
          <span>Include dishes to rate</span>
        </label>
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <Link className="button secondary" to={back}>
            Cancel
          </Link>
          <Submit busy={task.busy}>{existing ? 'Save changes' : 'Create visit'}</Submit>
        </div>
      </Form>
    </div>
  );
}
type Person = { _id: Id<'users'>; name: string; image?: string };
function RatingCard({
  name,
  description,
  kind,
  targetId,
  visitId,
  ratings,
  people,
  userId,
  onEdit,
  onRemove,
}: {
  name: string;
  description?: string;
  kind: 'dish' | 'category' | 'overall';
  targetId: Id<'dishes'> | Id<'categories'> | Id<'visits'>;
  visitId: Id<'visits'>;
  ratings: Doc<'ratings'>[];
  people: Person[];
  userId: Id<'users'>;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const mine = ratings.find((r) => r.userId === userId);
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
            {kind === 'overall' && (
              <p className="muted small">Your feeling about the whole visit. Always optional.</p>
            )}
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
            <button className="icon-button" aria-label={`Edit ${name}`} onClick={onEdit}>
              <Pencil size={15} />
            </button>
          )}
          {onRemove && (
            <button className="icon-button" aria-label={`Remove ${name}`} onClick={onRemove}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="individual-ratings">
        {ratings.length ? (
          ratings.map((rating) => {
            const person = people.find((p) => p._id === rating.userId);
            const personName = person?.name ?? rating.importedName ?? 'Member';
            return (
              <div className="person-rating" key={rating._id}>
                <Initials name={personName} small />
                <div>
                  <strong>{rating.userId === userId ? 'You' : personName}</strong>
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
          })
        ) : (
          <p className="unrated">
            {kind === 'dish'
              ? 'Tried it? Be the first to rate it.'
              : 'No ratings yet. Add yours whenever you like.'}
          </p>
        )}
      </div>
      <button
        className={`rating-button ${mine ? 'has-rating' : ''}`}
        onClick={() => setEditing(true)}
      >
        {mine ? <Pencil size={14} /> : <Plus size={15} />}
        {mine
          ? 'Edit your rating'
          : kind === 'dish'
            ? 'I tried this · Add my rating'
            : 'Add my rating'}
      </button>
      {editing && (
        <RatingEditor
          name={name}
          kind={kind}
          targetId={targetId}
          visitId={visitId}
          existing={mine}
          onClose={() => setEditing(false)}
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
  onClose,
}: {
  name: string;
  kind: 'dish' | 'category' | 'overall';
  targetId: Id<'dishes'> | Id<'categories'> | Id<'visits'>;
  visitId: Id<'visits'>;
  existing?: Doc<'ratings'>;
  onClose: () => void;
}) {
  const save = useMutation(api.ratings.save);
  const task = useTask();
  const notice = useNotice();
  const [score, setScore] = useState(existing?.score.toString() ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  return (
    <Modal title={`Your rating · ${name}`} onClose={onClose}>
      <Form
        onSubmit={() =>
          task.run(async () => {
            await save({ visitId, kind, targetId, score: Number(score), note });
            notice('Your perspective, saved.');
            onClose();
          })
        }
      >
        <Field label="Your score" hint="1 to 10, in half-point steps.">
          <div className="score-input">
            <input
              autoFocus
              type="number"
              min={1}
              max={10}
              step={0.5}
              required
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="8.5"
            />
            <span>/ 10</span>
          </div>
        </Field>
        <Field label="A little note (optional)">
          <textarea
            rows={3}
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
                  await save({ visitId, kind, targetId, score: null, note: '' });
                  notice('Your rating was cleared.');
                  onClose();
                })
              }
            >
              Clear my rating
            </button>
          )}
          <Submit busy={task.busy}>Save rating</Submit>
        </div>
      </Form>
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
  const id = visitId as Id<'visits'>;
  const data = useQuery(api.visits.get, { visitId: id });
  const me = useQuery(api.boards.me);
  const remove = useMutation(api.visits.remove);
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
  const canDelete = visit.creatorId === me._id || board.ownerId === me._id;
  const forTarget = (kind: string, target: string) =>
    ratings.filter((r) => r.kind === kind && r.targetId === target);
  return (
    <div className="page visit-page">
      <Back to={`/boards/${board._id}`}>{board.name}</Back>
      <div className="page-heading">
        <div>
          <span className={`type-pill ${board.accent}`}>{visit.typeName}</span>
          <h1>
            {visit.title}
            {visit.visitNumber && visit.visitNumber > 1 && (
              <span className="visit-number">Visit {visit.visitNumber}</span>
            )}
          </h1>
          <div className="visit-meta">
            <span>
              <CalendarDays size={16} />
              {formatDate(visit.date)}
            </span>
            {visit.place && (
              <span>
                <MapPin size={16} />
                {visit.place}
              </span>
            )}
          </div>
        </div>
        <div className="actions">
          {visit.location && (
            <a className="button secondary" href={mapsLink(visit)} target="_blank" rel="noreferrer">
              <Navigation size={16} />
              Google Maps
            </a>
          )}
          <Link className="button secondary" to={`/visits/${id}/edit`}>
            <Pencil size={16} /> Edit visit
          </Link>
          {canDelete && (
            <button
              className="icon-button"
              aria-label="Delete visit"
              onClick={() => setDeleteVisit(true)}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
      {visit.notes && (
        <div className="visit-note">
          <span className="eyebrow">Notes</span>
          <p>{visit.notes}</p>
        </div>
      )}
      <div className="visit-content">
        <div className="visit-main">
          {(visit.showDishes || data.dishes.length > 0) && (
            <section>
              <div className="section-heading">
                <div>
                  <h2>
                    What was on the table <span className="count">{data.dishes.length}</span>
                  </h2>
                  <p className="muted small">Shared a dish? Each of you can add a rating.</p>
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
                    <strong>What did you try?</strong>
                    <small>Add a dish, then give it your own rating.</small>
                  </span>
                  <Plus size={19} />
                </button>
              ) : (
                <div className="ratings-stack">
                  {data.dishes.map((dish) => (
                    <RatingCard
                      key={dish._id}
                      name={dish.name}
                      description={dish.description}
                      kind="dish"
                      targetId={dish._id}
                      visitId={id}
                      ratings={forTarget('dish', dish._id)}
                      people={people}
                      userId={me._id}
                      onEdit={() => setEditor({ kind: 'dish', item: dish })}
                      onRemove={() => setDeleting({ id: dish._id, name: dish.name })}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          <PhotoSection visitId={id} photos={data.photos} userId={me._id} ownerId={board.ownerId} />
        </div>
        <aside className="visit-ratings">
          <div className="section-heading">
            <div>
              <h2>The whole experience</h2>
            </div>
          </div>
          <RatingCard
            name="Overall"
            kind="overall"
            targetId={id}
            visitId={id}
            ratings={forTarget('overall', id)}
            people={people}
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
            All ratings are out of 10. Averages include only the people who rated that item.
          </p>
        </aside>
      </div>
      {editor && <ItemEditor state={editor} visitId={id} onClose={() => setEditor(null)} />}
      {deleting && (
        <Confirm
          title={`Remove ${deleting.name}?`}
          onClose={() => setDeleting(null)}
          onConfirm={() => removeItem({ visitId: id, target: deleting.id, confirmed: true })}
        >
          This also removes everyone’s ratings for this item. It cannot be undone.
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
          This permanently removes the visit, dishes, ratings, and photos for everyone on the board.
        </Confirm>
      )}
    </div>
  );
}
