import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PanelSettledWidthContext } from 'shared/ui/DrawerShell/panelSettledWidth';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import {
  PanelLayout,
  PanelLayoutMetadata,
  PanelLayoutRail,
  PanelLayoutStickyChrome,
  PanelLayoutStickyChromeReplacement,
} from './PanelLayout';

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

describe('PanelLayoutStickyChrome', () => {
  it('pins content published deep inside children directly in the scroll owner', () => {
    render(
      <PanelLayout>
        <div>
          <div>
            <PanelLayoutStickyChrome>
              <div>Search and filters</div>
            </PanelLayoutStickyChrome>
          </div>
        </div>
        <div>Scrolled content</div>
      </PanelLayout>,
    );

    const chrome = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    expect(chrome).not.toBeNull();
    expect(chrome?.parentElement?.hasAttribute('data-panel-scroll-owner')).toBe(true);
  });

  it('renders nothing when mounted outside a PanelLayout', () => {
    render(
      <PanelLayoutStickyChrome>
        <div>Search and filters</div>
      </PanelLayoutStickyChrome>,
    );

    expect(screen.queryByText('Search and filters')).toBeNull();
  });

  it('uses one sticky slot to alternate primary browse controls with the active date', () => {
    const layout = (hidden: boolean) => (
      <PanelScrollChromeStateProvider value={{ hidden, drawerPresentation: 'bottomSheet' }}>
        <PanelLayout>
          <PanelLayoutStickyChrome>
            <button type="button">Search and upload</button>
          </PanelLayoutStickyChrome>
          <PanelLayoutStickyChromeReplacement>
            <button type="button">Jump to date</button>
          </PanelLayoutStickyChromeReplacement>
          <div>Gallery cards</div>
        </PanelLayout>
      </PanelScrollChromeStateProvider>
    );

    const view = render(layout(false));
    const search = screen.getByRole('button', { name: 'Search and upload' });
    expect(screen.queryByRole('button', { name: 'Jump to date' })).toBeNull();

    view.rerender(layout(true));

    const date = screen.getByRole('button', { name: 'Jump to date' });
    expect(screen.queryByRole('button', { name: 'Search and upload' })).toBeNull();
    expect(search.closest('[data-panel-scroll-chrome]')).toBe(
      date.closest('[data-panel-scroll-chrome]'),
    );
  });

  it('keeps both rows mounted in the same slot across the switch, so the row never collapses to remeasure', () => {
    const layout = (hidden: boolean) => (
      <PanelScrollChromeStateProvider value={{ hidden, drawerPresentation: 'bottomSheet' }}>
        <PanelLayout>
          <PanelLayoutStickyChrome>
            <button type="button">Search and upload</button>
          </PanelLayoutStickyChrome>
          <PanelLayoutStickyChromeReplacement>
            <button type="button">Jump to date</button>
          </PanelLayoutStickyChromeReplacement>
          <div>Gallery cards</div>
        </PanelLayout>
      </PanelScrollChromeStateProvider>
    );

    const { container, rerender } = render(layout(false));
    const rowsPresent = () => [
      container.querySelector('[data-panel-scroll-chrome-primary]'),
      container.querySelector('[data-panel-scroll-chrome-replacement]'),
    ];

    expect(rowsPresent().every(Boolean)).toBe(true);

    rerender(layout(true));

    expect(rowsPresent().every(Boolean)).toBe(true);
  });
});

describe('PanelLayoutMetadata', () => {
  it('pins metadata content between the header and the scroller, outside the scroll owner', () => {
    render(
      <PanelLayout>
        <div>Scrolled content</div>
        <PanelLayoutMetadata>
          <span>Session metadata</span>
        </PanelLayoutMetadata>
      </PanelLayout>,
    );

    const metadata = screen.getByText('Session metadata');
    expect(metadata.closest('[data-panel-layout-metadata]')).not.toBeNull();
    expect(metadata.closest('[data-panel-scroll-owner]')).toBeNull();
    expect(screen.getByText('Scrolled content').closest('[data-panel-scroll-owner]')).not.toBeNull();
  });

  it('renders nothing when mounted outside a PanelLayout', () => {
    render(
      <PanelLayoutMetadata>
        <span>Session metadata</span>
      </PanelLayoutMetadata>,
    );

    expect(screen.queryByText('Session metadata')).toBeNull();
  });
});
