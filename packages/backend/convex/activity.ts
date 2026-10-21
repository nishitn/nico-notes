import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { storedPlace } from '../placePersistence';

// Call only after authorization, in the same transaction as the change.
export async function logChange(
  ctx: MutationCtx,
  boardId: Id<'boards'>,
  actorId: Id<'users'>,
  summary: string,
  visitId?: Id<'visits'>,
) {
  await ctx.db.insert('boardChanges', { boardId, actorId, summary, visitId });
}

export async function logMemberChange(
  ctx: MutationCtx,
  boardId: Id<'boards'>,
  actorId: Id<'users'>,
  userId: Id<'users'>,
  role?: 'admin' | 'member',
) {
  // Resolve the subject at read time so deleted accounts remain anonymous.
  await ctx.db.insert('boardChanges', {
    boardId,
    actorId,
    summary: role
      ? `made a member ${role === 'admin' ? 'an admin' : 'a member'}`
      : 'removed a member from the board',
    memberChange: { userId, role },
  });
}

export async function logPlaceChange(
  ctx: MutationCtx,
  subject: Pick<Doc<'visits'>, 'boardId' | 'title' | 'googlePlaceId'>,
  actorId: Id<'users'>,
  prefix: string,
  suffix = '',
  visitId?: Id<'visits'>,
) {
  const { title } = storedPlace(subject);
  const message = { prefix, title, suffix, googlePlaceId: subject.googlePlaceId };
  await ctx.db.insert('boardChanges', {
    boardId: subject.boardId,
    actorId,
    visitId,
    summary: `${prefix}${title}${suffix}`,
    message,
  });
}

export async function logVisitChange(
  ctx: MutationCtx,
  visitId: Id<'visits'>,
  actorId: Id<'users'>,
  prefix: string,
  suffix = '',
) {
  const visit = await ctx.db.get(visitId);
  if (visit) await logPlaceChange(ctx, visit, actorId, prefix, suffix, visitId);
}

export async function logVisitUpdate(
  ctx: MutationCtx,
  before: Doc<'visits'>,
  actorId: Id<'users'>,
) {
  const after = await ctx.db.get(before._id);
  if (!after) return;
  const labels = {
    title: 'name',
    date: 'date',
    place: 'address',
    notes: 'notes',
    showDishes: 'dish tracking',
    typeName: 'visit type',
    location: 'location',
    savedLink: 'link',
    googlePlaceId: 'place',
    placeId: 'place',
  } as const;
  const changed = [
    ...new Set(
      (Object.keys(labels) as Array<keyof typeof labels>)
        .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        .map((field) => labels[field]),
    ),
  ];
  if (changed.length)
    await logVisitChange(
      ctx,
      before._id,
      actorId,
      before.status === 'planned' ? 'updated ' : 'updated the visit to ',
      `${before.status === 'planned' ? ' in the wishlist' : ''} · Changed: ${changed.join(', ')}`,
    );
}
