import { useEffect, useMemo, useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  ChevronDown,
  Heart,
  List,
  Map,
  MapPin,
  Plus,
  Search,
  Settings2,
  UserPlus,
  Utensils,
  Mountain,
  X,
  Navigation,
} from 'lucide-react';
import { api } from '@date-notes/backend/api';
import type { Doc, Id } from '@date-notes/backend/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Initials, Modal, Spinner, formatDate } from './ui';
import { Invitations } from './Settings';
import { Photo } from './Photos';
import { Artwork } from './Artwork';
import { PlacesMap, mapsLink } from './PlacesMap';

type Detail = FunctionReturnType<typeof api.boards.get>;
type VisitSummary = FunctionReturnType<typeof api.visits.list>['page'][number];
function placeKey(visit: Doc<'visits'>) {
  return `${visit.title.trim().toLowerCase()}|${visit.place.trim().toLowerCase()}`;
}
function VisitCard({ visit }: { visit: VisitSummary }) {
  return (
    <article className="memory-card">
      <div className="memory-topline">
        <span>
          {visit.typeName} <span aria-hidden="true">·</span> Visit {visit.visitNumber ?? 1}
        </span>
        <span>{formatDate(visit.date)}</span>
      </div>
      <div className="memory-title-row">
        <Link to={`/visits/${visit._id}`}>
          <h3>{visit.title}</h3>
        </Link>
        {visit.overall !== null && (
          <span className="memory-score" title="Overall visit average">
            <Heart size={15} fill="currentColor" />
            {visit.overall.toFixed(1)}
            <small>/10</small>
          </span>
        )}
      </div>
      <p className="memory-location">
        <MapPin size={14} />
        {visit.place || 'Location not recorded'}
      </p>
      <Link
        to={`/visits/${visit._id}`}
        className={`memory-photos ${visit.photoIds.length ? '' : 'no-photos'}`}
        aria-label={`Open ${visit.title}, visit ${visit.visitNumber ?? 1}`}
      >
        {visit.photoIds.length ? (
          visit.photoIds.map((id, index) => (
            <Photo key={id} id={id} alt={`${visit.title} photo ${index + 1}`} />
          ))
        ) : (
          <>
            <Artwork variant={visit.showDishes ? 'food' : 'adventure'} />
            <span>
              <Camera size={19} />
              Add your photos
            </span>
          </>
        )}
      </Link>
      {visit.highlights.length > 0 && (
        <p className="memory-dishes">{visit.highlights.join(' · ')}</p>
      )}
      <div className="memory-footer">
        <span>
          {visit.dishAverage !== null ? (
            <>
              <Utensils size={14} />
              {visit.dishAverage.toFixed(1)}/10 <small>dish avg.</small>
            </>
          ) : (
            <>{visit.dishCount ? `${visit.dishCount} dishes` : visit.typeName}</>
          )}
        </span>
        <Link to={`/visits/${visit._id}`}>
          View notes <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}
export function BoardDashboard({ detail, userId }: { detail: Detail; userId?: Id<'users'> }) {
  const id = detail.board._id;
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'map';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
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
  const matching = groups.filter(({ entries, visit }) => {
    const matchFilter =
      filter === 'All' ||
      (filter === 'Food'
        ? visit.showDishes
        : filter === 'Adventure'
          ? !visit.showDishes
          : !visit.location);
    return (
      matchFilter &&
      entries.some((v) =>
        `${v.title} ${v.place} ${v.notes}`.toLowerCase().includes(query.toLowerCase().trim()),
      )
    );
  });
  const pins = matching.flatMap(({ key, entries, visit }) =>
    visit.location
      ? [{ id: key, title: visit.title, location: visit.location, count: entries.length }]
      : [],
  );
  const selected = matching.find((p) => p.key === selectedKey);
  const unpinned = matching.filter((p) => !p.visit.location).length;
  const loaded = placesStatus === 'Exhausted';
  const heading = view === 'map' ? 'Your places' : 'All places';
  return (
    <div className="page board-dashboard">
      <header className="board-heading dashboard-heading">
        <div>
          <h1>{detail.board.name}</h1>
          <div className="members-inline">
            <div className="avatar-stack">
              {detail.members.slice(0, 5).map((p) => (
                <Initials key={p._id} name={p.name} small />
              ))}
            </div>
            <span>
              {detail.members.length} {detail.members.length === 1 ? 'member' : 'members'}
            </span>
            {userId === detail.board.ownerId && (
              <button
                className="button invite-pill"
                onClick={() => setAddingMember(true)}
                disabled={detail.members.length >= 20}
              >
                <UserPlus size={15} /> Invite
              </button>
            )}
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
          <Link className="button primary" to={`/boards/${id}/visits/new`}>
            <Plus size={19} />
            Add visit
          </Link>
        </div>
        {detail.board.description && <p>{detail.board.description}</p>}
      </header>
      <section className="places-section" aria-label="Places visited">
        <div className="places-heading">
          <h2>
            {heading}
            <span className="heading-heart" aria-hidden="true">
              ♡
            </span>
          </h2>
          <span className="explored-badge">
            <MapPin size={15} />
            {groups.length}
            {!loaded ? '+' : ''} explored
          </span>
        </div>
        <div className="explore-toolbar">
          <div className="view-switch" role="group" aria-label="Choose view">
            <button
              aria-pressed={view === 'map'}
              onClick={() => setParams({ view: 'map' }, { replace: true })}
            >
              <Map size={18} />
              Map view
            </button>
            <button
              aria-pressed={view === 'list'}
              onClick={() => setParams({ view: 'list' }, { replace: true })}
            >
              <List size={18} />
              List <span>({groups.length})</span>
            </button>
          </div>
          <span className="visit-total">{visits.length} visits together</span>
        </div>
        <div className="place-filters" role="group" aria-label="Filter places">
          {['All', 'Food', 'Adventure', 'Need a pin'].map((name) => (
            <button
              key={name}
              aria-pressed={filter === name}
              onClick={() => {
                setFilter(name);
                setSelectedKey(null);
              }}
            >
              {name === 'Food' ? (
                <Utensils size={14} />
              ) : name === 'Adventure' ? (
                <Mountain size={15} />
              ) : null}
              {name}
            </button>
          ))}
        </div>
        <div className="places-search">
          <Search size={20} />
          <input
            aria-label="Search places"
            placeholder="Find a place or memory…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedKey(null);
            }}
          />
          {query && (
            <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={17} />
            </button>
          )}
        </div>
        {placesStatus === 'LoadingFirstPage' ? (
          <Spinner />
        ) : view === 'map' ? (
          <>
            <div className="map-shell">
              <PlacesMap places={pins} selectedId={selected?.key} onSelect={setSelectedKey} />
              {selected ? (
                <div className="map-place-card">
                  <button
                    className="icon-button close-place"
                    aria-label="Close selected place"
                    onClick={() => setSelectedKey(null)}
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
                    <a href={mapsLink(selected.visit)} target="_blank" rel="noreferrer">
                      <Navigation size={16} />
                      Google Maps
                    </a>
                    <Link className="button primary" to={`/visits/${selected.entries[0]._id}`}>
                      View notes
                      <ArrowRight size={17} />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="map-hint">
                  <Heart size={15} />
                  {pins.length ? 'Tap a heart to open your notes' : 'No pinned places in this view'}
                </div>
              )}
            </div>
            <div className="map-caption">
              <span>
                {pins.length} pinned {pins.length === 1 ? 'place' : 'places'}
              </span>
              {unpinned > 0 && (
                <button
                  onClick={() => {
                    setFilter('Need a pin');
                    setParams({ view: 'list' }, { replace: true });
                  }}
                >
                  {unpinned} waiting for a pin <ArrowRight size={14} />
                </button>
              )}
            </div>
            {matching.length === 0 && (
              <p className="no-results">No matching places. Try another search or filter.</p>
            )}
          </>
        ) : (
          <div className="places-list">
            {matching.length ? (
              matching.map(({ key, entries, visit }) => (
                <article key={key} className="place-row">
                  <span className={`place-row-icon ${visit.showDishes ? '' : 'sage'}`}>
                    {visit.showDishes ? <Utensils size={21} /> : <Mountain size={22} />}
                  </span>
                  <div className="place-row-body">
                    <h3>
                      <Link to={`/visits/${entries[0]._id}`}>{visit.title}</Link>
                    </h3>
                    <p>
                      {visit.place} · {entries.length} {entries.length === 1 ? 'visit' : 'visits'}
                    </p>
                    <div className="place-row-links">
                      <a href={mapsLink(visit)} target="_blank" rel="noreferrer">
                        Google Maps
                        <Navigation size={12} />
                      </a>
                      {!visit.location && (
                        <Link to={`/visits/${visit._id}/edit`}>
                          Set pin
                          <MapPin size={12} />
                        </Link>
                      )}
                    </div>
                    {entries.length > 1 && (
                      <div className="repeat-visits">
                        {[...entries]
                          .sort((a, b) => (a.visitNumber ?? 1) - (b.visitNumber ?? 1))
                          .map((v) => (
                            <Link key={v._id} to={`/visits/${v._id}`}>
                              Visit {v.visitNumber ?? 1}
                              <ArrowRight size={12} />
                            </Link>
                          ))}
                      </div>
                    )}
                  </div>
                  {visit.location && (
                    <button
                      className="icon-button"
                      aria-label={`Show ${visit.title} on map`}
                      onClick={() => {
                        setSelectedKey(key);
                        setParams({ view: 'map' }, { replace: true });
                      }}
                    >
                      <MapPin size={20} />
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p className="no-results">No matching places. Try another search or filter.</p>
            )}
          </div>
        )}
      </section>
      <section className="recent-section" aria-label="Recent dates">
        <div className="recent-heading">
          <h2>
            <span aria-hidden="true" />
            Recent dates
          </h2>
          <span>
            {recent.length} of {visits.length}
            {!loaded ? '+' : ''} visits
          </span>
        </div>
        {recent.some((v) => !v.date) && (
          <p className="undated-note">Undated visits from your notes appear after dated visits.</p>
        )}
        {status === 'LoadingFirstPage' ? (
          <Spinner />
        ) : recent.length ? (
          <div className="memory-grid">
            {recent.map((visit) => (
              <VisitCard key={visit._id} visit={visit} />
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
        {(status === 'CanLoadMore' || status === 'LoadingMore') && (
          <button
            className="button secondary load-more"
            disabled={status === 'LoadingMore'}
            onClick={() => loadMore(6)}
          >
            More dates
            <ChevronDown size={17} />
          </button>
        )}
      </section>
      {addingMember && (
        <Modal title="Add member" onClose={() => setAddingMember(false)}>
          <Invitations boardId={id} />
        </Modal>
      )}
    </div>
  );
}
