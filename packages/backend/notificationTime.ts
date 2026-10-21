export function notificationTime(createdAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (seconds < 60) return `${seconds} sec ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 3 * 24 * 3600) return `${Math.floor(seconds / 3600)} hr ago`;
  return new Date(createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
