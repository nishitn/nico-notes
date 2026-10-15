import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { colors } from './ui';

// Official Google logo and outlined Google Sans label, without a baked-in fill
// or border. The native container provides the app's white/accent styling.
export function GoogleSignInButton({
  onPress,
  disabled,
  busy,
}: {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const scale = Math.max(1.1, Math.min(fontScale, 1.6));
  return (
    <View style={[button.frame, disabled && !busy && button.disabled]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Signing in with Google' : 'Sign in with Google'}
        accessibilityHint={
          Platform.OS === 'android' ? 'Opens the Google sign-in sheet.' : 'Opens Google sign-in.'
        }
        accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
        disabled={disabled || busy}
        onPress={onPress}
        style={({ pressed }) => [button.container, pressed && button.pressed, busy && button.busy]}
      >
        <View
          style={[button.label, { gap: (Platform.OS === 'ios' ? 12 : 10) * scale }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Image
            source={require('../assets/google/g-logo.png')}
            style={{ width: 20 * scale, height: 20 * scale }}
            contentFit="contain"
          />
          <Image
            source={require('../assets/google/signin-label.svg')}
            style={{ width: 126 * scale, height: 20 * scale, flexShrink: 1 }}
            contentFit="contain"
          />
        </View>
        {busy && (
          <ActivityIndicator
            size="small"
            color={colors.coral}
            style={button.spinner}
            accessible={false}
            importantForAccessibility="no"
          />
        )}
      </Pressable>
    </View>
  );
}

const button = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.coral,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: Platform.OS === 'ios' ? 16 : 12,
    paddingVertical: 15,
    backgroundColor: colors.paper,
  },
  pressed: { backgroundColor: `${colors.coral}18` },
  busy: { backgroundColor: `${colors.coral}0D`, paddingHorizontal: 48 },
  disabled: { opacity: 0.5 },
  spinner: { position: 'absolute', right: 16 },
  label: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
});
