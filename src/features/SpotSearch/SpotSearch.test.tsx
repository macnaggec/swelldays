import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import SpotSearch from './SpotSearch';

const mocks = vi.hoisted(() => ({
  addAlias: vi.fn(),
  spots: Array.from({ length: 12 }, (_, index) => ({
    id: `spot-${index}`,
    name: `Bali Spot ${index}`,
    location: 'Bali, Indonesia',
    coords: { lat: -8.65 + index / 100, lng: 115.2 },
  })),
}));

vi.mock('entities/Spot', async (importOriginal) => ({
  ...await importOriginal<typeof import('entities/Spot')>(),
  useAddSpotAlias: () => ({ isPending: false, mutateAsync: mocks.addAlias }),
  useSpots: () => ({ data: mocks.spots, isFetching: false }),
}));

function rect({
  height,
  left,
  top,
  width,
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe('SpotSearch result containment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('bounds portaled results to the keyboard-visible viewport', async () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(390);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844);
    const visualViewport = Object.assign(new EventTarget(), {
      width: 390,
      height: 400,
      offsetLeft: 0,
      offsetTop: 200,
    });
    vi.stubGlobal('visualViewport', visualViewport as unknown as VisualViewport);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this instanceof HTMLInputElement) {
        return rect({ height: 48, left: 16, top: 480, width: 358 });
      }
      return rect({ height: 0, left: 0, top: 0, width: 0 });
    });

    render(<SpotSearch onSpotSelect={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText('Search for a spot...'), 'ba');

    const listbox = await screen.findByRole('listbox');
    const dropdown = listbox.parentElement;
    const resultsScroller = listbox.firstElementChild as HTMLElement | null;

    expect(dropdown).not.toBeNull();
    expect(resultsScroller).not.toBeNull();
    await waitFor(() => {
      expect(dropdown).toHaveAttribute('data-fixed', 'true');
      const availableHeight = Number.parseFloat(
        dropdown!.style.getPropertyValue('--wa-spot-search-available-height'),
      );
      expect(availableHeight).toBeGreaterThan(0);
      expect(Number.parseFloat(dropdown!.style.top) + availableHeight)
        .toBeLessThanOrEqual(visualViewport.offsetTop + visualViewport.height);
    });
    expect(resultsScroller!.style.maxHeight).toContain('--wa-spot-search-results-max-height');
  });
});
