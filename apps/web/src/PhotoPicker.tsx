import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from '@date-notes/backend/shared';
import { ErrorNote } from './ui';

export type PhotoSelection = { file: File; preview: string };

export function PhotoPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PhotoSelection | null;
  onChange: (value: PhotoSelection | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (value) URL.revokeObjectURL(value.preview);
    },
    [value],
  );
  return (
    <section className="visit-photo-picker" aria-label="Visit picture">
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Choose a picture"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!PHOTO_TYPES.includes(file.type)) {
            setError('Choose a JPEG, PNG, or WebP picture.');
            return;
          }
          if (file.size > MAX_PHOTO_BYTES) {
            setError('Choose a picture up to 10 MB.');
            return;
          }
          setError('');
          onChange({ file, preview: URL.createObjectURL(file) });
        }}
      />
      <button
        type="button"
        className={`visit-picture-box ${value ? 'has-picture' : ''}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {value ? (
          <>
            <img src={value.preview} alt="Selected visit picture" />
            <span className="change-picture">
              <ImagePlus size={16} /> Change picture
            </span>
          </>
        ) : (
          <>
            <ImagePlus size={25} />
            <strong>Add a picture</strong>
            <small>JPEG, PNG or WebP · Up to 10 MB</small>
          </>
        )}
      </button>
      {value && (
        <button
          type="button"
          className="picture-remove icon-button"
          aria-label="Remove selected picture"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setError('');
          }}
        >
          <X size={18} />
        </button>
      )}
      <ErrorNote text={error} />
    </section>
  );
}
