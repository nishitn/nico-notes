export type LivePlace = {
  id: string;
  name: string;
  address: string;
  location?: { latitude: number; longitude: number };
  attributions?: string[];
};

export function isPlacePlaceholder(name: string) {
  return ['Saved Google place', 'Loading place…', 'Place details unavailable'].includes(name);
}

/** Pure projection: live SDK content is never sent back to Convex by this helper. */
export function projectLivePlaces<T>(
  value: T,
  lookup: (id: string) => LivePlace | undefined,
  fallback: (id: string) => string = () => 'Saved Google place',
): T {
  if (Array.isArray(value))
    return value.map((item) => projectLivePlaces(item, lookup, fallback)) as T;
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, projectLivePlaces(item, lookup, fallback)]),
  );
  const id = record.googlePlaceId;
  if (typeof id === 'string' && id) {
    const place = lookup(id);
    // Never fall back to historical persisted SDK content after a failed lookup.
    if ('title' in record) result.title = place?.name ?? fallback(id);
    if ('name' in record) result.name = place?.name ?? fallback(id);
    if ('place' in record) result.place = place?.address ?? '';
    if ('address' in record) result.address = place?.address ?? '';
    result.location = place?.location;
  }
  return result as T;
}

export function googlePlaceIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return ids;
  if ('googlePlaceId' in value && typeof value.googlePlaceId === 'string' && value.googlePlaceId)
    ids.add(value.googlePlaceId);
  for (const item of Object.values(value)) googlePlaceIds(item, ids);
  return ids;
}
