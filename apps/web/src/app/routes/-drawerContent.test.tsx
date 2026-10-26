import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spotPublicDocument, staticPublicDocument, type SurfSessionItem } from '@swelldays/contracts/core';

const context = vi.hoisted(() => ({ filters: { date: 'today', favoriteSpotsOnly: false } }));
vi.mock('../lib/panelContexts', () => ({
  usePanelFilter: () => ({ filters: context.filters, clearFilters: () => {} }),
  usePanelFeedLayoutReadyChange: () => () => {},
  usePanelExpanded: () => false,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useNavigate: () => () => {},
  useMatch: () => ({ id: 'spot-1', slug: 'pipeline' }),
}));
vi.mock('widgets/SidePanel', () => ({
  SessionFeed: ({ filters, spotId }: { filters: { date: string }; spotId?: string }) => <div data-content="feed" data-date={filters.date} data-spot={spotId} />,
}));
vi.mock('features/PublicGallery', () => ({
  PublicGallery: ({ filters, spotId }: { filters: { date: string }; spotId?: string }) => <div data-content="gallery" data-date={filters.date} data-spot={spotId} />,
}));
vi.mock('widgets/SessionDetail', () => ({
  SessionDetail: ({ session }: { session: { id: string } }) => <div data-content="session" data-session={session.id} />,
}));

import { Route as Home } from './_panel.index';
import { Route as Gallery } from './_panel.gallery';
import { Route as Spot } from './_panel.$spotId.index';
import { Route as SpotGallery } from './_panel.$spotId.gallery';
import { Route as Session } from './_panel.$spotId.session.$sessionId';

const spot = { id: 'spot-1', slug: 'pipeline', name: 'Pipeline', location: 'Hawaii', coords: { lat: 1, lng: 2 } };
const session: SurfSessionItem = {
  id: '11111111-1111-4111-8111-111111111111', spotId: spot.id, photographerId: 'user-1',
  startsAt: new Date('2026-01-01T10:00:00Z'), endsAt: new Date('2026-01-01T11:00:00Z'),
  status: 'PUBLISHED', createdAt: new Date('2026-01-01'), spot,
  photographer: { id: 'user-1', name: 'Kai' }, mediaCount: 1, thumbnailUrl: null,
};
afterEach(() => { vi.restoreAllMocks(); context.filters.date = 'today'; });

describe('approved discovery drawer', () => {
  it('home contains only the existing date-filtered feed', () => {
    vi.spyOn(Home, 'useLoaderData').mockReturnValue(staticPublicDocument('home'));
    const View = Home.options.component;
    if (typeof View !== 'function') throw new Error('Expected feed view');
    expect(renderToStaticMarkup(<View />)).toBe('<div data-content="feed" data-date="today"></div>');
    context.filters.date = 'yesterday';
    expect(renderToStaticMarkup(<View />)).toBe('<div data-content="feed" data-date="yesterday"></div>');
  });
  it('gallery contains only the existing date-filtered media content', () => {
    vi.spyOn(Gallery, 'useLoaderData').mockReturnValue(staticPublicDocument('gallery'));
    const View = Gallery.options.component;
    if (typeof View !== 'function') throw new Error('Expected gallery view');
    expect(renderToStaticMarkup(<View />)).toBe('<div data-content="gallery" data-date="today"></div>');
  });
  it('spot feed keeps its selected spot and date without an extra link list', () => {
    vi.spyOn(Spot, 'useParams').mockReturnValue({ spotId: spot.slug });
    vi.spyOn(Spot, 'useLoaderData').mockReturnValue(spotPublicDocument(spot, false, [session]));
    const View = Spot.options.component;
    if (typeof View !== 'function') throw new Error('Expected spot feed');
    expect(renderToStaticMarkup(<View />)).toBe('<div data-content="feed" data-date="today" data-spot="spot-1"></div>');
  });
  it('spot gallery keeps its selected spot and date without an extra text block', () => {
    vi.spyOn(SpotGallery, 'useLoaderData').mockReturnValue({ spot, document: spotPublicDocument(spot, true, [session]) });
    const View = SpotGallery.options.component;
    if (typeof View !== 'function') throw new Error('Expected spot gallery');
    expect(renderToStaticMarkup(<View />)).toBe('<div data-content="gallery" data-date="today" data-spot="spot-1"></div>');
  });
  it('session drawer renders its existing media view without an injected heading or nav', () => {
    vi.spyOn(Session, 'useLoaderData').mockReturnValue(session);
    const View = Session.options.component;
    if (typeof View !== 'function') throw new Error('Expected session view');
    expect(renderToStaticMarkup(<View />)).toBe(`<div data-content="session" data-session="${session.id}"></div>`);
  });
});
