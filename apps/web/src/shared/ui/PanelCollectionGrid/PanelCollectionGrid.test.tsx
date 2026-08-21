import { useLayoutEffect } from 'react';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PanelSettledWidthContext } from 'shared/ui/DrawerShell/panelSettledWidth';
import { PanelCollectionGrid, usePanelCollectionColumns } from './PanelCollectionGrid';

const mocks = vi.hoisted(() => ({
  drawerPresentation: 'persistent' as string,
}));

vi.mock('shared/model/appShellPresentation', () => ({
  useAppShellLayoutPolicy: () => ({
    drawer: { presentation: mocks.drawerPresentation },
  }),
}));

/**
 * Stubs the global ResizeObserver in the shape used by useMeasuredWidth.test.tsx: a
 * class capturing the callback passed by the hook under test, with observe/unobserve/
 * disconnect as no-ops. Exposes `emit(width)` to drive a resize entry carrying a
 * chosen `contentRect.width`, mirroring the real browser callback shape.
 */
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

    unobserve() { }

    disconnect() { }
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverStub);

  return {
    emit(width: number) {
      if (!capturedCallback || !observedTarget) {
        throw new Error('ResizeObserver was never constructed and observed');
      }
      const size: ResizeObserverSize = { blockSize: 0, inlineSize: width };
      const inertObserver: ResizeObserver = { observe() { }, unobserve() { }, disconnect() { } };
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

const NINE_CHILDREN = Array.from({ length: 9 }, (_, i) => <div key={i}>{i}</div>);

describe('PanelCollectionGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mocks.drawerPresentation = 'persistent';
  });

  it('steps columns, tracks, and the preview reveal together across the captured breakpoints', () => {
    const resizeObserver = stubResizeObserver();

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 296, height: 0, x: 0, y: 0 }),
    );

    const { container } = render(
      <PanelCollectionGrid preview>{NINE_CHILDREN}</PanelCollectionGrid>,
    );

    const getRoot = () => container.querySelector('[data-panel-collection-grid]') as HTMLElement;

    const cases = [
      { width: 296, columns: 1 },
      { width: 510, columns: 2 },
      { width: 850, columns: 3 },
      { width: 1416, columns: 3 },
    ];

    for (const { width, columns } of cases) {
      resizeObserver.emit(width);

      const root = getRoot();
      expect(root.dataset.columns).toBe(String(columns));
      expect(root.style.getPropertyValue('grid-template-columns')).toBe(`repeat(${columns}, minmax(0, 1fr))`);
      expect(root.children.length).toBe(Math.min(columns * 3, 9));
    }
  });

  it('never lets the track count and the preview reveal disagree, even at zero columns of measured width', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 0, height: 0, x: 0, y: 0 }),
    );

    const { container } = render(
      <PanelCollectionGrid preview>{NINE_CHILDREN}</PanelCollectionGrid>,
    );

    const root = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    expect(root.dataset.columns).toBe('1');
    expect(root.style.getPropertyValue('grid-template-columns')).toBe('repeat(1, minmax(0, 1fr))');
    expect(root.children.length).toBe(3);
  });

  it('tightens to exactly two columns inside a sideWorkspace drawer, at a width that would otherwise clamp to three', () => {
    const resizeObserver = stubResizeObserver();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 1416, height: 0, x: 0, y: 0 }),
    );
    mocks.drawerPresentation = 'sideWorkspace';

    const { container } = render(<PanelCollectionGrid>{NINE_CHILDREN}</PanelCollectionGrid>);
    resizeObserver.emit(1416);

    const root = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    expect(root.dataset.columns).toBe('2');
  });

  it.each(['persistent', 'sideOverlay', 'fullScreen'] as const)(
    'renders three columns at the same width for a plain %s presentation',
    (drawerPresentation) => {
      const resizeObserver = stubResizeObserver();
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
        DOMRect.fromRect({ width: 1416, height: 0, x: 0, y: 0 }),
      );
      mocks.drawerPresentation = drawerPresentation;

      const { container } = render(<PanelCollectionGrid>{NINE_CHILDREN}</PanelCollectionGrid>);
      resizeObserver.emit(1416);

      const root = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
      expect(root.dataset.columns).toBe('3');
    },
  );
});

