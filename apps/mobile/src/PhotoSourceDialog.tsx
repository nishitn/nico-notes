import { StyleSheet, Text, View } from 'react-native';
import { Button, Dialog } from 'react-native-paper';
import { colors, styles } from './ui';
import { MaterialDialog, materialDialogSpacing } from './MaterialDialog';
import type { PhotoSource } from './photoPicker';

export function PhotoSourceDialog({
  visible,
  onDismiss,
  onSelect,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (source: PhotoSource) => void;
}) {
  function choose(source: PhotoSource) {
    onDismiss();
    onSelect(source);
  }

  return (
    <MaterialDialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title style={materialDialogSpacing.title}>Add image</Dialog.Title>
      <Dialog.Content style={materialDialogSpacing.content}>
        <Text style={styles.muted}>Take an image or choose from your library.</Text>
        <View style={dialog.choices}>
          <Button
            icon="camera-outline"
            mode="contained"
            buttonColor={colors.rust}
            textColor={colors.paper}
            contentStyle={dialog.button}
            labelStyle={dialog.label}
            onPress={() => choose('camera')}
          >
            Take image
          </Button>
          <Button
            icon="image-multiple-outline"
            mode="outlined"
            textColor={colors.rust}
            contentStyle={dialog.button}
            labelStyle={dialog.label}
            onPress={() => choose('library')}
          >
            Choose from library
          </Button>
        </View>
      </Dialog.Content>
      <Dialog.Actions style={materialDialogSpacing.actions}>
        <Button textColor={colors.muted} labelStyle={dialog.label} onPress={onDismiss}>
          Cancel
        </Button>
      </Dialog.Actions>
    </MaterialDialog>
  );
}

const dialog = StyleSheet.create({
  choices: { gap: 10, marginTop: 20 },
  button: { minHeight: 48 },
  label: { fontFamily: 'JakartaSemiBold', fontSize: 14 },
});
