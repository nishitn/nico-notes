import { useEffect, useState } from 'react';
import { LoaderCircle, Mail, Send, UserRoundX } from 'lucide-react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import {
  APP_VERSION,
  ACCOUNT_DELETION_NOTICE,
  SUPPORT_EMAIL,
  legalPages,
  type LegalPage,
} from '@nico-notes/backend/legal';
import { Back, Brand, ErrorNote, Field, Form, Modal, Spinner, Submit, useTask } from './ui';
import { Photo } from './Photos';
import { useUnsavedChanges } from './useUnsavedChanges';

export function LegalLinks() {
  return (
    <nav
      aria-label="Privacy and support"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '16px 0' }}
    >
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
      <Link to="/help">Help</Link>
      <Link to="/delete-account">Delete account</Link>
    </nav>
  );
}

export function PublicLegalPage({ page }: { page: LegalPage }) {
  const document = legalPages[page];
  useEffect(() => {
    const titles: Record<LegalPage, string> = {
      privacy: 'Privacy Policy',
      terms: 'Terms & Community Rules',
      help: 'Help & Support',
      'delete-account': 'Delete Account',
    };
    window.document.title = `${titles[page]} | nico notes`;
    return () => {
      window.document.title = 'nico notes';
    };
  }, [page]);
  return (
    <main
      id="main-content"
      className="page legal-page"
      style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}
    >
      <Brand />
      <h1>{document.title}</h1>
      {document.sections.map((section) => (
        <section key={section.title} style={{ margin: '28px 0' }}>
          <h2>{section.title}</h2>
          <p style={{ lineHeight: 1.75 }}>{section.text}</p>
          {section.links && (
            <ul>
              {section.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p>
        <a
          href={`mailto:${SUPPORT_EMAIL}${page === 'delete-account' ? '?subject=Delete%20my%20nico%20notes%20account' : ''}`}
        >
          {page === 'delete-account' ? 'Request deletion by email' : 'Contact support'}
        </a>
      </p>
      <p>
        <Link to={page === 'delete-account' ? '/account' : '/'}>
          {page === 'delete-account' ? 'Sign in to delete your account' : 'Open nico notes'}
        </Link>
      </p>
      <LegalLinks />
    </main>
  );
}

export function DeleteAccountButton({ className = 'button secondary' }: { className?: string }) {
  const remove = useMutation(api.account.remove);
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const task = useTask();
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        Delete account
      </button>
      {open && (
        <Modal title="Delete your account?" onClose={() => !task.busy && setOpen(false)}>
          <p>{ACCOUNT_DELETION_NOTICE}</p>
          <Form
            onSubmit={async () => {
              if (confirmation !== 'DELETE') return;
              await task.run(async () => {
                await remove({ confirmation: 'DELETE' });
                await signOut().catch(() => undefined);
                setOpen(false);
              });
            }}
          >
            <Field label="Type DELETE to confirm">
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={task.busy}
                autoComplete="off"
              />
            </Field>
            <ErrorNote text={task.error} />
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={task.busy}
                onClick={() => setOpen(false)}
              >
                Keep account
              </button>
              <button className="button primary" disabled={task.busy || confirmation !== 'DELETE'}>
                {task.busy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}

export function TermsGate({ version }: { version: string }) {
  const accept = useMutation(api.safety.acceptTerms);
  const { signOut } = useAuthActions();
  const task = useTask();
  return (
    <main
      id="main-content"
      className="page"
      style={{
        maxWidth: 420,
        minHeight: '100svh',
        margin: '0 auto',
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 20,
      }}
    >
      <Brand />
      <h1>Welcome to nico notes.</h1>
      <p className="small muted terms-copy">
        By continuing, you agree to our <Link to="/terms">Terms</Link>.
        <br />
        Read our <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <Form
        onSubmit={async () => {
          await task.run(() => accept({ version }));
        }}
      >
        <ErrorNote text={task.error} />
        <button className="button primary" disabled={task.busy} style={{ width: '100%' }}>
          {task.busy ? 'Just a moment…' : 'Agree and continue'}
        </button>
      </Form>
      <div style={{ marginTop: 4 }}>
        <button className="text-button" disabled={task.busy} onClick={() => void task.run(signOut)}>
          Sign out
        </button>
      </div>
    </main>
  );
}

export function AccountUnavailable({ deleting }: { deleting: boolean }) {
  const { signOut } = useAuthActions();
  const task = useTask();
  return (
    <main id="main-content" className="page">
      <h1>{deleting ? 'Account deletion requested' : 'Account unavailable'}</h1>
      <p>
        {deleting
          ? 'Your account is closed. Contact support within 30 days to request recovery or permanent erasure sooner. After 30 days, permanent cleanup starts.'
          : 'Contact support to ask about your account or appeal a moderation decision.'}
      </p>
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      <LegalLinks />
      <button
        className="button secondary"
        disabled={task.busy}
        onClick={() => void task.run(signOut)}
      >
        Sign out
      </button>
      <ErrorNote text={task.error} />
    </main>
  );
}

export function HelpPage() {
  const report = useMutation(api.safety.reportProblem);
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const task = useTask();
  useUnsavedChanges(!sent && !!description.trim(), task.busy);
  return (
    <div className="page">
      <h1>Help and support</h1>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> · Version {APP_VERSION}
      </p>
      <p>Please keep passwords, tokens and private images out of support requests.</p>
      {sent ? (
        <p role="status">Your request was sent to support.</p>
      ) : (
        <Form
          onSubmit={async () => {
            if (
              await task.run(() => report({ description, version: APP_VERSION, platform: 'web' }))
            )
              setSent(true);
          }}
        >
          <Field label="What went wrong?">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              required
              minLength={5}
              disabled={task.busy}
            />
          </Field>
          <ErrorNote text={task.error} />
          <Submit busy={task.busy}>Send support request</Submit>
        </Form>
      )}
      <LegalLinks />
    </div>
  );
}

export function BlockedPeople() {
  const people = useQuery(api.safety.blocked);
  const unblock = useMutation(api.safety.unblock);
  const task = useTask();
  if (!people?.length) return null;
  return (
    <section className="settings-section">
      <h2>Blocked people</h2>
      {people.map((person) => (
        <div key={person._id} className="form-actions">
          <span>{person.name}</span>
          <button
            className="button secondary"
            disabled={task.busy}
            onClick={() => void task.run(() => unblock({ userId: person.userId }))}
          >
            Unblock
          </button>
        </div>
      ))}
      <ErrorNote text={task.error} />
    </section>
  );
}

export function SafetyPage() {
  const { boardId } = useParams();
  const [params] = useSearchParams();
  const visitId = (params.get('visitId') || undefined) as Id<'visits'> | undefined;
  const photoId = (params.get('photoId') || undefined) as Id<'photos'> | undefined;
  const id = boardId as Id<'boards'>;
  const board = useQuery(api.boards.get, { boardId: id });
  const me = useQuery(api.boards.me);
  const report = useMutation(api.safety.report);
  const block = useMutation(api.safety.block);
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const task = useTask();
  const guard = useUnsavedChanges(!sent && !!reason.trim(), task.busy);
  if (!board) return <Spinner label="Loading board…" />;
  const people = me ? board.members.filter((person) => person._id !== me._id) : [];
  return (
    <div className="page safety-page">
      <Back to={`/boards/${id}/settings`}>Board settings</Back>
      <div className="safety-heading">
        <h1>Safety</h1>
        {!sent && (
          <button
            type="submit"
            form="safety-report"
            className="icon-button"
            aria-label="Send report"
            title="Send report"
            disabled={task.busy || reason.trim().length < 5}
          >
            {task.busy ? <LoaderCircle className="spin" size={21} /> : <Send size={21} />}
          </button>
        )}
      </div>
      {sent ? (
        <p role="status">Report received. A service moderator will review it.</p>
      ) : (
        <form
          id="safety-report"
          className="safety-report"
          onSubmit={(event) => {
            event.preventDefault();
            if (task.busy || reason.trim().length < 5) return;
            void task.run(async () => {
              await report({ boardId: id, visitId, photoId, reason });
              setSent(true);
            });
          }}
        >
          <textarea
            aria-label="What happened?"
            placeholder="What happened? Include the person or content involved."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            minLength={5}
            required
            disabled={task.busy}
            rows={5}
          />
          <p className="small muted">Reports are reviewed by service moderators.</p>
        </form>
      )}
      <ErrorNote text={task.error} />
      <div className="safety-footer">
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          <Mail size={16} /> Contact support
        </a>
        {!!people.length && (
          <details className="safety-block">
            <summary>
              <UserRoundX size={16} /> Block a person
            </summary>
            <div className="safety-block-people">
              {people.map((person) => (
                <button
                  type="button"
                  key={person._id}
                  disabled={task.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Block ${person.name} and leave shared boards? You cannot join the same boards while blocked. Existing contributions remain.`,
                      )
                    )
                      void task.run(async () => {
                        await block({ boardId: id, userId: person._id });
                        guard.allowNavigation();
                        navigate('/boards', { replace: true });
                      });
                  }}
                >
                  {person.name}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export function ModerationPage() {
  const account = useQuery(api.account.status);
  if (!account) return <Spinner label="Loading…" />;
  if (!account.isModerator)
    return (
      <div className="page">
        <h1>Not available</h1>
        <p>This page is for service moderators.</p>
      </div>
    );
  return <ModerationQueue />;
}

function ModerationQueue() {
  const reports = usePaginatedQuery(api.safety.reports, {}, { initialNumItems: 20 });
  const resolve = useMutation(api.safety.resolveReport);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const task = useTask();
  return (
    <div className="page">
      <h1>Safety and support queue</h1>
      <p>
        Review reports promptly. Resolve only after inspecting the relevant content and explaining
        the action.
      </p>
      <ErrorNote text={task.error} />
      {reports.status === 'LoadingFirstPage' && <Spinner label="Loading reports…" />}
      {reports.results.map((report) => (
        <section className="settings-section" key={report._id}>
          <h2>
            {report.kind === 'problem' ? 'Support request' : 'Safety report'} · {report.status}
          </h2>
          <p>{report.reason}</p>
          <p className="small muted">Received {new Date(report.createdAt).toLocaleString()}</p>
          {report.contentSummary && (
            <p style={{ whiteSpace: 'pre-wrap' }}>{report.contentSummary}</p>
          )}
          {report.photoId && report.status === 'open' && (
            <Photo id={report.photoId} alt="Reported picture for moderation" />
          )}
          {report.status === 'open' && (
            <>
              <Field label="Review note">
                <textarea
                  value={notes[report._id] ?? ''}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [report._id]: event.target.value }))
                  }
                  maxLength={2000}
                />
              </Field>
              <div className="form-actions">
                {(['dismiss', 'remove-content', 'suspend-user'] as const).map((action) => (
                  <button
                    key={action}
                    className="button secondary"
                    disabled={
                      task.busy ||
                      !notes[report._id]?.trim() ||
                      (action === 'remove-content' && !report.visitId && !report.photoId) ||
                      (action === 'suspend-user' && !report.userId)
                    }
                    onClick={() => {
                      if (
                        action !== 'dismiss' &&
                        !window.confirm(
                          `Confirm ${action === 'remove-content' ? 'removing the reported content' : 'suspending this user'}?`,
                        )
                      )
                        return;
                      void task.run(() =>
                        resolve({ reportId: report._id, action, note: notes[report._id] }),
                      );
                    }}
                  >
                    {action === 'dismiss'
                      ? 'Resolve / dismiss'
                      : action === 'remove-content'
                        ? 'Remove content'
                        : 'Suspend user'}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      ))}
      {reports.status === 'Exhausted' && reports.results.length === 0 && <p>No reports.</p>}
      {(reports.status === 'CanLoadMore' || reports.status === 'LoadingMore') && (
        <button
          className="button secondary"
          disabled={reports.status === 'LoadingMore'}
          onClick={() => reports.loadMore(20)}
        >
          More reports
        </button>
      )}
    </div>
  );
}
