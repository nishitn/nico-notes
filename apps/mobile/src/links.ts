export const AUTH_REDIRECT = 'niconotes://auth';

export function authCode(link: string): string | null {
  try {
    const url = new URL(link);
    if (
      `${url.protocol}//${url.host}${url.pathname}` !== AUTH_REDIRECT ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    return url.searchParams.get('code');
  } catch {
    return null;
  }
}
export function inviteToken(link: string, webOrigin: string): string | null {
  try {
    const url = new URL(link);
    if (url.username || url.password) return null;
    const native = url.protocol === 'niconotes:' && url.host === 'invite';
    if (
      !native &&
      (url.origin !== new URL(webOrigin).origin || !url.pathname.startsWith('/invite/'))
    )
      return null;
    const token = decodeURIComponent(
      native ? url.pathname.slice(1) : url.pathname.slice('/invite/'.length),
    );
    return token && !/[\s/\\?#]/.test(token) ? token : null;
  } catch {
    return null;
  }
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
