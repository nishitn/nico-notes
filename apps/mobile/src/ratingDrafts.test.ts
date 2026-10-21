import { describe, expect, it } from 'vite-plus/test';
import { markRatingSaved, mergeRatingDrafts } from './ratingDrafts';

describe('collaborative rating drafts', () => {
  it('preserves an unfinished note while refreshing another member’s score', () => {
    const dirty = { score: 8.5, note: 'Still writing', hasChanged: true };
    const result = mergeRatingDrafts(
      { alice: dirty, bob: { score: 7, note: '', hasChanged: false } },
      {
        alice: { score: 6, note: 'Old', hasChanged: false },
        bob: { score: 9, note: 'Updated elsewhere', hasChanged: false },
      },
    );
    expect(result.alice).toBe(dirty);
    expect(result.bob.score).toBe(9);
  });

  it('does not mark a newer edit saved when an earlier request completes', () => {
    const submitted = { score: 8, note: 'Before', hasChanged: true };
    const newer = { score: 9, note: 'After', hasChanged: true };
    expect(markRatingSaved({ alice: newer }, 'alice', submitted).alice.hasChanged).toBe(true);
    expect(markRatingSaved({ alice: submitted }, 'alice', submitted).alice.hasChanged).toBe(false);
  });
});
