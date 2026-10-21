import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from './convexLive';
import { Link } from 'react-router-dom';
import { ChevronRight, Pencil } from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import { ErrorNote, Field, Form, Modal, Spinner, Submit, useNotice, useTask } from './ui';
import { APP_VERSION } from '@nico-notes/backend/legal';
import { BlockedPeople, DeleteAccountButton } from './ReleasePages';
import { ProfilePhoto } from './ProfilePhoto';

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
      <section className="account-profile" aria-label="Your profile">
        <div className="account-details">
          <ProfilePhoto name={me.name} image={me.image} />
          <div className="account-name">
            <h2>{me.name}</h2>
          </div>
          <button
            className="icon-button account-edit"
            aria-label="Edit name"
            onClick={() => setEditingName(true)}
          >
            <Pencil size={19} />
          </button>
        </div>
      </section>
      <nav className="account-card account-group" aria-label="Account settings">
        <Link to="/support" className="account-link">
          <strong>Help and support</strong>
          <ChevronRight size={18} />
        </Link>
      </nav>
      <nav className="account-card account-group" aria-label="Privacy and terms">
        <Link to="/privacy" className="account-link">
          <strong>Privacy policy</strong>
          <ChevronRight size={18} />
        </Link>
        <Link to="/terms" className="account-link">
          <strong>Terms of use</strong>
          <ChevronRight size={18} />
        </Link>
      </nav>
      <BlockedPeople />
      <section className="account-card account-group">
        <button
          className="account-link account-sign-out"
          disabled={task.busy}
          onClick={() => task.run(signOut)}
        >
          <strong>{task.busy ? 'Signing out…' : 'Sign out'}</strong>
          <ChevronRight size={18} />
        </button>
      </section>
      <ErrorNote text={task.error} />
      <footer className="account-footer">
        <DeleteAccountButton className="account-delete" />
        <p>nico notes · {APP_VERSION}</p>
      </footer>
      {editingName && <EditName name={me.name} onClose={() => setEditingName(false)} />}
    </div>
  );
}
