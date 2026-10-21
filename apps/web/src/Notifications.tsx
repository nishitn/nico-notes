import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Bell, CheckCheck } from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import { BoardHeader } from './BoardDashboard';
import { ErrorNote, Spinner, useTask } from './ui';

export function NotificationsPage() {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const detail = useQuery(api.boards.get, { boardId: id });
  return detail ? (
    <div className="page board-dashboard design-editorial notifications-page">
      <BoardHeader detail={detail} />
      <BoardNotifications key={id} boardId={id} />
    </div>
  ) : (
    <Spinner label="Loading board…" />
  );
}

export function BoardNotifications({ boardId }: { boardId: Id<'boards'> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.list,
    { boardId },
    { initialNumItems: 30 },
  );
  const markRead = useMutation(api.notifications.markRead);
  const task = useTask();
  const newest = results[0];
  return (
    <section aria-labelledby="notifications-title">
      <div className="page-heading notifications-heading">
        <div>
          <h2 id="notifications-title">Notifications</h2>
          <p className="muted">What’s changed on your board, newest first.</p>
        </div>
        <button
          className="button secondary small"
          disabled={!newest?.unread || task.busy}
          onClick={() =>
            newest && void task.run(() => markRead({ boardId, throughId: newest._id }))
          }
        >
          <CheckCheck size={17} /> {task.busy ? 'Marking as read…' : 'Mark all as read'}
        </button>
      </div>
      <ErrorNote text={task.error} />
      {status === 'LoadingFirstPage' ? (
        <Spinner label="Loading notifications…" />
      ) : results.length ? (
        <ol className="notification-list">
          {results.map((item) => (
            <li key={item._id} className={`notification-card ${item.unread ? 'unread' : ''}`}>
              <span className="notification-icon" aria-hidden="true">
                <Bell size={19} />
              </span>
              <div className="notification-content">
                <p>
                  <strong>{item.actorName}</strong> {item.summary}
                </p>
                <time className="small muted" dateTime={new Date(item.createdAt).toISOString()}>
                  {new Date(item.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
                {item.visitId && (
                  <Link className="notification-link" to={`/visits/${item.visitId}`}>
                    View visit <ArrowRight size={14} />
                  </Link>
                )}
              </div>
              {item.unread && <span className="notification-new">New</span>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="first-memory">
          <Bell size={35} />
          <h3>No changes yet</h3>
          <p>New visits, ratings, photos, and other board changes will appear here.</p>
        </div>
      )}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <button
          className="button secondary"
          disabled={status === 'LoadingMore'}
          onClick={() => loadMore(30)}
        >
          {status === 'LoadingMore' ? 'Loading…' : 'Older notifications'}
        </button>
      )}
    </section>
  );
}
