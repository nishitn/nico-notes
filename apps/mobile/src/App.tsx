import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { ConvexReactClient, useConvexAuth, useConvexConnectionState, useQuery } from './convexLive';
import { ConvexAuthProvider, useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { configureFonts, MD3LightTheme, PaperProvider } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { router, useRootNavigationState } from 'expo-router';
import { api } from '@nico-notes/backend/api';
import { AUTH_REDIRECT, authCode, inviteToken } from './links';
import {
  Button,
  colors,
  ErrorBoundary,
  ErrorNote,
  Loading,
  Page,
  styles,
  Title,
  useTask,
} from './ui';
import { WelcomeScreen } from './screens/Welcome';
import { signInWithNativeGoogle } from '../modules/google-sign-in';
import { POLICY_VERSION } from '@nico-notes/backend/legal';
import { TermsGate, openLegal } from './ReleaseTools';
import { JournalProvider } from './JournalContext';
import { DiscardChangesDialog } from './DiscardChangesDialog';
import { AppAlertHost } from './AppAlertHost';

WebBrowser.maybeCompleteAuthSession();
const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;
const storage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

function ConnectionNotice() {
  const connection = useConvexConnectionState();
  if (connection.isWebSocketConnected) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        styles.muted,
        {
          padding: 12,
          backgroundColor: colors.coralLight,
          color: colors.rust,
          textAlign: 'center',
        },
      ]}
    >
      {connection.hasEverConnected
        ? 'Reconnecting… Changes will finish saving when you’re back online.'
        : 'Connecting… Check your connection if this takes a while.'}
    </Text>
  );
}

function AccountUnavailable({ deleting }: { deleting: boolean }) {
  const { signOut } = useAuthActions();
  const task = useTask();
  return (
    <Page>
      <Title>{deleting ? 'Account deletion requested' : 'Account unavailable'}</Title>
      <Text style={styles.body}>
        {deleting
          ? 'Your account is closed. Contact support within 30 days to request recovery or permanent erasure sooner. After 30 days, permanent cleanup starts.'
          : 'Contact support to ask about your account or appeal a moderation decision.'}
      </Text>
      <Button secondary title="Contact support" onPress={() => void openLegal('help')} />
      <Button title="Sign out" disabled={task.busy} onPress={() => void task.run(signOut)} />
      <ErrorNote error={task.error} />
    </Page>
  );
}

function Login({
  finishSignIn,
  error,
}: {
  finishSignIn: (link: string) => Promise<void>;
  error: string;
}) {
  const { signIn, signOut } = useAuthActions();
  const rejectedToken = useAuthToken();
  const config = useQuery(api.photos.configuration);
  const task = useTask();
  return (
    <WelcomeScreen
      busy={task.busy}
      googleReady={config?.googleReady}
      error={task.error || error}
      onSignIn={() =>
        void task.run(async () => {
          // Render the button's loading state before handing over to native Google UI.
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          if (Platform.OS === 'android' || Platform.OS === 'ios') {
            const credential = await signInWithNativeGoogle(config?.googleClientId);
            if (credential) {
              // This screen is shown only when Convex has not authenticated us.
              // Clear any rejected session so a new token restarts authentication.
              if (rejectedToken) await signOut();
              await signIn('google-native', credential);
            }
            return;
          }
          const { redirect } = await signIn('google', { redirectTo: AUTH_REDIRECT });
          if (!redirect) throw new Error('Google sign-in could not start. Please retry.');
          const result = await WebBrowser.openAuthSessionAsync(redirect.toString(), AUTH_REDIRECT);
          if (result.type === 'success') await finishSignIn(result.url);
        })
      }
    />
  );
}

