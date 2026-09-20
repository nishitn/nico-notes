import { useEffect, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Heart,
  Image,
  MapPin,
  Plus,
  Settings2,
  Star,
  Utensils,
  UserPlus,
} from 'lucide-react';
import { api } from '@date-notes/backend/api';
import type { Id } from '@date-notes/backend/dataModel';
import { Artwork } from './Artwork';
import { Photo } from './Photos';
import { Invitations } from './Settings';
import {
  Back,
  Empty,
  ErrorNote,
  Field,
  Form,
  Initials,
  Modal,
  Spinner,
  Submit,
  formatDate,
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
export function BoardPage() {
  const [addingMember, setAddingMember] = useState(false);
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const me = useQuery(api.boards.me);
  const detail = useQuery(api.boards.get, { boardId: id });
  const { results, status, loadMore } = usePaginatedQuery(
    api.visits.list,
    { boardId: id },
    { initialNumItems: 12 },
  );
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
    <div className="page">
      <header className="board-heading">
        <h1>{detail.board.name}</h1>
        <div className="members-inline">
          <div className="avatar-stack">
            {detail.members.slice(0, 5).map((p) => (
              <Initials key={p._id} name={p.name} small />
            ))}
          </div>
          <span>
            {detail.members.length === 1 ? '1 member' : `${detail.members.length} members`}
          </span>
          {me?._id === detail.board.ownerId && (
            <button
              className="button secondary add-member"
              onClick={() => setAddingMember(true)}
              disabled={detail.members.length >= 20}
            >
              <UserPlus size={16} /> Add member
            </button>
          )}
        </div>
        {detail.board.description && <p>{detail.board.description}</p>}
      </header>
      {addingMember && me?._id === detail.board.ownerId && (
        <Modal title="Add member" onClose={() => setAddingMember(false)}>
          <Invitations boardId={id} />
        </Modal>
      )}
      <div className="section-heading">
        <div>
          <h2>
            Visits{' '}
            <span className="count">
              {results.length}
              {status === 'CanLoadMore' ? '+' : ''}
            </span>
          </h2>
        </div>
        <div className="actions">
          <Link
            className="button secondary"
            to={`/boards/${id}/settings`}
            aria-label="Board settings"
          >
            <Settings2 size={17} />
            <span>Board settings</span>
          </Link>
          <Link className="button primary" to={`/boards/${id}/visits/new`}>
            <Plus size={18} /> Add visit
          </Link>
        </div>
      </div>
      {status === 'LoadingFirstPage' ? (
        <Spinner />
      ) : results.length === 0 ? (
        <Empty
          title="No visits yet"
          action={
            <Link className="button primary" to={`/boards/${id}/visits/new`}>
              <Plus size={18} /> Add visit
            </Link>
          }
        >
          Add a visit to save dishes, ratings, and photos.
        </Empty>
      ) : (
        <div className="visit-grid">
          {results.map((visit) => (
            <Link className="visit-card" key={visit._id} to={`/visits/${visit._id}`}>
              <div className={`visit-cover ${detail.board.accent}`}>
                {visit.photoId ? (
                  <Photo id={visit.photoId} alt={visit.title} />
                ) : (
                  <Artwork variant={visit.showDishes ? 'food' : 'adventure'} />
                )}
                <span className="cover-badge">{visit.typeName}</span>
                {visit.overall !== null && (
                  <span className="score-badge">
                    <Star size={13} fill="currentColor" />
                    {visit.overall.toFixed(1)}
                    <small>/10</small>
                  </span>
                )}
              </div>
              <div className="visit-card-body">
                <span className="date-label">
                  <CalendarDays size={13} />
                  {formatDate(visit.date)}
                </span>
                <h3>{visit.title}</h3>
                {visit.place && (
                  <p className="place">
                    <MapPin size={14} />
                    {visit.place}
                  </p>
                )}
                <div className="visit-card-footer">
                  <span>
                    <Utensils size={14} />
                    {visit.dishCount} dishes
                  </span>
                  <span>
                    <Image size={14} />
                    {visit.photoCount} photos
                  </span>
                  <ArrowRight size={18} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {status === 'CanLoadMore' && (
        <button className="button secondary load-more" onClick={() => loadMore(12)}>
          More visits
        </button>
      )}
    </div>
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
