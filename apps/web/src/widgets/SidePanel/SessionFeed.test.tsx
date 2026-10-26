import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { SessionFeed } from './SessionFeed';

const mocks = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('entities/SurfSession', () => ({
  useSessionFeed: () => ({
    data: {
      pages: [{
        items: [{
          id: 'session-1',
          spotId: 'spot-1',
          photographerId: 'photographer-1',
          startsAt: new Date('2026-06-24T06:00:00.000Z'),
          endsAt: new Date('2026-06-24T10:00:00.000Z'),
          status: 'PUBLISHED',
          createdAt: new Date('2026-06-24T11:00:00.000Z'),
          spot: { id: 'spot-1', slug: 'pipeline', name: 'Pipeline', location: 'Oahu' },
          photographer: { id: 'photographer-1', name: 'Kai' },
          thumbnailUrl: 'https://example.com/session.jpg',
          mediaCount: 1,
        }],
        nextCursor: null,
      }],
    },
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    refetch: mocks.refetch,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
  }),
}));

describe('SessionFeed', () => {
  beforeEach(() => {
    mocks.isLoading = false;
    mocks.isError = false;
    mocks.refetch.mockClear();
  });

  it('reports layout readiness only while real session cards are committed', () => {
    const onLayoutReadyChange = vi.fn();
    mocks.isLoading = true;
    const { rerender, unmount } = render(
      <MantineProvider>
        <AppShellLayoutPolicyProvider routeIntent="browse" browseExpanded={false} galleryExpanded={false}>
          <SessionFeed onLayoutReadyChange={onLayoutReadyChange} />
        </AppShellLayoutPolicyProvider>
      </MantineProvider>,
    );

    expect(onLayoutReadyChange).not.toHaveBeenCalled();

    mocks.isLoading = false;
    rerender(
      <MantineProvider>
        <AppShellLayoutPolicyProvider routeIntent="browse" browseExpanded={false} galleryExpanded={false}>
          <SessionFeed onLayoutReadyChange={onLayoutReadyChange} />
        </AppShellLayoutPolicyProvider>
      </MantineProvider>,
    );

    expect(onLayoutReadyChange).toHaveBeenLastCalledWith(true);

    unmount();

    expect(onLayoutReadyChange).toHaveBeenLastCalledWith(false);
  });

  it('shows a retry panel instead of the empty state when the primary session query fails', () => {
    mocks.isError = true;

    render(
      <MantineProvider>
        <AppShellLayoutPolicyProvider routeIntent="browse" browseExpanded={false} galleryExpanded={false}>
          <SessionFeed />
        </AppShellLayoutPolicyProvider>
      </MantineProvider>,
    );

    expect(screen.getByRole('heading', { name: "Couldn't load the feed" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});


it('exposes a real session anchor and preserves modified-click navigation', () => {
  mocks.isError = false;
  mocks.isLoading = false;
  const onSessionClick = vi.fn();
  render(<MantineProvider><AppShellLayoutPolicyProvider routeIntent="browse" browseExpanded={false} galleryExpanded={false}><SessionFeed onSessionClick={onSessionClick} /></AppShellLayoutPolicyProvider></MantineProvider>);
  const link = screen.getByRole('link', { name: /Pipeline/ });
  expect(link).toHaveAttribute('href', '/pipeline/session/session-1');
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link, { ctrlKey: true });
  expect(onSessionClick).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(onSessionClick).toHaveBeenCalledOnce();
});
