import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

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

export async function logVisitChange(
  ctx: MutationCtx,
  visitId: Id<'visits'>,
  actorId: Id<'users'>,
  action: string,
) {
  const visit = await ctx.db.get(visitId);
  if (visit) await logChange(ctx, visit.boardId, actorId, `${action} “${visit.title}”`, visitId);
}

export async function logVisitUpdate(
  ctx: MutationCtx,
  before: Doc<'visits'>,
  actorId: Id<'users'>,
) {
  const after = await ctx.db.get(before._id);
  const fields = [
    'title',
    'date',
    'place',
    'notes',
    'showDishes',
    'location',
    'savedLink',
    'googlePlaceId',
  ] as const;
  if (
    after &&
    fields.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
  )
    await logVisitChange(
      ctx,
      before._id,
      actorId,
      before.status === 'planned' ? 'updated a planned visit:' : 'updated a visit:',
    );
}
