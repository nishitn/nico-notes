import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, type QueryCtx } from './_generated/server';
import { authedMutation, requireActiveUser, TERMS_VERSION } from './lib';
import { MAX_PHOTO_BYTES } from '../shared';

async function profileAccess(ctx: QueryCtx) {
  const userId = await requireActiveUser(ctx);
  const user = (await ctx.db.get(userId))!;
  if (user.termsVersion !== TERMS_VERSION)
    throw new ConvexError('Please accept the current terms before making changes.');
  return user;
}

export const authorize = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await profileAccess(ctx);
    return null;
  },
});

// Only the authenticated HTTP upload can attach a newly stored file. Clients never
// choose a storage ID, so they cannot claim or delete another person's upload.
export const setPhoto = internalMutation({
  args: {
    storageId: v.id('_storage'),
    contentType: v.union(v.literal('image/jpeg'), v.literal('image/png'), v.literal('image/webp')),
  },
  returns: v.null(),
  handler: async (ctx, { storageId, contentType }) => {
    const user = await profileAccess(ctx);
    const metadata = await ctx.db.system.get(storageId);
    if (
      !metadata ||
      metadata.size > MAX_PHOTO_BYTES ||
      (metadata.contentType !== undefined && metadata.contentType !== contentType)
    )
      throw new ConvexError('Use a JPEG, PNG or WebP image up to 10 MB.');
    await ctx.db.patch(user._id, { profilePhotoId: storageId, hideProfilePhoto: false });
    if (user.profilePhotoId && user.profilePhotoId !== storageId)
      await ctx.db.insert('retainedFiles', {
        userId: user._id,
        storageId: user.profilePhotoId,
        deletedAt: Date.now(),
      });
    return null;
  },
});

export const removePhoto = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = (await ctx.db.get(ctx.userId))!;
    if (user.profilePhotoId)
      await ctx.db.insert('retainedFiles', {
        userId: user._id,
        storageId: user.profilePhotoId,
        deletedAt: Date.now(),
      });
    await ctx.db.patch(ctx.userId, { profilePhotoId: undefined, hideProfilePhoto: true });
    return null;
  },
});
