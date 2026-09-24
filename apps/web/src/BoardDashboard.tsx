import { useEffect, useMemo, useRef, useState } from 'react';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
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
import { api } from '@date-notes/backend/api';
import type { Doc } from '@date-notes/backend/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Initials, Modal, Spinner, formatDate } from './ui';
import { Invitations } from './Settings';
import { Photo } from './Photos';
import { PlacesMap, mapsLink, type MapLocation } from './PlacesMap';
import { googleMapsConfigured, placeSearchErrorMessage, searchNearbyPlaces } from './googleMaps';

type Detail = FunctionReturnType<typeof api.boards.get>;
type VisitSummary = FunctionReturnType<typeof api.visits.list>['page'][number];
export type DesignVariant = 'modern' | 'editorial' | 'compact';

type NewPlace = {
  id: string;
  title: string;
  place: string;
  location: MapLocation;
};

function placeKey(visit: Doc<'visits'>) {
  return `${visit.title.trim().toLowerCase()}|${visit.place.trim().toLowerCase()}`;
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
  dateNumber,
}: {
  visit: VisitSummary;
  variant: DesignVariant;
  members: Detail['members'];
  isRow?: boolean;
  dateNumber?: number;
}) {
  const hasPhotos = visit.photoIds.length > 0;
  const showDishRatings = members.length <= 3;
  const displayRating = visit.overall ?? visit.dishAverage;
  return (
    <article
      className={`memory-card memory-card-${variant} ${isRow ? 'memory-row' : ''} ${
        !hasPhotos ? 'no-photo-card' : ''
      }`}
    >
      <div className="memory-topline">
        {dateNumber !== undefined && <span className="memory-date-number">Date #{dateNumber}</span>}
        {visit.date && <time dateTime={visit.date}>{formatDate(visit.date)}</time>}
      </div>
      <div className="memory-title-row">
        <Link to={`/visits/${visit._id}`}>
          <h3>{visit.title}</h3>
        </Link>
        <div className="memory-title-meta">
          {displayRating !== null && (
            <span className="memory-score" title="Visit rating">
              <Heart size={14} fill="currentColor" />
              {formatRatingScore(displayRating)}
              <small>/10</small>
            </span>
          )}
          <span className="memory-visit-badge">{formatOrdinalVisit(visit.visitNumber ?? 1)}</span>
        </div>
      </div>
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
          <Link
            to={`/visits/${visit._id}`}
            className="memory-photos"
            aria-label={`Open ${visit.title}, visit ${visit.visitNumber ?? 1}`}
          >
            {visit.photoIds.map((id, index) => (
              <Photo key={id} id={id} alt={`${visit.title} photo ${index + 1}`} />
            ))}
          </Link>
        ) : visit.dishes && visit.dishes.length > 0 ? (
          <div className="memory-dishes-list">
            {visit.dishes.map((dish) => (
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
            {visit.highlights.map((dishName) => (
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
          <p className="memory-dishes">{visit.highlights.join(' · ')}</p>
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
  forcedDesign,
}: {
  detail: Detail;
  forcedDesign?: DesignVariant;
}) {
  const id = detail.board._id;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selectParam = params.get('select') || params.get('selected');

  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(selectParam);
  const [addingMember, setAddingMember] = useState(false);
  const isAdmin = detail.isAdmin;
  const pendingRequests =
    useQuery(api.boards.pendingRequests, isAdmin ? { boardId: id } : 'skip') ?? [];

  // New place search states
  const [newPlaces, setNewPlaces] = useState<NewPlace[]>([]);
  const [isSearchingNew, setIsSearchingNew] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<MapLocation | null>(null);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [searchedPlace, setSearchedPlace] = useState<NewPlace | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const {
    results: visits,
    status: placesStatus,
    loadMore: loadPlaces,
  } = usePaginatedQuery(api.visits.places, { boardId: id }, { initialNumItems: 100 });
  const {
    results: recent,
    status,
    loadMore,
  } = usePaginatedQuery(api.visits.list, { boardId: id }, { initialNumItems: 6 });

  useEffect(() => {
    if (placesStatus === 'CanLoadMore') loadPlaces(100);
  }, [placesStatus, loadPlaces]);

  // Infinite scroll observer to automatically load more dates
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
  // Ignore stale responses when the query or the nearby search area changes.
  useEffect(() => {
    const trimmed = query.trim();
    setNewPlaces([]);
    setSearchError('');
    if (trimmed.length < 2) {
      setIsSearchingNew(false);
      return;
    }
    let cancelled = false;
    setIsSearchingNew(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchNearbyPlaces(
          trimmed,
          searchLatitude !== undefined && searchLongitude !== undefined
            ? { latitude: searchLatitude, longitude: searchLongitude }
            : undefined,
        );
        if (!cancelled) setNewPlaces(results);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(
            'Place search failed:',
            String(error)
              .replace(/AIza[\w-]+/g, '[redacted]')
              .replace(/key=[^&\s]+/g, 'key=[redacted]'),
          );
        }
        if (!cancelled) setSearchError(placeSearchErrorMessage(error));
      } finally {
        if (!cancelled) setIsSearchingNew(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchLatitude, searchLongitude, searchAttempt]);

  const groups = useMemo(() => {
    const map = new globalThis.Map<string, Doc<'visits'>[]>();
    for (const visit of visits) {
      const key = placeKey(visit);
      map.set(key, [...(map.get(key) ?? []), visit]);
    }
    return [...map.entries()].map(([key, entries]) => ({
      key,
      entries,
      visit: entries.find((v) => v.location) ?? entries[0],
    }));
  }, [visits]);

  const matching = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return groups;
    return groups.filter(({ entries }) =>
      entries.some((v) => `${v.title} ${v.place} ${v.notes}`.toLowerCase().includes(trimmed)),
    );
  }, [groups, query]);

  const pins = useMemo(() => {
    const list = matching.flatMap(({ key, entries, visit }) =>
      visit.location
        ? [{ id: key, title: visit.title, location: visit.location, count: entries.length }]
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

  // Both visit queries use the same newest-first order. Wait for all lightweight
  // metadata so numbers stay consistent as more cards are loaded.
  const dateNumbers = useMemo(
    () =>
      new Map(
        placesStatus === 'Exhausted'
          ? visits.map((visit, index) => [visit._id, visits.length - index])
          : [],
      ),
    [visits, placesStatus],
  );

  const selected = matching.find((p) => p.key === selectedKey);
  const selectedPlaceUrl = selected
    ? `/boards/${id}/place?title=${encodeURIComponent(
        selected.visit.title,
      )}&place=${encodeURIComponent(selected.visit.place || '')}&from=map`
    : undefined;
  const unpinned = useMemo(() => groups.filter((p) => !p.visit.location).length, [groups]);

  return (
    <div className="page board-dashboard design-editorial">
      {/* Editorial Keepsake Header */}
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
      <section className="places-section" aria-label="Places visited">
        <div className="places-heading">
          <h2>Your places</h2>
          <div className="places-explored-heading-right">
            <span className="heart-counter-badge">
              <Heart className="heading-heart-icon" aria-hidden="true" strokeWidth={1.4} />
              <span className="heart-counter-number">{groups.length}</span>
            </span>
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
                      setNewPlaces([]);
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
                      {matching.slice(0, 3).map(({ key, entries, visit }) => (
                        <div
                          key={key}
                          className="search-result-item"
                          onClick={() => {
                            setSelectedKey(key);
                            setSearchDropdownOpen(false);
                          }}
                        >
                          <div className="result-icon">
                            <MapPin size={16} />
                          </div>
                          <div className="result-body">
                            <span className="result-title">{visit.title}</span>
                            <span className="result-sub">
                              {visit.place || 'Saved place'} · {entries.length}{' '}
                              {entries.length === 1 ? 'visit' : 'visits'}
                            </span>
                          </div>
                          <Link
                            className="result-action-button"
                            to={`/boards/${id}/visits/new?title=${encodeURIComponent(
                              visit.title,
                            )}&place=${encodeURIComponent(visit.place || '')}${
                              visit.location
                                ? `&lat=${visit.location.latitude}&lng=${visit.location.longitude}`
                                : ''
                            }`}
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
                    {newPlaces.length > 0 ? (
                      newPlaces.map((place) => (
                        <div
                          key={place.id}
                          className="search-result-item new-place-item"
                          onClick={() => {
                            setSearchedPlace(place);
                            setSelectedKey('searched-place');
                            setSearchDropdownOpen(false);
                          }}
                        >
                          <div className="result-icon new-pin-icon">
                            <Compass size={16} />
                          </div>
                          <div className="result-body">
                            <span className="result-title">{place.title}</span>
                            <span className="result-sub">{place.place}</span>
                          </div>
                          <Link
                            className="result-action-button primary-pill"
                            to={`/boards/${id}/visits/new?title=${encodeURIComponent(
                              place.title,
                            )}&place=${encodeURIComponent(place.place)}&lat=${
                              place.location.latitude
                            }&lng=${place.location.longitude}`}
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
              {searchBarNode}
              <div className="map-shell">
                <PlacesMap
                  places={pins}
                  selectedId={selectedKey ?? undefined}
                  onSelect={setSelectedKey}
                  autoLocate
                  onLocationChange={setCurrentLocation}
                />
                {googleMapsConfigured && !selectedKey && pins.length > 0 && (
                  <div className="map-hint">
                    <Heart size={14} strokeWidth={1.7} />
                    <span>Tap a heart to open your notes</span>
                  </div>
                )}
              </div>

              {/* Place Card: Searched New Place */}
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
                      to={`/boards/${id}/visits/new?title=${encodeURIComponent(
                        searchedPlace.title,
                      )}&place=${encodeURIComponent(searchedPlace.place)}&lat=${
                        searchedPlace.location.latitude
                      }&lng=${searchedPlace.location.longitude}`}
                    >
                      <Plus size={16} /> Add visit
                    </Link>
                  </div>
                </div>
              ) : selected && selectedPlaceUrl ? (
                /* Place Card: Existing Visited Place */
                <div
                  className="map-place-card map-place-card-clickable"
                  onClick={() => navigate(selectedPlaceUrl)}
                >
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
                    {selected.visit.typeName} · {selected.entries.length}{' '}
                    {selected.entries.length === 1 ? 'visit' : 'visits'}
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
                        View place
                        <ArrowRight size={17} />
                      </Link>
                      <Link
                        className="button primary"
                        to={`/boards/${id}/visits/new?title=${encodeURIComponent(
                          selected.visit.title,
                        )}&place=${encodeURIComponent(selected.visit.place || '')}${
                          selected.visit.location
                            ? `&lat=${selected.visit.location.latitude}&lng=${selected.visit.location.longitude}`
                            : ''
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Plus size={16} /> Add visit
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="map-summary">
                <Link to={`/boards/${id}/places`} className="text-button">
                  <List size={16} /> View list <ArrowRight size={15} />
                </Link>
                {unpinned > 0 && (
                  <Link className="map-unpinned" to={`/boards/${id}/places?tab=unpinned`}>
                    {unpinned} without a pin <ArrowRight size={14} />
                  </Link>
                )}
              </div>

              {matching.length === 0 && !searchedPlace && (
                <p className="no-results">
                  No matching saved places. Try searching for a new place above.
                </p>
              )}
            </>
          );
        })()}
      </section>

      {/* Your dates Section (No dot, no subtitle) */}
      <section className="recent-section" aria-label="Your dates">
        <div className="recent-heading">
          <h2>Your dates</h2>
          <div className="places-explored-heading-right">
            <span className="heart-counter-badge">
              <Heart className="heading-heart-icon" aria-hidden="true" strokeWidth={1.4} />
              <span className="heart-counter-number">{visits.length}</span>
            </span>
            <span className="explored-word">so far</span>
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
                dateNumber={dateNumbers.get(visit._id)}
                variant="editorial"
                members={detail.members}
                isRow={false}
              />
            ))}
          </div>
        ) : (
          <div className="first-memory">
            <Heart size={35} />
            <h3>Your first date goes here</h3>
            <p>Add a place, a few dishes, and your photos.</p>
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

      {addingMember && (
        <Modal title="Add member" onClose={() => setAddingMember(false)}>
          <Invitations
            boardId={id}
            inviteCode={detail.board.inviteCode}
            canManage={detail.isAdmin}
          />
        </Modal>
      )}
    </div>
  );
}
