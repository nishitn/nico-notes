import { storedPlace } from '../placePersistence';
import { logVisitChange } from './activity';
import { requireUser } from './lib';
import { ConvexError } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { bumpVisitCount } from './lib';
import { resolvePlace, syncPlace } from './places';
import { validDate } from '../shared';

export function safeLink(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error();
    if (url.toString().length > 500) throw new Error();
    return url.toString();
  } catch {
    throw new ConvexError('Use a valid http or https link up to 500 characters.');
  }
}

/** Atomic and repeatable: preserve the original wishlist row and every saved field. */
export async function ensurePlannedVisit(ctx: MutationCtx, wish: Doc<'wishlist'>) {
  if (wish.visitId) {
    const existing = await ctx.db.get(wish.visitId);
    if (existing && existing.boardId === wish.boardId) return existing._id;
    throw new ConvexError('This planned visit is no longer available.');
  }
  if (wish.googlePlaceId) {
    const clean = storedPlace(wish);
    await ctx.db.patch(wish._id, { title: clean.title, place: '', location: undefined });
    wish = clean;
  }
  const type = await ctx.db
    .query('visitTypes')
    .withIndex('by_boardId', (q) => q.eq('boardId', wish.boardId))
    .first();
  const visitId = await ctx.db.insert('visits', {
    boardId: wish.boardId,
    creatorId: wish.creatorId,
    status: 'planned',
    wishlistId: wish._id,
    plannedAt: wish.createdAt,
    title: wish.title,
    place: wish.place ?? '',
    date: '',
    notes: wish.notes ?? '',
    notesAuthorId: wish.creatorId,
    savedLink: wish.link,
    location: wish.location,
    googlePlaceId: wish.googlePlaceId,
    typeName: type?.name ?? 'A visit',
    showDishes: type?.showDishes ?? true,
  });
  for (const [position, name] of (type?.categories ?? []).entries())
    await ctx.db.insert('categories', { visitId, name, position });
  await ctx.db.patch(wish._id, { visitId });
  return visitId;
}

export async function completePlannedVisit(
  ctx: MutationCtx,
  visit: Doc<'visits'>,
  date: string,
  expectedRevision?: number,
): Promise<Id<'visits'>> {
  if (!validDate(date)) throw new ConvexError('Choose a valid visit date.');
  // Lost responses and concurrent taps must not create another visit or increment counts twice.
  if (visit.status !== 'planned') return visit._id;
  if (expectedRevision !== undefined && expectedRevision !== (visit.revision ?? 0))
    throw new ConvexError('This planned visit changed. Reopen it before marking it as visited.');
  const place = await resolvePlace(ctx, visit);
  await ctx.db.patch(visit._id, {
    status: undefined,
    date,
    placeId: place._id,
    revision: (visit.revision ?? 0) + 1,
  });
  if (visit.wishlistId) {
    const wish = await ctx.db.get(visit.wishlistId);
    if (wish?.visitId === visit._id) await ctx.db.delete(wish._id);
  }
  await syncPlace(ctx, place._id);
  await bumpVisitCount(ctx, visit.boardId, 1);
  await logVisitChange(ctx, visit._id, await requireUser(ctx), 'marked ', ' as visited');
  return visit._id;
}
