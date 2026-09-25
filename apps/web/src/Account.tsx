import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { ArrowRight, LayoutGrid, LogOut, Pencil } from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import { ErrorNote, Field, Form, Initials, Modal, Spinner, Submit, useNotice, useTask } from './ui';

function EditName({ name, onClose }: { name: string; onClose: () => void }) {
  const [draft, setDraft] = useState(name);
  const updateProfile = useMutation(api.boards.updateProfile);
  const task = useTask();
  const notice = useNotice();
  return (
    <Modal title="Edit name" onClose={() => !task.busy && onClose()}>
      <Form
        onSubmit={async () => {
          if (await task.run(() => updateProfile({ name: draft }))) {
            notice('Your name has been updated.');
            onClose();
          }
        }}
      >
        <Field label="Name">
          <input
            autoFocus
            autoComplete="nickname"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={80}
            required
            disabled={task.busy}
          />
        </Field>
        <ErrorNote text={task.error} />
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={task.busy} onClick={onClose}>
            Cancel
          </button>
          <Submit busy={task.busy}>Save name</Submit>
        </div>
      </Form>
    </Modal>
  );
}

export function AccountPage() {
  const me = useQuery(api.boards.me);
  const { signOut } = useAuthActions();
  const task = useTask();
  const [editingName, setEditingName] = useState(false);

  if (!me) return <Spinner label="Loading your account…" />;

  return (
    <div className="page account-page">
      <div className="page-heading">
        <div>
          <h1>Your account</h1>
        </div>
      </div>
      <section className="account-card" aria-label="Your profile">
        <div className="account-details">
          <Initials name={me.name} image={me.image} />
          <div className="account-name">
            <h2>{me.name}</h2>
            <button
              className="icon-button"
              aria-label="Edit name"
              title="Edit name"
              onClick={() => setEditingName(true)}
            >
              <Pencil size={17} />
            </button>
          </div>
        </div>
        <Link to="/boards" className="account-link">
          <span className="account-link-icon">
            <LayoutGrid size={21} />
          </span>
          <span>
            <strong>Your boards</strong>
          </span>
          <ArrowRight size={18} />
        </Link>
        <button
          className="account-link account-sign-out"
          disabled={task.busy}
          onClick={() => task.run(signOut)}
        >
          <span className="account-link-icon">
            <LogOut size={20} />
          </span>
          <strong>{task.busy ? 'Signing out…' : 'Sign out'}</strong>
        </button>
      </section>
      <ErrorNote text={task.error} />
      {editingName && <EditName name={me.name} onClose={() => setEditingName(false)} />}
    </div>
  );
}
