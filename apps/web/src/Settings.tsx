import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, Link2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '@date-notes/backend/api';
import type { Doc, Id } from '@date-notes/backend/dataModel';
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
  useNotice,
  useTask,
} from './ui';

function BoardDetails({ board }: { board: Doc<'boards'> }) {
  const update = useMutation(api.boards.update);
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [accent, setAccent] = useState(board.accent);
  const task = useTask();
  const notice = useNotice();
  return (
    <Form
      onSubmit={() =>
        task.run(async () => {
          await update({ boardId: board._id, name, description, accent });
          notice('Board details updated.');
        })
      }
    >
      <Field label="Board name">
        <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <fieldset className="color-picker">
        <legend>Board color</legend>
        {(['coral', 'sage', 'peach'] as const).map((color) => (
          <label
            key={color}
            className={`color-option ${color} ${accent === color ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="accent"
              checked={accent === color}
              onChange={() => setAccent(color)}
            />
            <span>{color}</span>
          </label>
        ))}
      </fieldset>
      <ErrorNote text={task.error} />
      <div className="form-actions">
        <Submit busy={task.busy}>Save board</Submit>
      </div>
    </Form>
  );
}
export function Invitations({ boardId }: { boardId: Id<'boards'> }) {
  const invitations = useQuery(api.boards.invitations, { boardId });
  const create = useMutation(api.boards.createInvitation);
  const revoke = useMutation(api.boards.revokeInvitation);
  const [revoking, setRevoking] = useState<Id<'invitations'> | null>(null);
  const task = useTask();
  const notice = useNotice();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const active = invitations?.find((i) => !i.revoked && i.expiresAt > now);
  const link = active ? `${window.location.origin}/invite/${active.token}` : '';
  if (!invitations) return <Spinner label="Loading invitations…" />;
  return (
    <>
      <p className="muted">
        Anyone with your link can join after signing in. Links last seven days. Share it only with
        your people.
      </p>
      {active ? (
        <div className="invite-link-box">
          <Field label="Invitation link">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </Field>
          <div className="actions">
            <button
              className="button secondary"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  notice('Invitation link copied.');
                })
              }
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button className="text-button danger-text" onClick={() => setRevoking(active._id)}>
              Revoke link
            </button>
          </div>
          <small className="muted">Expires {new Date(active.expiresAt).toLocaleDateString()}</small>
        </div>
      ) : (
        <button
          className="button primary"
          disabled={task.busy}
          onClick={() =>
            task.run(async () => {
              await create({ boardId });
              setCopied(false);
            })
          }
        >
          <Link2 size={16} /> Create invitation link
        </button>
      )}
      <ErrorNote text={task.error} />
      {revoking && (
        <Confirm
          title="Revoke this invitation?"
          onClose={() => setRevoking(null)}
          onConfirm={() => revoke({ invitationId: revoking })}
        >
          This link will stop working. Existing members will keep their access.
        </Confirm>
      )}
    </>
  );
}
function TypeEditor({
  boardId,
  type,
  onClose,
}: {
  boardId: Id<'boards'>;
  type?: Doc<'visitTypes'>;
  onClose: () => void;
}) {
  const save = useMutation(api.visitTypes.save);
  const [name, setName] = useState(type?.name ?? '');
  const [categories, setCategories] = useState(type?.categories.join(', ') ?? '');
  const [showDishes, setShowDishes] = useState(type?.showDishes ?? false);
  const task = useTask();
  return (
    <Modal title={type ? 'Edit visit type' : 'Make a visit type'} onClose={onClose}>
      <Form
        onSubmit={() =>
          task.run(async () => {
            await save({
              boardId,
              id: type?._id,
              name,
              categories: categories
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              showDishes,
            });
            onClose();
          })
        }
      >
        <Field label="Type name">
          <input
            required
            autoFocus
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trek"
          />
        </Field>
        <Field
          label="Preset rating categories"
          hint="Separate with commas, in the order you want them. Up to 20 categories."
        >
          <textarea
            rows={3}
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="View, Trail, Experience"
          />
        </Field>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDishes}
            onChange={(e) => setShowDishes(e.target.checked)}
          />
          Include dishes to rate
        </label>
        <p className="muted small">
          Changes apply to future visits. Existing visits keep their categories and ratings.
        </p>
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <Submit busy={task.busy}>Save visit type</Submit>
        </div>
      </Form>
    </Modal>
  );
}
export function Settings() {
  const { boardId } = useParams();
  const id = boardId as Id<'boards'>;
  const detail = useQuery(api.boards.get, { boardId: id });
  const me = useQuery(api.boards.me);
  const removeMember = useMutation(api.boards.removeMember);
  const removeBoard = useMutation(api.boards.remove);
  const removeType = useMutation(api.visitTypes.remove);
  const navigate = useNavigate();
  const [editingType, setEditingType] = useState<Doc<'visitTypes'> | 'new' | null>(null);
  const [removingType, setRemovingType] = useState<Doc<'visitTypes'> | null>(null);
  const [removingMember, setRemovingMember] = useState<{ _id: Id<'users'>; name: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  if (!detail || !me) return <Spinner />;
  const owner = detail.board.ownerId === me._id;
  return (
    <div className="page settings-page">
      <Back to={`/boards/${id}`}>{detail.board.name}</Back>
      <div className="page-heading">
        <div>
          <h1>Board settings</h1>
        </div>
      </div>
      <div className="settings-grid">
        <div>
          {owner && (
            <section className="settings-card">
              <h2>The details</h2>
              <BoardDetails board={detail.board} />
            </section>
          )}
          <section className="settings-card">
            <div className="section-heading">
              <div>
                <h2>Visit types</h2>
              </div>
              <button
                className="button secondary"
                onClick={() => setEditingType('new')}
                disabled={detail.types.length >= 50}
              >
                <Plus size={16} /> New type
              </button>
            </div>
            <div className="type-list">
              {detail.types.map((type) => (
                <div className="type-row" key={type._id}>
                  <div>
                    <strong>{type.name}</strong>
                    <p>
                      {type.categories.join(' · ') || 'No preset categories'}
                      {type.showDishes && ' · Dishes'}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${type.name} type`}
                    onClick={() => setEditingType(type)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${type.name} type`}
                    onClick={() => setRemovingType(type)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {detail.types.length === 0 && (
              <p className="muted">
                Create a type like Food or Trek to reuse your favorite rating categories.
              </p>
            )}
          </section>
        </div>
        <div>
          <section className="settings-card">
            <div className="section-heading">
              <h2>
                <Users size={20} /> Your people{' '}
                <span className="count">{detail.members.length}/20</span>
              </h2>
            </div>
            {detail.members.map((person) => (
              <div className="member-row" key={person._id}>
                <Initials name={person.name} />
                <div>
                  <strong>
                    {person.name}
                    {person._id === me._id ? ' (you)' : ''}
                  </strong>
                  <span>{person._id === detail.board.ownerId ? 'Board owner' : 'Member'}</span>
                </div>
                {owner && person._id !== me._id && (
                  <button
                    className="icon-button"
                    aria-label={`Remove ${person.name}`}
                    onClick={() => setRemovingMember(person)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {owner && (
              <div className="invite-settings">
                <h3>Save them a seat</h3>
                <Invitations boardId={id} />
              </div>
            )}
          </section>
          {owner && (
            <section className="settings-card danger-zone">
              <h2>Delete this board</h2>
              <p className="muted small">
                Permanently remove this board and all of its visits, photos, and ratings.
              </p>
              <button className="button danger-outline" onClick={() => setDeleting(true)}>
                <Trash2 size={16} /> Delete board
              </button>
            </section>
          )}
        </div>
      </div>
      {editingType && (
        <TypeEditor
          boardId={id}
          type={editingType === 'new' ? undefined : editingType}
          onClose={() => setEditingType(null)}
        />
      )}
      {removingType && (
        <Confirm
          title={`Delete ${removingType.name} type?`}
          onClose={() => setRemovingType(null)}
          onConfirm={() => removeType({ id: removingType._id })}
        >
          Existing visits and their ratings will stay as they are.
        </Confirm>
      )}
      {removingMember && (
        <Confirm
          title={`Remove ${removingMember.name}?`}
          onClose={() => setRemovingMember(null)}
          onConfirm={() => removeMember({ boardId: id, userId: removingMember._id })}
        >
          They will lose access to this board. Their existing contributions will remain. Revoke any
          invitation link they have to prevent them joining again.
        </Confirm>
      )}
      {deleting && (
        <Confirm
          title="Delete this entire board?"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await removeBoard({ boardId: id });
            navigate('/');
          }}
        >
          All visits, photos, and ratings will be permanently removed for everyone. This cannot be
          undone.
        </Confirm>
      )}
    </div>
  );
}
