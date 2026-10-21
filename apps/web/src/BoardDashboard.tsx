import { PlaceLookupNotice } from './PlaceLookupNotice';
import { GoogleAttribution, GoogleSearchInfo } from './GoogleAttribution';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePaginatedQuery, useQuery } from './convexLive';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import {
  Bell,
  ArrowRight,
  Compass,
  Funnel,
  Heart,
  List,
  MapPin,
  Navigation,
  Plus,
  Search,
  Settings2,
  UserPlus,
  Utensils,
  X,
} from 'lucide-react';
import { api } from '@nico-notes/backend/api';
import type { Doc } from '@nico-notes/backend/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Initials, Modal, Spinner, formatDate } from './ui';
import { Invitations } from './Settings';
import { PhotoCarousel } from './Photos';
import { PlacesMap, mapsLink, type MapLocation, type MapPlace } from './PlacesMap';
import { preferVisitedPlaces } from '@nico-notes/backend/mapMarkers';
import { usePlaceLinking } from './usePlaceLinking';
import { googleMapsConfigured, placeSearchErrorMessage, searchNearbyPlaces } from './googleMaps';

type Detail = FunctionReturnType<typeof api.boards.get>;
type VisitSummary = FunctionReturnType<typeof api.visits.list>['page'][number];
export type DesignVariant = 'modern' | 'editorial' | 'compact';

type NewPlace = {
  attributions?: string[];
  id: string;
  title: string;
  place: string;
  location: MapLocation;
};

function NoteCounter({ count }: { count: number }) {
  return (
    <span className="visit-counter">
      <svg
        width="26"
        height="28"
        viewBox="8 7 44 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M41 51H19a7 7 0 0 1-7-7V20a7 7 0 0 1 7-7h22a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7ZM12 23h36M21 10v7m9-7v7m9-7v7M21 32h16M21 40h8" />
      </svg>
      <span className="visit-counter-number">{count}</span>
    </span>
  );
}

export function placeKey(visit: Doc<'visits'>) {
  return visit.placeId ?? `${visit.title.trim().toLowerCase()}|${visit.place.trim().toLowerCase()}`;
}

function formatOrdinalVisit(n: number) {
  const pr = new Intl.PluralRules('en-US', { type: 'ordinal' });
  const suffixes: Record<string, string> = {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
  };
  const suffix = suffixes[pr.select(n)] || 'th';
  return `${n}${suffix} Visit`;
}

function formatRatingScore(score: number): string {
  return score.toFixed(1);
}

