import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const accent = v.union(v.literal('coral'), v.literal('sage'), v.literal('peach'));
export const targetKind = v.union(v.literal('overall'), v.literal('dish'), v.literal('category'));
const schema = defineSchema({
  ...authTables,
  boards: defineTable({
    name: v.string(),
    description: v.string(),
    accent,
    ownerId: v.id('users'),
    deleting: v.boolean(),
  }),
  memberships: defineTable({ boardId: v.id('boards'), userId: v.id('users') })
    .index('by_userId', ['userId'])
    .index('by_boardId', ['boardId'])
    .index('by_boardId_and_userId', ['boardId', 'userId']),
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
  visits: defineTable({
    boardId: v.id('boards'),
    creatorId: v.id('users'),
    title: v.string(),
    date: v.string(),
    place: v.string(),
    notes: v.string(),
    typeName: v.string(),
    showDishes: v.boolean(),
  }).index('by_boardId_and_date', ['boardId', 'date']),
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
    userId: v.id('users'),
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
    storageId: v.id('_storage'),
    caption: v.string(),
    contentType: v.string(),
  })
    .index('by_visitId', ['visitId'])
    .index('by_storageId', ['storageId']),
  uploads: defineTable({
    visitId: v.id('visits'),
    userId: v.id('users'),
    caption: v.string(),
    expiresAt: v.number(),
  })
    .index('by_visitId', ['visitId'])
    .index('by_expiresAt', ['expiresAt']),
});
export default schema;
