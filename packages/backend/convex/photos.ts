import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, query, mutation } from './_generated/server';
import { authedMutation, authedQuery, visitAccess } from './lib';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_TYPES } from '../shared';
import schema from './schema';
import { deletePhoto } from './cleanup';

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
    if (photos.length + reservations.filter((r) => r.expiresAt > Date.now()).length >= MAX_PHOTOS)
      throw new ConvexError('A visit can have up to 10 photos.');
    return ctx.db.insert('uploads', {
      visitId,
      userId: ctx.userId,
      caption: caption.trim().slice(0, 300),
      expiresAt: Date.now() + 15 * 60 * 1000,
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
    const upload = await ctx.db.get(uploadId);
    if (!upload || upload.expiresAt <= Date.now())
      throw new ConvexError('Upload expired. Please retry.');
    const { userId } = await visitAccess(ctx, upload.visitId);
    if (userId !== upload.userId) throw new ConvexError('This upload belongs to another person.');
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
    const upload = await ctx.db.get(uploadId);
    if (!upload || upload.expiresAt <= Date.now())
      throw new ConvexError('Upload expired. Please retry.');
    const { userId } = await visitAccess(ctx, upload.visitId);
    if (userId !== upload.userId) throw new ConvexError('This upload belongs to another person.');
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
      caption: upload.caption,
      contentType,
    });
    await ctx.db.delete(uploadId);
    return id;
  },
});
export const file = internalQuery({
  args: { photoId: v.id('photos') },
  returns: v.id('_storage'),
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new ConvexError('Photo not found.');
    await visitAccess(ctx, photo.visitId);
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
    await ctx.db.patch(photoId, { caption: caption.trim().slice(0, 300) });
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
    await deletePhoto(ctx, photo);
    return null;
  },
});
export const configuration = query({
  args: {},
  returns: v.object({ googleReady: v.boolean() }),
  handler: async () => ({
    googleReady:
      !!process.env.AUTH_GOOGLE_ID &&
      !!process.env.AUTH_GOOGLE_SECRET &&
      !!process.env.JWT_PRIVATE_KEY &&
      !!process.env.JWKS,
  }),
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
  handler: async (ctx, { uploadId, contentType, secret }) => {
    requireLocalSecret(secret);
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
    const photos = await ctx.db
      .query('photos')
      .withIndex('by_visitId', (q) => q.eq('visitId', ticket.visitId))
      .take(MAX_PHOTOS);
    if (photos.length >= MAX_PHOTOS) throw new ConvexError('This visit already has 10 photos.');
    const photoId = await ctx.db.insert('photos', {
      visitId: ticket.visitId,
      uploaderId: ctx.userId,
      localKey: uploadId,
      caption: ticket.caption,
      contentType,
    });
    await ctx.db.delete(uploadId);
    return photoId;
  },
});
export const localFile = authedQuery({
  args: { photoId: v.id('photos') },
  returns: v.union(v.object({ key: v.string(), contentType: v.string() }), v.null()),
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new ConvexError('Photo not found.');
    await visitAccess(ctx, photo.visitId);
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
