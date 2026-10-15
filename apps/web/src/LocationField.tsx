import { useRef, useState } from 'react';
import { MapPin, Navigation, Pencil, Search } from 'lucide-react';
import { ErrorNote, Field, Modal } from './ui';
import { PlacesMap, mapsLink, type MapLocation } from './PlacesMap';
import { placeSearchErrorMessage, searchNearbyPlaces } from './googleMaps';

type SelectedPlace = {
  googlePlaceId?: string;
  title: string;
  place: string;
  location: MapLocation | null;
};

export function LocationField({
  value,
  googlePlaceId,
  onChange,
  title,
  place,
}: {
  value: MapLocation | null;
  googlePlaceId?: string;
  onChange: (place: SelectedPlace) => void;
  title: string;
  place: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SelectedPlace>({
    title,
    place,
    location: value,
    googlePlaceId,
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchNearbyPlaces>>>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [coordinates, setCoordinates] = useState('');
  const [error, setError] = useState('');
  const searchVersion = useRef(0);
  const pins = (location: MapLocation | null, name: string) =>
    location ? [{ id: 'visit', title: name || 'Visit location', count: 1, location }] : [];

  function close() {
    searchVersion.current++;
    setEditing(false);
  }

  async function search() {
    if (query.trim().length < 2) return;
    const version = ++searchVersion.current;
    setSearching(true);
    setError('');
    setResults([]);
    setSearched(false);
    try {
      const found = await searchNearbyPlaces(query.trim());
      if (version !== searchVersion.current) return;
      setResults(found);
      setSearched(true);
    } catch (error) {
      if (version === searchVersion.current) setError(placeSearchErrorMessage(error));
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }

  return (
    <section className="location-field" aria-label="Visit place">
      <div className="visit-location-picker">
        <PlacesMap
          places={pins(value, title)}
          selectedId={value ? 'visit' : undefined}
          label="Visit location"
        />
        <div className="visit-place-actions">
          <button
            type="button"
            className="button secondary visit-map-edit"
            onClick={() => {
              setDraft({ title, place, location: value, googlePlaceId });
              setQuery(title);
              setCoordinates('');
              setResults([]);
              setSearched(false);
              setSearching(false);
              setError('');
              setEditing(true);
            }}
          >
            {value || place ? <Pencil size={15} /> : <MapPin size={15} />}
            {value || place ? 'Edit place' : 'Choose place'}
          </button>
        </div>
      </div>
      <div className="visit-place-summary">
        <div>
          <Field label="Visit name">
            <input
              className="visit-place-name"
              required
              maxLength={120}
              value={title}
              placeholder="Choose a place or enter a name"
              onChange={(event) => onChange({ title: event.target.value, place, location: value })}
            />
          </Field>
          {(place || value) && (
            <div className="visit-place-caption">
              {place && <p className="muted small">{place}</p>}
              {value && (
                <a
                  href={mapsLink({ title, place, location: value, googlePlaceId })}
                  target="_blank"
                  rel="noreferrer"
                  className="text-button small"
                >
                  <Navigation size={14} /> Google Maps
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <Modal title="Choose a place" className="location-modal" onClose={close}>
          <div
            className="form"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.target instanceof HTMLInputElement)
                event.preventDefault();
            }}
          >
            <div className="place-search-controls">
              <Field label="Search Google Maps">
                <input
                  autoFocus
                  value={query}
                  placeholder="Place name and area"
                  onChange={(event) => {
                    searchVersion.current++;
                    setQuery(event.target.value);
                    setResults([]);
                    setSearched(false);
                    setSearching(false);
                    setError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void search();
                    }
                  }}
                />
              </Field>
              <button
                type="button"
                className="button secondary"
                disabled={searching || query.trim().length < 2}
                onClick={() => void search()}
              >
                <Search size={16} /> {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            <ErrorNote text={error} />
            {searched && !results.length && (
              <p className="small muted" role="status">
                No matching places. Try adding the city or area.
              </p>
            )}
            {results.length > 0 && (
              <div className="place-search-results" aria-label="Google Maps results">
                {results.map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    className="place-search-result"
                    onClick={() => {
                      setDraft({ ...result, googlePlaceId: result.id });
                      setResults([]);
                      setSearched(false);
                      setCoordinates('');
                    }}
                  >
                    <MapPin size={18} />
                    <span>
                      <strong>{result.title}</strong>
                      <small>{result.place}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <PlacesMap
              places={pins(draft.location, draft.title)}
              selectedId={draft.location ? 'visit' : undefined}
              onPick={(location) => setDraft((current) => ({ ...current, location }))}
              autoLocate={!value}
              label="Choose visit location"
            />
            {draft.title && (
              <div className="place-selection" aria-live="polite">
                <strong>{draft.title}</strong>
                <p className="small muted">{draft.place}</p>
              </div>
            )}
            <details className="place-manual-details">
              <summary>Enter place details manually or adjust the pin</summary>
              <div className="form">
                <Field label="Place name">
                  <input
                    maxLength={120}
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value, googlePlaceId: undefined })
                    }
                  />
                </Field>
                <Field label="Address (optional)">
                  <input
                    maxLength={250}
                    value={draft.place}
                    onChange={(event) => setDraft({ ...draft, place: event.target.value })}
                  />
                </Field>
                <Field label="Coordinates or a Google Maps URL">
                  <input
                    value={coordinates}
                    onChange={(event) => setCoordinates(event.target.value)}
                    placeholder="12.93, 77.63"
                  />
                </Field>
                <div className="actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      const pair = coordinates
                        .trim()
                        .match(
                          /(?:@|!3d|q=|query=)?(-?\d{1,3}\.\d+)(?:,|!4d|\s+)\s*(-?\d{1,3}\.\d+)/,
                        );
                      if (
                        !pair ||
                        Math.abs(Number(pair[1])) > 90 ||
                        Math.abs(Number(pair[2])) > 180
                      ) {
                        setError(
                          'Paste latitude, longitude or a full Maps URL containing coordinates. Short sharing links do not include coordinates.',
                        );
                        return;
                      }
                      setDraft({
                        ...draft,
                        location: { latitude: Number(pair[1]), longitude: Number(pair[2]) },
                      });
                      setError('');
                    }}
                  >
                    Locate coordinates
                  </button>
                  {draft.location && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setDraft({ ...draft, location: null })}
                    >
                      Remove pin
                    </button>
                  )}
                </div>
              </div>
            </details>
            <div className="form-actions">
              <button type="button" className="button secondary" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!draft.title.trim()}
                onClick={() => {
                  onChange({
                    ...draft,
                    title: draft.title.trim().slice(0, 120),
                    place: draft.place.slice(0, 250),
                  });
                  close();
                }}
              >
                Use this place
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
