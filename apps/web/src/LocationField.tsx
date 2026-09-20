import { useMemo, useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { Field, Modal } from './ui';
import { PlacesMap, mapsLink, type MapLocation } from './PlacesMap';

export function LocationField({
  value,
  onChange,
  title,
  place,
}: {
  value: MapLocation | null;
  onChange: (location: MapLocation | null) => void;
  title: string;
  place: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [coordinates, setCoordinates] = useState('');
  const [error, setError] = useState('');
  const pins = useMemo(
    () =>
      draft ? [{ id: 'draft', title: title || 'Visit location', count: 1, location: draft }] : [],
    [draft, title],
  );
  return (
    <div className="location-field">
      <span className="field-title">
        Map pin <span className="muted">(optional)</span>
      </span>
      <div className="actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          <MapPin size={17} />
          {value ? 'Adjust pin' : 'Set map pin'}
        </button>
        <a
          href={mapsLink({ title, place })}
          target="_blank"
          rel="noreferrer"
          className="text-button"
        >
          <Navigation size={15} />
          Find on Google Maps
        </a>
        {value && (
          <button
            type="button"
            className="icon-button"
            aria-label="Remove map pin"
            onClick={() => onChange(null)}
          >
            <X size={17} />
          </button>
        )}
      </div>
      {value && (
        <p className="small muted">
          {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
        </p>
      )}
      {editing && (
        <Modal title="Place your pin" className="location-modal" onClose={() => setEditing(false)}>
          <p className="muted small">
            Tap the map, or paste coordinates copied from Google Maps. Check the branch before
            saving.
          </p>
          <PlacesMap places={pins} onPick={setDraft} label="Choose visit location" />
          <Field label="Coordinates or a Google Maps URL">
            <input
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
              placeholder="12.93, 77.63"
            />
          </Field>
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                const pair = coordinates
                  .trim()
                  .match(/(?:@|!3d|q=|query=)?(-?\d{1,3}\.\d+)(?:,|!4d|\s+)\s*(-?\d{1,3}\.\d+)/);
                if (!pair || Math.abs(Number(pair[1])) > 90 || Math.abs(Number(pair[2])) > 180) {
                  setError(
                    'Paste latitude, longitude or a full Maps URL containing coordinates. Short sharing links do not include coordinates.',
                  );
                  return;
                }
                setDraft({ latitude: Number(pair[1]), longitude: Number(pair[2]) });
                setError('');
              }}
            >
              Locate coordinates
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!draft}
              onClick={() => {
                onChange(draft);
                setEditing(false);
              }}
            >
              Use this pin
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
