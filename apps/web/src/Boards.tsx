import { useEffect, useMemo, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Heart, MapPin, Mountain, Search, Utensils, X } from 'lucide-react';
import { api } from '@date-notes/backend/api';
import type { Doc, Id } from '@date-notes/backend/dataModel';
import { Artwork } from './Artwork';
import { BoardDashboard, VisitCard, type DesignVariant } from './BoardDashboard';
import { PlacesMap } from './PlacesMap';
import {
  Back,
  Empty,
  ErrorNote,
  Field,
  Form,
  Modal,
  Spinner,
  Submit,
  useNotice,
  useTask,
} from './ui';

export function BoardForm({ onClose }: { onClose: () => void }) {
  const create = useMutation(api.boards.create);
  const navigate = useNavigate();
  const task = useTask();
  const notice = useNotice();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accent, setAccent] = useState<'coral' | 'sage' | 'peach'>('coral');
  return (
    <Modal title="New board" onClose={onClose}>
      <Form
        onSubmit={() =>
          task.run(async () => {
            const id = await create({ name, description, accent });
            notice('Board created.');
            onClose();
            navigate(`/boards/${id}`);
          })
        }
      >
        <Field label="Board name">
          <input
            required
            maxLength={80}
            autoFocus
            placeholder="e.g. Our food adventures"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            maxLength={500}
            rows={3}
            placeholder="What is this board for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <fieldset className="color-picker">
          <legend>Choose a color</legend>
          {(['coral', 'sage', 'peach'] as const).map((color) => (
            <label
              key={color}
              className={`color-option ${color} ${accent === color ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="accent"
                value={color}
                checked={accent === color}
                onChange={() => setAccent(color)}
              />
              <span>{color}</span>
            </label>
          ))}
        </fieldset>
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <Submit busy={task.busy}>Create board</Submit>
        </div>
      </Form>
    </Modal>
  );
}
function lastBoardKey(userId: string) {
  return `date-notes:last-board:${userId}`;
}
function readLastBoard(userId: string) {
  try {
    return localStorage.getItem(lastBoardKey(userId));
  } catch {
    return null;
  }
}
export function HomePage() {
  const me = useQuery(api.boards.me);
  const { results, status, loadMore } = usePaginatedQuery(
    api.boards.list,
    {},
    { initialNumItems: 30 },
  );
  const lastBoard = me ? readLastBoard(me._id) : null;
  const previous = results.find((board) => board._id === lastBoard);
  const searching =
    !previous && !!lastBoard && (status === 'CanLoadMore' || status === 'LoadingMore');
  useEffect(() => {
    if ((!results.length || searching) && status === 'CanLoadMore') loadMore(30);
  }, [results.length, searching, status, loadMore]);
  if (
    !me ||
    status === 'LoadingFirstPage' ||
    searching ||
    (!results.length && status !== 'Exhausted')
  )
    return <Spinner />;
  const board = previous ?? results[0];
  return <Navigate replace to={board ? `/boards/${board._id}` : '/boards'} />;
}
export function BoardsPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.boards.list,
    {},
    { initialNumItems: 24 },
  );
  return (
    <div className="page">
      <Back to="/">Home</Back>
      <div className="page-heading">
        <h1>Boards</h1>
      </div>
      {status === 'LoadingFirstPage' ? (
        <Spinner />
      ) : results.length === 0 ? (
        <Empty title="No boards yet">Open the menu and choose New board to get started.</Empty>
      ) : (
        <div className="board-grid">
          {results.map((board) => (
            <Link
              className={`board-card ${board.accent}`}
              key={board._id}
              to={`/boards/${board._id}`}
            >
              <div className="board-cover">
                <Artwork
                  variant={
                    board.accent === 'sage'
                      ? 'adventure'
                      : board.accent === 'peach'
                        ? 'notes'
                        : 'food'
                  }
                />
              </div>
              <div className="board-card-body">
                <div className="card-title">
                  <h2>{board.name}</h2>
                  <span className="round-arrow">
                    <ArrowRight size={19} />
                  </span>
                </div>
                {board.description && <p>{board.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <button
          className="button secondary load-more"
          disabled={status === 'LoadingMore'}
          onClick={() => loadMore(24)}
        >
          More boards
        </button>
      )}
    </div>
  );
}
export function BoardPage({ forcedDesign }: { forcedDesign?: DesignVariant } = {}) {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const me = useQuery(api.boards.me);
  const detail = useQuery(api.boards.get, { boardId: id });
  useEffect(() => {
    if (detail && me) {
      try {
        localStorage.setItem(lastBoardKey(me._id), detail.board._id);
      } catch {
        /* Storage may be disabled. */
      }
    }
  }, [detail, me]);
  if (!detail) return <Spinner />;
  return (
    <BoardDashboard
      key={`${id}-${forcedDesign || 'default'}`}
      detail={detail}
      userId={me?._id}
      forcedDesign={forcedDesign}
    />
  );
}
export function InvitePage() {
  const { token = '' } = useParams();
  const invite = useQuery(api.boards.invitation, { token });
  const accept = useMutation(api.boards.acceptInvitation);
  const navigate = useNavigate();
  const task = useTask();
  if (!invite) return <Spinner label="Opening your invitation…" />;
  return (
    <div className="page invite-page">
      <span className="invite-icon">
        <Heart size={38} />
      </span>
      <h1>
        You’re invited to
        <br />
        {invite.name}
      </h1>
      <p>
        Join this private board to add visits, share photos, and bring your own perspective to every
        rating.
      </p>
      <ErrorNote text={task.error} />
      <button
        className="button primary"
        disabled={task.busy}
        onClick={() =>
          task.run(async () => {
            const boardId = await accept({ token });
            navigate(`/boards/${boardId}`);
          })
        }
      >
        {task.busy ? 'Joining…' : invite.alreadyMember ? 'Open board' : 'Accept invitation'}
        <ArrowRight size={18} />
      </button>
      <Link className="back" to="/">
        Maybe later
      </Link>
    </div>
  );
}

export function PlacesPage() {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const navigate = useNavigate();
  const detail = useQuery(api.boards.get, { boardId: id });
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') === 'unpinned' ? 'unpinned' : 'all';
  const [query, setQuery] = useState('');

  const {
    results: visits,
    status: placesStatus,
    loadMore: loadPlaces,
  } = usePaginatedQuery(api.visits.places, { boardId: id }, { initialNumItems: 100 });

  useEffect(() => {
    if (placesStatus === 'CanLoadMore') loadPlaces(100);
  }, [placesStatus, loadPlaces]);

  const groups = useMemo(() => {
    const map = new globalThis.Map<string, Doc<'visits'>[]>();
    for (const visit of visits) {
      const key = `${visit.title.trim().toLowerCase()}|${visit.place.trim().toLowerCase()}`;
      map.set(key, [...(map.get(key) ?? []), visit]);
    }
    return [...map.entries()].map(([key, entries]) => ({
      key,
      entries,
      visit: entries.find((v) => v.location) ?? entries[0],
    }));
  }, [visits]);

  const matching = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return groups;
    return groups.filter(({ entries }) =>
      entries.some((v) => `${v.title} ${v.place} ${v.notes}`.toLowerCase().includes(trimmed)),
    );
  }, [groups, query]);

  const unpinned = useMemo(() => groups.filter((p) => !p.visit.location).length, [groups]);

  if (!detail || placesStatus === 'LoadingFirstPage') return <Spinner />;

  const displayList =
    activeTab === 'unpinned' ? matching.filter((p) => !p.visit.location) : matching;

  return (
    <div className="page places-page">
      <Back to={`/boards/${id}`}>Map View</Back>
      <header className="page-heading">
        <h1>{detail.board.name} places</h1>
        <p className="subtitle">
          {groups.length} explored places across {visits.length} visits
        </p>
      </header>

      <div className="places-page-toolbar">
        <div className="places-search">
          <Search size={18} />
          <input
            aria-label="Search places"
            placeholder="Search saved places…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="modal-tab-bar" style={{ borderBottom: 'none', marginBottom: 0 }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setParams({}, { replace: true })}
          >
            All places ({groups.length})
          </button>
          {unpinned > 0 && (
            <button
              type="button"
              className={`tab-btn ${activeTab === 'unpinned' ? 'active' : ''}`}
              onClick={() => setParams({ tab: 'unpinned' }, { replace: true })}
            >
              Awaited pins ({unpinned})
            </button>
          )}
        </div>
      </div>

      <div className="places-list" style={{ marginTop: '20px' }}>
        {displayList.length ? (
          displayList.map(({ key, entries, visit }) => {
            const placeDetailUrl = `/boards/${id}/place?title=${encodeURIComponent(
              visit.title,
            )}&place=${encodeURIComponent(visit.place || '')}`;

            return (
              <article
                key={key}
                className="place-row place-row-clickable"
                onClick={() => navigate(placeDetailUrl)}
              >
                <span className={`place-row-icon ${visit.showDishes ? '' : 'sage'}`}>
                  {visit.showDishes ? <Utensils size={21} /> : <Mountain size={22} />}
                </span>
                <div className="place-row-body">
                  <div className="place-row-header">
                    <h3>
                      <Link to={placeDetailUrl} onClick={(e) => e.stopPropagation()}>
                        {visit.title}
                      </Link>
                    </h3>
                    {visit.location ? (
                      <Link
                        to={`/boards/${id}?select=${encodeURIComponent(key)}`}
                        className="place-card-pin-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapPin size={14} />
                        Show on map
                      </Link>
                    ) : (
                      <Link
                        to={`/visits/${visit._id}/edit`}
                        className="place-card-pin-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapPin size={14} />
                        Set pin
                      </Link>
                    )}
                  </div>
                  <p>
                    {visit.place || 'Location not recorded'} · {entries.length}{' '}
                    {entries.length === 1 ? 'visit' : 'visits'}
                  </p>
                </div>
              </article>
            );
          })
        ) : (
          <p className="no-results">
            {activeTab === 'unpinned' ? 'No places waiting for a pin!' : 'No matching places.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function PlaceDetailPage() {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const [params] = useSearchParams();
  const titleParam = params.get('title') || '';
  const placeParam = params.get('place') || '';

  const detail = useQuery(api.boards.get, { boardId: id });
  const {
    results: visitsList,
    status: visitsStatus,
    loadMore: loadVisits,
  } = usePaginatedQuery(api.visits.list, { boardId: id }, { initialNumItems: 50 });

  useEffect(() => {
    if (visitsStatus === 'CanLoadMore') loadVisits(50);
  }, [visitsStatus, loadVisits]);

  const targetKey = `${titleParam.trim().toLowerCase()}|${placeParam.trim().toLowerCase()}`;

  const placeEntries = useMemo(() => {
    return visitsList.filter(
      (v) => `${v.title.trim().toLowerCase()}|${v.place.trim().toLowerCase()}` === targetKey,
    );
  }, [visitsList, targetKey]);

  if (!detail || visitsStatus === 'LoadingFirstPage') return <Spinner />;

  const pinnedVisit = placeEntries.find((v) => v.location);
  const title = placeEntries[0]?.title || titleParam || 'Place';
  const place = placeEntries[0]?.place || placeParam || '';

  const mapPins = pinnedVisit?.location
    ? [{ id: targetKey, title, location: pinnedVisit.location, count: placeEntries.length }]
    : [];

  return (
    <div className="page place-detail-page">
      <Back to={`/boards/${id}/places`}>Places list</Back>

      <header className="page-heading">
        <h1>{title}</h1>
        {place && (
          <p className="subtitle">
            {place} · {placeEntries.length} {placeEntries.length === 1 ? 'visit' : 'visits'}
          </p>
        )}
      </header>

      {/* Map on top of page */}
      <div className="map-shell place-detail-map" style={{ marginBottom: '24px' }}>
        <PlacesMap places={mapPins} />
        {!pinnedVisit?.location && (
          <div className="map-hint" style={{ pointerEvents: 'auto' }}>
            <MapPin size={15} />
            <span>No location pin set for this place yet.</span>
            {placeEntries[0] && (
              <Link className="button secondary" to={`/visits/${placeEntries[0]._id}/edit`}>
                Set pin
              </Link>
            )}
          </div>
        )}
      </div>

      {/* All visits to this place */}
      <section className="place-visits-section">
        <div className="recent-heading" style={{ marginBottom: '16px' }}>
          <h2>All visits ({placeEntries.length})</h2>
        </div>

        {placeEntries.length > 0 ? (
          <div className="memory-grid">
            {placeEntries.map((visit) => (
              <VisitCard
                key={visit._id}
                visit={visit}
                variant="editorial"
                members={detail.members}
                isRow={false}
              />
            ))}
          </div>
        ) : (
          <p className="no-results">No visits found for this place.</p>
        )}
      </section>
    </div>
  );
}
