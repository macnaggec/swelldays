import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { useFirstVisitMapReadiness } from '../model/firstVisitMapReadiness';
import { FIRST_VISIT_STORAGE_KEY } from '../model/firstVisitStorage';
import { FirstVisitGate } from './FirstVisitGate';

const TITLE = /surf photos & videos/i;

function MapSurface() {
  const { markMapReady } = useFirstVisitMapReadiness();

  return (
    <button type="button" onClick={markMapReady}>
      Mark map ready
    </button>
  );
}

function renderGate({
  isEligibleRoute = true,
  isSessionLoading = false,
  isAuthenticated = false,
} = {}) {
  return render(
    <FirstVisitGate
      isEligibleRoute={isEligibleRoute}
      isSessionLoading={isSessionLoading}
      isAuthenticated={isAuthenticated}
    >
      <MapSurface />
    </FirstVisitGate>,
  );
}

const markMapReady = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Mark map ready', hidden: true }));
};

/** A third of the screen is the commit line, so both sides of it are worth naming. */
const commitLinePx = () => window.innerHeight / 3;

/**
 * Drags upward by `distancePx` of effective travel, then lifts the finger. The
 * first move only crosses the engagement slop, which is where the drag
 * re-anchors, so the second move carries the whole measured distance.
 */
const dragUpBy = (surface: HTMLElement, distancePx: number) => {
  const start = window.innerHeight;
  fireEvent.touchStart(surface, { touches: [{ clientY: start }] });
  fireEvent.touchMove(surface, { touches: [{ clientY: start - 40 }] });
  fireEvent.touchMove(surface, { touches: [{ clientY: start - 30 - distancePx }] });
  fireEvent.touchEnd(surface, {});
};

/** Longer than the pause that stands in for a trackpad's fingers lifting. */
const PAST_WHEEL_IDLE_MS = 300;
const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

describe('FirstVisitGate', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('shows the introduction with its prompt to a first-time visitor', () => {
    renderGate();

    expect(screen.getByRole('heading', { name: TITLE })).not.toBeNull();
    expect(screen.getByText('Buy · Sell · Share')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Enter the map' })).not.toBeNull();
  });

  it('holds the app behind an opaque cover without showing intro copy while the session resolves', () => {
    const { container } = renderGate({ isSessionLoading: true });

    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    expect(container.querySelector('[data-first-visit-state="checking-session"]')).not.toBeNull();
    expect(container.querySelector('[data-first-visit-app]')).toHaveAttribute('inert');
  });

  it('keeps an early entry request covered until the map reports ready', async () => {
    const user = userEvent.setup();
    const { container } = renderGate();

    await user.click(screen.getByRole('button', { name: 'Enter the map' }));

    expect(screen.getByRole('button', { name: 'Preparing the map' })).toBeDisabled();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();

    await markMapReady(user);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    });
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBe('seen');
    expect(container.querySelector('[data-first-visit-app]')).not.toHaveAttribute('inert');
  });

  it('enters when the prompt is pressed after the map is ready', async () => {
    const user = userEvent.setup();
    renderGate();

    await markMapReady(user);
    await user.click(screen.getByRole('button', { name: 'Enter the map' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    });
  });

  it('enters when the finger lifts past a third of the screen', async () => {
    const user = userEvent.setup();
    renderGate();

    await markMapReady(user);
    dragUpBy(screen.getByRole('dialog'), commitLinePx() + 40);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    });
  });

  it('returns to the introduction when the finger lifts just short of a third of the screen', async () => {
    const user = userEvent.setup();
    renderGate();

    await markMapReady(user);
    dragUpBy(screen.getByRole('dialog'), commitLinePx() - 40);

    await wait(PAST_WHEEL_IDLE_MS);

    expect(screen.getByRole('heading', { name: TITLE })).not.toBeNull();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });

  it('ignores the trackpad momentum that keeps arriving after the release', async () => {
    const user = userEvent.setup();
    renderGate();

    await markMapReady(user);
    const surface = screen.getByRole('dialog');

    // A short scroll, below half the screen, so the release sends it back.
    fireEvent.wheel(surface, { deltaY: window.innerHeight * 0.2 });
    await wait(PAST_WHEEL_IDLE_MS);

    // Momentum still arriving must not reopen the drag and carry it over the
    // line — that is what could leave the introduction parked half way.
    fireEvent.wheel(surface, { deltaY: window.innerHeight * 0.5 });
    fireEvent.wheel(surface, { deltaY: window.innerHeight * 0.5 });
    await wait(700);

    expect(screen.getByRole('heading', { name: TITLE })).not.toBeNull();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });

  it('stays on the introduction while the finger is still down', async () => {
    const user = userEvent.setup();
    renderGate();

    await markMapReady(user);

    const surface = screen.getByRole('dialog');
    fireEvent.touchStart(surface, { touches: [{ clientY: 600 }] });
    fireEvent.touchMove(surface, { touches: [{ clientY: 560 }], timeStamp: 40 });
    fireEvent.touchMove(surface, { touches: [{ clientY: 120 }], timeStamp: 400 });

    expect(screen.getByRole('heading', { name: TITLE })).not.toBeNull();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });

  it('returns to the introduction when the swipe falls short of the threshold', async () => {
    const user = userEvent.setup();
    renderGate();

    await markMapReady(user);

    const surface = screen.getByRole('dialog');
    fireEvent.touchStart(surface, { touches: [{ clientY: 600 }] });
    fireEvent.touchMove(surface, { touches: [{ clientY: 585 }], timeStamp: 200 });
    fireEvent.touchMove(surface, { touches: [{ clientY: 578 }], timeStamp: 600 });
    fireEvent.touchEnd(surface, {});

    expect(screen.getByRole('heading', { name: TITLE })).not.toBeNull();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBeNull();
  });

  it('ignores a tap that never travels far enough to be a drag', async () => {
    const user = userEvent.setup();
    renderGate();

    await markMapReady(user);

    const surface = screen.getByRole('dialog');
    fireEvent.touchStart(surface, { touches: [{ clientY: 600 }] });
    fireEvent.touchMove(surface, { touches: [{ clientY: 596 }], timeStamp: 60 });
    fireEvent.touchEnd(surface, {});

    expect(screen.getByRole('heading', { name: TITLE })).not.toBeNull();
  });

  it('hands the app back after entering in review mode', async () => {
    window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
    window.history.replaceState({}, '', '/?firstVisitReview=1');

    const user = userEvent.setup();
    const { container } = renderGate();

    await markMapReady(user);
    await user.click(screen.getByRole('button', { name: 'Enter the map' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    });
    expect(container.querySelector('[data-first-visit-app]')).not.toHaveAttribute('inert');
  });

  it('lets an authenticated returning visitor explicitly reopen review mode', () => {
    window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
    window.history.replaceState({}, '', '/?firstVisitReview=1');

    renderGate({ isAuthenticated: true });

    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.getByRole('heading', { name: TITLE })).not.toBeNull();
  });

  it('bypasses the introduction for authenticated visitors and remembers the bypass', async () => {
    renderGate({ isAuthenticated: true });

    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    await waitFor(() => {
      expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBe('seen');
    });
  });

  it('bypasses the introduction for returning visitors', () => {
    window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
    renderGate();

    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
  });

  it('bypasses the introduction for direct links', () => {
    renderGate({ isEligibleRoute: false });

    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
  });
});
