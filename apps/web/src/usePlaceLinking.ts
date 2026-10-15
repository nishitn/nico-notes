import { useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';

export function usePlaceLinking(boardId?: Id<'boards'>) {
  const ensureLinked = useMutation(api.places.ensureLinked);
  useEffect(() => {
    if (!boardId) return;
    // Best-effort background migration. Saved visits remain browsable if the
    // backend is unavailable; opening the board again retries linking.
    void ensureLinked({ boardId }).catch((error) => {
      if (import.meta.env.DEV) console.warn('Background place linking failed.', error);
    });
  }, [boardId, ensureLinked]);
}
