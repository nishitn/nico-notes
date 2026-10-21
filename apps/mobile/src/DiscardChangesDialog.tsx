import { useSyncExternalStore } from 'react';
import { Button, Dialog, Text } from 'react-native-paper';
import { MaterialDialog, materialDialogSpacing } from './MaterialDialog';
import { colors } from './ui';

let pendingDiscard: (() => void) | null = null;
const listeners = new Set<() => void>();

function setPendingDiscard(discard: (() => void) | null) {
  pendingDiscard = discard;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => pendingDiscard;
const keepEditing = () => setPendingDiscard(null);

export function confirmDiscard(dirty: boolean, busy: boolean, discard: () => void) {
  if (busy || pendingDiscard) return;
  if (!dirty) {
    discard();
    return;
  }
  setPendingDiscard(discard);
}

export function DiscardChangesDialog() {
  const discard = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (
    <MaterialDialog visible={!!discard} onDismiss={keepEditing}>
      <Dialog.Title style={materialDialogSpacing.title}>Discard changes?</Dialog.Title>
      <Dialog.Content style={materialDialogSpacing.content}>
        <Text variant="bodyMedium">Your unfinished changes will be lost.</Text>
      </Dialog.Content>
      <Dialog.Actions style={materialDialogSpacing.actions}>
        <Button textColor={colors.muted} onPress={keepEditing}>
          Keep editing
        </Button>
        <Button
          textColor={colors.error}
          onPress={() => {
            const action = pendingDiscard;
            setPendingDiscard(null);
            action?.();
          }}
        >
          Discard
        </Button>
      </Dialog.Actions>
    </MaterialDialog>
  );
}
