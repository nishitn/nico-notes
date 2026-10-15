import { describe, expect, it } from 'vite-plus/test';
import { safeRedirect, NATIVE_AUTH_REDIRECT } from '../redirect';

describe('Android OAuth redirect boundary', () => {
  it('allows the exact installed app callback alongside web redirects', () => {
    expect(safeRedirect(NATIVE_AUTH_REDIRECT, 'https://notes.example')).toBe('niconotes://auth');
    expect(safeRedirect('/boards', 'https://notes.example')).toBe('https://notes.example/boards');
  });

  it.each([
    'niconotes://auth/steal',
    'niconotes://auth?redirect=https://evil.example',
    'niconotes://auth#steal',
    'niconotes://auth.evil.example',
    'niconotes://user@auth',
    'niconotes://invite/token',
    'niconotes:///auth',
    'niconotes://auth\n',
    'exp://192.168.1.2:8081',
    'otherapp://auth',
  ])('rejects alternate native redirect %s', (url) => {
    expect(safeRedirect(url, 'https://notes.example')).toBe('https://notes.example/');
  });

  it('requires a valid backend site even for native sign-in', () => {
    expect(() => safeRedirect(NATIVE_AUTH_REDIRECT)).toThrow();
    expect(() => safeRedirect(NATIVE_AUTH_REDIRECT, 'niconotes://auth')).toThrow();
  });
});
