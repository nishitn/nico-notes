export type RatingDraft = { score?: number; note: string; hasChanged: boolean };
export type RatingDrafts = Record<string, RatingDraft>;

// Realtime updates may refresh clean values, but never replace unfinished input.
export function mergeRatingDrafts(previous: RatingDrafts, server: RatingDrafts): RatingDrafts {
  return Object.fromEntries(
    Object.entries(server).map(([id, value]) => [
      id,
      previous[id]?.hasChanged ? previous[id] : value,
    ]),
  );
}

export function markRatingSaved(
  drafts: RatingDrafts,
  id: string,
  submitted: RatingDraft,
): RatingDrafts {
  const current = drafts[id];
  if (!current || current.score !== submitted.score || current.note !== submitted.note)
    return drafts;
  return { ...drafts, [id]: { ...current, hasChanged: false } };
}
