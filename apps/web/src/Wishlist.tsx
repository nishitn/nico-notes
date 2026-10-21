import { GoogleAttribution } from './GoogleAttribution';
import { useEffect, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, ChevronRight, Plus, Search, X } from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import { BoardHeader } from './BoardDashboard';
import { Back, ErrorNote, Spinner, useTask } from './ui';

export function safeExternalUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function WishlistPage() {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const board = useQuery(api.boards.get, { boardId: id });
  const { results, status, loadMore } = usePaginatedQuery(
    api.wishlist.list,
    { boardId: id },
    { initialNumItems: 50 },
  );
  const ensurePlanned = useMutation(api.wishlist.ensurePlanned);
  const ensureVisit = useMutation(api.wishlist.ensureVisit);
  const navigate = useNavigate();
  const task = useTask();
  const [query, setQuery] = useState('');
  useEffect(() => {
    void ensurePlanned({ boardId: id }).catch(() => undefined);
  }, [id, ensurePlanned]);
  useEffect(() => {
    if (query.trim() && status === 'CanLoadMore') loadMore(50);
  }, [query, status, loadMore]);
  const matching = results.filter((item) =>
    `${item.title} ${item.place ?? ''} ${item.notes ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  if (!board) return <Spinner />;
  return (
    <div className="page wishlist-page">
      <Back to={`/boards/${id}`}>{board.board.name}</Back>
      <BoardHeader detail={board} />
      <div className="page-heading">
        <h1>Wishlist</h1>
        <Link className="button primary" to={`/boards/${id}/visits/new?planned=1`}>
          <Plus size={18} />
          Plan a visit
        </Link>
      </div>
      <div className="places-search">
        <Search size={18} />
        <input
          aria-label="Search wishlist"
          placeholder="Search wishlist…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <ErrorNote text={task.error} />
      {status === 'LoadingFirstPage' ? (
        <Spinner />
      ) : matching.length ? (
        <div className="wishlist-grid">
          {matching.map((item) => {
            const content = (
              <>
                <div className="section-heading">
                  <h2>{item.title}</h2>
                  <ChevronRight size={20} />
                </div>
                {item.googlePlaceId && <GoogleAttribution placeId={item.googlePlaceId} />}
                {item.place && <p className="small muted">{item.place}</p>}
                {item.notes && <p className="wishlist-note">{item.notes}</p>}
              </>
            );
            return item.visitId ? (
              <Link key={item._id} className="card wishlist-card" to={`/visits/${item.visitId}`}>
                {content}
              </Link>
            ) : (
              <button
                key={item._id}
                type="button"
                className="card wishlist-card"
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    const visitId = await ensureVisit({ id: item._id });
                    navigate(`/visits/${visitId}`);
                  })
                }
              >
                {content}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="first-memory" role="status">
          <Bookmark size={30} />
          <h2>
            {query.trim()
              ? status === 'Exhausted'
                ? 'No matching places'
                : 'Searching wishlist…'
              : 'Your wishlist is empty'}
          </h2>
          {!query.trim() && <p>Plan a place you’d like to visit.</p>}
        </div>
      )}
      {status !== 'LoadingFirstPage' && (
        <div className="list-pagination">
          <span className="small muted">
            {results.length} {status === 'Exhausted' ? 'planned visits' : 'places loaded'}
          </span>
          {status !== 'Exhausted' && (
            <button
              type="button"
              className="button secondary"
              disabled={status !== 'CanLoadMore'}
              onClick={() => loadMore(50)}
            >
              {status === 'LoadingMore' ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
