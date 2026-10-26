import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useFirstVisitMapReadiness, useFirstVisitPresentation } from 'features/FirstVisit';
import { FirstVisitBoundary } from './FirstVisitBoundary';

let mounts = 0;
function AppProbe() {
  const presentation = useFirstVisitPresentation();
  const { markMapReady } = useFirstVisitMapReadiness();
  useEffect(() => { mounts += 1; markMapReady(); }, [markMapReady]);
  return <><input aria-label="Selected date" defaultValue="2026-10-25" /><button type="button" onClick={() => presentation?.open()}>Open presentation</button></>;
}
function Shell() {
  const location = useLocation();
  return <FirstVisitBoundary isEligibleRoute={location.pathname === '/'} isSessionLoading={false} isAuthenticated><AppProbe /></FirstVisitBoundary>;
}
function setup(href: string) {
  const history = createMemoryHistory({ initialEntries: [href] });
  const root = createRootRoute({ component: Shell });
  const home = createRoute({ getParentRoute: () => root, path: '/' });
  const spot = createRoute({ getParentRoute: () => root, path: '/$spotId' });
  const router = createRouter({ routeTree: root.addChildren([home, spot]), history, defaultPendingMinMs: 0 });
  render(<RouterProvider router={router} />);
  return router;
}
const title = /surf photos & videos/i;
beforeEach(() => { window.localStorage.clear(); mounts = 0; vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
describe('presentation navigation', () => {
  it('preserves the selected route and date through intro, Back, Forward and map entry', async () => {
    const router = setup('/uluwatu?date=2026-10-25');
    const date = await screen.findByRole('textbox', { name: 'Selected date' });
    fireEvent.change(date, { target: { value: '2026-10-24' } });
    screen.getByRole('button', { name: 'Open presentation' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Open presentation' }));
    await screen.findByRole('heading', { name: title });
    expect(router.history.location.href).toBe('/uluwatu?date=2026-10-25#intro');
    expect(screen.getByRole('heading', { name: title })).toHaveFocus();
    act(() => router.history.back());
    await waitFor(() => expect(screen.queryByRole('heading', { name: title })).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Selected date' })).toBe(date);
    expect(date).toHaveValue('2026-10-24');
    expect(screen.getByRole('button', { name: 'Open presentation' })).toHaveFocus();
    act(() => router.history.forward());
    await screen.findByRole('heading', { name: title });
    fireEvent.click(screen.getByRole('link', { name: 'Find my photos' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: title })).toBeNull());
    expect(router.history.location.href).toBe('/uluwatu?date=2026-10-25');
    expect(screen.getByRole('textbox', { name: 'Selected date' })).toBe(date);
    expect(date).toHaveValue('2026-10-24');
    expect(mounts).toBe(1);
  });
  it('does not intercept an initial entity URL containing #intro', async () => {
    setup('/uluwatu#intro');
    await screen.findByRole('textbox', { name: 'Selected date' });
    expect(screen.queryByRole('heading', { name: title })).toBeNull();
  });
  it('handles direct intro/map links and reopens on browser Back', async () => {
    const router = setup('/#intro');
    await screen.findByRole('heading', { name: title });
    fireEvent.click(screen.getByRole('link', { name: 'Find my photos' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: title })).toBeNull());
    expect(router.history.location.href).toBe('/#map');
    act(() => { void router.navigate({ to: '/', hash: 'intro' }); });
    await screen.findByRole('heading', { name: title });
    act(() => router.history.back());
    await waitFor(() => expect(screen.queryByRole('heading', { name: title })).toBeNull());
    act(() => router.history.forward());
    await screen.findByRole('heading', { name: title });
    expect(mounts).toBe(1);
  });
});
