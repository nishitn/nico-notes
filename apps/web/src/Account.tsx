import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { ArrowRight, Heart, LayoutGrid, LogOut, ShieldCheck } from 'lucide-react';
import { api } from '@date-notes/backend/api';
import { ErrorNote, Initials, Spinner, useTask } from './ui';

export function AccountPage() {
  const me = useQuery(api.boards.me);
  const { signOut } = useAuthActions();
  const task = useTask();

  if (!me) return <Spinner label="Loading your account…" />;

  return (
    <div className="page account-page">
      <div className="page-heading">
        <div>
          <h1>Your account</h1>
        </div>
      </div>
      <section className="account-card" aria-label="Your profile">
        <div className="account-cover" aria-hidden="true">
          <Heart size={27} />
        </div>
        <div className="account-details">
          <Initials name={me.name} image={me.image} />
          <h2>{me.name}</h2>
          <span className="account-provider">
            <ShieldCheck size={15} /> Signed in with Google
          </span>
          <p>Your name is managed by your Google account.</p>
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
      </section>
      <div className="account-footer">
        <button className="button secondary" disabled={task.busy} onClick={() => task.run(signOut)}>
          <LogOut size={17} /> {task.busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      <ErrorNote text={task.error} />
    </div>
  );
}
