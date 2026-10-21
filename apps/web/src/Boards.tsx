import { useEffect, useMemo, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock, Heart, MapPin, Plus, Search, UserPlus, X } from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import { usePlaceLinking } from './usePlaceLinking';
import { Artwork } from './Artwork';
import { useUnsavedChanges } from './useUnsavedChanges';
import { BoardDashboard, BoardHeader, VisitCard, type DesignVariant } from './BoardDashboard';
import { PlacesMap } from './PlacesMap';
import { Back, ErrorNote, Field, Form, Modal, Spinner, Submit, useNotice, useTask } from './ui';

export function BoardForm({ onClose }: { onClose: () => void }) {
  const create = useMutation(api.boards.create);
  const navigate = useNavigate();
  const task = useTask();
  const notice = useNotice();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const guard = useUnsavedChanges(!!(name || description), task.busy);
  const close = () => {
    if (!task.busy && (!(name || description) || window.confirm('Discard this board draft?')))
      onClose();
  };
  return (
    <Modal title="New board" onClose={close}>
      <Form
        onSubmit={() =>
          task.run(async () => {
            const id = await create({ name, description, accent: 'coral' });
            notice('Board created.');
            guard.allowNavigation();
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
          <button type="button" className="button secondary" disabled={task.busy} onClick={close}>
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
            <h2>Join requests ({outgoingRequests.length})</h2>
          </div>
          <div className="pending-requests-grid">
            {outgoingRequests.map((req) => (
              <div key={req._id} className="pending-request-card">
                <div className="pending-request-header">
                  <strong>{req.boardName}</strong>
                  <span className="pending-pill">
                    {req.status === 'accepted'
                      ? 'Approved'
                      : req.status === 'rejected'
                        ? 'Not approved'
                        : 'Awaiting admin approval'}
                  </span>
                </div>
                <p className="small muted">
                  Requested {new Date(req.createdAt).toLocaleDateString()}
                  {req.status === 'pending' && ' · Waiting for an admin to accept'}
                  {req.status === 'rejected' && ' · Ask an admin before requesting again.'}
                </p>
                {req.status === 'accepted' && (
                  <Link className="button secondary small" to={`/boards/${req.boardId}`}>
                    Open board
                  </Link>
                )}
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
  const detail = useQuery(api.boards.get, { boardId: id });
  usePlaceLinking(detail?.board._id);
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') === 'unpinned' ? 'unpinned' : 'all';
  const [query, setQuery] = useState('');
  const {
    results: places,
    status,
    loadMore,
  } = usePaginatedQuery(api.places.list, { boardId: id }, { initialNumItems: 100 });
  useEffect(() => {
    if (query.trim() && status === 'CanLoadMore') loadMore(100);
  }, [query, status, loadMore]);
  const matching = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return places.filter(
      (place) =>
        (!trimmed || `${place.name} ${place.address}`.toLowerCase().includes(trimmed)) &&
        (activeTab !== 'unpinned' || !place.location),
    );
  }, [places, query, activeTab]);
  const unpinned = places.filter((place) => !place.location).length;
  if (!detail || status === 'LoadingFirstPage') return <Spinner />;
  return (
    <div className="page places-page board-dashboard design-editorial">
      <Back to={`/boards/${id}`}>{detail.board.name}</Back>
      <BoardHeader detail={detail} />
      <div className="section-heading places-list-heading">
        <div>
          <h2>Your Places</h2>
          <p className="small muted">
            {places.length} {status === 'Exhausted' ? 'saved places' : 'places loaded'}
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
            onChange={(event) => setQuery(event.target.value)}
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
            All places
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'unpinned' ? 'active' : ''}`}
            onClick={() => setParams({ tab: 'unpinned' }, { replace: true })}
          >
            Without a pin ({unpinned}
            {status !== 'Exhausted' ? '+' : ''})
          </button>
        </div>
      </div>
      <div className="places-list" style={{ marginTop: 20 }}>
        {matching.map((place) => {
          const placeDetailUrl = `/boards/${id}/place?placeId=${place._id}`;
          return (
            <article key={place._id} className="place-row">
              <span className="place-row-icon">
                <MapPin size={21} />
              </span>
              <div className="place-row-body">
                <div className="place-row-header">
                  <h3>
                    <Link to={placeDetailUrl}>{place.name}</Link>
                  </h3>
                  <Link
                    className="place-card-pin-link"
                    to={
                      place.location
                        ? `/boards/${id}?select=${encodeURIComponent(place._id)}`
                        : placeDetailUrl
                    }
                  >
                    <MapPin size={14} />
                    {place.location ? 'Show on map' : 'Set pin'}
                  </Link>
                </div>
                <p>
                  {place.address || 'Address not recorded'}
                  {place.visitCount !== undefined &&
                    ` · ${place.visitCount} ${place.visitCount === 1 ? 'visit' : 'visits'}`}
                </p>
              </div>
            </article>
          );
        })}
        {!matching.length && (
          <p className="no-results" role="status">
            {status !== 'Exhausted' && query.trim()
              ? 'Searching saved places…'
              : query.trim()
                ? 'No matching places.'
                : activeTab === 'unpinned'
                  ? 'No loaded places are missing a pin.'
                  : 'No saved places yet.'}
          </p>
        )}
      </div>
      {status !== 'Exhausted' && (
        <div className="list-pagination">
          <button
            type="button"
            className="button secondary"
            disabled={status !== 'CanLoadMore'}
            onClick={() => loadMore(100)}
          >
            {status === 'LoadingMore' ? 'Loading places…' : 'Load more places'}
          </button>
        </div>
      )}
    </div>
  );
}

export function PlaceDetailPage() {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const [params] = useSearchParams();
  const requestedPlaceId = params.get('placeId') as Id<'places'> | null;
  const detail = useQuery(api.boards.get, { boardId: id });
  usePlaceLinking(detail?.board._id);
  // Resolve older title/address bookmarks through the canonical place index.
  const legacy = usePaginatedQuery(api.places.list, !requestedPlaceId ? { boardId: id } : 'skip', {
    initialNumItems: 100,
  });
  const legacyPlace = legacy.results.find(
    (place) =>
      place.name.trim().toLowerCase() === (params.get('title') || '').trim().toLowerCase() &&
      place.address.trim().toLowerCase() === (params.get('place') || '').trim().toLowerCase(),
  );
  const placeId = requestedPlaceId ?? legacyPlace?._id;
  const { status: legacyStatus, loadMore: loadLegacy } = legacy;
  useEffect(() => {
    if (!requestedPlaceId && !legacyPlace && legacyStatus === 'CanLoadMore') loadLegacy(100);
  }, [requestedPlaceId, legacyPlace, legacyStatus, loadLegacy]);
  const place = useQuery(api.places.get, placeId ? { placeId } : 'skip');
  const {
    results: visits,
    status,
    loadMore,
  } = usePaginatedQuery(api.visits.list, placeId ? { boardId: id, placeId } : 'skip', {
    initialNumItems: 24,
  });
  if (!detail || (placeId && (place === undefined || status === 'LoadingFirstPage')))
    return <Spinner />;
  if (!placeId || !place || place.boardId !== id)
    return (
      <div className="page">
        <Back to={`/boards/${id}/places`}>Places</Back>
        {!requestedPlaceId && legacy.status !== 'Exhausted' ? (
          <Spinner />
        ) : (
          <p role="status">
            This place is unavailable. Older visits may still be linking; reopen the places list to
            retry.
          </p>
        )}
      </div>
    );
  const placeUrl = `/boards/${id}/places`;
  const mapPins = place.location
    ? [{ id: place._id, title: place.name, location: place.location, count: place.visitCount ?? 1 }]
    : [];
  return (
    <div className="page place-detail-page">
      <Back
        to={
          params.get('from') === 'map'
            ? `/boards/${id}?select=${encodeURIComponent(place._id)}`
            : placeUrl
        }
      >
        {params.get('from') === 'map' ? 'Map view' : 'Places list'}
      </Back>
      <header className="page-heading">
        <h1>{place.name}</h1>
        {place.address && <p className="subtitle">{place.address}</p>}
      </header>
      <div className="map-shell place-detail-map" style={{ marginBottom: 24 }}>
        <PlacesMap places={mapPins} />
        {!place.location && (
          <div className="map-hint" style={{ pointerEvents: 'auto' }}>
            <MapPin size={15} />
            <span>No location pin yet.</span>
            {visits[0] && (
              <Link className="button secondary" to={`/visits/${visits[0]._id}/edit`}>
                Set pin
              </Link>
            )}
          </div>
        )}
      </div>
      <section className="place-visits-section">
        <div className="recent-heading" style={{ marginBottom: 16 }}>
          <h2>Visits{place.visitCount !== undefined ? ` (${place.visitCount})` : ''}</h2>
        </div>
        {visits.length ? (
          <div className="memory-grid">
            {visits.map((visit) => (
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
        {status !== 'Exhausted' && (
          <div className="list-pagination">
            <button
              type="button"
              className="button secondary"
              disabled={status !== 'CanLoadMore'}
              onClick={() => loadMore(24)}
            >
              {status === 'LoadingMore' ? 'Loading visits…' : 'Load more visits'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
