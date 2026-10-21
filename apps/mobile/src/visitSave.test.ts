import { expect, it, vi } from 'vite-plus/test';
import { saveVisitWithPhotos, type VisitSaveSession } from './visitSave';

it('retries only unfinished photos without creating another visit', async () => {
  const session: VisitSaveSession<string> = { revision: 0, completedPhotos: new Set() };
  const saveDetails = vi.fn(async () => ({ id: 'one-visit', revision: 0 }));
  let fail = true;
  const upload = vi.fn(async (_id: string, uri: string) => {
    if (uri === 'second' && fail) throw new Error('Network lost');
  });
  const uploaded = vi.fn();
  const args = {
    session,
    fingerprint: 'notes',
    photos: ['first', 'second', 'third'],
    saveDetails,
    upload,
    uploaded,
  };
  await expect(saveVisitWithPhotos(args)).rejects.toThrow('Network lost');
  expect(session.id).toBe('one-visit');
  fail = false;
  expect(await saveVisitWithPhotos(args)).toBe('one-visit');
  expect(saveDetails).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls.map((call) => call[1])).toEqual(['first', 'second', 'second', 'third']);
  expect(uploaded.mock.calls.flat()).toEqual(['first', 'second', 'third']);
});

it('checks the saved revision when details change after a partial save', async () => {
  const session: VisitSaveSession<string> = {
    id: 'existing',
    revision: 4,
    fingerprint: 'before',
    completedPhotos: new Set(),
  };
  const saveDetails = vi.fn(async (_id: string | undefined, revision: number) => ({
    id: 'existing',
    revision: revision + 1,
  }));
  await saveVisitWithPhotos({
    session,
    fingerprint: 'after',
    photos: [],
    saveDetails,
    upload: async () => {},
    uploaded: () => {},
  });
  expect(saveDetails).toHaveBeenCalledWith('existing', 4);
  expect(session.revision).toBe(5);
});
