import { useSyncExternalStore } from 'react';
import { ScrollView } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';
import { appAlerts } from './alertState';
import { MaterialDialog, materialDialogSpacing } from './MaterialDialog';
import { colors } from './ui';

export function AppAlertHost() {
  const alert = useSyncExternalStore(
    appAlerts.subscribe,
    appAlerts.getSnapshot,
    appAlerts.getSnapshot,
  );
  if (!alert) return null;
  return (
    <MaterialDialog
      visible
      onDismiss={() => {
        appAlerts.dismiss(alert);
      }}
    >
      <Dialog.Title style={materialDialogSpacing.title}>{alert.title}</Dialog.Title>
      {!!alert.message && (
        <Dialog.Content style={materialDialogSpacing.content}>
          <ScrollView style={{ maxHeight: 320 }}>
            <Text variant="bodyMedium">{alert.message}</Text>
          </ScrollView>
        </Dialog.Content>
      )}
      <Dialog.Actions style={[materialDialogSpacing.actions, { flexWrap: 'wrap' }]}>
        {alert.actions.map((action, index) => (
          <Button
            key={index}
            textColor={
              action.style === 'cancel'
                ? colors.muted
                : action.style === 'destructive'
                  ? colors.error
                  : colors.rust
            }
            onPress={() => appAlerts.respond(alert, action)}
          >
            {action.text}
          </Button>
        ))}
      </Dialog.Actions>
    </MaterialDialog>
  );
}
