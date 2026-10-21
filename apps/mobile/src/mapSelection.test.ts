import { describe, expect, it } from 'vite-plus/test';
import { mapSelectionReducer } from './mapSelection';

type Selection = { kind: 'saved' | 'wishlist' | 'google'; id: string };

describe('map place selection', () => {
  it('replaces the previous highlight when switching between saved, wishlist and search places', () => {
    let selection: Selection | undefined;
    for (const next of [
      { kind: 'saved', id: 'a' },
      { kind: 'saved', id: 'b' },
      { kind: 'wishlist', id: 'wish' },
      { kind: 'google', id: 'search' },
    ] satisfies Selection[]) {
      selection = mapSelectionReducer(selection, { type: 'select', place: next });
      expect(selection).toEqual(next);
    }
  });

  it('clears a place when tapped a second time, and permits selecting it again', () => {
    const place: Selection = { kind: 'saved', id: 'a' };
    let selection = mapSelectionReducer(undefined, { type: 'select', place });
    selection = mapSelectionReducer(selection, { type: 'select', place });
    expect(selection).toBeUndefined();
    expect(mapSelectionReducer(selection, { type: 'select', place })).toEqual(place);
  });

  it('selects a different place after closing the drawer without restoring the previous one', () => {
    const first: Selection = { kind: 'saved', id: 'a' };
    const second: Selection = { kind: 'saved', id: 'b' };
    let selection = mapSelectionReducer(undefined, { type: 'select', place: first });
    selection = mapSelectionReducer(selection, { type: 'clear' });
    expect(selection).toBeUndefined();
    expect(mapSelectionReducer(selection, { type: 'select', place: second })).toEqual(second);
  });
});
