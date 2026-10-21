import { usePlaceLookups } from './convexLive';

export function PlaceLookupNotice({
  placeIds,
  map = false,
}: {
  placeIds: string[];
  map?: boolean;
}) {
  const { states, retry } = usePlaceLookups(placeIds);
  const lookups = [...new Set(placeIds)].map((id) => states.get(id));
  const failures = lookups.filter((state) => state?.status === 'error');
  const loading = lookups.some((state) => !state || state.status === 'loading');
  if (!failures.length && !loading) return null;
  return (
    <div className="card small">
      {failures.length > 0 && (
        <div role="alert">
          <p>
            {map
              ? `${failures.length} saved ${failures.length === 1 ? 'place couldn’t' : 'places couldn’t'} load on the map. `
              : ''}
            {failures[0]?.status === 'error' ? failures[0].error.message : ''}
          </p>
          <button type="button" className="button secondary" onClick={() => void retry()}>
            Retry
          </button>
        </div>
      )}
      {loading && (
        <p role="status">{map ? 'Loading saved place pins…' : 'Loading place details…'}</p>
      )}
    </div>
  );
}
