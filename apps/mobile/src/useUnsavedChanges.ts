import { useRef } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

export function confirmDiscard(dirty: boolean, busy: boolean, discard: () => void) {
  if (busy) return;
  if (!dirty) {
    discard();
    return;
  }
  Alert.alert('Discard changes?', 'Your unfinished changes will be lost.', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: discard },
  ]);
}

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
