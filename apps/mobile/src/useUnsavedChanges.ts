import { useRef } from 'react';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { confirmDiscard } from './DiscardChangesDialog';

export { confirmDiscard };

/** Call allowExit immediately before navigation after a successful save. */
export function useUnsavedChanges(dirty: boolean, busy = false) {
  const navigation = useNavigation();
  const allowed = useRef(false);
  usePreventRemove(dirty || busy, ({ data }) => {
    if (allowed.current) navigation.dispatch(data.action);
    else confirmDiscard(dirty, busy, () => navigation.dispatch(data.action));
  });
  return () => {
    allowed.current = true;
  };
}
