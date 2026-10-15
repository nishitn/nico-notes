import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const accent = v.union(v.literal('coral'), v.literal('sage'), v.literal('peach'));
export const memberRole = v.union(v.literal('admin'), v.literal('member'));
export const photoStorage = v.union(v.literal('convex'), v.literal('local'));
export const targetKind = v.union(v.literal('overall'), v.literal('dish'), v.literal('category'));
export const locationValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
  source: v.optional(v.string()),
});
const schema = defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    displayName: v.optional(v.string()),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),
  boards: defineTable({
    name: v.string(),
    description: v.string(),
    accent,
    ownerId: v.id('users'),
    deleting: v.boolean(),
    inviteCode: v.optional(v.string()),
    photoStorage: v.optional(photoStorage),
    placeLinkingStartedAt: v.optional(v.number()),
  }).index('by_inviteCode', ['inviteCode']),
  memberships: defineTable({
    boardId: v.id('boards'),
    userId: v.id('users'),
    role: v.optional(memberRole),
  })
    .index('by_userId', ['userId'])
    .index('by_boardId', ['boardId'])
    .index('by_boardId_and_userId', ['boardId', 'userId']),
  joinRequests: defineTable({
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
    .index('by_userId_and_status', ['userId', 'status']),
  invitations: defineTable({
    boardId: v.id('boards'),
    token: v.string(),
    expiresAt: v.number(),
    revoked: v.boolean(),
  })
    .index('by_token', ['token'])
    .index('by_boardId', ['boardId']),
  visitTypes: defineTable({
    boardId: v.id('boards'),
    name: v.string(),
    categories: v.array(v.string()),
    showDishes: v.boolean(),
  }).index('by_boardId', ['boardId']),
  places: defineTable({
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
    .index('by_boardId_and_matchKey', ['boardId', 'matchKey']),
  visits: defineTable({
    boardId: v.id('boards'),
    creatorId: v.id('users'),
    title: v.string(),
    date: v.string(),
    place: v.string(),
    notes: v.string(),
    typeName: v.string(),
    showDishes: v.boolean(),
    location: v.optional(locationValidator),
    mapQuery: v.optional(v.string()),
    visitNumber: v.optional(v.number()),
    placeId: v.optional(v.id('places')),
    googlePlaceId: v.optional(v.string()),
    importKey: v.optional(v.string()),
  })
    .index('by_placeId_and_date', ['placeId', 'date'])
    .index('by_boardId_and_placeId', ['boardId', 'placeId'])
    .index('by_boardId_and_importKey', ['boardId', 'importKey'])
    .index('by_boardId_and_date', ['boardId', 'date']),
  categories: defineTable({
    visitId: v.id('visits'),
    name: v.string(),
    position: v.number(),
  }).index('by_visitId', ['visitId']),
  dishes: defineTable({ visitId: v.id('visits'), name: v.string(), description: v.string() }).index(
    'by_visitId',
    ['visitId'],
  ),
  ratings: defineTable({
    visitId: v.id('visits'),
    userId: v.optional(v.id('users')),
    importedName: v.optional(v.string()),
    kind: targetKind,
    targetId: v.string(),
    score: v.number(),
    note: v.string(),
  })
    .index('by_visitId', ['visitId'])
    .index('by_visitId_and_kind_and_targetId', ['visitId', 'kind', 'targetId'])
    .index('by_visitId_and_userId_and_kind_and_targetId', [
      'visitId',
      'userId',
      'kind',
      'targetId',
    ]),
  photos: defineTable({
    visitId: v.id('visits'),
    uploaderId: v.id('users'),
    storageId: v.optional(v.id('_storage')),
    localKey: v.optional(v.string()),
    caption: v.string(),
    contentType: v.string(),
  })
    .index('by_visitId', ['visitId'])
    .index('by_storageId', ['storageId'])
    .index('by_localKey', ['localKey']),
  localPhotoDeletions: defineTable({ key: v.string(), contentType: v.string() }),
  uploads: defineTable({
    visitId: v.id('visits'),
    userId: v.id('users'),
    caption: v.string(),
    expiresAt: v.number(),
    provider: v.optional(photoStorage),
  })
    .index('by_visitId', ['visitId'])
    .index('by_expiresAt', ['expiresAt']),
});
export default schema;
