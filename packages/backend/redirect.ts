import { ConvexError } from 'convex/values';

export const NATIVE_AUTH_REDIRECT = 'niconotes://auth';

// Only the exact native auth callback, root-relative paths and the application origin
// are accepted. Never allow arbitrary custom schemes or native callback paths.
// URL parsing handles ports, credentials, lookalike hosts and backslashes.
export function safeRedirect(redirectTo: string, siteUrl?: string) {
  if (!siteUrl) throw new ConvexError('Sign-in is not configured. Please contact the board admin.');
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    throw new ConvexError('Sign-in is not configured. Please contact the board admin.');
  }
  if (!['http:', 'https:'].includes(base.protocol))
    throw new ConvexError('Sign-in is not configured. Please contact the board admin.');
  if (redirectTo === NATIVE_AUTH_REDIRECT) return NATIVE_AUTH_REDIRECT;
  const fallback = base.origin + '/';
  if (
    Array.from(redirectTo).some(
      (char) => char === '\\' || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    ) ||
    redirectTo.startsWith('//')
  )
    return fallback;
  const relative = redirectTo.startsWith('/');
  if (!relative && !/^https?:\/\//i.test(redirectTo)) return fallback;
  try {
    const url = new URL(redirectTo, base.origin);
    if (url.username || url.password || url.origin !== base.origin) return fallback;
    return url.origin + url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
