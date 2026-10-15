import { useEffect, useMemo, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Heart,
  MapPin,
  Mountain,
  Plus,
  Search,
  UserPlus,
  Utensils,
  X,
} from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { usePlaceLinking } from './usePlaceLinking';
import { Artwork } from './Artwork';
import {
  BoardDashboard,
  BoardHeader,
  VisitCard,
  placeKey,
  type DesignVariant,
} from './BoardDashboard';
import { PlacesMap } from './PlacesMap';
import { Back, ErrorNote, Field, Form, Modal, Spinner, Submit, useNotice, useTask } from './ui';

export function BoardForm({ onClose }: { onClose: () => void }) {
  const create = useMutation(api.boards.create);
  const navigate = useNavigate();
  const task = useTask();
  const notice = useNotice();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <Modal title="New board" onClose={onClose}>
      <Form
        onSubmit={() =>
          task.run(async () => {
            const id = await create({ name, description, accent: 'coral' });
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
export function JoinBoardModal({ onClose }: { onClose: () => void }) {
  const requestToJoin = useMutation(api.boards.requestToJoin);
  const navigate = useNavigate();
  const task = useTask();
  const notice = useNotice();
  const [code, setCode] = useState('');

  return (
    <Modal title="Join a board" onClose={onClose}>
      <Form
        onSubmit={() =>
          task.run(async () => {
            const res = await requestToJoin({ code });
            if (res.status === 'already_member') {
              notice(`You are already a member of "${res.boardName}".`);
              onClose();
              navigate(`/boards/${res.boardId}`);
            } else if (res.status === 'already_pending') {
              notice(`You already have a pending join request for "${res.boardName}".`);
              onClose();
            } else {
              notice(`Join request sent to the admins of "${res.boardName}"!`);
              onClose();
            }
          })
        }
      >
        <Field
          label="Board invite code or link"
          hint="Ask a board member for their invite code or invitation link."
        >
          <input
            required
            autoFocus
            placeholder="e.g. MINT-ROSE-MOON"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <Submit busy={task.busy}>Request to join</Submit>
        </div>
      </Form>
    </Modal>
  );
}
function lastBoardKey(userId: string) {
  return `nico-notes:last-board:${userId}`;
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
  const outgoingRequests = useQuery(api.boards.myOutgoingRequests) ?? [];
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  return (
    <div className="page boards-page">
      <div className="page-heading">
        <div>
          <h1>Boards</h1>
        </div>
        {results.length > 0 && (
          <div className="heading-actions">
            <button className="button secondary" onClick={() => setJoining(true)}>
              <UserPlus size={16} /> Join board
            </button>
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Add board
            </button>
          </div>
        )}
      </div>

      {outgoingRequests.length > 0 && (
        <section className="pending-requests-section">
          <div className="section-title-row">
            <Clock size={17} />
            <h2>Pending requests ({outgoingRequests.length})</h2>
          </div>
          <div className="pending-requests-grid">
            {outgoingRequests.map((req) => (
              <div key={req._id} className="pending-request-card">
                <div className="pending-request-header">
                  <strong>{req.boardName}</strong>
                  <span className="pending-pill">Awaiting admin approval</span>
                </div>
                <p className="small muted">
                  Requested {new Date(req.createdAt).toLocaleDateString()} · Waiting for an admin to
                  accept
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {status === 'LoadingFirstPage' ? (
        <Spinner />
      ) : results.length === 0 ? (
        <div className="empty boards-empty">
          <div className="empty-keepsake" aria-hidden="true">
            <Artwork variant="notes" />
            <span className="keepsake-spark">✧</span>
            <Heart className="keepsake-heart" size={23} />
          </div>
          <h2>No boards yet</h2>
          <p>Create a board or join one with an invite code.</p>
          <div className="empty-actions">
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={18} /> Create a board
            </button>
            <button className="text-button" onClick={() => setJoining(true)}>
              <UserPlus size={16} /> Have an invite code?
            </button>
          </div>
        </div>
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
      {creating && <BoardForm onClose={() => setCreating(false)} />}
      {joining && <JoinBoardModal onClose={() => setJoining(false)} />}
    </div>
  );
}
export function BoardPage({ forcedDesign }: { forcedDesign?: DesignVariant } = {}) {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const me = useQuery(api.boards.me);
  const detail = useQuery(api.boards.get, { boardId: id });
  usePlaceLinking(detail?.board._id);
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
      forcedDesign={forcedDesign}
    />
  );
}
export function InvitePage() {
  const { token = '' } = useParams();
  const invite = useQuery(api.boards.invitation, { token });
  const request = useMutation(api.boards.requestToJoin);
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
        {invite.alreadyMember
          ? 'You’re already a member of this board.'
          : invite.requestStatus === 'pending'
            ? 'Your request is waiting for a board admin’s approval.'
            : invite.requestStatus === 'rejected'
              ? 'An admin declined your request. You can request to join again.'
              : 'Request to join. A board admin will approve your access.'}
      </p>
      <ErrorNote text={task.error} />
      <button
        className="button primary"
        disabled={task.busy || (!invite.alreadyMember && invite.requestStatus === 'pending')}
        onClick={() =>
          task.run(async () => {
            if (invite.alreadyMember) {
              navigate(`/boards/${invite.boardId}`);
              return;
            }
            const result = await request({ code: token });
            if (result.status === 'already_member') navigate(`/boards/${result.boardId}`);
          })
        }
      >
        {task.busy
          ? 'Sending request…'
          : invite.alreadyMember
            ? 'Open board'
            : invite.requestStatus === 'pending'
              ? 'Request pending'
              : 'Request to join'}
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
  usePlaceLinking(detail?.board._id);
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
      const key = placeKey(visit);
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
    <div className="page places-page board-dashboard design-editorial">
      <Back to={`/boards/${id}`}>{detail.board.name}</Back>
      <BoardHeader detail={detail} />
      <div className="section-heading places-list-heading">
        <div>
          <h2>Your Places</h2>
          <p className="small muted">
            {groups.length} explored places across {visits.length} visits
          </p>
        </div>
      </div>

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
            )}&place=${encodeURIComponent(visit.place || '')}&placeId=${visit.placeId ?? ''}`;

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
  usePlaceLinking(detail?.board._id);
  const {
    results: visitsList,
    status: visitsStatus,
    loadMore: loadVisits,
  } = usePaginatedQuery(api.visits.list, { boardId: id }, { initialNumItems: 50 });

  useEffect(() => {
    if (visitsStatus === 'CanLoadMore') loadVisits(50);
  }, [visitsStatus, loadVisits]);

  const requestedPlaceId = params.get('placeId');
  const targetKey = `${titleParam.trim().toLowerCase()}|${placeParam.trim().toLowerCase()}`;

  const placeEntries = useMemo(() => {
    return visitsList.filter((v) =>
      requestedPlaceId
        ? v.placeId === requestedPlaceId
        : `${v.title.trim().toLowerCase()}|${v.place.trim().toLowerCase()}` === targetKey,
    );
  }, [visitsList, targetKey, requestedPlaceId]);

  if (!detail || visitsStatus === 'LoadingFirstPage') return <Spinner />;

  const pinnedVisit = placeEntries.find((v) => v.location);
  const title = placeEntries[0]?.title || titleParam || 'Place';
  const place = placeEntries[0]?.place || placeParam || '';

  const mapPins = pinnedVisit?.location
    ? [{ id: targetKey, title, location: pinnedVisit.location, count: placeEntries.length }]
    : [];

  return (
    <div className="page place-detail-page">
      <Back
        to={
          params.get('from') === 'map'
            ? `/boards/${id}?select=${encodeURIComponent(targetKey)}`
            : `/boards/${id}/places`
        }
      >
        {params.get('from') === 'map' ? 'Map view' : 'Places list'}
      </Back>

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
