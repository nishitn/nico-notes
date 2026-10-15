import React, { Component, useCallback, useRef, useState, type ReactNode } from 'react';
import { ConvexError } from 'convex/values';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const colors = {
  background: '#FAF7F2',
  paper: '#FFFFFF',
  ink: '#292C27',
  muted: '#686D63',
  primary: '#E06D53',
  coral: '#A93E32',
  navHighlight: '#A93E32',
  onNavMuted: '#472F29',
  sage: '#DCE5D6',
  peach: '#F3D9BA',
  border: '#D8D6CE',
};
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 18, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -1 },
  subtitle: { fontSize: 20, fontWeight: '600', color: colors.ink },
  body: { fontSize: 16, lineHeight: 24, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  card: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 50,
    color: colors.ink,
    fontSize: 16,
  },
  error: { color: '#A52C24', fontSize: 14, lineHeight: 21 },
});
export function Page({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Title({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.subtitle}>
      {children}
    </Text>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: secondary ? colors.paper : colors.primary,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: 14,
        minHeight: 48,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: secondary ? colors.border : colors.primary,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 100, textAlignVertical: 'top' },
          props.style,
        ]}
      />
    </View>
  );
}
export function Loading() {
  return (
    <View style={[styles.page, { alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
      <ActivityIndicator size="large" color={colors.coral} />
      <Text style={styles.muted}>Loading your notes…</Text>
    </View>
  );
}
export function ErrorNote({ error }: { error: string }) {
  return error ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {error}
    </Text>
  ) : null;
}
export function message(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data;
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const run = useCallback(async (work: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}
export function confirm(title: string, work: () => void) {
  Alert.alert(title, 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', style: 'destructive', onPress: work },
  ]);
}
export class ErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: string }
> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) {
    return { error: message(error) };
  }
  render() {
    if (this.state.error)
      return (
        <Page>
          <Title>Unable to open this screen</Title>
          <ErrorNote error={this.state.error} />
          <Button
            title="Back to boards"
            onPress={() => {
              this.props.onReset?.();
              this.setState({ error: '' });
            }}
          />
        </Page>
      );
    return this.props.children;
  }
}