describe('PanelCollectionGrid scroll anchoring', () => {
  const ROW_HEIGHT = 100;
  const SIX_CARDS = Array.from({ length: 6 }, (_, i) => <div key={i}>{`card-${i}`}</div>);
  const TWELVE_CARDS = Array.from({ length: 12 }, (_, i) => <div key={i}>{`card-${i}`}</div>);
  const THIRTY_CARDS = Array.from({ length: 30 }, (_, i) => <div key={i}>{`card-${i}`}</div>);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * Simulates a real CSS grid: a card's rendered top/bottom follows its row (index ÷
   * live column count, read from the grid's own `data-columns`) times a fixed row
   * height, minus however far the scroll owner has actually scrolled — exactly the
   * geometry a browser would report, without needing a real layout engine.
   *
   * Also stubs `offsetTop`/`offsetParent`/`offsetHeight` to the same row math, minus
   * the scrollTop term: the production code reads a card's position through those
   * instead of `getBoundingClientRect`, specifically so a card mid-glide (moved only
   * by a `transform`) can't be read as being wherever that transform currently has it
   * painted. `getBoundingClientRect` stays stubbed too, purely as a convenience for
   * tests to read "the visual position" in their own assertions.
   */
  function stubGridLayout() {
    const rowHeight = (element: Element) => Number(
      element.closest<HTMLElement>('[data-row-height]')?.dataset.rowHeight ?? ROW_HEIGHT,
    );
    // Real CSS, not a simplification: .scroller (the scroll owner) carries
    // `padding-block-start: var(--wa-panel-chrome-height)`, and PanelLayout publishes
    // that same value as `data-panel-chrome-height` on the very same element. A normal-
    // flow descendant's offsetTop is spec'd relative to its offsetParent's PADDING edge,
    // so that padding is not a separate, parallel fact from a card's own offsetTop — it
    // is already baked into it, for every card, before either headRunway or the row math
    // below. The production code's own chromeHeight term (visibleChromeHeight, read
    // separately in captureAnchor) is for how much of a card is COVERED by the pinned
    // row's fixed overlay, a distinct fact from where the card actually sits in the
    // scrollable content — conflating the two is exactly the bug this stub now exposes.
    const chromeHeight = (element: Element) => Number(
      element.closest<HTMLElement>('[data-panel-scroll-owner]')?.dataset.panelChromeHeight ?? '0',
    );

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.hasAttribute('data-panel-scroll-owner')) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 400 });
      }
      const scrollOwner = this.closest<HTMLElement>('[data-panel-scroll-owner]');
      const grid = this.closest('[data-panel-collection-grid]');
      if (!scrollOwner || !grid || this === grid) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      }
      const headRunway = Number.parseFloat(
        (grid as HTMLElement).style.getPropertyValue('--wa-panel-collection-scroll-head-runway'),
      ) || 0;
      const gridTopOffset = Number(
        grid.parentElement?.closest<HTMLElement>('[data-grid-top-offset]')?.dataset.gridTopOffset ?? '0',
      );
      const columns = Number(grid.getAttribute('data-columns') ?? '1');
      const index = Array.from(grid.children).indexOf(this);
      if (index === -1) return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      const row = Math.floor(index / columns);
      const height = rowHeight(this);
      return DOMRect.fromRect({
        x: 0,
        y: chromeHeight(this) + gridTopOffset + headRunway + (row * height) - scrollOwner.scrollTop,
        width: 400 / columns,
        height,
      });
    });

    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) {
        const grid = this.closest<HTMLElement>('[data-panel-collection-grid]');
        if (grid && this !== grid) return grid;
        if (this.hasAttribute('data-panel-collection-grid')) {
          return this.parentElement?.closest<HTMLElement>('[data-grid-top-offset]')
            ?? this.parentElement?.closest<HTMLElement>('[data-panel-scroll-owner]')
            ?? null;
        }
        if (this.hasAttribute('data-grid-top-offset')) {
          return this.parentElement?.closest<HTMLElement>('[data-panel-scroll-owner]') ?? null;
        }
        if (this.hasAttribute('data-trailing-content')) {
          return this.parentElement?.closest<HTMLElement>('[data-panel-scroll-owner]') ?? null;
        }
        return null;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.hasAttribute('data-grid-top-offset')) {
          return Number(this.dataset.gridTopOffset ?? '0');
        }
        if (this.hasAttribute('data-trailing-content')) {
          const grid = this.parentElement?.querySelector<HTMLElement>('[data-panel-collection-grid]');
          return grid ? grid.offsetTop + grid.offsetHeight : 0;
        }
        const grid = this.closest('[data-panel-collection-grid]');
        if (!grid) return 0;
        if (this === grid) {
          return chromeHeight(this) + (Number.parseFloat(
            this.style.getPropertyValue('--wa-panel-collection-scroll-head-runway'),
          ) || 0);
        }
        // No chromeHeight term here: this offsetTop is relative to the grid root (this
        // element's offsetParent, below), not scrollOwner directly — contentTop()'s own
        // walk picks up scrollOwner's padding at the grid root's hop, one line up. Adding
        // it again at every card would double it a second time, same bug as production's.
        const columns = Number(grid.getAttribute('data-columns') ?? '1');
        const index = Array.from(grid.children).indexOf(this);
        if (index === -1) return 0;
        const row = Math.floor(index / columns);
        return row * rowHeight(this);
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.hasAttribute('data-trailing-content')) {
          return Number(this.dataset.trailingContent ?? '0');
        }
        if (this.hasAttribute('data-panel-collection-grid')) {
          const columns = Number(this.dataset.columns ?? '1');
          return Math.ceil(this.children.length / columns) * rowHeight(this);
        }
        return rowHeight(this);
      },
    });
  }

  it('keeps the scrolled-to card in the same place when a recolumn changes row heights', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    const trackedCard = () => grid.children[1] as HTMLElement;

    // Land on 1 column (6 rows), then scroll down so card 1 (row 1) straddles the
    // scroll owner's visible top — a real scroll, via a real event, independent of
    // any render, exactly like the photographer dragging the list with a finger.
    resizeObserver.emit(300);
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    const offsetBeforeRecolumn = trackedCard().getBoundingClientRect().top;

    // The panel expands to 3 columns: cards 0 and 1 now share row 0, taller rows
    // become shorter ones. Nothing about this recolumn is a scroll the user did.
    resizeObserver.emit(1020);

    expect(trackedCard().getBoundingClientRect().top).toBe(offsetBeforeRecolumn);
  });

  it('does not adjust scrollTop across a recolumn when preservesScrollOnReflow is false', () => {
    // Cart's own opt-out (2026-08-16): it never animates a card's position and is
    // always short, so it skips this whole mechanism rather than carry a guarantee
    // it doesn't need. Mirrors the test above, but with the correction disabled —
    // the browser's own unmodified scroll position must survive the recolumn.
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid preservesScrollOnReflow={false}>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;

    resizeObserver.emit(300);
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });

    resizeObserver.emit(1020);

    expect(scrollOwner.scrollTop).toBe(150);
    expect(grid.style.getPropertyValue('--wa-panel-collection-scroll-head-runway')).toBe('');
    expect(grid.style.getPropertyValue('--wa-panel-collection-scroll-runway')).toBe('');
  });

  it('keeps the scrolled-to card fixed when width changes row height without changing columns', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const atDrawerWidth = (
      destinationWidth: number,
      rowHeight: number,
      transitioning: boolean,
    ) => (
      <PanelSettledWidthContext.Provider value={{ destinationWidth, open: true, transitioning }}>
        <div data-panel-scroll-owner data-row-height={rowHeight}>
          <PanelCollectionGrid>{TWELVE_CARDS}</PanelCollectionGrid>
        </div>
      </PanelSettledWidthContext.Provider>
    );

    const { container, rerender } = render(atDrawerWidth(900, 100, false));
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    const trackedCard = () => grid.children[3] as HTMLElement;

    resizeObserver.emit(900);
    expect(grid.dataset.columns).toBe('3');
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    const offsetBeforeResize = trackedCard().getBoundingClientRect().top;

    rerender(atDrawerWidth(1200, 140, true));

    expect(grid.dataset.columns).toBe('3');
    expect(trackedCard().getBoundingClientRect().top).toBe(offsetBeforeResize);
  });

  it('preserves the existing anchor when a mounted panel closes to zero and reopens', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const atDrawerWidth = (
      destinationWidth: number,
      rowHeight: number,
      transitioning: boolean,
      open: boolean,
    ) => (
      <PanelSettledWidthContext.Provider value={{ destinationWidth, open, transitioning }}>
        <div data-panel-scroll-owner data-row-height={rowHeight}>
          <PanelCollectionGrid>{TWELVE_CARDS}</PanelCollectionGrid>
        </div>
      </PanelSettledWidthContext.Provider>
    );

    const { container, rerender } = render(atDrawerWidth(900, 100, false, true));
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    const trackedCard = () => grid.children[3] as HTMLElement;

    resizeObserver.emit(900);
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    const offsetBeforeClose = trackedCard().getBoundingClientRect().top;

    rerender(atDrawerWidth(0, 0, true, false));
    scrollOwner.scrollTop = 0;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    resizeObserver.emit(0);
    rerender(atDrawerWidth(1200, 140, true, true));

    expect(trackedCard().getBoundingClientRect().top).toBe(offsetBeforeClose);
  });

  it('starts at the top on mount instead of inheriting the shared scroll owner\'s position from whatever section was showing before (Feed/Gallery section switch)', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container, rerender } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    resizeObserver.emit(300);

    // Gallery unmounts this grid (a real section switch), leaves the shared
    // owner scrolled part-way down, then the user switches back to Feed — the
    // owner itself is the same persistent node, so its scrollTop survives the
    // switch unless something resets it.
    rerender(<div data-panel-scroll-owner>{'Gallery content'}</div>);
    scrollOwner.scrollTop = 150;
    expect(scrollOwner.scrollTop).toBe(150);

    rerender(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );
    resizeObserver.emit(300);

    expect(scrollOwner.scrollTop).toBe(0);
  });

  it('captures user scroll while an open presentation temporarily has zero destination width', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const atDrawerWidth = (
      destinationWidth: number,
      rowHeight: number,
      transitioning: boolean,
    ) => (
      <PanelSettledWidthContext.Provider
        value={{ destinationWidth, open: true, transitioning }}
      >
        <div data-panel-scroll-owner data-row-height={rowHeight}>
          <PanelCollectionGrid>{TWELVE_CARDS}</PanelCollectionGrid>
        </div>
      </PanelSettledWidthContext.Provider>
    );

    const { container, rerender } = render(atDrawerWidth(900, 100, false));
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    const trackedCard = () => grid.children[3] as HTMLElement;

    resizeObserver.emit(900);
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });

    rerender(atDrawerWidth(0, 100, true));
    resizeObserver.emit(960);
    expect(scrollOwner).toHaveAttribute('data-panel-collection-scroll-correction');
    scrollOwner.scrollTop = 180;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    expect(scrollOwner).not.toHaveAttribute('data-panel-collection-scroll-correction');
    const offsetAfterUserScroll = trackedCard().getBoundingClientRect().top;

    rerender(atDrawerWidth(1200, 140, true));

    expect(trackedCard().getBoundingClientRect().top).toBe(offsetAfterUserScroll);
  });

  it('keeps the top-left visible card fixed when the wide layout has no natural scroll range', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();
    const trailingContentHeight = 50;

    const atDrawerWidth = (
      destinationWidth: number,
      transitioning: boolean,
      cards = TWELVE_CARDS,
    ) => (
      <PanelSettledWidthContext.Provider value={{ destinationWidth, open: true, transitioning }}>
        <div data-panel-scroll-owner>
          <PanelCollectionGrid>{cards}</PanelCollectionGrid>
          <div data-trailing-content={trailingContentHeight} />
        </div>
      </PanelSettledWidthContext.Provider>
    );

    const { container, rerender } = render(atDrawerWidth(300, false));
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    const trackedCard = () => grid.children[6] as HTMLElement;
    let browserScrollTop = 0;
    let transformedOverflow = 0;
    let correctionPhase = false;
    const correctionScrollIsolation: boolean[] = [];
    const runwayRemovalIsolation: boolean[] = [];
    const scrollExtent = () => {
      const runway = Number.parseFloat(
        grid.style.getPropertyValue('--wa-panel-collection-scroll-runway'),
      ) || 0;
      return grid.offsetHeight + Math.max(runway, trailingContentHeight) + transformedOverflow;
    };

    Object.defineProperty(scrollOwner, 'scrollHeight', {
      configurable: true,
      get: scrollExtent,
    });
    Object.defineProperty(scrollOwner, 'clientHeight', {
      configurable: true,
      value: 400,
    });
    const removeGridProperty = grid.style.removeProperty.bind(grid.style);
    vi.spyOn(grid.style, 'removeProperty').mockImplementation((property: string) => {
      const removesActiveRunway = property === '--wa-panel-collection-scroll-runway'
        && grid.style.getPropertyValue(property) !== '';
      const result = removeGridProperty(property);
      if (removesActiveRunway) {
        runwayRemovalIsolation.push(
          scrollOwner.hasAttribute('data-panel-collection-scroll-correction'),
        );
        scrollOwner.dispatchEvent(new Event('scroll'));
      }
      return result;
    });

    Object.defineProperty(scrollOwner, 'scrollTop', {
      configurable: true,
      get() {
        const maxScrollTop = Math.max(0, scrollExtent() - 400);
        browserScrollTop = Math.min(browserScrollTop, maxScrollTop);
        return browserScrollTop;
      },
      set(value: number) {
        const maxScrollTop = Math.max(0, scrollExtent() - 400);
        browserScrollTop = Math.max(0, Math.min(value, maxScrollTop));
        if (correctionPhase) {
          correctionScrollIsolation.push(
            scrollOwner.hasAttribute('data-panel-collection-scroll-correction'),
          );
          scrollOwner.dispatchEvent(new Event('scroll'));
        }
      },
    });

    resizeObserver.emit(300);
    scrollOwner.scrollTop = 650;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    const offsetBeforeRecolumn = trackedCard().offsetTop - scrollOwner.scrollTop;

    // A card gliding from a lower compact row temporarily enlarges scrollable overflow.
    // That painted overflow disappears when its transform settles and cannot substitute
    // for the layout-owned runway that must keep the anchor in place afterward.
    transformedOverflow = 250;
    correctionPhase = true;
    rerender(atDrawerWidth(900, true));
    correctionPhase = false;
    transformedOverflow = 0;

    expect(trackedCard().offsetTop - scrollOwner.scrollTop).toBe(offsetBeforeRecolumn);
    expect(correctionScrollIsolation.length).toBeGreaterThan(0);
    expect(correctionScrollIsolation.every(Boolean)).toBe(true);
    expect(grid.style.getPropertyValue('--wa-panel-collection-scroll-runway')).not.toBe('');

    rerender(atDrawerWidth(900, true, THIRTY_CARDS));

    expect(grid.style.getPropertyValue('--wa-panel-collection-scroll-runway')).toBe('');
    expect(runwayRemovalIsolation).toEqual([true]);
  });

  it('does not walk the first card above the viewport across repeated top-of-list toggles', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const atDrawerWidth = (
      destinationWidth: number,
      transitioning: boolean,
      gridTopOffset: number,
    ) => (
      <PanelSettledWidthContext.Provider value={{ destinationWidth, open: true, transitioning }}>
        <div data-panel-scroll-owner>
          <div data-grid-top-offset={gridTopOffset}>
            <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
          </div>
        </div>
      </PanelSettledWidthContext.Provider>
    );

    const { container, rerender } = render(atDrawerWidth(900, false, 1));
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const firstCard = container.querySelector('[data-panel-collection-grid]')?.children[0] as HTMLElement;
    let browserScrollTop = 0;
    Object.defineProperty(scrollOwner, 'scrollTop', {
      configurable: true,
      get() {
        return browserScrollTop;
      },
      set(value: number) {
        browserScrollTop = Math.max(0, value);
      },
    });

    resizeObserver.emit(900);
    scrollOwner.scrollTop = 0;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    const initialTop = firstCard.getBoundingClientRect().top;

    for (let toggle = 0; toggle < 3; toggle += 1) {
      rerender(atDrawerWidth(300, true, 0));
      expect(firstCard.getBoundingClientRect().top).toBe(initialTop);

      rerender(atDrawerWidth(900, true, 1));
      expect(firstCard.getBoundingClientRect().top).toBe(initialTop);
    }

    expect(scrollOwner.scrollTop).toBe(0);
    expect(firstCard.getBoundingClientRect().top).toBe(initialTop);
  });

  it('computes the correction from true layout position, not a card mid-glide transform', () => {
    // Reproduces the bug caught on a real recording: the correction's own scrollTop
    // write fires a genuine `scroll` event, which the anchoring effect above reacts to
    // by re-capturing the anchor — while framer-motion's glide from the *previous*
    // recolumn is still easing its transform toward zero. Reading that card's position
    // via `getBoundingClientRect` at that moment reports wherever the glide currently
    // has it painted, not its real slot, and that bad reading became the next
    // recolumn's baseline — producing a scroll jump several rows too large. Only
    // `getBoundingClientRect` is affected by a `transform`; `offsetTop` never is.
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    const trackedCard = () => grid.children[1] as HTMLElement;

    resizeObserver.emit(300);
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    const trueOffsetBeforeRecolumn = trackedCard().offsetTop - scrollOwner.scrollTop;

    // A still-settling glide has this card's painted box far from its real slot.
    vi.spyOn(trackedCard(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 9999, width: 400, height: 100 }),
    );

    resizeObserver.emit(1020);

    expect(trackedCard().offsetTop - scrollOwner.scrollTop).toBe(trueOffsetBeforeRecolumn);
  });

  it('does not anchor on a card still hidden behind the pinned search/filter row', () => {
    // Reproduces a second, independent defect the recordings caught after the
    // mid-glide fix above: PanelLayout's pinned search/filter row sits in normal flow
    // ahead of the grid, then pins visually over whatever scrolls beneath it — so a
    // card can cross the scroll owner's raw `scrollTop` line while still being
    // entirely covered by that row, invisible to the photographer. Anchoring on it
    // anyway pinned the wrong card, and whichever card the photographer could actually
    // see landed wherever the pinned row's height happened to put it, one drawer
    // generation to the next — reported as "the top card lands about two card-heights
    // off." PanelLayout publishes the row's current height as `data-panel-chrome-height`
    // on the scroll owner; this stands in for that publication directly.
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container } = render(
      <div data-panel-scroll-owner data-panel-chrome-height="150">
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    // The pinned row's 150px is real padding-block-start on scrollOwner, so it is
    // already inside every card's own contentTop (content-space [150,250) for card 0,
    // [250,350) for card 1, [350,450) for card 2). At scrollTop 400, cards 0 and 1
    // ([150,250) and [250,350)) are both entirely scrolled past the visible top —
    // the photographer's first actually-visible card is card 2 ([350,450)).
    const trackedCard = () => grid.children[2] as HTMLElement;

    resizeObserver.emit(300);
    scrollOwner.scrollTop = 400;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    const offsetBeforeRecolumn = trackedCard().getBoundingClientRect().top;

    resizeObserver.emit(1020);

    expect(trackedCard().getBoundingClientRect().top).toBe(offsetBeforeRecolumn);
  });

  it('does not introduce a head runway when the pinned row settles to a shorter height after the anchor was captured', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const atChromeHeight = (chromeHeightPx: number) => (
      <div data-panel-scroll-owner data-panel-chrome-height={chromeHeightPx}>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>
    );

    const { container, rerender } = render(atChromeHeight(120));
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;

    resizeObserver.emit(300);
    scrollOwner.scrollTop = 400;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });

    // The pinned row settles to its real, shorter height (e.g. a transient one-render
    // expanded-style toolbar correcting itself back to a single search line) — nothing
    // about the grid's own columns or width changes from this alone.
    rerender(atChromeHeight(68));

    // A later, genuinely unrelated layout event — a recolumn — is the next thing that
    // actually re-checks the anchor against current geometry.
    resizeObserver.emit(1020);

    expect(grid.style.getPropertyValue('--wa-panel-collection-scroll-head-runway')).toBe('');
  });

  it('does not scroll into the newly revealed space when the pinned row settles to a taller height after the anchor was captured', () => {
    // Mirrors the shrink test above, reversed: a live presentation swap (e.g. a
    // portrait-to-landscape rotation) can make the pinned search/filter row taller,
    // not just shorter. Forgiving shrink alone left growth uncompensated, so the
    // correction read the anchor's own contentTop growing by the same amount the row
    // did as the anchor having moved, and scrolled down to match — eating exactly the
    // newly grown padding and leaving the photographer with the *old*, shorter gap
    // instead of the new one, with no recolumn or genuine content change involved.
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const atChromeHeight = (chromeHeightPx: number) => (
      <div data-panel-scroll-owner data-panel-chrome-height={chromeHeightPx}>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>
    );

    const { container, rerender } = render(atChromeHeight(68));
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;

    // Establishes the arrangement at rest, at the top: 300 and 310 both floor to a
    // single column at the panelCard density (340px target), so the second emit below
    // re-checks the anchor without also triggering a genuine recolumn — isolating the
    // row's own growth as the only thing that changed.
    resizeObserver.emit(300);

    // The pinned row settles to its real, taller height (e.g. the search row's own
    // padding under the landscape side-panel presentation) — nothing about the grid's
    // own columns or width changes from this alone.
    rerender(atChromeHeight(120));

    // A later, still same-column layout recheck is the next thing that actually
    // re-checks the anchor against current geometry.
    resizeObserver.emit(310);

    expect(scrollOwner.scrollTop).toBe(0);
  });

  it('does not introduce a head runway when the pinned row disappears before the photographer has scrolled', () => {
    // Reproduces the My Collections defect (2026-08-16): the pinned row is present
    // at mount, then relocates away entirely (e.g. into the panel header on a wider
    // band) before the photographer has scrolled at all. The card that was captured
    // as the anchor genuinely does sit higher once that row is gone, but the scroll
    // owner is still at its own top edge — there is no scrolled-away position to
    // protect, so no head runway should appear. The sibling test above covers the
    // same row-shrink shape after a real scroll to a nonzero position.
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const atChromeHeight = (chromeHeightPx: number) => (
      <div data-panel-scroll-owner data-panel-chrome-height={chromeHeightPx}>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>
    );

    const { container, rerender } = render(atChromeHeight(52));
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;

    resizeObserver.emit(300);

    // The pinned row relocates away entirely — nothing about the grid's own columns
    // or width changes from this alone.
    rerender(atChromeHeight(0));

    // A later, genuinely unrelated layout event — a recolumn — is the next thing that
    // actually re-checks the anchor against current geometry.
    resizeObserver.emit(1020);

    expect(grid.style.getPropertyValue('--wa-panel-collection-scroll-head-runway')).toBe('');
  });

  it('does not move an already-visible card when new cards are appended below it', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container, rerender } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const grid = container.querySelector('[data-panel-collection-grid]') as HTMLElement;
    const trackedCard = () => grid.children[1] as HTMLElement;

    resizeObserver.emit(300);
    const offsetAtRest = trackedCard().getBoundingClientRect().top;

    // Appending content below the fold, at the same column count, is not a recolumn —
    // the tracked card has not moved and scrollTop must be left exactly as it is.
    const scrollTopBefore = scrollOwner.scrollTop;
    rerender(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{[...SIX_CARDS, <div key="new">new</div>]}</PanelCollectionGrid>
      </div>,
    );

    expect(scrollOwner.scrollTop).toBe(scrollTopBefore);
    expect(trackedCard().getBoundingClientRect().top).toBe(offsetAtRest);
  });

  it('does not replay a stale anchor when unchanged cards rerender during a momentum return to the top', () => {
    const resizeObserver = stubResizeObserver();
    stubGridLayout();
    const cards = () => Array.from(
      { length: 6 },
      (_, index) => <div key={index}>{`card-${index}`}</div>,
    );

    const { container, rerender } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{cards()}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    resizeObserver.emit(300);
    scrollOwner.scrollTop = 50;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });

    // WebKit can commit a render caused by an earlier scroll event after native
    // momentum has already advanced the scroll position. The same keyed cards have
    // not changed layout, so that delayed render must not restore the older anchor.
    scrollOwner.scrollTop = 0;
    rerender(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{cards()}</PanelCollectionGrid>
      </div>,
    );

    expect(scrollOwner.scrollTop).toBe(0);
  });

  it('corrects scrollTop before any child layout effect can observe the stale position', () => {
    // Stands in for framer-motion's own layout-effect-based glide measurement
    // (FeedCardSlot's `layout="position"`): a plain child using the same React
    // lifecycle hook that any recolumn-reactive descendant would use to measure its
    // position, and — like FeedCardSlot — consuming `usePanelCollectionColumns()` so it
    // actually re-renders on a recolumn (a child that ignores the column count is
    // handed the same `children` element as last time and React skips it entirely,
    // same as it would skip a card that never reacts to the count changing). If the
    // grid's own correction ran too late, this probe — a child, and children's layout
    // effects fire before their parent's — would still observe the pre-correction
    // scrollTop.
    const observedScrollTops: number[] = [];
    function ChildLayoutEffectProbe() {
      usePanelCollectionColumns();
      useLayoutEffect(() => {
        const owner = document.querySelector('[data-panel-scroll-owner]') as HTMLElement;
        observedScrollTops.push(owner.scrollTop);
      });
      return <div>probe</div>;
    }

    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{[...SIX_CARDS, <ChildLayoutEffectProbe key="probe" />]}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    resizeObserver.emit(300);
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    observedScrollTops.length = 0;

    resizeObserver.emit(1020);

    expect(observedScrollTops).toHaveLength(1);
    expect(observedScrollTops[0]).toBe(scrollOwner.scrollTop);
  });

  it('releases its correction marker without ending another scroll isolation', () => {
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const resizeObserver = stubResizeObserver();
    stubGridLayout();

    const { container } = render(
      <div data-panel-scroll-owner>
        <PanelCollectionGrid>{SIX_CARDS}</PanelCollectionGrid>
      </div>,
    );

    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    resizeObserver.emit(300);
    scrollOwner.scrollTop = 150;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });

    resizeObserver.emit(1020);
    expect(scrollOwner).toHaveAttribute('data-panel-collection-scroll-correction');

    // Another owner begins isolation while the grid correction is settling. The grid
    // must not remove an attribute it does not exclusively own when its frames finish.
    scrollOwner.setAttribute('data-scroll-direction-isolated', 'true');

    act(() => queuedFrames.shift()?.(0));
    expect(scrollOwner).toHaveAttribute('data-panel-collection-scroll-correction');

    act(() => queuedFrames.shift()?.(16));
    expect(scrollOwner).not.toHaveAttribute('data-panel-collection-scroll-correction');
    expect(scrollOwner).toHaveAttribute('data-scroll-direction-isolated');
  });
});
