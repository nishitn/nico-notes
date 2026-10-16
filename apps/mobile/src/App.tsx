import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text } from 'react-native';
import { ConvexReactClient, useConvexAuth, useConvexConnectionState, useQuery } from 'convex/react';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  createNavigationContainerRef,
  DefaultTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { api } from '@nico-notes/backend/api';
import type { Routes } from './navigation';
import { AUTH_REDIRECT, authCode, inviteToken } from './links';
import { colors, ErrorBoundary, Loading, Page, styles, Title, useTask } from './ui';
import {
  BoardsScreen,
  BoardScreen,
  BoardFormScreen,
  JoinScreen,
  AccountScreen,
} from './screens/Boards';
import { VisitScreen, VisitFormScreen } from './screens/Visits';
import { SettingsScreen } from './screens/Settings';
import { PlacesScreen, PlaceScreen } from './screens/Places';
import { WishlistFormScreen } from './screens/WishlistForm';
import { WelcomeScreen } from './screens/Welcome';
import { signInWithNativeGoogle } from '../modules/google-sign-in';

WebBrowser.maybeCompleteAuthSession();
const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;
const storage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
const Stack = createNativeStackNavigator<Routes>();
const navigationRef = createNavigationContainerRef<Routes>();

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
          color: colors.primary,
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

function Login({
  finishSignIn,
  error,
}: {
  finishSignIn: (link: string) => Promise<void>;
  error: string;
}) {
  const { signIn } = useAuthActions();
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
          if (Platform.OS === 'android') {
            const credential = await signInWithNativeGoogle(config?.googleClientId);
            if (credential) await signIn('google-native', credential);
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

function AuthenticatedApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();
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
  const [ready, setReady] = useState(false);
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
    if (isAuthenticated && ready && pendingInvite && navigationRef.isReady()) {
      navigationRef.navigate('Join', { token: pendingInvite });
      // This effect synchronizes an external navigation container with incoming links.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingInvite(undefined);
    }
  }, [isAuthenticated, ready, pendingInvite]);
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Login finishSignIn={finishSignIn} error={authTask.error} />;
  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setReady(true)}
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.background,
          card: colors.background,
          text: colors.ink,
          primary: colors.primary,
          border: colors.border,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Boards" component={BoardsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Board" component={BoardScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="BoardForm"
          component={BoardFormScreen}
          options={{ title: 'Board details', presentation: 'modal' }}
        />
        <Stack.Screen
          name="Join"
          component={JoinScreen}
          getId={({ params }) => params?.token ?? 'manual'}
          options={{ title: 'Join a board', presentation: 'modal' }}
        />
        <Stack.Screen
          name="Account"
          component={AccountScreen}
          options={{ title: 'Your account' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Board settings' }}
        />
        <Stack.Screen name="Visit" component={VisitScreen} options={{ title: 'Your visit' }} />
        <Stack.Screen
          name="VisitForm"
          component={VisitFormScreen}
          options={{ title: 'Visit details', presentation: 'modal' }}
        />
        <Stack.Screen
          name="WishlistForm"
          component={WishlistFormScreen}
          options={{ title: 'Add to wishlist', presentation: 'modal' }}
        />
        <Stack.Screen name="Places" component={PlacesScreen} options={{ title: 'Places' }} />
        <Stack.Screen name="Place" component={PlaceScreen} options={{ title: 'Place visits' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
export default function App() {
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
        colors: {
          ...MD3LightTheme.colors,
          primary: colors.primary,
          onPrimary: colors.paper,
          primaryContainer: colors.coralLight,
          onPrimaryContainer: colors.coral,
          secondaryContainer: colors.coralLight,
          onSecondaryContainer: colors.coral,
          background: colors.background,
          surface: colors.paper,
          surfaceVariant: colors.coralSubtle,
          onSurface: colors.ink,
          onSurfaceVariant: colors.muted,
          outline: colors.border,
          elevation: { ...MD3LightTheme.colors.elevation, level2: '#F5EFEB' },
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
        <SafeAreaView edges={['top', 'bottom']} style={styles.page}>
          <StatusBar style="dark" />
          <ErrorBoundary onReset={() => setResetKey((key) => key + 1)}>
            {client ? (
              <ConvexAuthProvider client={client} storage={storage} shouldHandleCode={false}>
                <ConnectionNotice />
                <AuthenticatedApp key={resetKey} />
              </ConvexAuthProvider>
            ) : (
              <Page>
                <Title>Almost ready for your first visit.</Title>
                <Text style={styles.body}>
                  Set EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_CONVEX_SITE_URL in
                  apps/mobile/.env.local, then restart Expo.
                </Text>
              </Page>
            )}
          </ErrorBoundary>
        </SafeAreaView>
      </SafeAreaProvider>
    </PaperProvider>
  );
}
