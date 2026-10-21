import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vite-plus/test';
import { BoardNotifications } from './Notifications';
import { projectLivePlaces } from '@nico-notes/backend/livePlaces';
import type { NotificationMessage } from '@nico-notes/backend/notificationText';
import type { Id } from '@nico-notes/backend/dataModel';

const fixture = vi.hoisted(() => ({
  status: 'Exhausted',
  results: [] as Array<{
    _id: string;
    actorName: string;
    summary: string;
    message?: NotificationMessage;
    visitStatus?: 'planned';
    createdAt: number;
    unread: boolean;
    visitId: string | null;
  }>,
}));
vi.mock('./convexLive', () => ({
  useLivePlace: () => undefined,
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
  usePaginatedQuery: () => ({ ...fixture, loadMore: vi.fn() }),
}));
function render() {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(BoardNotifications, { boardId: 'board' as Id<'boards'> }),
    ),
  );
}
describe('Notifications interface', () => {
  it('shows a useful empty state and disables marking an empty feed read', () => {
    fixture.results = [];
    fixture.status = 'Exhausted';
    const html = render();
    expect(html).toContain('No changes yet');
    expect(html).toContain('Mark all as read');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('What’s changed on your board');
  });
  it('shows actors, timestamps, unread changes and links only to available visits', () => {
    fixture.status = 'CanLoadMore';
    fixture.results = [
      {
        _id: 'change-1',
        actorName: 'Alice',
        summary: 'added a visit: “Friday dinner”',
        createdAt: Date.UTC(2026, 9, 20, 12),
        unread: true,
        visitId: 'visit-1',
      },
      {
        _id: 'change-2',
        actorName: 'Bob',
        summary: 'deleted a visit: “Sunday brunch”',
        createdAt: Date.UTC(2026, 9, 19, 12),
        unread: false,
        visitId: null,
      },
    ];
    const html = render();
    expect(html).toContain('Alice');
    expect(html).toContain('Friday dinner');
    expect(html).toContain('dateTime="2026-10-20T12:00:00.000Z"');
    expect(html).toContain('notification-card unread');
    expect(html).toContain('href="/visits/visit-1"');
    expect(html).not.toContain('/visits/null');
    expect(html).toContain('Older notifications');
    expect(html.match(/class="notification-read"/g)).toHaveLength(1);
    expect(html).toContain('Mark as read');
    expect(html).toContain('notification-time muted');
  });
  it('keeps mark all available when the latest notification is read but an older one is unread', () => {
    fixture.results = [
      {
        _id: 'new',
        actorName: 'Alice',
        summary: 'added a visit',
        createdAt: Date.now(),
        unread: false,
        visitId: null,
      },
      {
        _id: 'old',
        actorName: 'Bob',
        summary: 'added a visit',
        createdAt: Date.now() - 60_000,
        unread: true,
        visitId: null,
      },
    ];
    fixture.status = 'Exhausted';
    const html = render();
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('0 sec ago');
    expect(html).toContain('1 min ago');
  });
  it('renders resolved place names, changed fields and wishlist actions', () => {
    fixture.status = 'Exhausted';
    fixture.results = projectLivePlaces(
      [
        {
          _id: 'google-change',
          actorName: 'Alice',
          createdAt: Date.now(),
          unread: true,
          visitId: 'planned-visit',
          visitStatus: 'planned' as const,
          summary: 'updated Saved Google place in the wishlist · Changed: notes',
          message: {
            prefix: 'updated ',
            title: 'Saved Google place',
            suffix: ' in the wishlist · Changed: notes',
            googlePlaceId: 'toit-id',
          },
        },
      ],
      () => ({ id: 'toit-id', name: 'Toit', address: 'Indiranagar' }),
    );
    const html = render();
    expect(html).toContain('updated Toit in the wishlist · Changed: notes');
    expect(html).toContain('View wishlist item');
    expect(html).toContain('href="/visits/planned-visit"');
    expect(html).not.toContain('Saved Google place');
    expect(html).toContain('Google Maps');
  });
  it('shows loading before displaying an empty feed', () => {
    fixture.results = [];
    fixture.status = 'LoadingFirstPage';
    const html = render();
    expect(html).toContain('Loading notifications');
    expect(html).not.toContain('No changes yet');
  });
});
