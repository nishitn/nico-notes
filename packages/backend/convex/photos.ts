import { logChange, logVisitChange } from './activity';
import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import {
  liveInternalMutation as internalMutation,
  liveInternalQuery as internalQuery,
} from './softDeletion';
import { admin, authedMutation, authedQuery, visitAccess } from './lib';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_TYPES } from '../shared';
import schema, { photoStorage } from './schema';
import { isModerator } from './account';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { requireActiveUser } from './lib';

async function readPhotoAccess(ctx: QueryCtx, photo: Doc<'photos'>) {
  try {
    await visitAccess(ctx, photo.visitId);
  } catch (error) {
    const userId = await requireActiveUser(ctx);
    if (!(await isModerator(ctx, userId))) throw error;
    const photoReports = await ctx.db
      .query('reports')
      .withIndex('by_photoId', (q) => q.eq('photoId', photo._id))
      .take(100);
    const visitReports = await ctx.db
      .query('reports')
      .withIndex('by_visitId', (q) => q.eq('visitId', photo.visitId))
      .take(100);
    if (![...photoReports, ...visitReports].some((report) => report.status === 'open')) throw error;
  }
}
// Completion is recoverable for the photo's lifetime, even after the short-lived
// reservation expires. Never renew an uncertain operation into a duplicate upload.
async function reservation(
  ctx: QueryCtx,
  uploadId: import('./_generated/dataModel').Id<'uploads'>,
) {
  const upload = await ctx.db.get(uploadId);
  if (upload && upload.expiresAt > Date.now()) return upload;
  const photo = await ctx.db
    .query('photos')
    .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
    .first();
  if (photo)
    return {
      _id: uploadId,
      _creationTime: photo._creationTime,
      visitId: photo.visitId,
      userId: photo.uploaderId,
      caption: photo.caption,
      photoId: photo._id,
      provider: photo.storageId ? ('convex' as const) : ('local' as const),
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
  throw new ConvexError('Upload expired. Please retry.');
}
export const reserve = authedMutation({
  args: { visitId: v.id('visits'), caption: v.string() },
  returns: v.id('uploads'),
  handler: async (ctx, { visitId, caption }) => {
    await visitAccess(ctx, visitId);
    const photos = await ctx.db
      .query('photos')
      .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
      .take(MAX_PHOTOS);
    const reservations = await ctx.db
      .query('uploads')
      .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
      .take(MAX_PHOTOS);
    for (const reservation of reservations)
      if (reservation.expiresAt <= Date.now()) await ctx.db.delete(reservation._id);
    if (
      photos.length + reservations.filter((r) => !r.photoId && r.expiresAt > Date.now()).length >=
      MAX_PHOTOS
    )
      throw new ConvexError('A visit can have up to 10 photos.');
    return ctx.db.insert('uploads', {
      visitId,
      userId: ctx.userId,
      caption: caption.trim().slice(0, 300),
      expiresAt: Date.now() + 15 * 60 * 1000,
      // Storage is a service-wide choice. Ignore historical board preferences.
      provider: 'convex',
    });
  },
});
export const cancel = authedMutation({
  args: { uploadId: v.id('uploads') },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get(uploadId);
    if (upload && upload.userId === ctx.userId) await ctx.db.delete(uploadId);
    return null;
  },
});
export const checkUpload = internalQuery({
  args: { uploadId: v.id('uploads') },
  returns: schema.doc('uploads'),
  handler: async (ctx, { uploadId }) => {
    const upload = await reservation(ctx, uploadId);
    const { userId } = await visitAccess(ctx, upload.visitId);
    if (userId !== upload.userId) throw new ConvexError('This upload belongs to another person.');
    if (upload.provider === 'local')
      throw new ConvexError('Use the local photo service for this upload.');
    return upload;
  },
});
export const finishUpload = internalMutation({
  args: {
    uploadId: v.id('uploads'),
    storageId: v.id('_storage'),
    contentType: v.union(v.literal('image/jpeg'), v.literal('image/png'), v.literal('image/webp')),
  },
  returns: v.id('photos'),
  handler: async (ctx, { uploadId, storageId, contentType }) => {
    const upload = await reservation(ctx, uploadId);
    const { userId } = await visitAccess(ctx, upload.visitId);
    if (userId !== upload.userId) throw new ConvexError('This upload belongs to another person.');
    if (upload.provider === 'local')
      throw new ConvexError('Use the local photo service for this upload.');
    if (upload.photoId) {
      const completed = await ctx.db.get(upload.photoId);
      if (!completed) throw new ConvexError('This photo was removed.');
      if (completed.storageId !== storageId) await ctx.storage.delete(storageId);
      return completed._id;
    }
    const file = await ctx.db.system.get(storageId);
    if (
      !file ||
      file.size > MAX_PHOTO_BYTES ||
      !PHOTO_TYPES.includes(contentType) ||
      (file.contentType !== undefined && file.contentType !== contentType)
    )
      throw new ConvexError('Use a JPEG, PNG, or WebP image up to 10 MB.');
    const photos = await ctx.db
      .query('photos')
      .withIndex('by_visitId', (q) => q.eq('visitId', upload.visitId))
      .take(MAX_PHOTOS);
    if (photos.length >= MAX_PHOTOS) throw new ConvexError('This visit already has 10 photos.');
    const id = await ctx.db.insert('photos', {
      visitId: upload.visitId,
      uploaderId: userId,
      storageId,
      uploadId,
      caption: upload.caption,
      contentType,
    });
    await logVisitChange(ctx, upload.visitId, userId, 'added a photo to');
    await ctx.db.patch(uploadId, { photoId: id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return id;
  },
});
export const file = internalQuery({
  args: { photoId: v.id('photos') },
  returns: v.id('_storage'),
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new ConvexError('Photo not found.');
    await readPhotoAccess(ctx, photo);
    if (!photo.storageId) throw new ConvexError('This photo is stored on the Mac mini.');
    return photo.storageId;
  },
});
export const updateCaption = authedMutation({
  args: { photoId: v.id('photos'), caption: v.string() },
  returns: v.null(),
  handler: async (ctx, { photoId, caption }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new ConvexError('Photo not found.');
    const { isAdmin } = await visitAccess(ctx, photo.visitId);
    if (photo.uploaderId !== ctx.userId && !isAdmin)
      throw new ConvexError('Only the uploader or admin can change the caption.');
    const clean = caption.trim().slice(0, 300);
    if (clean !== photo.caption) {
      await ctx.db.patch(photoId, { caption: clean });
      await logVisitChange(ctx, photo.visitId, ctx.userId, 'updated a photo caption on');
    }
    return null;
  },
});
export const remove = authedMutation({
  args: { photoId: v.id('photos') },
  returns: v.null(),
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) return null;
    const { isAdmin } = await visitAccess(ctx, photo.visitId);
    if (photo.uploaderId !== ctx.userId && !isAdmin)
      throw new ConvexError('Only the uploader or admin can remove this photo.');
    await ctx.db.delete(photo._id);
    await logVisitChange(ctx, photo.visitId, ctx.userId, 'removed a photo from');
    return null;
  },
});
export const configuration = query({
  args: {},
  returns: v.object({
    googleReady: v.boolean(),
    googleClientId: v.optional(v.string()),
    supportEmail: v.string(),
    localStorageReady: v.boolean(),
  }),
  handler: async () => ({
    supportEmail: 'nishit.nagar1@gmail.com',
    localStorageReady: false,
    // OAuth client IDs are public. Credentials and signing keys stay server-side.
    ...(process.env.AUTH_GOOGLE_ID ? { googleClientId: process.env.AUTH_GOOGLE_ID } : {}),
    googleReady:
      !!process.env.AUTH_GOOGLE_ID &&
      !!process.env.AUTH_GOOGLE_SECRET &&
      !!process.env.JWT_PRIVATE_KEY &&
      !!process.env.JWKS,
  }),
});

