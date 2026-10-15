import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  Clock,
  Cloud,
  Copy,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
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

import { DishRatingsToggle, RatingCategories } from './RatingCategories';

function PhotoStorageSettings({ board }: { board: Doc<'boards'> }) {
  const setStorage = useMutation(api.photos.setStorage);
  const task = useTask();
  const notice = useNotice();
  return (
    <section className="settings-section">
      <h2>
        <span className="settings-icon" aria-hidden="true">
          <Cloud size={18} />
        </span>
        Photo storage
      </h2>
      <div className="settings-section-body">
        <Field
          label="Store new photos in"
          hint="Applies to new uploads on this board. Existing photos stay where they are."
        >
          <select
            value={board.photoStorage ?? 'convex'}
            disabled={task.busy}
            onChange={(event) => {
              const provider = event.target.value as 'convex' | 'local';
              void task.run(async () => {
                await setStorage({ boardId: board._id, provider });
                notice('Photo storage updated');
              });
            }}
          >
            <option value="convex">Convex cloud (default)</option>
            <option value="local">Local storage (Mac mini)</option>
          </select>
        </Field>
        <p>
          Convex stores photos online. Local storage requires the Mac mini photo service to be set
          up and running.
        </p>
        <ErrorNote text={task.error} />
      </div>
    </section>
  );
}

