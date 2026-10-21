import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_TYPES } from '@nico-notes/backend/shared';
import { ErrorNote } from './ui';

export type PhotoSelection = { file: File; preview: string };

export function PhotoPicker({
  value,
  onChange,
  disabled = false,
  max = MAX_PHOTOS,
}: {
  value: PhotoSelection[];
  onChange: (value: PhotoSelection[]) => void;
  disabled?: boolean;
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const previous = useRef(value);
  const [error, setError] = useState('');
  useEffect(() => {
    for (const photo of previous.current)
      if (!value.includes(photo)) URL.revokeObjectURL(photo.preview);
    previous.current = value;
  }, [value]);
  useEffect(
    () => () => {
      for (const photo of previous.current) URL.revokeObjectURL(photo.preview);
    },
    [],
  );
  return (
    <section className="visit-photo-picker" aria-label="Visit pictures">
      <input
        ref={input}
        type="file"
        hidden
        multiple
        aria-label="Choose pictures"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (!files.length) return;
          if (files.length + value.length > max) {
            setError(`You can add up to ${max} more images.`);
            return;
          }
          if (files.some((file) => !PHOTO_TYPES.includes(file.type))) {
            setError('Choose JPEG, PNG, or WebP pictures.');
            return;
          }
          if (files.some((file) => file.size > MAX_PHOTO_BYTES)) {
            setError('Choose pictures up to 10 MB each.');
            return;
          }
          setError('');
          onChange([
            ...value,
            ...files.map((file) => ({ file, preview: URL.createObjectURL(file) })),
          ]);
        }}
      />
      <div className="selected-photos">
        {value.map((photo, index) => (
          <div className="selected-photo" key={photo.preview}>
            <img src={photo.preview} alt={`Selected visit picture ${index + 1}`} />
            <button
              type="button"
              className="picture-remove icon-button"
              aria-label={`Remove selected picture ${index + 1}`}
              disabled={disabled}
              onClick={() => {
                onChange(value.filter((item) => item !== photo));
                setError('');
              }}
            >
              <X size={18} />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            className="visit-picture-box"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={25} />
            <strong>Add pictures</strong>
            <small>JPEG, PNG or WebP · Up to 10 MB each</small>
          </button>
        )}
      </div>
      <ErrorNote text={error} />
    </section>
  );
}
