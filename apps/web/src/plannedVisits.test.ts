import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vite-plus/test';
import { getFunctionName } from 'convex/server';
import { VisitPage } from './Visit';

const fixture = vi.hoisted(() => ({ planned: true }));
vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(ref) === 'boards:me') return { _id: 'member', name: 'Member' };
    return {
      visit: {
        _id: 'visit',
        boardId: 'board',
        creatorId: 'member',
        status: fixture.planned ? 'planned' : undefined,
        title: 'Bakehouse Bistro',
        date: '',
        place: 'Indiranagar',
        notes: 'Cinnamon rolls and cold brew',
        savedLink: 'https://example.com/menu',
        typeName: 'Food',
        showDishes: true,
      },
      board: { _id: 'board', name: 'Dates', accent: 'coral' },
      ratings: [],
      people: [],
      members: [],
      categories: [],
      dishes: [{ _id: 'dish', name: 'Cold brew' }],
      photos: [],
      isAdmin: true,
    };
  },
}));
vi.mock('./Photos', () => ({
  PhotoSection: () => createElement('section', { 'aria-label': 'Photos' }),
  usePhotoUpload: () => ({}),
}));
function page() {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/visits/visit'] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/visits/:visitId', element: createElement(VisitPage) }),
      ),
    ),
  );
}
describe('shared visit page lifecycle', () => {
  it('shows a plan with its notes, dishes, photos and saved link, without rating controls', () => {
    fixture.planned = true;
    const html = page();
    expect(html).toContain('Planned');
    expect(html).toContain('Mark as visited');
    expect(html).toContain('Cinnamon rolls and cold brew');
    expect(html).toContain('Cold brew');
    expect(html).toContain('aria-label="Photos"');
    expect(html).toContain('https://example.com/menu');
    expect(html).not.toContain('visit-ratings');
    expect(html).not.toContain('individual-ratings');
  });
  it('restores rating controls in the same layout after visiting', () => {
    fixture.planned = false;
    const html = page();
    expect(html).toContain('Cinnamon rolls and cold brew');
    expect(html).toContain('Cold brew');
    expect(html).toContain('visit-ratings');
    expect(html).toContain('individual-ratings');
    expect(html).not.toContain('Mark as visited');
  });
});
