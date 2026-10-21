import type { ReactNode } from 'react';
import { Keyboard, Modal, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Dialog, ThemeProvider, useTheme } from 'react-native-paper';

// A native modal keeps Material dialogs above native sheets and photo viewers.
export function MaterialDialog({
  visible,
  onDismiss,
  dismissable = true,
  children,
  style,
}: {
  visible: boolean;
  onDismiss: () => void;
  dismissable?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const dialogTheme = {
    ...theme,
    fonts: {
      ...theme.fonts,
      headlineSmall: {
        ...theme.fonts.headlineSmall,
        fontFamily: 'EpilogueSemiBold',
        fontSize: 20,
        lineHeight: 28,
        letterSpacing: -0.3,
      },
      labelLarge: {
        ...theme.fonts.labelLarge,
        fontFamily: 'JakartaSemiBold',
      },
    },
  };
  if (!visible) return null;
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onShow={() => Keyboard.dismiss()}
      onRequestClose={() => dismissable && onDismiss()}
    >
      <ThemeProvider theme={dialogTheme}>
        <Dialog
          visible
          dismissable={dismissable}
          onDismiss={onDismiss}
          style={[
            {
              width: Math.min(320, width - 48),
              alignSelf: 'center',
              borderRadius: 24,
              backgroundColor: theme.colors.surface,
            },
            style,
          ]}
        >
          {children}
        </Dialog>
      </ThemeProvider>
    </Modal>
  );
}

export const materialDialogSpacing = {
  title: { marginBottom: 8 },
  content: { paddingBottom: 12 },
  actions: { flexGrow: 0, paddingHorizontal: 16, paddingBottom: 12 },
};