function getInitials(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function VisitCard({
  visit,
  variant,
  members,
  isRow,
  visitNumber,
}: {
  visit: VisitSummary;
  variant: DesignVariant;
  members: Detail['members'];
  isRow?: boolean;
  visitNumber?: number;
}) {
  const hasPhotos = visit.photoIds.length > 0;
  const showDishRatings = members.length <= 3;
  const displayRating = visit.overall;
  return (
    <article
      className={`memory-card memory-card-${variant} ${isRow ? 'memory-row' : ''} ${
        !hasPhotos ? 'no-photo-card' : ''
      }`}
    >
      <div className="memory-topline">
        {visitNumber !== undefined && (
          <span className="memory-visit-number">Visit #{visitNumber}</span>
        )}
        {visit.date && <time dateTime={visit.date}>{formatDate(visit.date)}</time>}
      </div>
      <div className="memory-title-row">
        <Link to={`/visits/${visit._id}`}>
          <h3>{visit.title}</h3>
        </Link>
        <div className="memory-title-meta">
          {displayRating !== null && (
            <span className="memory-score" title="Overall visit rating">
              <Heart size={14} fill="currentColor" />
              {formatRatingScore(displayRating)}
              <small>/10</small>
            </span>
          )}
          {visit.visitNumber && (
            <span className={`memory-visit-badge ${visit.visitNumber === 1 ? 'first-visit' : ''}`}>
              {formatOrdinalVisit(visit.visitNumber)}
            </span>
          )}
        </div>
      </div>
      {visit.googlePlaceId && <GoogleAttribution placeId={visit.googlePlaceId} />}
      <div className="memory-place-row">
        <p className="memory-location">
          <MapPin size={14} />
          <span>{visit.place || 'Location not recorded'}</span>
          {visit.typeName && (
            <>
              <span className="location-type-sep">·</span>
              <span className="location-type-name">{visit.typeName}</span>
            </>
          )}
        </p>
      </div>

      <div className="memory-card-body">
        {hasPhotos ? (
          <PhotoCarousel ids={visit.photoIds} title={visit.title} visitId={visit._id} />
        ) : visit.dishes && visit.dishes.length > 0 ? (
          <div className="memory-dishes-list">
            {visit.dishes.slice(0, 4).map((dish) => (
              <div key={dish._id} className="memory-dish-row">
                <span className="memory-dish-name">
                  <Utensils size={13} />
                  <span>{dish.name}</span>
                </span>
                {showDishRatings && (
                  <div className="memory-dish-ratings">
                    {dish.ratings && dish.ratings.length > 0 ? (
                      dish.ratings.map((r, i) => {
                        const member = members.find((m) => m._id === r.userId);
                        const fullName = r.importedName || member?.name;
                        const initials = getInitials(fullName);
                        return (
                          <span
                            key={i}
                            className="dish-member-rating"
                            title={fullName || undefined}
                          >
                            {initials ? <span className="dish-member-name">{initials}</span> : null}
                            <span className="dish-member-score">{formatRatingScore(r.score)}</span>
                          </span>
                        );
                      })
                    ) : dish.score !== null ? (
                      <span className="dish-member-rating">
                        <span className="dish-member-score">{formatRatingScore(dish.score)}</span>
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : visit.highlights.length > 0 ? (
          <div className="memory-dishes-list">
            {visit.highlights.slice(0, 4).map((dishName) => (
              <div key={dishName} className="memory-dish-row">
                <span className="memory-dish-name">
                  <Utensils size={13} />
                  <span>{dishName}</span>
                </span>
              </div>
            ))}
          </div>
        ) : visit.notes ? (
          <p className="dynamic-card-notes">“{visit.notes}”</p>
        ) : null}

        {hasPhotos && visit.highlights.length > 0 && (
          <p className="memory-dishes">{visit.highlights.slice(0, 2).join(' · ')}</p>
        )}
      </div>

      <div className="memory-footer">
        <Link to={`/visits/${visit._id}`}>
          View notes <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

export function BoardDashboard({
  detail,
  forcedDesign: _forcedDesign,
}: {
  detail: Detail;
  forcedDesign?: DesignVariant;
}) {
  const id = detail.board._id;
  usePlaceLinking(id);
  const [params] = useSearchParams();
  const selectParam = params.get('select') || params.get('selected');

  const [query, setQuery] = useState('');
  const [placeFilter, setPlaceFilter] = useState<'visited' | 'wishlist' | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(selectParam);
  const isAdmin = detail.isAdmin;
  const pendingRequests =
    useQuery(api.boards.pendingRequests, isAdmin ? { boardId: id } : 'skip') ?? [];

  // New place search states
  const [placeSearch, setPlaceSearch] = useState<{
    key: string;
    places: NewPlace[];
    error: string;
    loading: boolean;
  }>();
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<MapLocation | null>(null);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [searchedPlace, setSearchedPlace] = useState<NewPlace | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const {
    results: places,
    status: placesStatus,
    loadMore: loadPlaces,
  } = usePaginatedQuery(api.places.list, { boardId: id }, { initialNumItems: 100 });
  const {
    results: wishlist,
    status: wishlistStatus,
    loadMore: loadWishlist,
  } = usePaginatedQuery(api.wishlist.list, { boardId: id }, { initialNumItems: 100 });
  useEffect(() => {
    if (placeFilter !== 'visited' && wishlistStatus === 'CanLoadMore') loadWishlist(100);
  }, [placeFilter, wishlistStatus, loadWishlist]);
  const {
    results: recent,
    status,
    loadMore,
  } = usePaginatedQuery(api.visits.list, { boardId: id }, { initialNumItems: 6 });

  useEffect(() => {
    if (
      (query.trim() ||
        (selectParam &&
          !places.some(
            (place) =>
              place._id === selectParam ||
              `${place.name.trim().toLowerCase()}|${place.address.trim().toLowerCase()}` ===
                selectParam,
          ))) &&
      placesStatus === 'CanLoadMore'
    )
      loadPlaces(100);
  }, [query, selectParam, places, placesStatus, loadPlaces]);

  // Infinite scroll observer to automatically load more visits
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status !== 'CanLoadMore') return;
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && status === 'CanLoadMore') {
          loadMore(6);
        }
      },
      { rootMargin: '300px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [status, loadMore]);

  // Click outside search container to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchLatitude = currentLocation?.latitude;
  const searchLongitude = currentLocation?.longitude;
  const searchKey = `${query.trim()}|${searchLatitude}|${searchLongitude}|${searchAttempt}`;
  const activeSearch = placeSearch?.key === searchKey ? placeSearch : undefined;
  const newPlaces = activeSearch?.places ?? [];
  const searchError = activeSearch?.error ?? '';
  const isSearchingNew = query.trim().length >= 2 && (activeSearch?.loading ?? true);
  // Ignore stale responses when the query or the nearby search area changes.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPlaceSearch({ key: searchKey, places: [], error: '', loading: true });
      try {
        const results = await searchNearbyPlaces(
          trimmed,
          searchLatitude !== undefined && searchLongitude !== undefined
            ? { latitude: searchLatitude, longitude: searchLongitude }
            : undefined,
        );
        if (!cancelled)
          setPlaceSearch({ key: searchKey, places: results, error: '', loading: false });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(
            'Place search failed:',
            String(error)
              .replace(/AIza[\w-]+/g, '[redacted]')
              .replace(/key=[^&\s]+/g, 'key=[redacted]'),
          );
        }
        if (!cancelled)
          setPlaceSearch({
            key: searchKey,
            places: [],
            error: placeSearchErrorMessage(error),
            loading: false,
          });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchLatitude, searchLongitude, searchAttempt, searchKey]);

  const groups = useMemo(
    () =>
      places.map((place) => ({
        key: place._id,
        count: place.visitCount,
        visit: {
          title: place.name,
          place: place.address,
          placeId: place._id,
          googlePlaceId: place.googlePlaceId,
          location: place.location,
        },
      })),
    [places],
  );

  const matching = useMemo(() => {
    const visited = groups.map((group) => ({ ...group, wishlist: false }));
    const wishes = wishlist.map((item) => ({
      key: item._id as string,
      count: 0,
      wishlist: true,
      visit: {
        title: item.title,
        place: item.place ?? '',
        placeId: undefined,
        googlePlaceId: item.googlePlaceId,
        location: item.location,
      },
    }));
    const candidates =
      placeFilter === 'visited'
        ? visited
        : placeFilter === 'wishlist'
          ? wishes
          : preferVisitedPlaces([...visited, ...wishes], ({ visit, wishlist }) => ({
              name: visit.title,
              address: visit.place,
              googlePlaceId: visit.googlePlaceId,
              location: visit.location,
              wishlist,
            }));
    const trimmed = query.trim().toLowerCase();
    return candidates.filter(({ visit }) =>
      `${visit.title} ${visit.place}`.toLowerCase().includes(trimmed),
    );
  }, [groups, wishlist, placeFilter, query]);

  const mapLookupIds = [
    ...(placeFilter !== 'wishlist' ? places : []),
    ...(placeFilter !== 'visited' ? wishlist : []),
  ].flatMap((place) => (place.googlePlaceId ? [place.googlePlaceId] : []));

  const pins = useMemo(() => {
    const list: MapPlace[] = matching.flatMap(({ key, count, visit, wishlist }) =>
      visit.location
        ? [{ id: key, title: visit.title, location: visit.location, count: count ?? 1, wishlist }]
        : [],
    );
    if (searchedPlace) {
      list.push({
        id: 'searched-place',
        title: searchedPlace.title,
        location: searchedPlace.location,
        count: 1,
      });
    }
    return list;
  }, [matching, searchedPlace]);

  const selected = matching.find(
    (p) =>
      p.key === selectedKey ||
      `${p.visit.title.trim().toLowerCase()}|${p.visit.place.trim().toLowerCase()}` === selectedKey,
  );
  const selectedPlaceUrl = selected?.wishlist
    ? `/boards/${id}/wishlist`
    : selected
      ? `/boards/${id}/place?title=${encodeURIComponent(
          selected.visit.title,
        )}&place=${encodeURIComponent(selected.visit.place || '')}&placeId=${selected.visit.placeId ?? ''}&from=map`
      : undefined;
  const unpinned = useMemo(() => groups.filter((p) => !p.visit.location).length, [groups]);

  const mapFilters = (
    <label
      className="place-map-filter"
      title={`Filter places: ${placeFilter === 'visited' ? 'Visited' : placeFilter === 'wishlist' ? 'Wishlist' : 'All'}`}
    >
      <Funnel size={21} aria-hidden="true" />
      <select
        aria-label="Filter places on map"
        value={placeFilter}
        onChange={(event) => {
          setPlaceFilter(event.target.value as 'visited' | 'wishlist' | 'all');
          setSelectedKey(null);
          setSearchedPlace(null);
        }}
      >
        <option value="visited">Visited</option>
        <option value="wishlist">Wishlist</option>
        <option value="all">All</option>
      </select>
    </label>
  );
  const placePreview = (
    <>
      {selectedKey === 'searched-place' && searchedPlace ? (
        <div className="map-place-card searched-place-card">
          <button
            className="icon-button close-place"
            aria-label="Close selected place"
            onClick={() => {
              setSelectedKey(null);
              setSearchedPlace(null);
            }}
          >
            <X size={17} />
          </button>
          <span className="type-pill sage">New place to visit</span>
          <h3>{searchedPlace.title}</h3>
          <GoogleAttribution attributions={searchedPlace.attributions} />
          <p>
            <MapPin size={14} />
            {searchedPlace.place}
          </p>
          <div className="map-place-actions">
            <a href={mapsLink(searchedPlace)} target="_blank" rel="noreferrer">
              <Navigation size={16} />
              Google Maps
            </a>
            <Link
              className="button primary"
              to={`/boards/${id}/visits/new?googlePlaceId=${encodeURIComponent(searchedPlace.id)}`}
            >
              <Plus size={16} /> Add visit
            </Link>
          </div>
        </div>
      ) : selected && selectedPlaceUrl ? (
        /* Place Card: Existing Visited Place */
        <div className="map-place-card">
          <button
            className="icon-button close-place"
            aria-label="Close selected place"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedKey(null);
            }}
          >
            <X size={17} />
          </button>
          <span className="type-pill sage">
            {selected.wishlist
              ? 'Wishlist'
              : selected.count === undefined
                ? 'Saved place'
                : `${selected.count} ${selected.count === 1 ? 'visit' : 'visits'}`}
          </span>
          <h3>{selected.visit.title}</h3>
          <p>
            <MapPin size={14} />
            {selected.visit.place}
          </p>
          <div className="map-place-actions">
            <a
              href={mapsLink(selected.visit)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <Navigation size={16} />
              Google Maps
            </a>
            <div className="map-place-visit-actions">
              <Link
                className="button secondary"
                to={selectedPlaceUrl}
                onClick={(e) => e.stopPropagation()}
              >
                {selected.wishlist ? 'View wishlist' : 'View place'}
                <ArrowRight size={17} />
              </Link>
              <Link
                className="button primary"
                to={
                  selected.visit.googlePlaceId
                    ? `/boards/${id}/visits/new?googlePlaceId=${encodeURIComponent(selected.visit.googlePlaceId)}${selected.wishlist ? `&wishlistId=${encodeURIComponent(selected.key)}` : ''}`
                    : `/boards/${id}/visits/new?title=${encodeURIComponent(
                        selected.visit.title,
                      )}&place=${encodeURIComponent(selected.visit.place || '')}&placeId=${selected.visit.placeId ?? ''}${selected.wishlist ? `&wishlistId=${encodeURIComponent(selected.key)}` : ''}${selected.visit.googlePlaceId ? `&googlePlaceId=${encodeURIComponent(selected.visit.googlePlaceId)}` : ''}${
                        selected.visit.location
                          ? `&lat=${selected.visit.location.latitude}&lng=${selected.visit.location.longitude}`
                          : ''
                      }`
                }
                onClick={(e) => e.stopPropagation()}
              >
                <Plus size={16} /> Add visit
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="page board-dashboard design-editorial">
      {/* Editorial Keepsake Header */}
      <BoardHeader detail={detail} />

      {pendingRequests.length > 0 && (
        <div className="pending-banner">
          <div className="pending-banner-text">
            <span className="pending-banner-pill">👋 Join request</span>
            <span>
              <strong>
                {pendingRequests.length} pending join{' '}
                {pendingRequests.length === 1 ? 'request' : 'requests'}
              </strong>{' '}
              ({pendingRequests.map((p) => p.userName).join(', ')})
            </span>
          </div>
          <Link className="button small primary" to={`/boards/${id}/settings`}>
            Review requests
          </Link>
        </div>
      )}

      {/* Places Section */}
      <section className="places-section" aria-label="Your places">
        <div className="places-heading">
          <h2>Your Places</h2>
          <div className="places-explored-heading-right">
            <NoteCounter count={groups.length} />
            {placesStatus !== 'Exhausted' && <span aria-label="More places available">+</span>}
            <span className="explored-word">explored</span>
          </div>
        </div>

        {/* Search Bar Component */}
        {(() => {
          const searchBarNode = (
            <div
              className="places-search-wrap"
              ref={searchContainerRef}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <div className="places-search">
                <Search size={20} />
                <input
                  aria-label="Search places"
                  placeholder="Search places…"
                  value={query}
                  onFocus={() => {
                    if (query.trim()) setSearchDropdownOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSearchDropdownOpen(false);
                  }}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedKey(null);
                    setSearchedPlace(null);
                    setSearchDropdownOpen(true);
                  }}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('');
                      setPlaceSearch(undefined);
                      setSearchDropdownOpen(false);
                      setSearchedPlace(null);
                    }}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>

              {/* Search Dropdown with New Places Results */}
              {searchDropdownOpen && query.trim() && (
                <div
                  className="places-search-dropdown"
                  role="region"
                  aria-label="Place search results"
                >
                  {/* Saved places matching query */}
                  {matching.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="dropdown-section-title">
                        <span>Saved places ({matching.length})</span>
                      </div>
                      {matching.slice(0, 3).map(({ key, count, visit }) => (
                        <div key={key} className="search-result-item">
                          <button
                            type="button"
                            className="search-result-preview"
                            aria-label={`Preview ${visit.title}`}
                            onClick={() => {
                              setSelectedKey(key);
                              setSearchDropdownOpen(false);
                            }}
                          >
                            <span className="result-icon">
                              <MapPin size={16} />
                            </span>
                            <span className="result-body">
                              <span className="result-title">{visit.title}</span>
                              <span className="result-sub">
                                {visit.place || 'Saved place'}
                                {count !== undefined &&
                                  (count === 0
                                    ? ' · Wishlist'
                                    : ` · ${count} ${count === 1 ? 'visit' : 'visits'}`)}
                              </span>
                            </span>
                          </button>
                          <Link
                            className="result-action-button"
                            to={
                              visit.googlePlaceId
                                ? `/boards/${id}/visits/new?googlePlaceId=${encodeURIComponent(visit.googlePlaceId)}`
                                : `/boards/${id}/visits/new?title=${encodeURIComponent(
                                    visit.title,
                                  )}&place=${encodeURIComponent(visit.place || '')}&placeId=${visit.placeId ?? ''}${
                                    visit.location
                                      ? `&lat=${visit.location.latitude}&lng=${visit.location.longitude}`
                                      : ''
                                  }`
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Plus size={14} /> Add visit
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* New places found from live geocoding */}
                  <div className="search-dropdown-section">
                    <div className="dropdown-section-title">
                      <span>
                        <Compass size={13} /> {currentLocation ? 'Nearby · 10 km' : 'Find a place'}
                      </span>
                      {isSearchingNew && <span className="searching-spinner">Searching…</span>}
                    </div>
                    <>
                      <GoogleAttribution />
                      <GoogleSearchInfo />
                    </>
                    {newPlaces.length > 0 ? (
                      newPlaces.map((place) => (
                        <div key={place.id} className="search-result-item new-place-item">
                          <button
                            type="button"
                            className="search-result-preview"
                            aria-label={`Preview ${place.title}`}
                            onClick={() => {
                              setSearchedPlace(place);
                              setSelectedKey('searched-place');
                              setSearchDropdownOpen(false);
                            }}
                          >
                            <span className="result-icon new-pin-icon">
                              <Compass size={16} />
                            </span>
                            <span className="result-body">
                              <span className="result-title">{place.title}</span>
                              <span className="result-sub">{place.place}</span>
                              <GoogleAttribution attributions={place.attributions} />
                            </span>
                          </button>
                          <Link
                            className="result-action-button primary-pill"
                            to={`/boards/${id}/visits/new?googlePlaceId=${encodeURIComponent(place.id)}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Plus size={14} /> Add visit
                          </Link>
                        </div>
                      ))
                    ) : !isSearchingNew ? (
                      <div className="search-dropdown-empty" role="status">
                        <span>
                          {searchError ||
                            (query.trim().length < 2
                              ? 'Type at least two characters to search.'
                              : currentLocation
                                ? 'No matching places within 10 km. Try a different name.'
                                : 'No matching places. Try adding a city or area to your search.')}
                        </span>
                        {searchError && (
                          <button
                            type="button"
                            className="result-action-button"
                            onClick={() => setSearchAttempt((attempt) => attempt + 1)}
                          >
                            Try again
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {/* Manual fallback follows Google Maps results. */}
                  <div className="search-dropdown-section">
                    <Link
                      to={`/boards/${id}/visits/new?title=${encodeURIComponent(query.trim())}`}
                      className="search-quick-add"
                      onClick={() => setSearchDropdownOpen(false)}
                    >
                      <div className="quick-add-icon">
                        <Plus size={16} />
                      </div>
                      <div className="quick-add-body">
                        <strong>Add &ldquo;{query.trim()}&rdquo; manually</strong>
                        <span>Continue without a Google Maps place</span>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );

          if (placesStatus === 'LoadingFirstPage') {
            return <Spinner />;
          }

          return (
            <>
              <div className="places-map-toolbar">
                {searchBarNode}
                {mapFilters}
              </div>
              {placeFilter !== 'visited' && wishlistStatus !== 'Exhausted' && (
                <p role="status" className="small muted">
                  Loading wishlist places…
                </p>
              )}
              <div className="map-shell">
                <PlacesMap
                  places={pins}
                  selectedId={selected?.key ?? selectedKey ?? undefined}
                  onSelect={setSelectedKey}
                  onLocationChange={setCurrentLocation}
                  label="Map of your places"
                  fullscreenHeader={mapFilters}
                  fullscreenFooter={placePreview}
                  fitKey={placeFilter}
                />
                {googleMapsConfigured && !selectedKey && pins.length > 0 && (
                  <div className="map-hint">
                    <Heart size={14} strokeWidth={1.7} />
                    <span>Tap a heart to open your notes</span>
                  </div>
                )}
              </div>

              <PlaceLookupNotice placeIds={mapLookupIds} map />

              {placePreview}

              {placesStatus !== 'Exhausted' && (
                <div className="list-pagination" role="status">
                  <span className="small muted">{places.length} places loaded</span>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={placesStatus !== 'CanLoadMore'}
                    onClick={() => loadPlaces(100)}
                  >
                    {placesStatus === 'LoadingMore' ? 'Loading places…' : 'Load more places'}
                  </button>
                </div>
              )}
              <div className="map-summary">
                <Link to={`/boards/${id}/places`} className="text-button">
                  <List size={16} /> View All Places <ArrowRight size={15} />
                </Link>
                {unpinned > 0 && (
                  <Link className="map-unpinned" to={`/boards/${id}/places?tab=unpinned`}>
                    {unpinned} without a pin <ArrowRight size={14} />
                  </Link>
                )}
              </div>

              {matching.length === 0 && !searchedPlace && (
                <p className="no-results">
                  {placeFilter === 'wishlist'
                    ? 'No matching wishlist places. Save a place to your wishlist to see it here.'
                    : 'No matching saved places. Try searching for a new place above.'}
                </p>
              )}
            </>
          );
        })()}
      </section>

      <section className="recent-section" aria-label="Your Visits">
        <div className="recent-heading">
          <h2>Your Visits</h2>
          <div className="places-explored-heading-right">
            <NoteCounter count={recent.length} />
            <span className="explored-word">{status === 'Exhausted' ? 'visits' : 'loaded'}</span>
          </div>
        </div>

        {status === 'LoadingFirstPage' ? (
          <Spinner />
        ) : recent.length ? (
          <div className="memory-grid">
            {recent.map((visit) => (
              <VisitCard
                key={visit._id}
                visit={visit}
                variant="editorial"
                members={detail.members}
                isRow={false}
              />
            ))}
          </div>
        ) : (
          <div className="first-memory">
            <Heart size={35} />
            <h3>Your first visit goes here</h3>
            <p>Add a place, a few dishes, and your images.</p>
            <Link className="button primary" to={`/boards/${id}/visits/new`}>
              <Plus size={18} />
              Add visit
            </Link>
          </div>
        )}

        {/* Infinite scroll sentinel & loading indicator */}
        <div ref={loadMoreRef} className="infinite-scroll-sentinel">
          {status === 'LoadingMore' && (
            <div className="infinite-scroll-loading">
              <Spinner />
            </div>
          )}
        </div>
      </section>

      {/* Floating Action Button (FAB) for Add Visit */}
      <Link
        className="fab-add-visit fab-editorial"
        to={`/boards/${id}/visits/new`}
        aria-label="Add new visit"
        title="Add visit"
      >
        <Plus size={22} />
        <span>Add visit</span>
      </Link>
    </div>
  );
}

export function BoardHeader({ detail }: { detail: Detail }) {
  const id = detail.board._id;
  const [addingMember, setAddingMember] = useState(false);
  const hasUnread = useQuery(api.notifications.hasUnread, { boardId: id });
  return (
    <>
      <header className="board-heading dashboard-heading heading-editorial">
        <div className="heading-content-editorial">
          <h1 className="title-editorial">{detail.board.name}</h1>
          <div className="members-inline members-editorial">
            <div className="avatar-stack">
              {detail.members.slice(0, 5).map((p) => (
                <Initials key={p._id} name={p.name} image={p.image} small />
              ))}
            </div>
            <span className="editorial-dot">·</span>
            <span className="member-count-text">
              {detail.members.length} {detail.members.length === 1 ? 'member' : 'members'}
            </span>
            <span className="editorial-dot">·</span>
            <button
              className="button text-button invite-editorial"
              onClick={() => setAddingMember(true)}
              disabled={detail.members.length >= 20}
            >
              <UserPlus size={14} /> + Invite
            </button>
          </div>
        </div>
        <div className="board-heading-actions">
          <Link
            className="icon-button soft-icon"
            to={`/boards/${id}/settings`}
            aria-label="Board settings"
          >
            <Settings2 size={19} />
          </Link>
        </div>
        {detail.board.description && <p className="board-desc">{detail.board.description}</p>}
      </header>
      <nav className="board-tabs" aria-label="Board tabs">
        <NavLink to={`/boards/${id}`} end>
          Board
        </NavLink>
        <NavLink to={`/boards/${id}/wishlist`}>Wishlist</NavLink>
        <NavLink to={`/boards/${id}/notifications`}>
          <Bell size={16} /> Notifications
          {hasUnread && (
            <span className="notification-dot" role="img" aria-label="Unread notifications" />
          )}
        </NavLink>
      </nav>
      {addingMember && (
        <Modal title="Add member" onClose={() => setAddingMember(false)}>
          <Invitations
            boardId={id}
            inviteCode={detail.board.inviteCode}
            canManage={detail.isAdmin}
          />
        </Modal>
      )}
    </>
  );
}
