import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import { authedMutation, visitAccess } from './lib';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_TYPES } from '../shared';
import schema from './schema';

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
    return photo.storageId;
  },
});
export const updateCaption = authedMutation({
  args: { photoId: v.id('photos'), caption: v.string() },
  returns: v.null(),
  handler: async (ctx, { photoId, caption }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new ConvexError('Photo not found.');
    const { board } = await visitAccess(ctx, photo.visitId);
    if (photo.uploaderId !== ctx.userId && board.ownerId !== ctx.userId)
      throw new ConvexError('Only the uploader or owner can change the caption.');
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
    const { board } = await visitAccess(ctx, photo.visitId);
    if (photo.uploaderId !== ctx.userId && board.ownerId !== ctx.userId)
      throw new ConvexError('Only the uploader or owner can remove this photo.');
    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(photoId);
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
