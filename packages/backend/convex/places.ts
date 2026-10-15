import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import schema, { locationValidator } from './schema';
import { authedMutation, authedQuery, member } from './lib';
import { textValue } from '../shared';

export function normalizedPlaceKey(name: string, address: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return JSON.stringify([normalize(name), normalize(address)]);
}

export function validateLocation(location: Doc<'places'>['location'] | null | undefined) {
  if (
    location &&
    (!Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180)
  )
    throw new ConvexError('Choose a valid map location.');
  return location ? { latitude: location.latitude, longitude: location.longitude } : undefined;
}

// Bound atomic fan-out below Convex transaction limits; never silently truncate numbering.
const MAX_PLACE_VISITS = 2000;
async function placeVisits(ctx: MutationCtx, placeId: Id<'places'>) {
  const visits = await ctx.db
    .query('visits')
    .withIndex('by_placeId_and_date', (q) => q.eq('placeId', placeId))
    .take(MAX_PLACE_VISITS + 1);
  if (visits.length > MAX_PLACE_VISITS)
    throw new ConvexError('A place can have up to 2,000 visits on a board.');
  return visits;
}

export async function syncPlace(ctx: MutationCtx, placeId: Id<'places'>) {
  const place = await ctx.db.get(placeId);
  if (!place) return;
  const visits = await placeVisits(ctx, placeId);
  if (!visits.length) {
    await ctx.db.delete(placeId);
    return;
  }
  // Index order: date, creation time, ID. Undated visits come first, in creation order.
  for (const [index, visit] of visits.entries()) {
    if (
      visit.visitNumber !== index + 1 ||
      visit.place !== place.address ||
      visit.googlePlaceId !== place.googlePlaceId ||
      JSON.stringify(visit.location) !== JSON.stringify(place.location)
    ) {
      await ctx.db.patch(visit._id, {
        place: place.address,
        location: place.location,
        googlePlaceId: place.googlePlaceId,
        visitNumber: index + 1,
        mapQuery:
          visit.place !== place.address ||
          JSON.stringify(visit.location) !== JSON.stringify(place.location)
            ? undefined
            : visit.mapQuery,
      });
    }
  }
}

type PlaceInput = {
  boardId: Id<'boards'>;
  title: string;
  place: string;
  googlePlaceId?: string;
  location?: Doc<'places'>['location'] | null;
};

export async function resolvePlace(ctx: MutationCtx, input: PlaceInput): Promise<Doc<'places'>> {
  const name = textValue(input.title, 'Place name');
  const address = input.place.trim().slice(0, 250);
  const googlePlaceId = input.googlePlaceId
    ? textValue(input.googlePlaceId, 'Google Place ID', 300)
    : undefined;
  const matchKey = normalizedPlaceKey(name, address);
  let place = googlePlaceId
    ? await ctx.db
        .query('places')
        .withIndex('by_boardId_and_googlePlaceId', (q) =>
          q.eq('boardId', input.boardId).eq('googlePlaceId', googlePlaceId),
        )
        .unique()
    : null;
  if (!place) {
    const candidates = await ctx.db
      .query('places')
      .withIndex('by_boardId_and_matchKey', (q) =>
        q.eq('boardId', input.boardId).eq('matchKey', matchKey),
      )
      .take(100);
    // A known, different Google ID identifies a different place even if the labels coincide.
    place =
      candidates.find(
        (candidate) =>
          !googlePlaceId || !candidate.googlePlaceId || candidate.googlePlaceId === googlePlaceId,
      ) ?? null;
  }
  const location = validateLocation(input.location);
  if (place) {
    // A repeated visit cannot replace canonical details with stale form data.
    // Fill missing data during linking; explicit corrections use update/match below.
    const patch = {
      googlePlaceId: place.googlePlaceId ?? googlePlaceId,
      location: place.location ?? location,
      address: place.address || address,
    };
    await ctx.db.patch(place._id, {
      ...patch,
      matchKey: normalizedPlaceKey(place.name, patch.address),
    });
    return { ...place, ...patch };
  }
  const id = await ctx.db.insert('places', {
    boardId: input.boardId,
    name,
    address,
    matchKey,
    googlePlaceId,
    location,
  });
  return (await ctx.db.get(id))!;
}

export async function requireLinkedBoard(ctx: MutationCtx, boardId: Id<'boards'>) {
  const unlinked = await ctx.db
    .query('visits')
    .withIndex('by_boardId_and_placeId', (q) => q.eq('boardId', boardId).eq('placeId', undefined))
    .first();
  if (unlinked)
    throw new ConvexError('Places are still being linked. Please try again in a moment.');
}

