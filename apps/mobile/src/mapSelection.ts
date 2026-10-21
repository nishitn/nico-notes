type Selection = { kind: string; id: string };
type SelectionAction<T> = { type: 'select'; place: T } | { type: 'clear' };

// One selection value drives both the preview and the highlighted marker.
export function mapSelectionReducer<T extends Selection>(
  current: T | undefined,
  action: SelectionAction<T>,
): T | undefined {
  if (action.type === 'clear') return undefined;
  const next = action.place;
  return current?.kind === next.kind && current.id === next.id ? undefined : next;
}
