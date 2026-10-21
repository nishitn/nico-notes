import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('expo');
  vi.doUnmock('react-native');
});

async function load(platform: string, available = true) {
  const native = {
    signIn: vi.fn(),
    clearCredentialState: vi.fn().mockResolvedValue(undefined),
  };
  const requireNative = vi.fn().mockReturnValue(available ? native : null);
  vi.doMock('expo', () => ({ requireOptionalNativeModule: requireNative }));
  vi.doMock('react-native', () => ({ Platform: { OS: platform } }));
  return { native, requireNative, ...(await import('./index')) };
}

describe.each(['ios', 'android'])('native Google sign-in on %s', (platform) => {
  it('passes the server client ID and returns the token and nonce for backend verification', async () => {
    const { native, requireNative, signInWithNativeGoogle } = await load(platform);
    const credential = { idToken: 'signed-google-token', nonce: 'n'.repeat(43) };
    native.signIn.mockResolvedValue(credential);
    expect(await signInWithNativeGoogle('web-client.apps.googleusercontent.com')).toEqual(
      credential,
    );
    expect(requireNative).toHaveBeenCalledWith('NicoGoogleSignIn');
    expect(native.signIn).toHaveBeenCalledWith('web-client.apps.googleusercontent.com');
  });

  it('returns cancellation without an error or another sign-in attempt', async () => {
    const { native, signInWithNativeGoogle } = await load(platform);
    native.signIn.mockResolvedValue(null);
    expect(await signInWithNativeGoogle('web-client.apps.googleusercontent.com')).toBeNull();
    expect(native.signIn).toHaveBeenCalledTimes(1);
  });

  it('clears the native session when signing out', async () => {
    const { native, clearNativeGoogleSession } = await load(platform);
    await clearNativeGoogleSession();
    expect(native.clearCredentialState).toHaveBeenCalledOnce();
  });

  it('requires a new native build when the module is missing', async () => {
    const { signInWithNativeGoogle } = await load(platform, false);
    await expect(signInWithNativeGoogle('web-client.apps.googleusercontent.com')).rejects.toThrow(
      'Install the latest app build',
    );
  });

  it('does not open Google sign-in without the backend client ID', async () => {
    const { native, signInWithNativeGoogle } = await load(platform);
    await expect(signInWithNativeGoogle()).rejects.toThrow('not configured');
    expect(native.signIn).not.toHaveBeenCalled();
  });
});