function AuthenticatedApp({ children }: { children: ReactNode }) {
  const rootState = useRootNavigationState();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const account = useQuery(api.account.status, isAuthenticated ? {} : 'skip');
  const { signIn } = useAuthActions();
  const authTask = useTask();
  const { run: runAuth } = authTask;
  const exchanging = useRef<string | null>(null);
  const finishSignIn = useCallback(
    async (link: string) => {
      const code = authCode(link);
      if (!code) throw new Error('Invalid sign-in response. Please retry.');
      if (exchanging.current === code) return;
      exchanging.current = code;
      try {
        await signIn('google', { code });
      } catch (error) {
        exchanging.current = null;
        throw error;
      }
    },
    [signIn],
  );
  const [pendingInvite, setPendingInvite] = useState<string>();
  const ready = Boolean(rootState?.key);
  const sessionReady = Boolean(
    isAuthenticated &&
    account &&
    !account.deleting &&
    !account.suspended &&
    account.termsVersion === (account.requiredTermsVersion ?? POLICY_VERSION),
  );
  const seen = useRef<string | null>(null);
  useEffect(() => {
    function receive(link: string | null) {
      if (!link || seen.current === link) return;
      if (authCode(link)) {
        void runAuth(() => finishSignIn(link));
        return;
      }
      const token = inviteToken(
        link,
        process.env.EXPO_PUBLIC_WEB_URL || 'https://notes.nishitnagar.com',
      );
      if (token) {
        seen.current = link;
        setPendingInvite(token);
      }
    }
    void Linking.getInitialURL().then(receive);
    const listener = Linking.addEventListener('url', ({ url: link }) => receive(link));
    return () => listener.remove();
  }, [finishSignIn, runAuth]);
  useEffect(() => {
    if (sessionReady && ready && pendingInvite) {
      router.navigate({ pathname: '/Join', params: { token: pendingInvite } });
      // This effect synchronizes an external navigation container with incoming links.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingInvite(undefined);
    }
  }, [sessionReady, ready, pendingInvite]);
  if (sessionReady) return <JournalProvider>{children}</JournalProvider>;
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.page}>
      {isLoading || (isAuthenticated && !account) ? (
        <Loading />
      ) : !isAuthenticated ? (
        <Login finishSignIn={finishSignIn} error={authTask.error} />
      ) : account?.deleting || account?.suspended ? (
        <AccountUnavailable deleting={Boolean(account.deleting)} />
      ) : (
        <TermsGate version={account?.requiredTermsVersion ?? POLICY_VERSION} />
      )}
    </SafeAreaView>
  );
}

export default function App({ children }: { children: ReactNode }) {
  const [resetKey, setResetKey] = useState(0);
  const [fontsLoaded, fontError] = useFonts({
    Epilogue: require('../assets/fonts/Epilogue.ttf'),
    EpilogueItalic: require('../assets/fonts/EpilogueItalic.ttf'),
    EpilogueSemiBold: require('../assets/fonts/EpilogueSemiBold.ttf'),
    Jakarta: require('../assets/fonts/Jakarta.ttf'),
    JakartaSemiBold: require('../assets/fonts/JakartaSemiBold.ttf'),
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <PaperProvider
      theme={{
        ...MD3LightTheme,
        fonts: configureFonts({ config: { fontFamily: 'Jakarta' } }),
        colors: {
          ...MD3LightTheme.colors,
          primary: colors.rust,
          onPrimary: colors.paper,
          primaryContainer: colors.coralLight,
          onPrimaryContainer: colors.rust,
          secondaryContainer: colors.coralLight,
          onSecondaryContainer: colors.rust,
          background: colors.background,
          surface: colors.paper,
          surfaceVariant: colors.coralSubtle,
          onSurface: colors.ink,
          onSurfaceVariant: colors.muted,
          outline: colors.border,
          elevation: { ...MD3LightTheme.colors.elevation, level2: '#F5EFEB', level3: '#F5EFEB' },
        },
      }}
      settings={{
        icon: (props) => (
          <MaterialCommunityIcons
            {...props}
            name={props.name as keyof typeof MaterialCommunityIcons.glyphMap}
          />
        ),
      }}
    >
      <SafeAreaProvider>
        <View style={styles.page}>
          <StatusBar style="dark" />
          <ErrorBoundary onReset={() => setResetKey((key) => key + 1)}>
            {client ? (
              <ConvexAuthProvider client={client} storage={storage} shouldHandleCode={false}>
                <ConnectionNotice />
                <AuthenticatedApp key={resetKey}>{children}</AuthenticatedApp>
              </ConvexAuthProvider>
            ) : (
              <Page>
                <Title>Service unavailable</Title>
                <Text style={styles.body}>Please try again later or contact support.</Text>
                <Button secondary title="Help and support" onPress={() => void openLegal('help')} />
              </Page>
            )}
          </ErrorBoundary>
          <DiscardChangesDialog />
          <AppAlertHost />
        </View>
      </SafeAreaProvider>
    </PaperProvider>
  );
}
