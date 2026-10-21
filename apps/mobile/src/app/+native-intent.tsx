import { authCode, inviteToken } from '../links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const token = inviteToken(
    path,
    process.env.EXPO_PUBLIC_WEB_URL || 'https://notes.nishitnagar.com',
  );
  if (token) return `/Join?token=${encodeURIComponent(token)}`;
  // The session provider exchanges the original auth URL, keeping codes out of route state.
  if (authCode(path)) return '/';
  try {
    // Google's native SDK owns its reversed-client-ID callback, not Router.
    if (/^com\.googleusercontent\.apps\.[a-z0-9-]+:$/i.test(new URL(path).protocol)) return '/';
  } catch {
    // Relative Router paths do not need URL parsing.
  }
  return path;
}
