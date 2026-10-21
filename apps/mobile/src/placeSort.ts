type PlaceWithLatestVisit = {
  name: string;
  latestVisit: { date: string; creationTime: number; id: string } | null;
};

type BoardVisit = {
  _id: string;
  _creationTime: number;
  placeId?: string;
  date: string;
};

// History arrives newest first. Board numbers are only known once all pages load.
export function latestBoardVisitsByPlace(visits: BoardVisit[], complete: boolean) {
  const latest = new Map<
    string,
    { id: string; creationTime: number; date: string; number: number | undefined }
  >();
  for (const [index, visit] of visits.entries()) {
    if (!visit.placeId || latest.has(visit.placeId)) continue;
    latest.set(visit.placeId, {
      id: visit._id,
      creationTime: visit._creationTime,
      date: visit.date,
      number: complete ? visits.length - index : undefined,
    });
  }
  return latest;
}

// Match the board visit list: date, creation time, then ID, all descending.
export function comparePlacesByLatestVisit(a: PlaceWithLatestVisit, b: PlaceWithLatestVisit) {
  const left = a.latestVisit;
  const right = b.latestVisit;
  if (!left || !right) {
    if (left) return -1;
    if (right) return 1;
    return a.name.localeCompare(b.name);
  }
  if (left.date !== right.date) return left.date > right.date ? -1 : 1;
  if (left.creationTime !== right.creationTime) return right.creationTime - left.creationTime;
  if (left.id !== right.id) return left.id > right.id ? -1 : 1;
  return a.name.localeCompare(b.name);
}
