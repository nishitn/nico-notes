import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';

function useJournalData() {
  const me = useQuery(api.boards.me);
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const summaries = useQuery(api.boards.summaries);
  const requests = useQuery(api.boards.myOutgoingRequests);
  const [selectedId, setSelectedId] = useState<Id<'boards'>>();
  // An explicit board may be beyond the loaded page; keep it until it is switched.
  const boardId = selectedId ?? boards.results[0]?._id;
  const board = useQuery(api.boards.get, boardId ? { boardId } : 'skip');
  const ensureCounts = useMutation(api.boards.ensureCounts);
  const ensurePlanned = useMutation(api.wishlist.ensurePlanned);
  useEffect(() => {
    if (boardId) void ensurePlanned({ boardId }).catch(() => undefined);
  }, [boardId, ensurePlanned]);
  const countRequests = useRef(new Set<string>());
  const pending = useQuery(
    api.boards.pendingRequests,
    board?.isAdmin && boardId ? { boardId } : 'skip',
  );
  const hasUnread = useQuery(api.notifications.hasUnread, boardId ? { boardId } : 'skip');
  useEffect(() => {
    const ids = new Set([
      ...(boardId ? [boardId] : []),
      ...(summaries ?? [])
        .filter((summary) => summary.visitCount === null)
        .map((summary) => summary._id),
    ]);
    for (const id of ids) {
      if (countRequests.current.has(id)) continue;
      countRequests.current.add(id);
      void ensureCounts({ boardId: id }).catch(() => countRequests.current.delete(id));
    }
  }, [boardId, summaries, ensureCounts]);

  return { me, boards, summaries, requests, boardId, board, pending, hasUnread, setSelectedId };
}
const JournalContext = createContext<ReturnType<typeof useJournalData> | null>(null);
export function JournalProvider({ children }: { children: ReactNode }) {
  const value = useJournalData();
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}
export function useJournal() {
  const value = useContext(JournalContext);
  if (!value) throw new Error('JournalProvider is missing.');
  return value;
}
