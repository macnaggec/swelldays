import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useFirstVisitMapReadiness } from '../model/firstVisitMapReadiness';
import { FIRST_VISIT_STORAGE_KEY } from '../model/firstVisitStorage';
import { FirstVisitGate } from './FirstVisitGate';
import { FirstVisitDocument } from './FirstVisitDocument';
import { renderToStaticMarkup } from 'react-dom/server';

const TITLE = /surf photos & videos/i;
function MapSurface() {
  const { markMapReady, markMapFailed, markMapLoading, mapAttempt } = useFirstVisitMapReadiness();
  return <><button type="button" onClick={markMapReady}>Mark map ready</button><button type="button" onClick={() => markMapFailed?.()}>Fail map</button><button type="button" onClick={() => markMapLoading?.()}>Mark map loading</button><output data-testid="map-attempt">{mapAttempt}</output></>;
}
function renderGate({ isEligibleRoute = true, isSessionLoading = false, isAuthenticated = false } = {}) {
  return render(<FirstVisitGate isEligibleRoute={isEligibleRoute} isSessionLoading={isSessionLoading} isAuthenticated={isAuthenticated}><MapSurface /></FirstVisitGate>);
}
const enter = () => screen.getAllByRole('link', { name: 'Find my photos' })[0]!;
const markReady = () => fireEvent.click(screen.getByRole('button', { name: 'Mark map ready', hidden: true }));

describe('FirstVisitGate scroll presentation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });
  it('shows only the two audience paths immediately', () => {
    const { container } = renderGate();
    expect(screen.getByRole('heading', { name: TITLE })).toBeVisible();
    expect(screen.getByText('For surfers')).toBeVisible();
    expect(screen.getByText('For photographers')).toBeVisible();
    expect(container.querySelectorAll('[data-first-visit-document] a')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Find your surf photos' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sell surf photos' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start uploading' })).toHaveAttribute('href', '/upload');
    expect(container.querySelectorAll('[data-first-visit-document]')).toHaveLength(1);
  });
  it('keeps public text readable while auth is resolving', () => {
    renderGate({ isSessionLoading: true });
    expect(screen.getByRole('heading', { name: TITLE })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Find your surf photos' })).toBeVisible();
  });
  it('does not turn a scroll on the hero into map entry', async () => {
    const { container } = renderGate();
    markReady();
    const surface = container.querySelector('[data-first-visit-document]');
    if (!surface) throw new Error('Missing presentation scroll surface');
    fireEvent.wheel(surface, { deltaY: window.innerHeight });
    fireEvent.touchStart(surface, { touches: [{ clientY: 700 }] });
    fireEvent.touchMove(surface, { touches: [{ clientY: 20 }] });
    fireEvent.touchEnd(surface);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.getByRole('heading', { name: TITLE })).toBeVisible();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });
  it('keeps early entry pending until the existing map is ready', async () => {
    const user = userEvent.setup();
    const { container } = renderGate();
    const mapNode = screen.getByRole('button', { name: 'Mark map ready', hidden: true });
    await user.click(enter());
    expect(screen.getByRole('status')).toHaveTextContent('Preparing the map');
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
    expect(container.querySelector('[data-first-visit-app]')).toHaveAttribute('inert');
    markReady();
    await waitFor(() => expect(screen.queryByRole('heading', { name: TITLE })).toBeNull());
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBe('seen');
    expect(screen.getByRole('button', { name: 'Mark map ready' })).toBe(mapNode);
    expect(container.querySelector('[data-first-visit-app]')).not.toHaveAttribute('inert');
  });
  it('allows an early request to be cancelled without completing the visit', async () => {
    const user = userEvent.setup();
    renderGate();
    await user.click(enter());
    await user.click(screen.getByRole('button', { name: 'Keep reading' }));
    markReady();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('heading', { name: TITLE })).toBeVisible();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });
  it('skips the presentation for a returning visitor', () => {
    window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
    renderGate();
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
  });
  it('skips the presentation for authenticated visitors', () => {
    renderGate({ isAuthenticated: true });
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
  });
  it.each(['/#intro', '/?firstVisitReview=1'])('reopens explicitly at %s for an authenticated returning visitor', (url) => {
    window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
    window.history.replaceState({}, '', url);
    renderGate({ isAuthenticated: true });
    expect(screen.getByRole('heading', { name: TITLE })).toBeVisible();
  });
  it('honours explicit map entry ahead of review mode', () => {
    window.history.replaceState({}, '', '/?firstVisitReview=1#map');
    renderGate();
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
  });
  it('keeps direct entity/private routes outside the presentation', () => {
    window.history.replaceState({}, '', '/upload#intro');
    renderGate({ isEligibleRoute: false });
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
  });
  it('does not block entry when storage reads and writes fail', async () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    try {
      renderGate();
      markReady();
      fireEvent.click(enter());
      await waitFor(() => expect(screen.queryByRole('heading', { name: TITLE })).toBeNull());
    } finally { read.mockRestore(); write.mockRestore(); }
  });
});


