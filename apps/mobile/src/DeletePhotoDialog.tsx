import { Button, Dialog, Text } from 'react-native-paper';
import { colors, ErrorNote } from './ui';
import { MaterialDialog, materialDialogSpacing } from './MaterialDialog';

export function DeletePhotoDialog({
  visible,
  busy,
  error,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  busy: boolean;
  error: string;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <MaterialDialog visible={visible} dismissable={!busy} onDismiss={onDismiss}>
      <Dialog.Title style={materialDialogSpacing.title}>Delete image?</Dialog.Title>
      <Dialog.Content style={materialDialogSpacing.content}>
        <Text variant="bodyMedium">This image will be removed from the visit.</Text>
        <ErrorNote error={error} />
      </Dialog.Content>
      <Dialog.Actions style={materialDialogSpacing.actions}>
        <Button textColor={colors.muted} disabled={busy} onPress={onDismiss}>
          Cancel
        </Button>
        <Button loading={busy} textColor={colors.error} disabled={busy} onPress={onConfirm}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </Dialog.Actions>
    </MaterialDialog>
  );
}
