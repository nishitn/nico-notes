import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowRight, Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import { nextNotificationTimeUpdate, notificationTime } from '@nico-notes/backend/notificationTime';
import { notificationText } from '@nico-notes/backend/notificationText';
import { GoogleAttribution } from './GoogleAttribution';
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
  const markOneRead = useMutation(api.notifications.markOneRead);
  const deleteAll = useMutation(api.notifications.deleteAll);
  const hasUnread = useQuery(api.notifications.hasUnread, { boardId });
  const task = useTask();
  const newest = results[0];
  const [now, setNow] = useState(Date.now);
  const nextUpdate = results.reduce(
    (next, item) => Math.min(next, nextNotificationTimeUpdate(item.createdAt, now) ?? Infinity),
    Infinity,
  );
  useEffect(() => {
    if (!Number.isFinite(nextUpdate)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextUpdate - Date.now()));
    return () => clearTimeout(timer);
  }, [nextUpdate]);
  return (
    <section aria-labelledby="notifications-title">
      <div className="page-heading notifications-heading">
        <h2 id="notifications-title">Notifications</h2>
        <div className="notification-toolbar">
          <button
            className="button secondary small"
            disabled={!newest || !(hasUnread ?? results.some((item) => item.unread)) || task.busy}
            onClick={() =>
              newest && void task.run(() => markRead({ boardId, throughId: newest._id }))
            }
          >
            <CheckCheck size={17} /> Mark all as read
          </button>
          <button
            className="button danger-outline small"
            disabled={!newest || task.busy}
            onClick={() => {
              if (
                window.confirm(
                  'Delete all notifications for this board? This clears your feed only. New notifications will still appear.',
                )
              )
                void task.run(() => deleteAll({ boardId }));
            }}
          >
            <Trash2 size={17} /> Delete all notifications
          </button>
        </div>
      </div>
      <ErrorNote text={task.error} />
      {status === 'LoadingFirstPage' ? (
        <Spinner label="Loading notifications…" />
      ) : results.length ? (
        <ol className="notification-list">
          {results.map((item) => (
            <li key={item._id} className={`notification-card ${item.unread ? 'unread' : ''}`}>
              <span className="notification-icon" aria-hidden="true">
                <Bell size={16} />
              </span>
              <div className="notification-content">
                <p>
                  <strong>{item.actorName}</strong> {notificationText(item)}
                </p>
                {item.message?.googlePlaceId && (
                  <GoogleAttribution placeId={item.message.googlePlaceId} />
                )}
                <div className="notification-actions">
                  {item.visitId && (
                    <Link className="notification-link" to={`/visits/${item.visitId}`}>
                      {item.visitStatus === 'planned' ? 'View wishlist item' : 'View visit'}{' '}
                      <ArrowRight size={13} />
                    </Link>
                  )}
                  {item.unread && (
                    <button
                      className="notification-read"
                      disabled={task.busy}
                      onClick={() =>
                        void task.run(() => markOneRead({ boardId, notificationId: item._id }))
                      }
                    >
                      <Check size={14} /> Mark as read
                    </button>
                  )}
                </div>
              </div>
              <time
                className="notification-time muted"
                dateTime={new Date(item.createdAt).toISOString()}
                title={new Date(item.createdAt).toLocaleString()}
              >
                {notificationTime(item.createdAt, now)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <div className="first-memory">
          <Bell size={35} />
          <h3>No changes yet</h3>
          <p>Visits, wishlist updates, photos, and board changes will appear here.</p>
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
