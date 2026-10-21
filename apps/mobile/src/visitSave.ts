export type VisitSaveSession<VisitId> = {
  id?: VisitId;
  revision: number;
  fingerprint?: string;
  completedPhotos: Set<string>;
};

/** A save may commit before photos finish. Reuse its identity on every retry. */
export async function saveVisitWithPhotos<VisitId>({
  session,
  fingerprint,
  photos,
  saveDetails,
  upload,
  uploaded,
}: {
  session: VisitSaveSession<VisitId>;
  fingerprint: string;
  photos: string[];
  saveDetails: (
    id: VisitId | undefined,
    revision: number,
  ) => Promise<{ id: VisitId; revision: number }>;
  upload: (id: VisitId, uri: string, index: number) => Promise<void>;
  uploaded: (uri: string) => void;
}) {
  if (!session.id || session.fingerprint !== fingerprint) {
    const saved = await saveDetails(session.id, session.revision);
    session.id = saved.id;
    session.revision = saved.revision;
    session.fingerprint = fingerprint;
  }
  for (const [index, uri] of photos.entries()) {
    if (session.completedPhotos.has(uri)) continue;
    await upload(session.id, uri, index);
    session.completedPhotos.add(uri);
    uploaded(uri);
  }
  return session.id;
}
