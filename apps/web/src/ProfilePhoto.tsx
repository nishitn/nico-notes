import { useRef, useState } from 'react';
import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from '@nico-notes/backend/shared';
import { ErrorNote, Initials, Modal, useNotice, useTask } from './ui';

async function squarePhoto(file: File) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Choose an image up to 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare this image. Please try another.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 512, 512);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Unable to prepare this image.'))),
        'image/jpeg',
        0.85,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfilePhoto({ name, image }: { name: string; image?: string }) {
  const token = useAuthToken();
  const removePhoto = useMutation(api.profile.removePhoto);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const task = useTask();
  const notice = useNotice();
  async function upload(file: File) {
    if (!token) throw new Error('Sign in again to change your image.');
    const origin = import.meta.env.VITE_CONVEX_SITE_URL;
    if (!origin) throw new Error('Image uploads are unavailable. Please try again later.');
    const body = await squarePhoto(file);
    const response = await fetch(`${origin.replace(/\/$/, '')}/profile/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body,
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw new Error(failure?.message ?? 'Unable to upload your image. Please try again.');
    }
    notice('Your profile image has been updated.');
    setOpen(false);
  }
  return (
    <>
      <button
        className="profile-photo"
        aria-label="Change profile image"
        onClick={() => setOpen(true)}
      >
        <Initials name={name} image={image} />
        <span>Change image</span>
      </button>
      {open && (
        <Modal title="Profile image" onClose={() => !task.busy && setOpen(false)}>
          <div className="profile-photo-options">
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={task.busy}
              aria-label="Choose profile image"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void task.run(() => upload(file));
              }}
            />
            <button className="button" disabled={task.busy} onClick={() => input.current?.click()}>
              {task.busy ? 'Saving…' : 'Choose image'}
            </button>
            {image && (
              <button
                className="button secondary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await removePhoto({});
                    notice('Your profile image has been removed.');
                    setOpen(false);
                  })
                }
              >
                Remove image
              </button>
            )}
            <ErrorNote text={task.error} />
            <button className="button text" disabled={task.busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