export const setStorage = authedMutation({
  args: { boardId: v.id('boards'), provider: photoStorage },
  returns: v.null(),
  handler: async (ctx, { boardId, provider }) => {
    await admin(ctx, boardId);
    if (provider !== 'convex')
      throw new ConvexError(
        'Photos are stored securely in Convex. Local storage is no longer available.',
      );
    const board = await ctx.db.get(boardId);
    await ctx.db.patch(boardId, { photoStorage: provider });
    if ((board?.photoStorage ?? 'convex') !== provider)
      await logChange(ctx, boardId, ctx.userId, 'changed the photo storage setting');
    return null;
  },
});

// Pin the destination to the reservation so an admin change cannot split an upload.
export const uploadProvider = authedQuery({
  args: { uploadId: v.id('uploads') },
  returns: photoStorage,
  handler: async (ctx, { uploadId }) => {
    const upload = await reservation(ctx, uploadId);
    await visitAccess(ctx, upload.visitId);
    if (upload.userId !== ctx.userId)
      throw new ConvexError('This upload belongs to another person.');
    return upload.provider ?? 'convex';
  },
});

// Read from the file's actual location, independently of the board's current preference.
export const fileProvider = authedQuery({
  args: { photoId: v.id('photos') },
  returns: v.union(photoStorage, v.null()),
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) return null;
    await readPhotoAccess(ctx, photo);
    return photo.storageId ? 'convex' : photo.localKey ? 'local' : null;
  },
});

