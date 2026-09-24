import { createServer } from 'node:http';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const maxBytes = 10 * 1024 * 1024;
export function photoPath(directory, key, contentType) {
  if (!/^[a-zA-Z0-9]{20,64}$/.test(key) || !extensions[contentType])
    throw new Error('Invalid photo key.');
  return join(directory, `date-notes-${key}.${extensions[contentType]}`);
}
export function imageMatches(bytes, type) {
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  return (
    type === 'image/webp' &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  );
}

export function createPhotoServer({
  directory,
  secret,
  convexUrl,
  convexSiteUrl,
  clientFactory = () => new ConvexHttpClient(convexUrl),
}) {
  function reply(response, status, body) {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify(body));
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/health' && request.method === 'GET') {
        reply(response, 200, { ready: true });
        return;
      }
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token)
        return reply(response, 401, { error: 'Please sign in to view or upload photos.' });
      const client = clientFactory();
      client.setAuth(token);
      if (url.pathname === '/photos/upload' && request.method === 'POST') {
        const ticket = url.searchParams.get('ticket');
        const contentType = request.headers['content-type'];
        if (!ticket || !extensions[contentType])
          return reply(response, 400, { error: 'Use a JPEG, PNG, or WebP picture.' });
        const destination = photoPath(directory, ticket, contentType);
        const previous = await client.query(api.photos.localUpload, { uploadId: ticket });
        if (previous) {
          request.resume();
          return reply(response, 200, { photoId: previous });
        }
        if (Number(request.headers['content-length']) > maxBytes) {
          request.resume();
          return reply(response, 413, { error: 'Choose a picture up to 10 MB.' });
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > maxBytes) {
            reply(response, 413, { error: 'Choose a picture up to 10 MB.' });
            return;
          }
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (!imageMatches(bytes, contentType))
          return reply(response, 415, { error: 'This file is not a valid image.' });
        await mkdir(directory, { recursive: true, mode: 0o700 });
        try {
          await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          if (!(await readFile(destination)).equals(bytes))
            return reply(response, 409, {
              error: 'This upload already contains a different picture.',
            });
        }
        // Keep bytes after an uncertain response so retrying this ticket is safe.
        const photoId = await client.mutation(api.photos.finishLocalUpload, {
          uploadId: ticket,
          contentType,
          secret,
        });
        return reply(response, 200, { photoId });
      }
      if (url.pathname === '/photos/file' && request.method === 'GET') {
        const photoId = url.searchParams.get('id');
        if (!photoId) return reply(response, 400, { error: 'Choose a photo.' });
        const file = await client.query(api.photos.localFile, { photoId });
        if (!file) {
          // Existing cloud photos remain readable; all new uploads stay on disk.
          const remote = await fetch(
            `${convexSiteUrl}/photos/file?id=${encodeURIComponent(photoId)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!remote.ok) return reply(response, remote.status, { error: 'Photo unavailable.' });
          response.writeHead(200, {
            'Content-Type': remote.headers.get('content-type') ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(Buffer.from(await remote.arrayBuffer()));
          return;
        }
        const bytes = await readFile(photoPath(directory, file.key, file.contentType));
        response.writeHead(200, {
          'Content-Type': file.contentType,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(bytes);
        return;
      }
      reply(response, 404, { error: 'Not found.' });
    } catch {
      if (!response.headersSent)
        reply(response, 503, {
          error:
            'Photo unavailable. Check your access and that the Mac mini photo service is configured.',
        });
      else response.end();
    }
  });
  server.requestTimeout = 120_000;
  async function removeDeletedPhotos() {
    const client = clientFactory();
    const pending = await client.query(api.photos.localDeletions, { secret });
    const ids = [];
    for (const item of pending) {
      try {
        await unlink(photoPath(directory, item.key, item.contentType));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      ids.push(item._id);
    }
    if (ids.length) await client.mutation(api.photos.finishLocalDeletions, { secret, ids });
  }
  return { server, removeDeletedPhotos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(
    (process.env.PHOTO_STORAGE_DIR || '~/pics/notes').replace(/^~(?=\/|$)/, homedir()),
  );
  const secret = process.env.LOCAL_PHOTO_SECRET;
  const convexUrl = process.env.CONVEX_URL;
  const convexSiteUrl = process.env.CONVEX_SITE_URL;
  if (!secret || !convexUrl || !convexSiteUrl)
    throw new Error(
      'Configure LOCAL_PHOTO_SECRET, CONVEX_URL and CONVEX_SITE_URL before starting the photo service.',
    );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { server, removeDeletedPhotos } = createPhotoServer({
    directory,
    secret,
    convexUrl,
    convexSiteUrl,
  });
  let cleaning = false;
  const clean = async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await removeDeletedPhotos();
    } catch {
      console.error('Photo cleanup is waiting for the backend connection.');
    } finally {
      cleaning = false;
    }
  };
  const port = Number(process.env.PHOTO_SERVICE_PORT || 8788);
  server.listen(port, '127.0.0.1', () =>
    console.log(`Local photos: ${directory} (127.0.0.1:${port})`),
  );
  const cleanup = setInterval(clean, 60_000);
  const stop = () => {
    clearInterval(cleanup);
    server.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
