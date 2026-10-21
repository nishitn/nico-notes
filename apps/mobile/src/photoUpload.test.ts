import { expect, it, vi } from 'vite-plus/test';
import { resolveUpload } from './photoUpload';

it('keeps an uncertain upload ticket when the network fails', async () => {
  const reserve = vi.fn(async () => 'replacement');
  await expect(
    resolveUpload('original', reserve, async () => {
      throw new Error('Offline');
    }),
  ).rejects.toThrow('Offline');
  expect(reserve).not.toHaveBeenCalled();
});

it('renews only a definitively expired upload and preserves completed tickets', async () => {
  const reserve = vi.fn(async () => 'replacement');
  const check = vi.fn(async (ticket: string) => {
    if (ticket === 'expired') throw { data: 'Upload expired. Please retry.' };
    return 'convex';
  });
  expect(await resolveUpload('completed', reserve, check)).toEqual({
    ticket: 'completed',
    provider: 'convex',
  });
  expect(reserve).not.toHaveBeenCalled();
  expect(await resolveUpload('expired', reserve, check)).toEqual({
    ticket: 'replacement',
    provider: 'convex',
  });
  expect(reserve).toHaveBeenCalledTimes(1);
});
