import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { auth } from './auth';
import { requireUser } from './lib';
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from '../shared';

import { photoFailure } from '../photoErrors';

const http = httpRouter();
auth.addHttpRoutes(http);
function headers(request: Request) {
  const origin = request.headers.get('Origin');
  const allowed = [process.env.SITE_URL, process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173']
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((s) => s.trim());
  return {
    ...(origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'private, no-store',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
}
function imageMatches(bytes: Uint8Array, type: string) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  return (
    type === 'image/webp' &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}
http.route({
  path: '/photos/upload',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    let storageId: Id<'_storage'> | null = null;
    try {
      await requireUser(ctx);
      const uploadId = new URL(request.url).searchParams.get('ticket') as Id<'uploads'> | null;
      if (!uploadId)
        return new Response('Missing upload reservation.', {
          status: 400,
          headers: headers(request),
        });
      const upload = await ctx.runQuery(internal.photos.checkUpload, { uploadId });
      if (upload.photoId)
        return Response.json({ photoId: upload.photoId }, { headers: headers(request) });
      const contentType = request.headers.get('Content-Type') ?? '';
      if (!PHOTO_TYPES.includes(contentType))
        return new Response('Use JPEG, PNG, or WebP.', { status: 415, headers: headers(request) });
      if (Number(request.headers.get('Content-Length')) > MAX_PHOTO_BYTES)
        return new Response('Images must be 10 MB or smaller.', {
          status: 413,
          headers: headers(request),
        });
      const reader = request.body?.getReader();
      if (!reader) throw new Error('Empty image.');
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PHOTO_BYTES) {
          await reader.cancel();
          return new Response('Images must be 10 MB or smaller.', {
            status: 413,
            headers: headers(request),
          });
        }
        chunks.push(new Uint8Array(value));
      }
      const blob = new Blob(chunks, { type: contentType });
      if (!imageMatches(new Uint8Array(await blob.slice(0, 12).arrayBuffer()), contentType))
        return new Response('This file is not a valid JPEG, PNG, or WebP image.', {
          status: 415,
          headers: headers(request),
        });
      storageId = await ctx.storage.store(blob);
      const photoId = await ctx.runMutation(internal.photos.finishUpload, {
        uploadId,
        storageId,
        contentType: contentType as 'image/jpeg' | 'image/png' | 'image/webp',
      });
      return Response.json({ photoId }, { headers: headers(request) });
    } catch (error) {
      if (storageId) await ctx.storage.delete(storageId);
      const failure = photoFailure(error);
      if (failure.status === 503) console.error('photo_upload_failed', { code: failure.code });
      return Response.json(failure, { status: failure.status, headers: headers(request) });
    }
  }),
});
http.route({
  path: '/photos/file',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    try {
      await requireUser(ctx);
      const photoId = new URL(request.url).searchParams.get('id') as Id<'photos'> | null;
      if (!photoId) return new Response('Not found.', { status: 404, headers: headers(request) });
      const storageId = await ctx.runQuery(internal.photos.file, { photoId });
      const blob = await ctx.storage.get(storageId);
      if (!blob) return new Response('Not found.', { status: 404, headers: headers(request) });
      return new Response(blob, { headers: { ...headers(request), 'Content-Type': blob.type } });
    } catch {
      return new Response('Photo unavailable.', { status: 403, headers: headers(request) });
    }
  }),
});
http.route({
  path: '/profile/photo',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    let storageId: Id<'_storage'> | null = null;
    try {
      await ctx.runQuery(internal.profile.authorize, {});
      const contentType = request.headers.get('Content-Type') ?? '';
      if (!PHOTO_TYPES.includes(contentType))
        return Response.json(
          { message: 'Choose a JPEG, PNG or WebP photo.' },
          { status: 415, headers: headers(request) },
        );
      if (Number(request.headers.get('Content-Length')) > MAX_PHOTO_BYTES)
        return Response.json(
          { message: 'Choose a photo up to 10 MB.' },
          { status: 413, headers: headers(request) },
        );
      const reader = request.body?.getReader();
      if (!reader)
        return Response.json(
          { message: 'Choose a photo to upload.' },
          { status: 400, headers: headers(request) },
        );
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PHOTO_BYTES) {
          await reader.cancel();
          return Response.json(
            { message: 'Choose a photo up to 10 MB.' },
            { status: 413, headers: headers(request) },
          );
        }
        chunks.push(new Uint8Array(value));
      }
      const image = new Blob(chunks, { type: contentType });
      if (!imageMatches(new Uint8Array(await image.slice(0, 12).arrayBuffer()), contentType))
        return Response.json(
          { message: 'This file is not a valid photo.' },
          { status: 415, headers: headers(request) },
        );
      storageId = await ctx.storage.store(image);
      await ctx.runMutation(internal.profile.setPhoto, {
        storageId,
        contentType: contentType as 'image/jpeg' | 'image/png' | 'image/webp',
      });
      return Response.json({ saved: true }, { headers: headers(request) });
    } catch (error) {
      if (storageId) await ctx.storage.delete(storageId);
      const failure = photoFailure(error);
      return Response.json(
        {
          message:
            failure.status === 401
              ? 'Sign in again to change your photo.'
              : 'Unable to save your profile photo. Please try again.',
        },
        { status: failure.status, headers: headers(request) },
      );
    }
  }),
});
for (const path of ['/photos/upload', '/photos/file', '/profile/photo'])
  http.route({
    path,
    method: 'OPTIONS',
    handler: httpAction(
      async (_ctx, request) => new Response(null, { status: 204, headers: headers(request) }),
    ),
  });
export default http;
