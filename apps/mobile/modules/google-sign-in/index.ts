import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type GoogleCredential = { idToken: string; nonce: string };
type NativeGoogleSignIn = {
  signIn(webClientId: string): Promise<GoogleCredential | null>;
  clearCredentialState(): Promise<void>;
};

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeGoogleSignIn>('NicoGoogleSignIn')
    : null;

export async function signInWithNativeGoogle(clientId?: string) {
  if (!native) throw new Error('Install the latest Android app build to use Google sign-in.');
  if (!clientId) throw new Error('Google sign-in is not configured for this app build.');
  return native.signIn(clientId);
}

export async function clearNativeGoogleSession() {
  if (native) await native.clearCredentialState();
}
