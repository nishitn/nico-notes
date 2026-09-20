import { useEffect, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Heart } from 'lucide-react';
import { api } from '@date-notes/backend/api';
import type { Id } from '@date-notes/backend/dataModel';
import { Artwork } from './Artwork';
import { BoardDashboard } from './BoardDashboard';
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
export function BoardPage() {
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
  return <BoardDashboard key={id} detail={detail} userId={me?._id} />;
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