function BoardDetails({ board, canEdit }: { board: Doc<'boards'>; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="board-details-summary">
        <div>
          <strong>{board.name}</strong>
          <p>{board.description || 'No description'}</p>
        </div>
        <button
          className="icon-button"
          aria-label="Edit board details"
          disabled={!canEdit}
          title={!canEdit ? 'Only a board admin can edit board details' : 'Edit board details'}
          onClick={() => setEditing(true)}
        >
          <Pencil size={17} />
        </button>
      </div>
      {editing && <BoardDetailsEditor board={board} onClose={() => setEditing(false)} />}
    </>
  );
}
function BoardDetailsEditor({ board, onClose }: { board: Doc<'boards'>; onClose: () => void }) {
  const update = useMutation(api.boards.update);
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const task = useTask();
  const notice = useNotice();
  return (
    <Modal
      title="Edit board"
      className="board-details-modal"
      onClose={() => {
        if (!task.busy) onClose();
      }}
    >
      <Form
        onSubmit={() =>
          task.run(async () => {
            await update({ boardId: board._id, name, description, accent: board.accent });
            notice('Board details updated.');
            onClose();
          })
        }
      >
        <Field label="Board name">
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={task.busy} onClick={onClose}>
            Cancel
          </button>
          <Submit busy={task.busy}>Save board</Submit>
        </div>
      </Form>
    </Modal>
  );
}
export function PendingRequestsList({ boardId }: { boardId: Id<'boards'> }) {
  const pending = useQuery(api.boards.pendingRequests, { boardId });
  const accept = useMutation(api.boards.acceptRequest);
  const reject = useMutation(api.boards.rejectRequest);
  const task = useTask();
  const notice = useNotice();

  if (!pending) return <Spinner label="Loading join requests…" />;
  if (pending.length === 0) return null;

  return (
    <div className="pending-requests-card">
      <div className="pending-requests-head">
        <Clock size={17} />
        <h3>Pending join requests ({pending.length})</h3>
      </div>
      <p className="muted small">
        These people requested to join using your board's invite code or link.
      </p>
      <ErrorNote text={task.error} />
      <div className="join-requests-list">
        {pending.map((req) => (
          <div key={req._id} className="join-request-row">
            <div className="join-request-user">
              <Initials name={req.userName} small />
              <div>
                <strong>{req.userName}</strong>
                <span className="small muted">
                  Requested {new Date(req.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="join-request-actions">
              <button
                className="button primary small"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await accept({ requestId: req._id });
                    notice(`Accepted ${req.userName} into the board.`);
                  })
                }
              >
                <Check size={14} /> Accept
              </button>
              <button
                className="button secondary small danger-hover"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await reject({ requestId: req._id });
                    notice(`Rejected join request.`);
                  })
                }
              >
                <X size={14} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Invitations({
  boardId,
  inviteCode,
  canManage,
}: {
  boardId: Id<'boards'>;
  inviteCode?: string;
  canManage: boolean;
}) {
  const invitations = useQuery(api.boards.invitations, { boardId });
  const create = useMutation(api.boards.createInvitation);
  const revoke = useMutation(api.boards.revokeInvitation);
  const regenerateCode = useMutation(api.boards.regenerateInviteCode);
  const ensureCode = useMutation(api.boards.ensureInviteCode);
  const [revoking, setRevoking] = useState<Id<'invitations'> | null>(null);
  const task = useTask();
  const notice = useNotice();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const code = generatedCode || inviteCode || '';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!inviteCode && !generatedCode) {
      ensureCode({ boardId })
        .then(setGeneratedCode)
        .catch(() => {});
    }
  }, [inviteCode, generatedCode, boardId, ensureCode]);

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
        {canManage
          ? 'Share an invite. You approve who joins.'
          : 'Share an invite. A board admin approves who joins.'}
      </p>

      {code && (
        <div className="invite-code-card">
          <Field label="Board invite code">
            <div className="code-input-group">
              <input
                readOnly
                value={code}
                className="code-input"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="button secondary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await navigator.clipboard.writeText(code);
                    setCopiedCode(true);
                    notice('Invite code copied.');
                  })
                }
              >
                {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                {copiedCode ? 'Copied' : 'Copy code'}
              </button>
              <button
                type="button"
                className="button secondary icon-only"
                title="Regenerate invite code"
                disabled={!canManage || task.busy}
                onClick={() =>
                  task.run(async () => {
                    const newCode = await regenerateCode({ boardId });
                    setGeneratedCode(newCode);
                    setCopiedCode(false);
                    notice('Generated new invite code.');
                  })
                }
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </Field>
        </div>
      )}

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
                  setCopiedLink(true);
                  notice('Invitation link copied.');
                })
              }
            >
              {copiedLink ? <Check size={16} /> : <Copy size={16} />}
              {copiedLink ? 'Copied' : 'Copy link'}
            </button>
            <button
              className="text-button danger-text"
              disabled={!canManage || task.busy}
              title={!canManage ? 'Only a board admin can revoke invitation links' : undefined}
              onClick={() => setRevoking(active._id)}
            >
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
              setCopiedLink(false);
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
  isAdmin,
  onClose,
}: {
  boardId: Id<'boards'>;
  type?: Doc<'visitTypes'>;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const save = useMutation(api.visitTypes.save);
  const [name, setName] = useState(type?.name ?? '');
  const [categories, setCategories] = useState<string[]>(type?.categories ?? []);
  const [showDishes, setShowDishes] = useState(type?.showDishes ?? false);
  const task = useTask();
  return (
    <Modal
      title={type ? 'Edit visit type' : 'New visit type'}
      onClose={onClose}
      className="visit-type-modal"
    >
      <div className="type-editor-decoration" aria-hidden="true">
        <Sparkles size={24} />
      </div>
      <Form
        onSubmit={() =>
          task.run(async () => {
            await save({
              boardId,
              id: type?._id,
              name,
              categories: categories.map((category) => category.trim()),
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
        <RatingCategories
          value={categories}
          onChange={setCategories}
          locked={isAdmin ? [] : type?.categories}
        />
        <DishRatingsToggle checked={showDishes} onChange={setShowDishes} />
        {type && <small className="muted">Applies to new visits only.</small>}
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
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
  const setMemberRole = useMutation(api.boards.setMemberRole);
  const roleTask = useTask();
  const leave = useMutation(api.boards.leave);
  const [leaving, setLeaving] = useState(false);
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
  const isAdmin = detail.isAdmin;
  const adminCount = detail.members.filter((person) => person.role === 'admin').length;
  return (
    <div className="page settings-page">
      <Back to={`/boards/${id}`}>{detail.board.name}</Back>
      <div className="page-heading">
        <div>
          <h1>Board Settings</h1>
        </div>
      </div>
      <div className="settings-sections">
        <section className="settings-section settings-details">
          <h2>
            <span className="settings-icon" aria-hidden="true">
              <SlidersHorizontal size={18} />
            </span>
            Details
          </h2>
          <div className="settings-section-body">
            <BoardDetails board={detail.board} canEdit={isAdmin} />
          </div>
        </section>
        {isAdmin && <PhotoStorageSettings board={detail.board} />}
        <section className="settings-section settings-types">
          <div className="section-heading">
            <h2>
              <span className="settings-icon" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              Visit types
            </h2>
            <button
              className="button secondary"
              onClick={() => setEditingType('new')}
              disabled={detail.types.length >= 50}
            >
              <Plus size={16} /> New type
            </button>
          </div>
          <div className="settings-section-body">
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
                  {isAdmin && (
                    <button
                      className="icon-button"
                      aria-label={`Delete ${type.name} type`}
                      onClick={() => setRemovingType(type)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {detail.types.length === 0 && (
              <p className="muted">
                Create a type like Food or Trek to reuse your favorite rating categories.
              </p>
            )}
          </div>
        </section>
        <section className="settings-section settings-people">
          <h2>
            <span className="settings-icon" aria-hidden="true">
              <Users size={18} />
            </span>
            Members <span className="count">{detail.members.length}/20</span>
          </h2>
          <div className="settings-section-body">
            {detail.members.map((person) => (
              <div className="member-row" key={person._id}>
                <Initials name={person.name} image={person.image} />
                <div>
                  <strong>
                    {person.name}
                    {person._id === me._id ? ' (you)' : ''}
                  </strong>
                </div>
                <select
                  className="member-role"
                  aria-label={`Role for ${person.name}`}
                  value={person.role}
                  disabled={
                    !isAdmin || roleTask.busy || (person.role === 'admin' && adminCount === 1)
                  }
                  title={
                    person.role === 'admin' && adminCount === 1
                      ? 'Keep at least one admin'
                      : undefined
                  }
                  onChange={(event) => {
                    const role = event.target.value as 'admin' | 'member';
                    void roleTask.run(() =>
                      setMemberRole({ boardId: id, userId: person._id, role }),
                    );
                  }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  className="icon-button"
                  disabled={!isAdmin || (person.role === 'admin' && adminCount === 1)}
                  title={
                    person.role === 'admin' && adminCount === 1
                      ? 'Keep at least one admin'
                      : !isAdmin
                        ? 'Only a board admin can remove members'
                        : `Remove ${person.name}`
                  }
                  aria-label={`Remove ${person.name}`}
                  onClick={() => setRemovingMember(person)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <ErrorNote text={roleTask.error} />
            {isAdmin && <PendingRequestsList boardId={id} />}
          </div>
        </section>
        <section className="settings-section settings-invites">
          <h2>
            <span className="settings-icon" aria-hidden="true">
              <Link2 size={18} />
            </span>
            Invite someone
          </h2>
          <div className="settings-section-body">
            <Invitations boardId={id} inviteCode={detail.board.inviteCode} canManage={isAdmin} />
          </div>
        </section>
      </div>
      <div className="settings-delete">
        <button className="button secondary" onClick={() => setLeaving(true)}>
          Leave board
        </button>
        <button
          className="button danger"
          disabled={!isAdmin}
          title={!isAdmin ? 'Only a board admin can delete this board' : undefined}
          onClick={() => setDeleting(true)}
        >
          <Trash2 size={16} /> Delete board
        </button>
      </div>
      {editingType && (
        <TypeEditor
          boardId={id}
          type={editingType === 'new' ? undefined : editingType}
          isAdmin={isAdmin}
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
          onConfirm={async () => {
            await removeMember({ boardId: id, userId: removingMember._id });
            if (removingMember._id === me._id) navigate('/');
          }}
        >
          They will lose access to this board. Their existing contributions will remain. They will
          need your approval to rejoin.
        </Confirm>
      )}
      {leaving && (
        <Confirm
          title="Leave this board?"
          confirmLabel="Leave board"
          onClose={() => setLeaving(false)}
          onConfirm={async () => {
            await leave({ boardId: id });
            navigate('/boards');
          }}
        >
          Your visits, photos, and ratings will remain. You’ll need an invitation and admin approval
          to rejoin.
        </Confirm>
      )}
      {deleting && (
        <Confirm
          title={`Delete “${detail.board.name}”?`}
          confirmLabel="Delete board"
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
