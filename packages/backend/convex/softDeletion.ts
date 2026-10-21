import { getAuthUserId } from '@convex-dev/auth/server';
import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';
import {
  wrapDatabaseReader,
  wrapDatabaseWriter,
  type Rules,
} from 'convex-helpers/server/rowLevelSecurity';
import {
  internalMutation,
  internalQuery,
  mutation,
  type DatabaseReader,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { DataModel, Doc, Id } from './_generated/dataModel';

export const recoverableTables = [
  'boards',
  'memberships',
  'boardChanges',
  'joinRequests',
  'invitations',
  'visitTypes',
  'places',
  'visits',
  'categories',
  'dishes',
  'ratings',
  'photos',
  'wishlist',
  'blocks',
  'reports',
] as const;
export type RecoverableTable = (typeof recoverableTables)[number];
type RecoverableDoc = Doc<RecoverableTable>;
export const ACCOUNT_RECOVERY_MS = 30 * 24 * 60 * 60 * 1000;

// Keep deleted records outside the scanned index range. The existing index API
// stays available to callers; operator/erasure functions use the raw database.
function indexedReader<T extends DatabaseReader>(db: T): T {
  type Range = { eq(field: string, value: undefined): Range };
  type Query = { withIndex(name: string, range: (q: Range) => unknown): Query };
  return new Proxy(db, {
    get(target, property) {
      if (property === 'query')
        return (table: RecoverableTable) => {
          const source = target.query(table);
          if (!recoverableTables.includes(table)) return source;
          const raw = source as unknown as Query;
          const active = raw.withIndex('by_deletedAt', (q) => q.eq('deletedAt', undefined));
          return new Proxy(source, {
            get(_query, method) {
              if (method === 'withIndex')
                return (name: string, range?: (q: Range) => unknown) =>
                  raw.withIndex(`live_${name}`, (q) => {
                    const live = q.eq('deletedAt', undefined);
                    return range ? range(live) : live;
                  });
              const value = Reflect.get(active, method);
              return typeof value === 'function' ? value.bind(active) : value;
            },
          });
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

// The original IDs and relationships stay in place. Children of an archived board
// or visit are also hidden, without a destructive cascade or an unbounded fan-out.
export async function isLive(db: DatabaseReader, row: RecoverableDoc): Promise<boolean> {
  if (row.deletedAt !== undefined || ('deleting' in row && row.deleting)) return false;
  let boardId = 'boardId' in row ? row.boardId : undefined;
  const history = db.normalizeId('boardChanges', row._id) || db.normalizeId('reports', row._id);
  if (!history && 'visitId' in row && row.visitId) {
    const visit = await db.get(row.visitId);
    if (!visit || visit.deletedAt !== undefined) return false;
    boardId = visit.boardId;
  }
  if (boardId) {
    const board = await db.get(boardId);
    if (!board || board.deleting || board.deletedAt !== undefined) return false;
  }
  return true;
}
function rules(ctx: QueryCtx): Rules<QueryCtx, DataModel> {
  return {
    ...Object.fromEntries(
      recoverableTables.map((table) => [
        table,
        {
          read: async (_ctx: QueryCtx, row: RecoverableDoc) => isLive(ctx.db, row),
        },
      ]),
    ),
    users: { read: async (_ctx, user) => !user.deleting && user.deletedAt === undefined },
    deletions: { read: async () => false, insert: async () => false, modify: async () => false },
    retainedFiles: {
      read: async () => false,
      insert: async (_ctx, file) => file.userId === (await getAuthUserId(ctx)),
      modify: async () => false,
    },
  };
}
export function liveReader(ctx: QueryCtx) {
  return wrapDatabaseReader(ctx, indexedReader(ctx.db), rules(ctx));
}

// All user-facing content deletes share one batch per mutation. Recovery can undo
// that batch without resurrecting a photo/item deleted independently beforehand.
export function liveWriter(ctx: MutationCtx, actorId?: Id<'users'>) {
  const wrapped = wrapDatabaseWriter(ctx, indexedReader(ctx.db), rules(ctx));
  let batch: Id<'deletions'> | undefined;
  return new Proxy(wrapped, {
    get(target, property) {
      if (property === 'delete')
        return async (first: string, second?: string) => {
          const rawId = second ?? first;
          const table = recoverableTables.find((name) => ctx.db.normalizeId(name, rawId));
          if (!table)
            return second
              ? ctx.db.delete(first as 'uploads', second as Id<'uploads'>)
              : ctx.db.delete(first as Id<'uploads'>);
          const id = ctx.db.normalizeId(table, rawId)!;
          const row = await ctx.db.get(id);
          if (!row || row.deletedAt !== undefined) return;
          const userId = actorId ?? (await getAuthUserId(ctx)) ?? undefined;
          const deletedAt = Date.now();
          batch ??= await ctx.db.insert('deletions', {
            createdAt: deletedAt,
            actorId: userId,
            firstTable: table,
            firstId: id,
          });
          await ctx.db.patch(id, { deletedAt, deletedBy: userId, deletionId: batch });
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
export const liveInternalQuery = customQuery(
  internalQuery,
  customCtx((ctx) => ({ db: liveReader(ctx) })),
);
export const liveInternalMutation = customMutation(
  internalMutation,
  customCtx((ctx) => ({ db: liveWriter(ctx) })),
);
export const liveMutation = customMutation(
  mutation,
  customCtx((ctx) => ({ db: liveWriter(ctx) })),
);
