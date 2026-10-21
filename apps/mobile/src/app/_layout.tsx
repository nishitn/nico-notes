import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import App from '../App';
import { colors } from '../ui';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  return (
    <App>
      <ThemeProvider
        value={{
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
        <Stack
          screenOptions={{
            headerShown: false,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="BoardForm" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="Join"
            dangerouslySingular={(name, params) => `${name}:${params.token ?? 'manual'}`}
            options={{ headerShown: true, title: 'Join a board', presentation: 'modal' }}
          />
          <Stack.Screen name="Support" options={{ headerShown: true, title: 'Help' }} />
          <Stack.Screen name="WishlistForm" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </App>
  );
}