// Manual corrections can make two previously separate records identify the same place.
export async function updatePlaceDetails(
  ctx: MutationCtx,
  source: Doc<'places'>,
  address: string,
  location: Doc<'places'>['location'],
) {
  const matchKey = normalizedPlaceKey(source.name, address);
  const candidates = await ctx.db
    .query('places')
    .withIndex('by_boardId_and_matchKey', (q) =>
      q.eq('boardId', source.boardId).eq('matchKey', matchKey),
    )
    .take(100);
  const target =
    candidates.find(
      (candidate) =>
        candidate._id !== source._id &&
        (!candidate.googlePlaceId ||
          !source.googlePlaceId ||
          candidate.googlePlaceId === source.googlePlaceId),
    ) ?? source;
  await ctx.db.patch(target._id, {
    address,
    location,
    googlePlaceId: source.googlePlaceId ?? target.googlePlaceId,
    matchKey,
  });
  if (target._id !== source._id) {
    for (const visit of await placeVisits(ctx, source._id))
      await ctx.db.patch(visit._id, { placeId: target._id });
    await ctx.db.delete(source._id);
  }
  return (await ctx.db.get(target._id))!;
}

export async function linkVisit(ctx: MutationCtx, visitId: Id<'visits'>) {
  const visit = await ctx.db.get(visitId);
  if (!visit) return;
  const place = visit.placeId ? await ctx.db.get(visit.placeId) : await resolvePlace(ctx, visit);
  if (!place || place.boardId !== visit.boardId)
    throw new ConvexError('This place is unavailable.');
  await ctx.db.patch(visitId, { placeId: place._id });
  await syncPlace(ctx, place._id);
}

export const list = authedQuery({
  args: { boardId: v.id('boards'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(schema.doc('places')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { boardId, paginationOpts }) => {
    await member(ctx, boardId);
    const { page, isDone, continueCursor } = await ctx.db
      .query('places')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 100) });
    return { page, isDone, continueCursor };
  },
});

export const match = authedMutation({
  args: {
    placeId: v.id('places'),
    name: v.string(),
    address: v.string(),
    googlePlaceId: v.string(),
    location: locationValidator,
  },
  returns: v.id('places'),
  handler: async (ctx, { placeId, name, address, googlePlaceId, location }) => {
    const source = await ctx.db.get(placeId);
    if (!source) throw new ConvexError('This place is no longer available.');
    await member(ctx, source.boardId);
    await requireLinkedBoard(ctx, source.boardId);
    const target = await resolvePlace(ctx, {
      boardId: source.boardId,
      title: name,
      place: address,
      googlePlaceId,
      location,
    });
    await ctx.db.patch(target._id, {
      name: textValue(name, 'Place name'),
      address: address.trim().slice(0, 250),
      matchKey: normalizedPlaceKey(name, address.trim().slice(0, 250)),
      googlePlaceId: textValue(googlePlaceId, 'Google Place ID', 300),
      location: validateLocation(location),
    });
    if (source._id !== target._id) {
      for (const visit of await placeVisits(ctx, source._id))
        await ctx.db.patch(visit._id, { placeId: target._id });
      await ctx.db.delete(source._id);
    }
    await syncPlace(ctx, target._id);
    return target._id;
  },
});

async function startLinking(ctx: MutationCtx, boardId: Id<'boards'>) {
  const board = await ctx.db.get(boardId);
  if (!board || board.deleting) return;
  // Lease allows a later board open to retry a failed scheduler job.
  if (board.placeLinkingStartedAt && board.placeLinkingStartedAt > Date.now() - 60_000) return;
  const unlinked = await ctx.db
    .query('visits')
    .withIndex('by_boardId_and_placeId', (q) => q.eq('boardId', boardId).eq('placeId', undefined))
    .first();
  if (!unlinked) return;
  await ctx.db.patch(boardId, { placeLinkingStartedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.places.linkBoardBatch, { boardId });
}

export const ensureLinked = authedMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    await member(ctx, boardId);
    await startLinking(ctx, boardId);
    return null;
  },
});

export const linkBoardBatch = internalMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    const board = await ctx.db.get(boardId);
    if (!board || board.deleting) return null;
    const visit = await ctx.db
      .query('visits')
      .withIndex('by_boardId_and_placeId', (q) => q.eq('boardId', boardId).eq('placeId', undefined))
      .first();
    if (visit) {
      await linkVisit(ctx, visit._id);
      await ctx.db.patch(boardId, { placeLinkingStartedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.places.linkBoardBatch, { boardId });
    } else {
      await ctx.db.patch(boardId, { placeLinkingStartedAt: undefined });
    }
    return null;
  },
});

// Operator-only, resumable backfill: one board or all boards. Safe to rerun.
export const backfill = internalMutation({
  args: { boardId: v.optional(v.id('boards')), cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { boardId, cursor }) => {
    if (boardId) {
      await startLinking(ctx, boardId);
      return null;
    }
    const batch = await ctx.db.query('boards').paginate({ cursor: cursor ?? null, numItems: 25 });
    for (const board of batch.page) await startLinking(ctx, board._id);
    if (!batch.isDone)
      await ctx.scheduler.runAfter(0, internal.places.backfill, { cursor: batch.continueCursor });
    return null;
  },
});
