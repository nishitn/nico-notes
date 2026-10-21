import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';

type Draft = { dirty: boolean; saving: boolean; bypass: RefObject<boolean> };
type Register = (id: string, draft: Draft | null) => void;
const DraftsContext = createContext<Register | null>(null);

/** One router blocker protects all active forms, including dialogs over an editor. */
export function UnsavedChangesBoundary({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const register = useCallback<Register>((id, draft) => {
    setDrafts((current) => {
      const next = { ...current };
      if (draft) next[id] = draft;
      else delete next[id];
      return next;
    });
  }, []);
  const activeDrafts = useCallback(
    () =>
      Object.values(drafts).filter(
        (draft) => !draft.bypass.current && (draft.dirty || draft.saving),
      ),
    [drafts],
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      activeDrafts().length > 0 &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.key !== nextLocation.key),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (activeDrafts().some((draft) => draft.saving)) {
      window.alert('Your changes are still saving. Please wait before leaving.');
      blocker.reset();
    } else if (window.confirm('Discard your unsaved changes?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, activeDrafts]);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!activeDrafts().length) return;
        event.preventDefault();
        event.returnValue = '';
      },
      [activeDrafts],
    ),
  );
  return createElement(DraftsContext.Provider, { value: register }, children);
}

export function useUnsavedChanges(dirty: boolean, saving = false) {
  const register = useContext(DraftsContext);
  const id = useId();
  const bypass = useRef(false);
  if (!register) throw new Error('Forms must be inside UnsavedChangesBoundary.');
  useEffect(() => {
    register(id, { dirty, saving, bypass });
    return () => register(id, null);
  }, [register, id, dirty, saving]);
  return {
    allowNavigation: () => {
      bypass.current = true;
    },
  };
}
