import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { LocateFixed, MapPin, RefreshCw } from 'lucide-react';

export type MapLocation = { latitude: number; longitude: number; source?: string };
export type MapPlace = { id: string; title: string; location: MapLocation; count: number };
const bangalore: L.LatLngTuple = [12.95, 77.65];

export function mapsLink(place: {
  title: string;
  place: string;
  mapQuery?: string;
  location?: MapLocation;
}) {
  const query = place.location
    ? `${place.location.latitude},${place.location.longitude}`
    : place.mapQuery || `${place.title} ${place.place}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function PlacesMap({
  places,
  selectedId,
  onSelect,
  onPick,
  label = 'Map of visited places',
}: {
  places: MapPlace[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onPick?: (location: MapLocation) => void;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const clusters = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const callbacks = useRef({ onSelect, onPick });
  const [failed, setFailed] = useState(false);
  const fit = useRef(() => {});
  useEffect(() => {
    callbacks.current = { onSelect, onPick };
  }, [onSelect, onPick]);
  useEffect(() => {
    const instance = L.map(host.current!, {
      zoomControl: false,
      scrollWheelZoom: false,
      maxZoom: 19,
    }).setView(bangalore, 12);
    map.current = instance;
    clusters.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      animate: false,
      iconCreateFunction: (cluster) =>
        L.divIcon({
          className: 'date-cluster',
          iconSize: [44, 44],
          html: `<span aria-label="${cluster.getChildCount()} places; zoom in">${cluster.getChildCount()}</span>`,
        }),
    }).addTo(instance);
    L.control.zoom({ position: 'topright' }).addTo(instance);
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(instance);
    tiles.current = layer;
    layer.on('tileerror', () => setFailed(true));
    instance.on('click', (event: L.LeafletMouseEvent) =>
      callbacks.current.onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
    );
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(host.current!);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  const coordinateKey = places
    .map((p) => `${p.id}:${p.location.latitude}:${p.location.longitude}:${p.count}:${p.title}`)
    .join('|');
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    clusters.current?.clearLayers();
    markers.current.clear();
    for (const place of places) {
      const labelNode = document.createElement('span');
      labelNode.textContent = place.title;
      const marker = L.marker([place.location.latitude, place.location.longitude], {
        title: `${place.title}, ${place.count} ${place.count === 1 ? 'visit' : 'visits'}`,
        keyboard: true,
        icon: L.divIcon({
          className: 'date-pin',
          iconSize: [42, 48],
          iconAnchor: [21, 46],
          html: '<span aria-hidden="true">♥</span>',
        }),
      })
        .addTo(clusters.current!)
        .bindTooltip(labelNode, { direction: 'top', offset: [0, -40], className: 'place-tooltip' });
      marker.on('click', () => callbacks.current.onSelect?.(place.id));
      markers.current.set(place.id, marker);
    }
    fit.current = () => {
      if (places.length)
        instance.fitBounds(
          L.latLngBounds(
            places.map((p) => [p.location.latitude, p.location.longitude] as L.LatLngTuple),
          ),
          { padding: [50, 70], maxZoom: 14 },
        );
      else instance.setView(bangalore, 12);
    };
    fit.current();
    // The key includes every property used to build markers; callback changes do not reset the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateKey]);
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle('selected', id === selectedId);
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
      if (id === selectedId) {
        clusters.current?.zoomToShowLayer(marker, () => {
          marker.getElement()?.classList.add('selected');
          marker.openTooltip();
          map.current?.panTo(marker.getLatLng(), { animate: false });
        });
      } else marker.closeTooltip();
    });
  }, [selectedId, coordinateKey]);
  return (
    <div className={`places-map ${onPick ? 'pin-picker' : ''}`}>
      <div className="map-canvas" ref={host} role="region" aria-label={label} />
      <button
        type="button"
        className="map-fit"
        aria-label="Show all map pins"
        onClick={() => fit.current()}
      >
        <LocateFixed size={20} />
      </button>
      {onPick && (
        <span className="map-instruction">
          <MapPin size={15} /> Tap the map to place your pin
        </span>
      )}
      {failed && (
        <div className="map-error" role="status">
          Map tiles couldn’t load. Your saved places are still available.
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              tiles.current?.redraw();
            }}
          >
            <RefreshCw size={15} /> Retry map
          </button>
        </div>
      )}
    </div>
  );
}