function requireLocalSecret(secret: string) {
  if (!process.env.LOCAL_PHOTO_SECRET || secret !== process.env.LOCAL_PHOTO_SECRET)
    throw new ConvexError('Local photo service is not authorized.');
}

export const localUpload = authedQuery({
  args: { uploadId: v.id('uploads') },
  returns: v.union(v.id('photos'), v.null()),
  handler: async (ctx, { uploadId }) => {
    const existing = await ctx.db
      .query('photos')
      .withIndex('by_localKey', (q) => q.eq('localKey', uploadId))
      .unique();
    if (existing) {
      await visitAccess(ctx, existing.visitId);
      if (existing.uploaderId !== ctx.userId)
        throw new ConvexError('This upload belongs to another person.');
      return existing._id;
    }
    const ticket = await ctx.db.get(uploadId);
    if (!ticket || ticket.expiresAt <= Date.now())
      throw new ConvexError('Upload expired. Please retry.');
    await visitAccess(ctx, ticket.visitId);
    if (ticket.userId !== ctx.userId)
      throw new ConvexError('This upload belongs to another person.');
    if (ticket.provider !== 'local') throw new ConvexError('Use Convex for this upload.');
    return null;
  },
});
export const finishLocalUpload = authedMutation({
  args: {
    uploadId: v.id('uploads'),
    contentType: v.union(v.literal('image/jpeg'), v.literal('image/png'), v.literal('image/webp')),
    secret: v.string(),
  },
  returns: v.id('photos'),
  handler: async () => {
    throw new ConvexError(
      'Local uploads are no longer available. Please retry with Convex storage.',
    );
  },
});
export const localFile = authedQuery({
  args: { photoId: v.id('photos') },
  returns: v.union(v.object({ key: v.string(), contentType: v.string() }), v.null()),
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new ConvexError('Photo not found.');
    await readPhotoAccess(ctx, photo);
    return photo.localKey ? { key: photo.localKey, contentType: photo.contentType } : null;
  },
});
export const localDeletions = query({
  args: { secret: v.string() },
  returns: v.array(schema.doc('localPhotoDeletions')),
  handler: async (ctx, { secret }) => {
    requireLocalSecret(secret);
    return ctx.db.query('localPhotoDeletions').take(100);
  },
});
export const finishLocalDeletions = mutation({
  args: { secret: v.string(), ids: v.array(v.id('localPhotoDeletions')) },
  returns: v.null(),
  handler: async (ctx, { secret, ids }) => {
    requireLocalSecret(secret);
    if (ids.length > 100) throw new ConvexError('Delete up to 100 photos at a time.');
    for (const id of ids) await ctx.db.delete(id);
    return null;
  },
});
