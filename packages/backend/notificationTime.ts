export function notificationTime(createdAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 3 * 24 * 3600) return `${Math.floor(seconds / 3600)} hr ago`;
  return new Date(createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

// Absolute time when the displayed label next changes; dates need no refresh.
export function nextNotificationTimeUpdate(createdAt: number, now: number): number | null {
  const age = Math.max(0, now - createdAt);
  if (age >= 3 * 24 * 3600 * 1000) return null;
  const unit = age < 3_600_000 ? 60_000 : 3_600_000;
  return createdAt + (Math.floor(age / unit) + 1) * unit;
}
