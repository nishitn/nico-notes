import {
  Component,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, Heart, LoaderCircle, X } from 'lucide-react';

export function message(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && typeof error.data === 'string')
    return error.data;
  return error instanceof Error
    ? error.message.split('\n')[0]
    : 'Something went wrong. Please try again.';
}
export function useTask() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<unknown>) {
    if (busy) return false;
    setError('');
    setBusy(true);
    try {
      await task();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}
export const NoticeContext = createContext<(text: string) => void>(() => {});
export const useNotice = () => useContext(NoticeContext);
export function Notices({ children }: { children: ReactNode }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (text) {
      const timer = setTimeout(() => setText(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [text]);
  return (
    <NoticeContext.Provider value={setText}>
      {children}
      {text && (
        <div className="toast" role="status">
          <Check size={18} />
          {text}
          <button aria-label="Dismiss notification" onClick={() => setText('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </NoticeContext.Provider>
  );
}
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Date Notes home">
      <span className="brand-mark">
        <Heart size={23} strokeWidth={2} />
      </span>
      <span>
        date notes<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorNote({ text }: { text: string }) {
  return text ? (
    <div className="error-note" role="alert">
      <AlertCircle size={18} />
      <span>{text}</span>
    </div>
  ) : null;
}
export const TopNavContext = createContext<HTMLElement | null>(null);
export function Back({ to, children }: { to: string; children: ReactNode }) {
  const target = useContext(TopNavContext);
  const link = (
    <Link className="back" to={to}>
      <ArrowLeft size={18} />
      <span>{children}</span>
    </Link>
  );
  return target ? createPortal(link, target) : link;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy && <LoaderCircle size={16} className="spin" />}
      {busy ? 'Saving…' : children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [returnFocus] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const titleId = useId();
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    el.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select')?.focus({
      preventScroll: true,
    });
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      el.close();
      document.body.style.overflow = old;
      queueMicrotask(() => {
        if (!el.isConnected && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      });
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-top">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const task = useTask();
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!task.busy) onClose();
      }}
    >
      <p className="muted">{children}</p>
      <ErrorNote text={task.error} />
      <div className="form-actions">
        <button className="button secondary" disabled={task.busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button danger"
          disabled={task.busy}
          onClick={async () => {
            if (await task.run(onConfirm)) onClose();
          }}
        >
          {task.busy ? 'Removing…' : 'Yes, remove'}
        </button>
      </div>
    </Modal>
  );
}
export function Initials({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={`avatar ${small ? 'small' : ''}`} title={name}>
      {name
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Heart size={30} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Form({
  children,
  onSubmit,
  className = '',
}: {
  children: ReactNode;
  onSubmit: () => void;
  className?: string;
}) {
  return (
    <form
      className={`form ${className}`}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) {
    return { error: message(error) };
  }
  render() {
    return this.state.error ? (
      <div className="page">
        <Back to="/boards">Boards</Back>
        <Empty
          title="This page is unavailable"
          action={
            <button className="button primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          }
        >
          {this.state.error}
        </Empty>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  );
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
