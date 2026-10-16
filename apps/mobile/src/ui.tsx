import React, { Component, useCallback, useRef, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { Icon } from 'react-native-paper';
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
  paper: '#FFFDF9',
  ink: '#302B26',
  muted: '#786D64',
  primary: '#E06D53',
  primaryDark: '#C8533B',
  primaryLight: '#FDEEE9',
  coral: '#E06D53',
  coralLight: '#FDEEE9',
  coralBorder: '#F5D6CE',
  coralSubtle: '#FDF6F3',
  navHighlight: '#FDEEE9',
  onNavMuted: '#7D736A',
  sage: '#DCE5D6',
  sageLight: '#F0F4EE',
  sageBorder: '#D8E2D4',
  peach: '#F8DEC3',
  peachLight: '#FDF5EC',
  peachBorder: '#F6E4D2',
  border: '#E5DED4',
  rust: '#A33E27',
  green: '#46674F',
  error: '#D63D33',
};
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 22,
    paddingTop: 28,
    gap: 22,
    paddingBottom: 48,
    width: '100%',
    maxWidth: 840,
    alignSelf: 'center',
  },
  title: {
    fontFamily: 'Epilogue',
    fontSize: 30,
    lineHeight: 39,
    color: colors.ink,
    letterSpacing: -1.2,
  },
  subtitle: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  body: { fontFamily: 'Jakarta', fontSize: 15, lineHeight: 25, color: colors.ink },
  muted: { fontFamily: 'Jakarta', fontSize: 13, lineHeight: 21, color: colors.muted },
  card: {
    backgroundColor: colors.paper,
    borderRadius: 22,
    padding: 22,
    gap: 16,
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
    fontFamily: 'Jakarta',
  },
  eyebrow: { fontFamily: 'JakartaSemiBold', fontSize: 10, letterSpacing: 1.8, color: colors.muted },
  label: { fontFamily: 'JakartaSemiBold', fontSize: 14, lineHeight: 22, color: colors.ink },
  link: { fontFamily: 'JakartaSemiBold', fontSize: 13, color: colors.rust },
  textButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  error: { color: colors.error, fontSize: 14, lineHeight: 21 },
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
export function SectionHeading({
  title,
  count,
  suffix,
}: {
  title: string;
  count?: string | number;
  suffix?: string;
}) {
  return (
    <View style={styles.sectionRow}>
      <Heading>{title}</Heading>
      {count !== undefined && (
        <View style={styles.row}>
          <Text style={{ fontFamily: 'Epilogue', fontSize: 24, color: colors.rust }}>{count}</Text>
          <Text style={styles.muted}>{suffix}</Text>
        </View>
      )}
    </View>
  );
}
export function Avatar({
  name,
  image,
  size = 40,
}: {
  name?: string;
  image?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: colors.peach,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {image ? (
        <Image source={{ uri: image }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontFamily: 'JakartaSemiBold', fontSize: size * 0.3, color: colors.rust }}>
          {name
            ?.trim()
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join('') || '?'}
        </Text>
      )}
    </View>
  );
}
export function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Icon source={icon} size={22} color={colors.rust} />
        <Heading>{title}</Heading>
      </View>
      {children}
    </Card>
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
        backgroundColor: secondary ? colors.paper : colors.rust,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: 999,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: secondary ? colors.border : colors.rust,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          color: secondary ? colors.ink : colors.paper,
          fontFamily: 'JakartaSemiBold',
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
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
