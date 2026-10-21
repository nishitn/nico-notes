import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { redirectSystemPath } from './app/+native-intent';

afterEach(() => vi.unstubAllEnvs());

function redirect(path: string) {
  return redirectSystemPath({ path, initial: true });
}

describe('Router native link compatibility', () => {
  it('opens existing app invitation links in the join screen', () => {
    expect(redirect('niconotes://invite/invitation-token')).toBe('/Join?token=invitation-token');
  });

  it('opens web invitation links only from the configured web origin', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', 'https://journal.example.com');
    expect(redirect('https://journal.example.com/invite/invitation-token')).toBe(
      '/Join?token=invitation-token',
    );
    const untrusted = 'https://untrusted.example.com/invite/invitation-token';
    expect(redirect(untrusted)).toBe(untrusted);
  });

  it('keeps valid OAuth codes out of Router state for the session provider to exchange', () => {
    expect(redirect('niconotes://auth?code=one-time-code')).toBe('/');
  });

  it('leaves native Google callbacks to the Google SDK without opening an unmatched route', () => {
    expect(
      redirect('com.googleusercontent.apps.123-iosclient:/oauth2redirect?code=google-code'),
    ).toBe('/');
  });

  it('does not treat malformed invitations or lookalike auth URLs as valid app links', () => {
    for (const link of [
      'niconotes://invite/token%2Fextra',
      'niconotes://invite/token%3Fextra',
      'niconotes://auth/extra?code=one-time-code',
      'niconotes://user@auth?code=one-time-code',
    ])
      expect(redirect(link)).toBe(link);
  });

  it('preserves Router screen paths and their query parameters', () => {
    expect(redirect('/Visit?visitId=visit-id')).toBe('/Visit?visitId=visit-id');
  });
});
