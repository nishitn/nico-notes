import { useEffect, useRef, useState } from 'react';
import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { Camera, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { api } from '@date-notes/backend/api';
import type { Doc, Id } from '@date-notes/backend/dataModel';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_TYPES } from '@date-notes/backend/shared';
const photoApi = import.meta.env.VITE_PHOTO_API_URL || '';

import { Confirm, ErrorNote, Field, Form, Modal, Submit, useNotice, useTask } from './ui';

export function Photo({
  id,
  alt,
  className = '',
}: {
  id: Id<'photos'>;
  alt: string;
  className?: string;
}) {
  const token = useAuthToken();
  const [loaded, setLoaded] = useState<{
    id: string;
    token: string;
    src: string;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    let objectUrl = '';
    void fetch(`${photoApi}/photos/file?id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Photo unavailable.');
        const blob = await response.blob();
        if (!abort.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ id, token, src: objectUrl, failed: false });
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setLoaded({ id, token, src: '', failed: true });
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, token]);
  const current = loaded?.id === id && loaded.token === token ? loaded : null;
  if (current?.failed)
    return (
      <span className="photo-loading">
        <Camera size={22} />
        Photo unavailable. Reopen the visit to retry.
      </span>
    );
  return current?.src ? (
    <img className={className} src={current.src} alt={alt} loading="lazy" />
  ) : (
    <span className="photo-loading" role="status">
      <LoaderCircle size={20} className="spin" />
      <span>Loading photo…</span>
    </span>
  );
}

function upload(file: File, url: string, token: string, progress: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = 120_000;
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded * 100) / event.total));
    };
    xhr.onerror = () => reject(new Error('Connection lost. Your photo is ready to retry.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please retry.'));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(xhr.responseText || 'Upload failed. Please retry.'));
    xhr.send(file);
  });
}
export function usePhotoUpload() {
  const token = useAuthToken();
  const reserve = useMutation(api.photos.reserve);
  const [progress, setProgress] = useState(0);
  const pending = useRef<{
    file: File;
    visitId: Id<'visits'>;
    ticket: Id<'uploads'>;
    createdAt: number;
  } | null>(null);
  async function send(visitId: Id<'visits'>, file: File, caption = '') {
    if (!token) throw new Error('Please sign in to upload.');
    if (!PHOTO_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP picture.');
    if (file.size > MAX_PHOTO_BYTES) throw new Error('Choose a picture up to 10 MB.');
    setProgress(0);
    if (
      !pending.current ||
      pending.current.file !== file ||
      pending.current.visitId !== visitId ||
      Date.now() - pending.current.createdAt > 14 * 60_000
    ) {
      const ticket = await reserve({ visitId, caption });
      pending.current = { file, visitId, ticket, createdAt: Date.now() };
    }
    await upload(
      file,
      `${photoApi}/photos/upload?ticket=${pending.current.ticket}`,
      token,
      setProgress,
    );
    pending.current = null;
  }
  return { send, progress };
}

export function PhotoSection({
  visitId,
  photos,
  userId,
  isAdmin,
}: {
  visitId: Id<'visits'>;
  photos: Omit<Doc<'photos'>, 'storageId'>[];
  userId: Id<'users'>;
  isAdmin: boolean;
}) {
  const photoUpload = usePhotoUpload();
  const remove = useMutation(api.photos.remove);
  const updateCaption = useMutation(api.photos.updateCaption);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState('');
  const progress = photoUpload.progress;
  const [viewing, setViewing] = useState<Id<'photos'> | null>(null);
  const [deleting, setDeleting] = useState<Id<'photos'> | null>(null);
  const [editCaption, setEditCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const task = useTask();
  const captionTask = useTask();
  const notice = useNotice();
  const current = photos.find((p) => p._id === viewing);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function send() {
    if (!file) throw new Error('Select a photo to upload.');
    await photoUpload.send(visitId, file, caption);
    setAdding(false);
    setFile(null);
    setPreview('');
    setCaption('');
    notice('Picture saved.');
  }
  return (
    <section className="photo-section">
      <div className="section-heading">
        <div>
          <h2>
            Photos{' '}
            <span className="count">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </h2>
        </div>
        <button
          className="button secondary"
          disabled={photos.length >= MAX_PHOTOS}
          onClick={() => setAdding(true)}
        >
          <ImagePlus size={17} /> Add photo
        </button>
      </div>
      {photos.length ? (
        <div className="photo-grid">
          {photos.map((photo) => (
            <button
              key={photo._id}
              className="photo-tile"
              onClick={() => {
                setViewing(photo._id);
                setEditCaption(false);
              }}
            >
              <Photo id={photo._id} alt={photo.caption || 'Visit photo'} />
              {photo.caption && <span>{photo.caption}</span>}
            </button>
          ))}
        </div>
      ) : (
        <button className="photo-empty" onClick={() => setAdding(true)}>
          <Camera size={29} />
          <strong>Add your first photo</strong>
        </button>
      )}
      {adding && (
        <Modal
          title="Add photo"
          onClose={() => {
            if (!task.busy) setAdding(false);
          }}
        >
          <Form onSubmit={() => task.run(send)}>
            <Field label="Choose a photo" hint="JPEG, PNG, or WebP · Up to 10 MB">
              <input
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                disabled={task.busy}
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setFile(next);
                  setPreview(next ? URL.createObjectURL(next) : '');
                }}
              />
            </Field>
            {preview && (
              <img className="upload-preview" src={preview} alt="Your selected photo preview" />
            )}
            <Field label="Caption (optional)">
              <input
                maxLength={300}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="The last bite was worth fighting over."
              />
            </Field>
            {task.busy && (
              <div className="upload-progress" role="status">
                <progress value={progress} max={100} />
                <span>{progress === 100 ? 'Saving photo…' : `Uploading ${progress}%`}</span>
              </div>
            )}
            <ErrorNote text={task.error} />
            <div className="form-actions">
              <Submit busy={task.busy}>{task.error ? 'Retry upload' : 'Save photo'}</Submit>
            </div>
          </Form>
        </Modal>
      )}
      {current && (
        <Modal title="A moment from this visit" onClose={() => setViewing(null)}>
          <div className="gallery-image">
            <Photo id={current._id} alt={current.caption || 'Visit photo'} />
          </div>
          <p>{current.caption}</p>
          <div className="gallery-actions">
            <button
              className="button secondary"
              disabled={photos.length <= 1}
              onClick={() => {
                setViewing(
                  photos[
                    (photos.findIndex((p) => p._id === viewing) + photos.length - 1) % photos.length
                  ]._id,
                );
                setEditCaption(false);
              }}
            >
              Previous
            </button>
            <span>
              {photos.findIndex((p) => p._id === viewing) + 1} / {photos.length}
            </span>
            <button
              className="button secondary"
              disabled={photos.length <= 1}
              onClick={() => {
                setViewing(
                  photos[(photos.findIndex((p) => p._id === viewing) + 1) % photos.length]._id,
                );
                setEditCaption(false);
              }}
            >
              Next
            </button>
          </div>
          {(current.uploaderId === userId || isAdmin) && (
            <>
              <div className="form-actions">
                <button
                  className="text-button"
                  onClick={() => {
                    setCaptionDraft(current.caption);
                    setEditCaption(true);
                  }}
                >
                  Edit caption
                </button>
                <button
                  className="text-button danger-text"
                  onClick={() => {
                    setDeleting(current._id);
                    setViewing(null);
                  }}
                >
                  <Trash2 size={15} /> Remove photo
                </button>
              </div>
              {editCaption && (
                <Form
                  onSubmit={() =>
                    captionTask.run(async () => {
                      await updateCaption({ photoId: current._id, caption: captionDraft });
                      setEditCaption(false);
                    })
                  }
                >
                  <Field label="Caption">
                    <input
                      maxLength={300}
                      value={captionDraft}
                      onChange={(e) => setCaptionDraft(e.target.value)}
                    />
                  </Field>
                  <ErrorNote text={captionTask.error} />
                  <Submit busy={captionTask.busy}>Save caption</Submit>
                </Form>
              )}
            </>
          )}
        </Modal>
      )}
      {deleting && (
        <Confirm
          title="Remove this photo?"
          onClose={() => setDeleting(null)}
          onConfirm={() => remove({ photoId: deleting })}
        >
          This removes the photo from this visit for everyone.
        </Confirm>
      )}
    </section>
  );
}
