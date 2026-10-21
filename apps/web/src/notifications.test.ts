import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vite-plus/test';
import { BoardNotifications } from './Notifications';
import type { Id } from '@nico-notes/backend/dataModel';

const fixture = vi.hoisted(() => ({
  status: 'Exhausted',
  results: [] as Array<{
    _id: string;
    actorName: string;
    summary: string;
    createdAt: number;
    unread: boolean;
    visitId: string | null;
  }>,
}));
vi.mock('convex/react', () => ({
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
  });
  it('shows loading before displaying an empty feed', () => {
    fixture.results = [];
    fixture.status = 'LoadingFirstPage';
    const html = render();
    expect(html).toContain('Loading notifications');
    expect(html).not.toContain('No changes yet');
  });
});
