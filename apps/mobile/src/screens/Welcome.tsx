import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { colors, ErrorNote } from '../ui';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { openLegal } from '../ReleaseTools';

export function WelcomeScreen({
  onSignIn,
  busy,
  googleReady,
  error,
}: {
  onSignIn: () => void;
  busy: boolean;
  googleReady?: boolean;
  error: string;
}) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 760 || fontScale > 1.2;
  return (
    <ScrollView
      style={welcome.screen}
      contentContainerStyle={[welcome.content, compact && welcome.compactContent]}
      showsVerticalScrollIndicator={false}
    >
      <View style={welcome.brand}>
        <Image
          source={require('../../../web/public/favicon.svg')}
          contentFit="contain"
          style={welcome.brandMark}
          accessible={false}
          importantForAccessibility="no"
        />
        <Text style={welcome.wordmark}>
          nico notes<Text style={welcome.brandDot}>.</Text>
        </Text>
      </View>

      <View style={welcome.main}>
        <View style={welcome.story}>
          <Image
            source={require('../../assets/welcome-keepsakes.svg')}
            contentFit="contain"
            style={[welcome.illustration, { maxHeight: compact ? 180 : 240 }]}
            accessible={false}
            importantForAccessibility="no"
          />
          <View style={welcome.copy}>
            <Text
              accessibilityRole="header"
              style={[welcome.headline, compact && welcome.compactHeadline]}
            >
              Your shared{'\n'}visit journal.
            </Text>
            <Text style={welcome.description}>
              Keep places, photos, and ratings together on private boards.
            </Text>
          </View>
        </View>

        <View style={welcome.signIn}>
          <GoogleSignInButton onPress={onSignIn} disabled={!googleReady} busy={busy} />
          {!busy && !googleReady && (
            <View style={welcome.status} accessibilityLiveRegion="polite">
              {googleReady === undefined && <ActivityIndicator size="small" color={colors.muted} />}
              <Text style={welcome.signInNote}>
                {googleReady === undefined
                  ? 'Getting sign-in ready…'
                  : 'Sign-in is temporarily unavailable. Please try again later.'}
              </Text>
            </View>
          )}
          <ErrorNote error={error} />
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 }}
          >
            {(['privacy', 'terms', 'help'] as const).map((page) => (
              <Text
                key={page}
                accessibilityRole="link"
                onPress={() => void openLegal(page)}
                style={[stylesForLinks, { textTransform: 'capitalize' }]}
              >
                {page}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const stylesForLinks = { minHeight: 44, paddingVertical: 12, color: colors.rust, fontSize: 13 };

const welcome = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 32,
    gap: 32,
  },
  compactContent: { paddingTop: 14, paddingBottom: 20, gap: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 36,
    height: 36,
    transform: [{ rotate: '-6deg' }],
  },
  wordmark: { color: colors.ink, fontSize: 24, fontWeight: '700', letterSpacing: -1.1 },
  brandDot: { color: colors.primary },
  main: { flexGrow: 1, justifyContent: 'center', gap: 28 },
  story: { alignItems: 'center', gap: 28 },
  illustration: { width: '100%', aspectRatio: 400 / 272 },
  copy: { alignItems: 'center', gap: 14 },
  headline: {
    fontFamily: 'Epilogue',
    color: colors.ink,
    fontSize: 36,
    letterSpacing: -1.2,
    lineHeight: 42,
    textAlign: 'center',
  },
  compactHeadline: { fontSize: 32, lineHeight: 38 },
  description: {
    maxWidth: 280,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  signIn: { alignItems: 'center', width: '100%', gap: 14 },
  status: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signInNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    flexShrink: 1,
  },
});
