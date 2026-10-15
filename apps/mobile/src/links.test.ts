import { describe, expect, it } from 'vite-plus/test';
import { authCode, inviteToken, localDate } from './links';

describe('native incoming links', () => {
  it('redeems auth codes only at the exact callback route', () => {
    expect(authCode('niconotes://auth?code=one-time')).toBe('one-time');
    for (const link of [
      'https://auth?code=x',
      'niconotes://auth/other?code=x',
      'niconotes://auth.evil?code=x',
      'niconotes://user@auth?code=x',
      'niconotes://invite/x',
      'not-a-url',
    ])
      expect(authCode(link)).toBeNull();
  });
  it('recognizes native and same-origin web invitations', () => {
    expect(inviteToken('niconotes://invite/abc', 'https://notes.example')).toBe('abc');
    expect(inviteToken('https://notes.example/invite/abc', 'https://notes.example')).toBe('abc');
    for (const link of [
      'https://evil.example/invite/abc',
      'niconotes://invite/abc%2Fdef',
      'niconotes://invite/',
      'niconotes://user@invite/abc',
      'niconotes://auth?code=x',
    ])
      expect(inviteToken(link, 'https://notes.example')).toBeNull();
  });
  it('uses the local calendar date for a new visit', () => {
    expect(localDate(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
  });
});
