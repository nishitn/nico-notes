import { describe, expect, it } from 'vite-plus/test';
import { nextNotificationTimeUpdate, notificationTime } from '../notificationTime';

describe('notification timestamps', () => {
  const now = Date.UTC(2026, 9, 21, 12);
  it('uses just now, minutes and hours for notifications within three days', () => {
    expect(notificationTime(now, now)).toBe('Just now');
    expect(notificationTime(now + 5000, now)).toBe('Just now');
    expect(notificationTime(now - 59_000, now)).toBe('Just now');
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

  it('waits until the next visible timestamp change', () => {
    const createdAt = now;
    for (const [age, nextAge] of [
      [0, 60_000],
      [500, 60_000],
      [59_999, 60_000],
      [60_000, 120_000],
      [90_000, 120_000],
      [3_599_999, 3_600_000],
      [3_600_000, 7_200_000],
      [5_400_000, 7_200_000],
      [259_199_999, 259_200_000],
    ]) {
      const next = nextNotificationTimeUpdate(createdAt, createdAt + age);
      expect(next).toBe(createdAt + nextAge);
      expect(notificationTime(createdAt, next! - 1)).toBe(
        notificationTime(createdAt, createdAt + age),
      );
      expect(notificationTime(createdAt, next!)).not.toBe(
        notificationTime(createdAt, createdAt + age),
      );
    }
  });

  it('stops refreshing fixed dates and accounts for future timestamps', () => {
    expect(nextNotificationTimeUpdate(now - 259_200_000, now)).toBeNull();
    expect(nextNotificationTimeUpdate(now - 300_000_000, now)).toBeNull();
    expect(nextNotificationTimeUpdate(now + 5000, now)).toBe(now + 65_000);
  });
});
