import { NotificationsPage } from './Notifications';
import { useState } from 'react';
import { useConvexAuth, usePaginatedQuery, useQuery } from './convexLive';
import { useAuthActions } from '@convex-dev/auth/react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Heart,
  LayoutGrid,
  LockKeyhole,
  ChevronRight,
  Plus,
  Menu,
  UserPlus,
} from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import {
  Brand,
  ErrorBoundary,
  ErrorNote,
  Initials,
  Modal,
  Spinner,
  TopNavContext,
  useTask,
} from './ui';
import { Artwork } from './Artwork';
import {
  BoardForm,
  BoardPage,
  BoardsPage,
  HomePage,
  InvitePage,
  JoinBoardModal,
  PlaceDetailPage,
  PlacesPage,
} from './Boards';
import { VisitEditor, VisitPage } from './Visit';
import { Settings } from './Settings';
import { AccountPage } from './Account';
import { POLICY_VERSION, type LegalPage } from '@nico-notes/backend/legal';
import {
  AccountUnavailable,
  HelpPage,
  LegalLinks,
  ModerationPage,
  PublicLegalPage,
  SafetyPage,
  TermsGate,
} from './ReleasePages';
import { WishlistPage } from './Wishlist';

export function Setup() {
  const page = useLocation().pathname.slice(1);
  if (['privacy', 'terms', 'help', 'delete-account'].includes(page))
    return <PublicLegalPage page={page as LegalPage} />;
  return (
    <div className="setup">
      <Brand />
      <h1>The service is temporarily unavailable.</h1>
      <p>Please try again later or contact support.</p>
      <LegalLinks />
    </div>
  );
}
function Login() {
  const { signIn } = useAuthActions();
  const config = useQuery(api.photos.configuration);
  const task = useTask();
  const invited = useLocation().pathname.startsWith('/invite/');
  return (
    <div className="login">
      <header>
        <Brand />
        <span className="quiet-label">
          <LockKeyhole size={14} /> Just for your people
        </span>
      </header>
      <main id="main-content" className="login-main">
        <section className="login-copy">
          <h1>
            Some moments
            <br />
            deserve a<br />
            <span>second helping.</span>
          </h1>
          <p>
            A favorite dish. A beautiful view. A day worth remembering. Keep your visits, images,
            and honest little ratings in one shared place.
          </p>
          <div className="login-action">
            <button
              className="button google"
              disabled={!config?.googleReady || task.busy}
              onClick={() =>
                task.run(() =>
                  signIn('google', {
                    redirectTo:
                      window.location.pathname + window.location.search + window.location.hash,
                  }),
                )
              }
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M21 12.2c0-.7-.1-1.5-.2-2.2H12v4h5a4.3 4.3 0 0 1-2 2.9v2.6h3.3c1.8-1.7 2.7-4.2 2.7-7.3Z"
                  fill="#4285F4"
                />
                <path
                  d="M12 22c2.5 0 4.7-.8 6.3-2.5L15 16.9c-.8.6-1.8.9-3 .9-2.4 0-4.5-1.7-5.2-3.9H3.4v2.7A10 10 0 0 0 12 22Z"
                  fill="#34A853"
                />
                <path d="M6.8 13.9a6 6 0 0 1 0-3.8V7.4H3.4a10 10 0 0 0 0 9.2Z" fill="#FBBC05" />
                <path
                  d="M12 6.2c1.4 0 2.6.5 3.5 1.4l3-3A9.4 9.4 0 0 0 12 2a10 10 0 0 0-8.6 5.4l3.4 2.7A5.6 5.6 0 0 1 12 6.2Z"
                  fill="#EA4335"
                />
              </svg>
              {task.busy ? 'Opening Google…' : 'Continue with Google'}
              <ArrowUpRight size={18} />
            </button>
            {invited && (
              <p className="small muted">
                Sign in to view your board invitation. You’ll choose whether to join next.
              </p>
            )}
            {config && !config.googleReady && (
              <div className="setup-note">
                <LockKeyhole size={17} />
                <span>
                  Sign-in is temporarily unavailable. Please try again later or contact support.
                </span>
              </div>
            )}
            <ErrorNote text={task.error} />
          </div>
        </section>
        <section
          className="login-illustration"
          aria-label="Illustration of a shared meal and a keepsake notebook"
        >
          <div className="keepsake">
            <Artwork />
            <div className="keepsake-caption">
              <span>A table for two</span>
              <Heart size={19} />
            </div>
          </div>
          <span className="decorative-spark">✧</span>
        </section>
      </main>
      <footer>
        <LegalLinks />
      </footer>
    </div>
  );
}
function Shell() {
  const me = useQuery(api.boards.me);
  const {
    results: boards,
    status,
    loadMore,
  } = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 30 });
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAction, setDrawerAction] = useState<'create' | 'join' | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [backSlot, setBackSlot] = useState<HTMLDivElement | null>(null);
  return (
    <TopNavContext.Provider value={backSlot}>
      <div className="app-shell">
        <header className="app-header">
          <button
            className="icon-button"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={23} />
          </button>
          <div className="header-back" ref={setBackSlot} />
          <Brand />
        </header>
        <Modal
          title="Menu"
          className="board-drawer"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onAfterClose={() => {
            if (drawerAction === 'create') setCreating(true);
            if (drawerAction === 'join') setJoining(true);
            setDrawerAction(null);
          }}
        >
          <div className="drawer-content">
            <nav aria-label="Boards">
              <NavLink
                to="/boards"
                end
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <LayoutGrid size={19} /> All boards
              </NavLink>
              {boards.map((board) => (
                <NavLink
                  key={board._id}
                  to={`/boards/${board._id}`}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setDrawerOpen(false)}
                >
                  <span className={`board-dot ${board.accent}`} />
                  <span>{board.name}</span>
                </NavLink>
              ))}
            </nav>
            {status === 'LoadingFirstPage' && <Spinner label="Loading boards…" />}
            {(status === 'CanLoadMore' || status === 'LoadingMore') && (
              <button
                className="button secondary"
                disabled={status === 'LoadingMore'}
                onClick={() => loadMore(30)}
              >
                More boards
              </button>
            )}
          </div>
          <div className="drawer-actions">
            <button
              className="button primary drawer-create"
              onClick={() => {
                setDrawerOpen(false);
                setDrawerAction('create');
              }}
            >
              <Plus size={18} /> New board
            </button>
            <button
              className="button secondary drawer-join"
              onClick={() => {
                setDrawerOpen(false);
                setDrawerAction('join');
              }}
            >
              <UserPlus size={18} /> Join board
            </button>
          </div>
          <NavLink className="drawer-account" to="/account" onClick={() => setDrawerOpen(false)}>
            <Initials name={me?.name ?? 'You'} image={me?.image} />
            <span>
              <strong>{me?.name ?? 'Your account'}</strong>
              <span>Account</span>
            </span>
            <ChevronRight size={18} />
          </NavLink>
        </Modal>
        {creating && <BoardForm onClose={() => setCreating(false)} />}
        {joining && <JoinBoardModal onClose={() => setJoining(false)} />}
        <main id="main-content" className="workspace">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/boards" element={<BoardsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/support" element={<HelpPage />} />
              <Route path="/moderation" element={<ModerationPage />} />
              <Route path="/boards/:boardId/safety" element={<SafetyPage />} />
              <Route path="/boards/:boardId/notifications" element={<NotificationsPage />} />
              <Route path="/boards/:boardId/wishlist" element={<WishlistPage />} />
              <Route path="/boards/:boardId" element={<BoardPage />} />
              <Route path="/boards/:boardId/places" element={<PlacesPage />} />
              <Route path="/boards/:boardId/place" element={<PlaceDetailPage />} />
              <Route path="/boards/:boardId/settings" element={<Settings />} />
              <Route path="/boards/:boardId/visits/new" element={<VisitEditor />} />
              <Route path="/visits/:visitId" element={<VisitPage />} />
              <Route path="/visits/:visitId/edit" element={<VisitEditor />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route
                path="*"
                element={
                  <div className="page">
                    <h1>Page not found</h1>
                    <Link className="button primary" to="/">
                      Home
                    </Link>
                  </div>
                }
              />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </TopNavContext.Provider>
  );
}
export function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();
  const account = useQuery(api.account.status, isAuthenticated ? {} : 'skip');
  const page = location.pathname.slice(1);
  if (['privacy', 'terms', 'help', 'delete-account'].includes(page))
    return <PublicLegalPage page={page as LegalPage} />;
  if (isLoading) return <Spinner label="Loading…" />;
  if (isAuthenticated && !account) return <Spinner label="Loading account…" />;
  if (account?.deleting || account?.suspended)
    return <AccountUnavailable deleting={account.deleting} />;
  const requiredTermsVersion = account?.requiredTermsVersion ?? POLICY_VERSION;
  if (isAuthenticated && account?.termsVersion !== requiredTermsVersion)
    return <TermsGate version={requiredTermsVersion} />;
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {isAuthenticated ? <Shell /> : <Login />}
    </>
  );
}
