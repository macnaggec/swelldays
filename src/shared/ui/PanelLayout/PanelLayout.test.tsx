import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PanelSettledWidthContext } from 'shared/ui/DrawerShell/panelSettledWidth';
import { PanelLayout, PanelLayoutRail } from './PanelLayout';

/** As in PanelCollectionGrid.test.tsx: drives a chosen contentRect width on demand. */
function stubResizeObserver() {
  let capturedCallback: ResizeObserverCallback | null = null;
  let observedTarget: Element | null = null;

  class ResizeObserverStub implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      capturedCallback = callback;
    }

    observe(target: Element) {
      observedTarget = target;
    }

    unobserve() {}

    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverStub);

  return {
    emit(width: number) {
      if (!capturedCallback || !observedTarget) {
        throw new Error('ResizeObserver was never constructed and observed');
      }
      const size: ResizeObserverSize = { blockSize: 0, inlineSize: width };
      const inertObserver: ResizeObserver = { observe() {}, unobserve() {}, disconnect() {} };
      act(() => {
        capturedCallback!(
          [{
            borderBoxSize: [size],
            contentBoxSize: [size],
            contentRect: DOMRectReadOnly.fromRect({ width, height: 0, x: 0, y: 0 }),
            devicePixelContentBoxSize: [size],
            target: observedTarget!,
          }],
          inertObserver,
        );
      });
    },
  };
}

const atDrawer = (destinationWidth: number, transitioning: boolean) => (
  <PanelSettledWidthContext.Provider value={{ destinationWidth, transitioning }}>
    <PanelLayout>content</PanelLayout>
  </PanelSettledWidthContext.Provider>
);

describe('PanelLayout destination width', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('holds the destination width for the whole drawer transition, then releases it', () => {
    const resizeObserver = stubResizeObserver();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 320, height: 0, x: 0, y: 0 }),
    );

    const { container, rerender } = render(atDrawer(320, false));
    const root = () => container.querySelector('[data-panel-layout]') as HTMLElement;

    // At rest the panel simply fills the drawer.
    expect(root().style.width).toBe('');

    // The toggle is pressed. The surface has not moved yet, so the panel must already
    // be laid out for where it is going: its content then reflows once, not per frame.
    rerender(atDrawer(960, true));
    expect(root().style.width).toBe('960px');

    // Widths swept through mid-animation must not disturb it.
    resizeObserver.emit(600);
    expect(root().style.width).toBe('960px');

    // Settled: hand sizing back to the drawer.
    resizeObserver.emit(960);
    rerender(atDrawer(960, false));
    expect(root().style.width).toBe('');
  });

  it('keeps its current width while closing, so the panel slides out in one piece', () => {
    const resizeObserver = stubResizeObserver();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 960, height: 0, x: 0, y: 0 }),
    );

    const { container, rerender } = render(atDrawer(960, false));
    const root = () => container.querySelector('[data-panel-layout]') as HTMLElement;

    // Closing must not narrow the content first: the surface is still wide, so content
    // shrunk to the destination would be stranded against its far edge with the columns
    // that no longer fit clipped away.
    rerender(atDrawer(320, true));
    expect(root().style.width).toBe('960px');

    // Still held part-way through, however narrow the surface has become by then.
    resizeObserver.emit(500);
    expect(root().style.width).toBe('960px');

    // Arrived: sizing goes back to the drawer and the narrow arrangement appears.
    rerender(atDrawer(320, false));
    expect(root().style.width).toBe('');
  });

  it('pins no width outside a drawer, where measured width is already the settled one', () => {
    stubResizeObserver();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 1000, height: 0, x: 0, y: 0 }),
    );

    const { container } = render(<PanelLayout>content</PanelLayout>);
    const root = container.querySelector('[data-panel-layout]') as HTMLElement;
    expect(root.style.width).toBe('');
  });
});

describe('PanelLayoutRail', () => {
  it('pins rail content beside the scroller, outside the scroll owner', () => {
    render(
      <PanelLayout>
        <div>Scrolled content</div>
        <PanelLayoutRail>
          <nav>Date rail</nav>
        </PanelLayoutRail>
      </PanelLayout>,
    );

    const rail = screen.getByText('Date rail');
    expect(rail.closest('[data-panel-layout-rail]')).not.toBeNull();
    expect(rail.closest('[data-panel-scroll-owner]')).toBeNull();
    expect(screen.getByText('Scrolled content').closest('[data-panel-scroll-owner]')).not.toBeNull();
  });

  it('renders nothing when mounted outside a PanelLayout', () => {
    render(
      <PanelLayoutRail>
        <nav>Date rail</nav>
      </PanelLayoutRail>,
    );

    expect(screen.queryByText('Date rail')).toBeNull();
  });
});
