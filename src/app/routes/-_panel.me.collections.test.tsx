import { screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { Route } from './_panel.me.collections';

const mocks = vi.hoisted(() => ({
  sessions: [
    {
      id: 'session-1',
      spotId: 'spot-1',
      photographerId: 'photographer-1',
      status: 'PUBLISHED',
      thumbnailUrl: null,
      startsAt: new Date('2026-06-01T06:00:00.000Z'),
      endsAt: new Date('2026-06-01T08:00:00.000Z'),
      createdAt: new Date('2026-06-01T05:00:00.000Z'),
      mediaCount: 2,
      spot: { id: 'spot-1', name: 'Pipeline', location: 'North Shore' },
      photographer: { id: 'photographer-1', name: 'Kai' },
    },
    {
      id: 'session-2',
      spotId: 'spot-2',
      photographerId: 'photographer-1',
      status: 'PUBLISHED',
      thumbnailUrl: null,
      startsAt: new Date('2026-06-02T06:00:00.000Z'),
      endsAt: new Date('2026-06-02T08:00:00.000Z'),
      createdAt: new Date('2026-06-02T05:00:00.000Z'),
      mediaCount: 3,
      spot: { id: 'spot-2', name: 'Uluwatu', location: 'Bali' },
      photographer: { id: 'photographer-1', name: 'Kai' },
    },
  ],
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
  Outlet: () => <div data-testid="collections-outlet" />,
  useNavigate: () => vi.fn(),
  useRouterState: () => 'uploads',
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({
      data: mocks.sessions,
      isLoading: false,
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    sessions: {
      mine: {
        queryOptions: () => ({}),
      },
    },
  }),
}));

describe('CollectionsLayout', () => {
  it('owns the collection state tabs and outlet', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(
      <PanelLayout>
        <Component />
      </PanelLayout>,
    );

    expect(screen.getByText('Uploads')).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByTestId('collections-outlet')).toBeInTheDocument();
  });

  it('places the upload spot filter in the same pills toolbar as the tabs', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(
      <PanelLayout>
        <Component />
      </PanelLayout>,
    );

    const toolbar = screen.getByTestId('collections-toolbar');
    expect(toolbar).not.toHaveAttribute('data-panel-scroll-hide');
    expect(toolbar.closest('[data-panel-scroll-chrome]')).not.toBeNull();
    expect(within(toolbar).getByTestId('collections-tabs')).toHaveAttribute('data-variant', 'pills');
    expect(within(toolbar).getByRole('textbox', { name: 'Filter uploads by spot' })).toBeInTheDocument();
  });
});