describe('map entry reliability', () => {
  beforeEach(() => { window.localStorage.clear(); window.history.replaceState({}, '', '/'); });
  it('keeps background map errors quiet until the visitor requests entry', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Fail map', hidden: true }));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(enter());
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the map');
    markReady();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('lets the visitor dismiss a failed entry and keep reading', () => {
    renderGate();
    fireEvent.click(enter());
    fireEvent.click(screen.getByRole('button', { name: 'Fail map', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep reading' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: TITLE })).toBeVisible();
    fireEvent.click(enter());
    expect(screen.getByRole('button', { name: 'Retry map' })).toBeVisible();
  });
  it('hides the prepared application visually without unmounting it', () => {
    const { container } = renderGate();
    expect(container.querySelector('[data-first-visit-app]')).toHaveAttribute('data-app-visible', 'false');
    expect(screen.getByRole('button', { name: 'Mark map ready', hidden: true })).toBeInTheDocument();
  });
  it('continues a click made in the initial HTML and counts its elapsed wait', () => {
    vi.useFakeTimers();
    try {
      document.documentElement.setAttribute('data-first-visit-enter-requested', String(Date.now() - 18_000));
      renderGate();
      expect(screen.getByRole('status')).toHaveTextContent('Preparing the map');
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the map');
    } finally { document.documentElement.removeAttribute('data-first-visit-enter-requested'); vi.useRealTimers(); }
  });
  it('reuses the painted welcome and connects its existing link to the prepared map', async () => {
    const initial = document.createElement('div');
    initial.setAttribute('data-first-visit-preserved', '');
    initial.innerHTML = renderToStaticMarkup(<FirstVisitDocument />);
    document.body.append(initial);
    const heading = initial.querySelector('h1');
    try {
      renderGate();
      expect(screen.getAllByRole('heading', { name: TITLE })).toEqual([heading]);
      fireEvent.click(enter());
      expect(screen.getByRole('status')).toHaveTextContent('Preparing the map');
      markReady();
      await waitFor(() => expect(initial).not.toBeVisible());
      expect(initial.querySelector('h1')).toBe(heading);
    } finally { initial.remove(); }
  });
  it('keeps the intro usable after a map error and retries without completing a visit', async () => {
    renderGate();
    fireEvent.click(enter());
    fireEvent.click(screen.getByRole('button', { name: 'Fail map', hidden: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the map');
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry map' }));
    expect(screen.getByTestId('map-attempt')).toHaveTextContent('1');
    expect(screen.getByRole('status')).toHaveTextContent('Preparing the map');
    markReady();
    await waitFor(() => expect(screen.queryByRole('heading', { name: TITLE })).toBeNull());
  });
  it('offers retry when a pending map never becomes ready', () => {
    vi.useFakeTimers();
    try {
      renderGate();
      fireEvent.click(enter());
      act(() => vi.advanceTimersByTime(20_000));
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the map');
      expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it('moves keyboard focus into the existing app after entering', async () => {
    renderGate();
    markReady();
    enter().focus();
    fireEvent.click(enter(), { detail: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark map ready' })).toHaveFocus());
  });
  it('cancels a pending request on Escape and returns focus to the surfer action', () => {
    renderGate();
    fireEvent.click(enter());
    fireEvent.keyDown(screen.getByRole('status'), { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(enter()).toHaveFocus();
    markReady();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });
  it('does not acknowledge an interrupted reveal after a route change', async () => {
    const view = renderGate();
    markReady();
    fireEvent.click(enter());
    view.rerender(<FirstVisitGate isEligibleRoute={false} isSessionLoading={false} isAuthenticated={false}><MapSurface /></FirstVisitGate>);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });
});

it('waits for the current canvas rather than readiness from an earlier map mount', () => {
  window.localStorage.clear(); window.history.replaceState({}, '', '/');
  renderGate();
  markReady();
  fireEvent.click(screen.getByRole('button', { name: 'Mark map loading', hidden: true }));
  fireEvent.click(enter());
  expect(screen.getByRole('status')).toHaveTextContent('Preparing the map');
  expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
});

it('skips decorative or hidden controls when handing keyboard focus to the app', async () => {
  window.localStorage.clear(); window.history.replaceState({}, '', '/');
  function FocusSurface() {
    const { markMapReady } = useFirstVisitMapReadiness();
    useEffect(markMapReady, [markMapReady]);
    return <><div inert><button type="button">Decorative map</button></div><button type="button">Search sessions</button></>;
  }
  render(<FirstVisitGate isEligibleRoute isAuthenticated={false} isSessionLoading={false}><FocusSurface /></FirstVisitGate>);
  fireEvent.click(enter(), { detail: 0 });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Search sessions' })).toHaveFocus());
});
