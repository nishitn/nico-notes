import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FULL_MARKER_SIZE, markerSizes } from '@nico-notes/backend/mapMarkers';
import {
  Expand,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Maximize,
  Minimize,
  Minus,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  DEFAULT_MAP_LOCATION,
  googleMapsConfigured,
  latLng,
  loadGoogleMaps,
  nearbyBounds,
  type MapLocation,
} from './googleMaps';
import { Modal } from './ui';
import { useCurrentLocation } from './useCurrentLocation';

export type { MapLocation } from './googleMaps';
export type MapPlace = {
  id: string;
  title: string;
  location: MapLocation;
  count: number;
  wishlist?: boolean;
};

export function mapsLink(place: {
  title: string;
  place: string;
  mapQuery?: string;
  googlePlaceId?: string;
  location?: MapLocation;
}) {
  const query = place.location
    ? `${place.location.latitude},${place.location.longitude}`
    : place.mapQuery || `${place.title} ${place.place}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${place.googlePlaceId ? `&query_place_id=${encodeURIComponent(place.googlePlaceId)}` : ''}`;
}

export function PlacesMap({
  places,
  selectedId,
  onSelect,
  onPick,
  onLocationChange,
  autoLocate = false,
  label = 'Map of visited places',
  fullscreenHeader,
  fullscreenFooter,
  fitKey,
}: {
  places: MapPlace[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onPick?: (location: MapLocation) => void;
  onLocationChange?: (location: MapLocation) => void;
  autoLocate?: boolean;
  label?: string;
  fullscreenHeader?: ReactNode;
  fullscreenFooter?: ReactNode;
  fitKey?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const initialZoom = useRef(15);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (fullscreen || !instance || !restoreFocus.current) return;
    restoreFocus.current = false;
    fullscreenButton.current?.focus({ preventScroll: true });
  }, [fullscreen, instance]);
  function toggleFullscreen() {
    const center = instance?.getCenter();
    if (center) initialCenter.current = { latitude: center.lat(), longitude: center.lng() };
    initialZoom.current = instance?.getZoom() ?? 15;
    intent.current = 'manual';
    restoreFocus.current = fullscreen;
    setInstance(null);
    setFullscreen((value) => !value);
  }
  const [retry, setRetry] = useState(0);
  const [hideLocationError, setHideLocationError] = useState(false);
  const callbacks = useRef({ onSelect, onPick, onLocationChange });
  const initialCenter = useRef(places[0]?.location ?? DEFAULT_MAP_LOCATION);
  const intent = useRef<'nearby' | 'manual' | 'selected'>('nearby');
  const markers = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const {
    location,
    locating,
    error: locationError,
    request,
  } = useCurrentLocation(autoLocate && googleMapsConfigured);
  useEffect(() => {
    callbacks.current = { onSelect, onPick, onLocationChange };
  }, [onSelect, onPick, onLocationChange]);

  useEffect(() => {
    const element = host.current!;
    let disposed = false;
    let map: google.maps.Map | null = null;
    const listeners: google.maps.MapsEventListener[] = [];
    const authFailure = () =>
      setError('Google Maps couldn’t connect. Check the Maps key and enabled APIs.');
    window.addEventListener('nico-notes:maps-auth-error', authFailure);
    setError('');
    void loadGoogleMaps()
      .then(({ maps }) => {
        if (disposed) return;
        map = new maps.Map(element, {
          center: latLng(initialCenter.current),
          zoom: initialZoom.current,
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
          disableDefaultUI: true,
          zoomControl: false,
          gestureHandling: 'cooperative',
          clickableIcons: false,
        });
        listeners.push(
          map.addListener('click', (event: google.maps.MapMouseEvent) => {
            if (event.latLng)
              callbacks.current.onPick?.({
                latitude: event.latLng.lat(),
                longitude: event.latLng.lng(),
              });
          }),
        );
        listeners.push(
          map.addListener('dragstart', () => {
            intent.current = 'manual';
          }),
        );
        setInstance(map);
      })
      .catch(() => {
        if (!disposed)
          setError(
            googleMapsConfigured
              ? 'Google Maps couldn’t load. Check your connection and try again.'
              : 'Google Maps isn’t configured yet.',
          );
      });
    return () => {
      disposed = true;
      listeners.forEach((listener) => listener.remove());
      if (map) google.maps.event.clearInstanceListeners(map);
      window.removeEventListener('nico-notes:maps-auth-error', authFailure);
      element.replaceChildren();
    };
  }, [retry, fullscreen]);

  const coordinateKey = places
    .map(
      (p) =>
        `${p.id}:${p.location.latitude}:${p.location.longitude}:${p.count}:${p.title}:${p.wishlist}`,
    )
    .join('|');
  useEffect(() => {
    if (!instance) return;
    const next = new Map<string, google.maps.marker.AdvancedMarkerElement>();
    const listeners: google.maps.MapsEventListener[] = [];
    for (const place of places) {
      const content = document.createElement('div');
      content.className = `visit-pin ${place.wishlist ? 'wishlist-pin' : ''}`;
      const heart = document.createElement('span');
      heart.setAttribute('aria-hidden', 'true');
      content.append(heart);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: instance,
        position: latLng(place.location),
        content,
        anchorTop: '-50%',
        collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
        title: place.wishlist
          ? `${place.title}, Wishlist`
          : `${place.title}, ${place.count} ${place.count === 1 ? 'visit' : 'visits'}`,
      });
      listeners.push(marker.addListener('click', () => callbacks.current.onSelect?.(place.id)));
      next.set(place.id, marker);
    }
    markers.current = next;
    // Use Google's screen projection so resizing follows zoom and map layout changes.
    const sizing = new google.maps.OverlayView();
    sizing.onAdd = () => {};
    sizing.onRemove = () => {};
    sizing.draw = () => {
      const projection = sizing.getProjection();
      const points = places.flatMap((place) => {
        const point = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(latLng(place.location)),
        );
        return point ? [{ id: place.id, x: point.x, y: point.y }] : [];
      });
      const sizes = markerSizes(points);
      next.forEach((marker, id) => {
        const diameter = id === selectedId ? FULL_MARKER_SIZE : (sizes.get(id) ?? FULL_MARKER_SIZE);
        const content = marker.content as HTMLElement;
        content.style.setProperty('--marker-size', `${diameter}px`);
        content.classList.toggle('compact', diameter < 22);
        content.classList.toggle('selected', id === selectedId);
        marker.zIndex = id === selectedId ? 1000 : diameter < 22 ? 1 : 2;
      });
    };
    sizing.setMap(instance);
    if (onPick && places[0]) {
      intent.current = 'selected';
      instance.panTo(latLng(places[0].location));
    }
    return () => {
      sizing.setMap(null);
      listeners.forEach((listener) => listener.remove());
      next.forEach((marker) => {
        marker.map = null;
      });
      markers.current.clear();
    };
    // Rebuild only when marker data, selection, or map changes, not callback identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, coordinateKey, selectedId]);

  useEffect(() => {
    if (!instance || !selectedId) return;
    const selected = places.find((place) => place.id === selectedId);
    if (!selected) return;
    intent.current = 'selected';
    const marker = markers.current.get(selectedId);
    (marker?.content as HTMLElement | undefined)?.classList.add('selected');
    if (marker) marker.zIndex = 1000;
    instance.panTo(latLng(selected.location));
    instance.setZoom(Math.max(instance.getZoom() ?? 15, 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, selectedId, coordinateKey]);

  useEffect(() => {
    if (!location) return;
    callbacks.current.onLocationChange?.(location);
    if (!instance) return;
    const dot = document.createElement('span');
    dot.className = 'current-location-dot';
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: instance,
      position: latLng(location),
      content: dot,
      title: 'Your current location',
      zIndex: 2000,
    });
    if (intent.current === 'nearby') {
      instance.fitBounds(nearbyBounds(location), 24);
    }
    return () => {
      marker.map = null;
    };
  }, [instance, location]);

  function showAllPins() {
    if (!instance || !places.length) return;
    intent.current = 'manual';
    const bounds = new google.maps.LatLngBounds();
    places.forEach((place) => bounds.extend(latLng(place.location)));
    instance.fitBounds(bounds, 70);
    google.maps.event.addListenerOnce(instance, 'idle', () => {
      if ((instance.getZoom() ?? 15) > 15) instance.setZoom(15);
    });
  }

  const appliedFitKey = useRef(fitKey);
  useEffect(() => {
    if (!instance || appliedFitKey.current === fitKey || !places.length) return;
    appliedFitKey.current = fitKey;
    showAllPins();
    // Fit once when the map filter changes, including asynchronously loaded wishlist pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, fitKey, coordinateKey]);

  const content = (
    <div className={`places-map ${onPick ? 'pin-picker' : ''}`}>
      <div className="map-canvas" ref={host} role="region" aria-label={label} />
      {instance && !error && (
        <div className="map-controls" role="group" aria-label="Map controls">
          <button
            type="button"
            className="map-control"
            ref={fullscreenButton}
            title={fullscreen ? 'Exit fullscreen map' : 'Fullscreen map'}
            aria-label={fullscreen ? 'Exit fullscreen map' : 'Fullscreen map'}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button
            type="button"
            className="map-control"
            title="Use my location"
            aria-label="Use my location"
            disabled={locating}
            onClick={() => {
              intent.current = 'nearby';
              setHideLocationError(false);
              void request();
            }}
          >
            {locating ? <LoaderCircle size={20} className="spin" /> : <LocateFixed size={20} />}
          </button>
          {places.length > 0 && (
            <button
              type="button"
              className="map-control"
              title="Show all saved pins"
              aria-label="Show all saved pins"
              onClick={showAllPins}
            >
              <Expand size={19} />
            </button>
          )}
          <button
            type="button"
            className="map-control map-zoom-start"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => instance.setZoom(Math.min(21, (instance.getZoom() ?? 15) + 1))}
          >
            <Plus size={20} />
          </button>
          <button
            type="button"
            className="map-control"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => instance.setZoom(Math.max(1, (instance.getZoom() ?? 15) - 1))}
          >
            <Minus size={20} />
          </button>
        </div>
      )}
      {onPick && instance && !error && (
        <span className="map-instruction">
          <MapPin size={15} /> Tap the map to place your pin
        </span>
      )}
      {locating && (
        <span className="map-location-status" role="status">
          Finding your location…
        </span>
      )}
      {locationError && !hideLocationError && (
        <div className="map-location-error" role="status">
          <span>{locationError}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss location message"
            onClick={() => setHideLocationError(true)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(!instance || error) && (
        <div className="map-load-state" role="status">
          {error ? (
            <>
              <MapPin size={24} />
              <p>{error}</p>
              <span>Your saved places are still available.</span>
              {googleMapsConfigured && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setInstance(null);
                    setRetry((value) => value + 1);
                  }}
                >
                  <RefreshCw size={15} /> Retry map
                </button>
              )}
            </>
          ) : (
            <>
              <LoaderCircle className="spin" size={24} />
              <span>Loading Google Maps…</span>
            </>
          )}
        </div>
      )}
    </div>
  );
  return fullscreen ? (
    <Modal title="Your Places map" className="fullscreen-map-modal" onClose={toggleFullscreen}>
      {fullscreenHeader}
      {content}
      {fullscreenFooter && <div className="fullscreen-map-selection">{fullscreenFooter}</div>}
    </Modal>
  ) : (
    content
  );
}
