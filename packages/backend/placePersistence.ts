/** Persist the Google reference only; SDK content is resolved in client memory. */
export const GOOGLE_PLACE_LABEL = 'Saved Google place';
export function storedPlace<
  T extends {
    title: string;
    place?: string;
    googlePlaceId?: string;
    location?: unknown;
  },
>(input: T): T {
  return input.googlePlaceId
    ? { ...input, title: GOOGLE_PLACE_LABEL, place: '', location: undefined }
    : input;
}
