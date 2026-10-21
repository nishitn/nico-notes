export type NotificationMessage = {
  prefix: string;
  title: string;
  suffix: string;
  googlePlaceId?: string;
};

export function notificationText(item: { summary: string; message?: NotificationMessage }) {
  const message = item.message;
  return message ? `${message.prefix}${message.title}${message.suffix}` : item.summary;
}

// Exact legacy action patterns only: never match a word inside a user-supplied title.
export function isQuietNotification(summary: string) {
  return (
    /^(?:added|updated|cleared) (?:overall|dish|category) rating (?:to |on )/.test(summary) ||
    /^(?:added|updated|removed) a (?:dish|category) (?:to|on|from) “/.test(summary) ||
    summary === 'changed the photo storage setting'
  );
}

/** Upgrade old visit summaries without guessing missing member names or changed fields. */
export function legacyVisitMessage(
  summary: string,
  subject: { title: string; googlePlaceId?: string },
): NotificationMessage | undefined {
  const start = summary.indexOf(' “');
  if (start < 0 || !summary.endsWith('”')) return undefined;
  const action = summary.slice(0, start);
  const wording: Record<string, [string, string]> = {
    'added to the wishlist:': ['added ', ' to the wishlist'],
    'removed from the wishlist:': ['removed ', ' from the wishlist'],
    'updated a planned visit:': ['updated ', ' in the wishlist'],
    'added a visit:': ['added a visit to ', ''],
    'updated a visit:': ['updated the visit to ', ''],
    'deleted a visit:': ['deleted the visit to ', ''],
    'marked as visited:': ['marked ', ' as visited'],
    'added a photo to': ['added a photo to the visit to ', ''],
    'removed a photo from': ['removed a photo from the visit to ', ''],
    'updated a photo caption on': ['updated a photo caption for the visit to ', ''],
  };
  const parts = wording[action];
  if (!parts) return undefined;
  return {
    prefix: parts[0],
    // Keep the historical title for manual entries; only Google names resolve live.
    title: subject.googlePlaceId ? 'Saved Google place' : summary.slice(start + 2, -1),
    suffix: parts[1],
    ...(subject.googlePlaceId ? { googlePlaceId: subject.googlePlaceId } : {}),
  };
}
