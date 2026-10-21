import { createElement } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@nico-notes/backend/api';
import { VisitCard } from './BoardDashboard';
import { safeExternalUrl } from './Wishlist';

type Visit = FunctionReturnType<typeof api.visits.list>['page'][number];
const visit = {
  _id: 'visit',
  _creationTime: 0,
  boardId: 'board',
  creatorId: 'person',
  title: 'Our cafe',
  date: '',
  place: '',
  notes: '',
  typeName: 'Food',
  showDishes: true,
  photoId: null,
  photoIds: [],
  photoCount: 0,
  dishCount: 1,
  highlights: ['Coffee'],
  dishAverage: 9,
  overall: null,
} as unknown as Visit;
function card(value: Visit) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(VisitCard, { visit: value, variant: 'editorial', members: [] }),
    ),
  );
}
describe('release-facing rating meaning', () => {
  it('does not label dish-only scores as an overall visit rating', () => {
    const html = card(visit);
    expect(html).not.toContain('title="Overall visit rating"');
    expect(html).toContain('Our cafe');
    expect(html).toContain('Coffee');
  });
  it('shows an explicitly provided overall rating', () => {
    const html = card({ ...visit, overall: 7.5 });
    expect(html).toContain('title="Overall visit rating"');
    expect(html).toContain('7.5');
  });
});
describe('saved recommendation links', () => {
  it('only opens standard web protocols, including legacy unvalidated entries', () => {
    expect(safeExternalUrl('https://example.com/place')).toBe('https://example.com/place');
    expect(safeExternalUrl('http://example.com/place')).toBe('http://example.com/place');
    expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeExternalUrl('data:text/html,hello')).toBeUndefined();
    expect(safeExternalUrl('/somewhere')).toBeUndefined();
  });
});
