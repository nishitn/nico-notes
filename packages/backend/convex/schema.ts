import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const accent = v.union(v.literal('coral'), v.literal('sage'), v.literal('peach'));
export const memberRole = v.union(v.literal('admin'), v.literal('member'));
export const notificationMessage = v.object({
  prefix: v.string(),
  title: v.string(),
  suffix: v.string(),
  googlePlaceId: v.optional(v.string()),
});
export const photoStorage = v.union(v.literal('convex'), v.literal('local'));
export const targetKind = v.union(v.literal('overall'), v.literal('dish'), v.literal('category'));
export const locationValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
  source: v.optional(v.string()),
});
export const deletionFields = {
  deletedAt: v.optional(v.number()),
  deletedBy: v.optional(v.id('users')),
  deletionId: v.optional(v.id('deletions')),
};
const schema = defineSchema({
  ...authTables,
  deletions: defineTable({
    createdAt: v.number(),
    actorId: v.optional(v.id('users')),
    firstTable: v.string(),
    firstId: v.string(),
    restoredAt: v.optional(v.number()),
    restoreReason: v.optional(v.string()),
  }).index('by_actorId', ['actorId']),
  retainedFiles: defineTable({
    userId: v.id('users'),
    storageId: v.id('_storage'),
    deletedAt: v.number(),
    restoredAt: v.optional(v.number()),
    restoreReason: v.optional(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_storageId', ['storageId']),
  users: defineTable({
    ...deletionFields,
    purgeAfter: v.optional(v.number()),
    reactivatedAt: v.optional(v.number()),
    ...authTables.users.validator.fields,
    displayName: v.optional(v.string()),
    profilePhotoId: v.optional(v.id('_storage')),
    hideProfilePhoto: v.optional(v.boolean()),
    deleting: v.optional(v.boolean()),
    suspended: v.optional(v.boolean()),
    termsVersion: v.optional(v.string()),
    termsAcceptedAt: v.optional(v.number()),
  })
    .index('by_profilePhotoId', ['profilePhotoId'])
    .index('by_deleting', ['deleting'])
    .index('by_deleting_and_purgeAfter', ['deleting', 'purgeAfter'])
    .index('email', ['email'])
    .index('phone', ['phone']),
  authVerifiers: defineTable({ ...authTables.authVerifiers.validator.fields })
    .index('signature', ['signature'])
    .index('by_sessionId', ['sessionId']),
  boards: defineTable({
    ...deletionFields,
    name: v.string(),
    description: v.string(),
    accent,
    ownerId: v.id('users'),
    deleting: v.boolean(),
    inviteCode: v.optional(v.string()),
    photoStorage: v.optional(photoStorage),
    placeLinkingStartedAt: v.optional(v.number()),
    visitCount: v.optional(v.number()),
    countRevision: v.optional(v.number()),
    counting: v.optional(v.boolean()),
  })
    .index('by_inviteCode', ['inviteCode'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_inviteCode', ['deletedAt', 'inviteCode']),
  memberships: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    userId: v.id('users'),
    role: v.optional(memberRole),
    notificationsReadAt: v.optional(v.number()),
    notificationReadIds: v.optional(v.array(v.id('boardChanges'))),
  })
    .index('by_userId', ['userId'])
    .index('by_boardId', ['boardId'])
    .index('by_boardId_and_userId', ['boardId', 'userId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_userId', ['deletedAt', 'userId'])
    .index('live_by_boardId', ['deletedAt', 'boardId'])
    .index('live_by_boardId_and_userId', ['deletedAt', 'boardId', 'userId']),
  boardChanges: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    actorId: v.optional(v.id('users')),
    summary: v.string(),
    visitId: v.optional(v.id('visits')),
    message: v.optional(notificationMessage),
    memberChange: v.optional(v.object({ userId: v.id('users'), role: v.optional(memberRole) })),
  })
    .index('by_boardId', ['boardId'])
    .index('by_actorId', ['actorId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_boardId', ['deletedAt', 'boardId'])
    .index('live_by_actorId', ['deletedAt', 'actorId']),
  joinRequests: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    userId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('rejected')),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id('users')),
  })
    .index('by_boardId', ['boardId'])
    .index('by_boardId_and_userId', ['boardId', 'userId'])
    .index('by_boardId_and_status', ['boardId', 'status'])
    .index('by_userId', ['userId'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_reviewedBy', ['reviewedBy'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_boardId', ['deletedAt', 'boardId'])
    .index('live_by_boardId_and_userId', ['deletedAt', 'boardId', 'userId'])
    .index('live_by_boardId_and_status', ['deletedAt', 'boardId', 'status'])
    .index('live_by_userId', ['deletedAt', 'userId'])
    .index('live_by_userId_and_status', ['deletedAt', 'userId', 'status'])
    .index('live_by_reviewedBy', ['deletedAt', 'reviewedBy']),
  invitations: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    token: v.string(),
    expiresAt: v.number(),
    revoked: v.boolean(),
  })
    .index('by_token', ['token'])
    .index('by_boardId', ['boardId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_token', ['deletedAt', 'token'])
    .index('live_by_boardId', ['deletedAt', 'boardId']),
  visitTypes: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    name: v.string(),
    categories: v.array(v.string()),
    showDishes: v.boolean(),
  })
    .index('by_boardId', ['boardId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_boardId', ['deletedAt', 'boardId']),
  places: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    name: v.string(),
    address: v.string(),
    matchKey: v.string(),
    // Preserve metadata from the legacy places model during the lookup-key backfill.
    key: v.optional(v.string()),
    earlierVisits: v.optional(v.number()),
    visitCount: v.optional(v.number()),
    lastVisitDate: v.optional(v.string()),
    mapQuery: v.optional(v.string()),
    googlePlaceId: v.optional(v.string()),
    location: v.optional(locationValidator),
  })
    .index('by_boardId', ['boardId'])
    .index('by_boardId_and_googlePlaceId', ['boardId', 'googlePlaceId'])
    .index('by_boardId_and_matchKey', ['boardId', 'matchKey'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_boardId', ['deletedAt', 'boardId'])
    .index('live_by_boardId_and_googlePlaceId', ['deletedAt', 'boardId', 'googlePlaceId'])
    .index('live_by_boardId_and_matchKey', ['deletedAt', 'boardId', 'matchKey']),
  visits: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    // Absence means visited, including all visits created before planned visits existed.
    status: v.optional(v.literal('planned')),
    wishlistId: v.optional(v.id('wishlist')),
    plannedAt: v.optional(v.number()),
    savedLink: v.optional(v.string()),
    creatorId: v.optional(v.id('users')),
    revision: v.optional(v.number()),
    title: v.string(),
    date: v.string(),
    place: v.string(),
    notes: v.string(),
    notesAuthorId: v.optional(v.id('users')),
    typeName: v.string(),
    showDishes: v.boolean(),
    location: v.optional(locationValidator),
    mapQuery: v.optional(v.string()),
    visitNumber: v.optional(v.number()),
    placeId: v.optional(v.id('places')),
    googlePlaceId: v.optional(v.string()),
    importKey: v.optional(v.string()),
  })
    .index('by_notesAuthorId', ['notesAuthorId'])
    .index('by_creatorId', ['creatorId'])
    .index('by_placeId_and_date', ['placeId', 'date'])
    .index('by_boardId_and_status_and_date', ['boardId', 'status', 'date'])
    .index('by_boardId_and_status_and_placeId', ['boardId', 'status', 'placeId'])
    .index('by_boardId_and_placeId', ['boardId', 'placeId'])
    .index('by_boardId_and_importKey', ['boardId', 'importKey'])
    .index('by_boardId_and_date', ['boardId', 'date'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_notesAuthorId', ['deletedAt', 'notesAuthorId'])
    .index('live_by_creatorId', ['deletedAt', 'creatorId'])
    .index('live_by_placeId_and_date', ['deletedAt', 'placeId', 'date'])
    .index('live_by_boardId_and_status_and_date', ['deletedAt', 'boardId', 'status', 'date'])
    .index('live_by_boardId_and_status_and_placeId', ['deletedAt', 'boardId', 'status', 'placeId'])
    .index('live_by_boardId_and_placeId', ['deletedAt', 'boardId', 'placeId'])
    .index('live_by_boardId_and_importKey', ['deletedAt', 'boardId', 'importKey'])
    .index('live_by_boardId_and_date', ['deletedAt', 'boardId', 'date']),
  categories: defineTable({
    ...deletionFields,
    visitId: v.id('visits'),
    name: v.string(),
    position: v.number(),
  })
    .index('by_visitId', ['visitId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_visitId', ['deletedAt', 'visitId']),
  dishes: defineTable({
    ...deletionFields,
    visitId: v.id('visits'),
    name: v.string(),
    description: v.string(),
  })
    .index('by_visitId', ['visitId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_visitId', ['deletedAt', 'visitId']),
  ratings: defineTable({
    ...deletionFields,
    visitId: v.id('visits'),
    userId: v.optional(v.id('users')),
    importedName: v.optional(v.string()),
    kind: targetKind,
    targetId: v.string(),
    score: v.number(),
    note: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_visitId', ['visitId'])
    .index('by_visitId_and_kind_and_targetId', ['visitId', 'kind', 'targetId'])
    .index('by_visitId_and_userId_and_kind_and_targetId', ['visitId', 'userId', 'kind', 'targetId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_userId', ['deletedAt', 'userId'])
    .index('live_by_visitId', ['deletedAt', 'visitId'])
    .index('live_by_visitId_and_kind_and_targetId', ['deletedAt', 'visitId', 'kind', 'targetId'])
    .index('live_by_visitId_and_userId_and_kind_and_targetId', [
      'deletedAt',
      'visitId',
      'userId',
      'kind',
      'targetId',
    ]),
  photos: defineTable({
    ...deletionFields,
    visitId: v.id('visits'),
    uploaderId: v.id('users'),
    uploadId: v.optional(v.id('uploads')),
    storageId: v.optional(v.id('_storage')),
    localKey: v.optional(v.string()),
    caption: v.string(),
    contentType: v.string(),
  })
    .index('by_visitId', ['visitId'])
    .index('by_uploaderId', ['uploaderId'])
    .index('by_uploadId', ['uploadId'])
    .index('by_storageId', ['storageId'])
    .index('by_localKey', ['localKey'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_visitId', ['deletedAt', 'visitId'])
    .index('live_by_uploaderId', ['deletedAt', 'uploaderId'])
    .index('live_by_uploadId', ['deletedAt', 'uploadId'])
    .index('live_by_storageId', ['deletedAt', 'storageId'])
    .index('live_by_localKey', ['deletedAt', 'localKey']),
  localPhotoDeletions: defineTable({ key: v.string(), contentType: v.string() }),
  uploads: defineTable({
    visitId: v.id('visits'),
    userId: v.id('users'),
    caption: v.string(),
    expiresAt: v.number(),
    provider: v.optional(photoStorage),
    photoId: v.optional(v.id('photos')),
  })
    .index('by_visitId', ['visitId'])
    .index('by_expiresAt', ['expiresAt'])
    .index('by_userId', ['userId']),
  wishlist: defineTable({
    ...deletionFields,
    boardId: v.id('boards'),
    // Compatibility/list reference; the linked visit owns notes, photos and lifecycle.
    visitId: v.optional(v.id('visits')),
    creatorId: v.id('users'),
    title: v.string(),
    notes: v.optional(v.string()),
    place: v.optional(v.string()),
    location: v.optional(locationValidator),
    googlePlaceId: v.optional(v.string()),
    link: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_boardId', ['boardId'])
    .index('by_creatorId', ['creatorId'])
    .index('by_boardId_and_createdAt', ['boardId', 'createdAt'])
    .index('by_boardId_and_visitId', ['boardId', 'visitId'])
    .index('by_boardId_and_googlePlaceId', ['boardId', 'googlePlaceId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_boardId', ['deletedAt', 'boardId'])
    .index('live_by_creatorId', ['deletedAt', 'creatorId'])
    .index('live_by_boardId_and_createdAt', ['deletedAt', 'boardId', 'createdAt'])
    .index('live_by_boardId_and_visitId', ['deletedAt', 'boardId', 'visitId'])
    .index('live_by_boardId_and_googlePlaceId', ['deletedAt', 'boardId', 'googlePlaceId']),
  blocks: defineTable({
    ...deletionFields,
    blockerId: v.id('users'),
    userId: v.id('users'),
    pending: v.optional(v.boolean()),
  })
    .index('by_pending', ['pending'])
    .index('by_blockerId', ['blockerId'])
    .index('by_userId', ['userId'])
    .index('by_blockerId_and_userId', ['blockerId', 'userId'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_pending', ['deletedAt', 'pending'])
    .index('live_by_blockerId', ['deletedAt', 'blockerId'])
    .index('live_by_userId', ['deletedAt', 'userId'])
    .index('live_by_blockerId_and_userId', ['deletedAt', 'blockerId', 'userId']),
  reports: defineTable({
    ...deletionFields,
    reporterId: v.id('users'),
    kind: v.union(v.literal('content'), v.literal('problem')),
    boardId: v.optional(v.id('boards')),
    visitId: v.optional(v.id('visits')),
    photoId: v.optional(v.id('photos')),
    userId: v.optional(v.id('users')),
    reason: v.string(),
    contentSummary: v.optional(v.string()),
    version: v.optional(v.string()),
    platform: v.optional(v.string()),
    status: v.union(v.literal('open'), v.literal('resolved')),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    resolution: v.optional(v.string()),
    note: v.optional(v.string()),
  })
    .index('by_photoId', ['photoId'])
    .index('by_visitId', ['visitId'])
    .index('by_reporterId', ['reporterId'])
    .index('by_boardId', ['boardId'])
    .index('by_userId', ['userId'])
    .index('by_status', ['status'])
    .index('by_deletionId', ['deletionId'])
    .index('by_deletedBy', ['deletedBy'])
    .index('by_deletedAt', ['deletedAt'])
    .index('live_by_photoId', ['deletedAt', 'photoId'])
    .index('live_by_visitId', ['deletedAt', 'visitId'])
    .index('live_by_reporterId', ['deletedAt', 'reporterId'])
    .index('live_by_boardId', ['deletedAt', 'boardId'])
    .index('live_by_userId', ['deletedAt', 'userId'])
    .index('live_by_status', ['deletedAt', 'status']),
});
export default schema;
