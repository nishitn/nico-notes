import { useEffect } from 'react';
import { router, useRoute } from 'expo-router';
import { useJournal } from '../JournalContext';
import type { ScreenProps } from '../navigation';
import { Loading } from '../ui';

export default function OpenBoard() {
  const { params } = useRoute<ScreenProps<'Board'>['route']>();
  const { setSelectedId } = useJournal();
  useEffect(() => {
    setSelectedId(params.boardId);
    router.dismissTo('/');
  }, [params.boardId, setSelectedId]);
  return <Loading />;
}
