import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFunctionName } from 'convex/server';
import { createPhotoServer, photoPath } from './local-photos.mjs';

const ticket = 'a'.repeat(32);
const photoId = 'b'.repeat(32);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'date-notes-photos-'));
  const state = { photo: false, writes: 0, pending: [], ack: [] };
  const service = createPhotoServer({
    directory,
    secret: 'test-secret',
    clientFactory: () => {
      let token;
      return {
        setAuth(value) {
          token = value;
        },
        async query(ref, args) {
          const name = getFunctionName(ref);
          if (name === 'photos:localDeletions') {
            assert.equal(args.secret, 'test-secret');
            return state.pending;
          }
          if (token !== 'member') throw new Error('No access');
          if (name === 'photos:localUpload') {
            assert.equal(args.uploadId, ticket);
            return state.photo ? photoId : null;
          }
          if (name === 'photos:localFile') {
            assert.equal(args.photoId, photoId);
            if (!state.photo) throw new Error('Missing photo');
            return { key: ticket, contentType: 'image/png' };
          }
          throw new Error('Unexpected query');
        },
        async mutation(ref, args) {
          assert.equal(args.secret, 'test-secret');
          if (getFunctionName(ref) === 'photos:finishLocalDeletions') {
            state.ack = args.ids;
            return null;
          }
          assert.equal(token, 'member');
          assert.equal(args.uploadId, ticket);
          state.photo = true;
          state.writes++;
          return photoId;
        },
      };
    },
  });
  await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  t.after(async () => {
    service.server.closeAllConnections();
    await new Promise((resolve) => service.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const send = (body = png, token = 'member') =>
    fetch(`${base}/photos/upload?ticket=${ticket}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body,
    });
  return { ...service, state, directory, base, send };
}
test('writes private image files and serves them only after an access check', async (t) => {
  const { send, base, directory } = await setup(t);
  assert.equal((await send()).status, 200);
  const path = photoPath(directory, ticket, 'image/png');
  assert.deepEqual(await readFile(path), png);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await fetch(`${base}/photos/file?id=${photoId}`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/photos/file?id=${photoId}`, {
        headers: { Authorization: 'Bearer outsider' },
      })
    ).status,
    503,
  );
  const response = await fetch(`${base}/photos/file?id=${photoId}`, {
    headers: { Authorization: 'Bearer member' },
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});
test('retries the same upload without a duplicate photo', async (t) => {
  const { send, state } = await setup(t);
  assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 200);
  assert.equal(state.writes, 1);
});
test('rejects invalid image bytes and unauthorized uploads', async (t) => {
  const { send, state } = await setup(t);
  assert.equal((await send(Buffer.from('not an image'))).status, 415);
  assert.equal((await send(png, 'outsider')).status, 503);
  assert.equal(state.writes, 0);
});
test('rejects path traversal and oversized images', async (t) => {
  const { directory, send, state } = await setup(t);
  assert.throws(() => photoPath(directory, '../private', 'image/png'));
  assert.equal((await send(Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
  assert.equal(state.writes, 0);
});
test('removes disk files only for authenticated deletion jobs and acknowledges missing files', async (t) => {
  const { send, state, directory, removeDeletedPhotos } = await setup(t);
  await send();
  state.pending = [{ _id: 'job', key: ticket, contentType: 'image/png' }];
  await removeDeletedPhotos();
  await assert.rejects(readFile(photoPath(directory, ticket, 'image/png')), { code: 'ENOENT' });
  assert.deepEqual(state.ack, ['job']);
  await removeDeletedPhotos();
});
