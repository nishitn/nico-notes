import { describe, expect, it } from 'vite-plus/test';
import { notificationTime } from '../notificationTime';

describe('notification timestamps', () => {
  const now = Date.UTC(2026, 9, 21, 12);
  it('uses seconds, minutes and hours for notifications within three days', () => {
    expect(notificationTime(now, now)).toBe('0 sec ago');
    expect(notificationTime(now + 5000, now)).toBe('0 sec ago');
    expect(notificationTime(now - 59_000, now)).toBe('59 sec ago');
    expect(notificationTime(now - 60_000, now)).toBe('1 min ago');
    expect(notificationTime(now - 3_599_000, now)).toBe('59 min ago');
    expect(notificationTime(now - 3_600_000, now)).toBe('1 hr ago');
    expect(notificationTime(now - 259_199_000, now)).toBe('71 hr ago');
  });
  it('shows a date once a notification reaches three days old', () => {
    const createdAt = now - 3 * 24 * 60 * 60 * 1000;
    expect(notificationTime(createdAt, now)).toBe(
      new Date(createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }),
    );
  });
});
