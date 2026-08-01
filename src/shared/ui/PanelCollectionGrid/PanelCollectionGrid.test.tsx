import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PanelCollectionGrid } from './PanelCollectionGrid';

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

const NINE_CHILDREN = Array.from({ length: 9 }, (_, i) => <div key={i}>{i}</div>);

describe('PanelCollectionGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
});

describe('PanelCollectionGrid scroll anchoring', () => {
  const ROW_HEIGHT = 100;
  const SIX_CARDS = Array.from({ length: 6 }, (_, i) => <div key={i}>{`card-${i}`}</div>);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * Simulates a real CSS grid: a card's rendered top/bottom follows its row (index ÷
   * live column count, read from the grid's own `data-columns`) times a fixed row
   * height, minus however far the scroll owner has actually scrolled — exactly the
   * geometry a browser would report, without needing a real layout engine.
   */
  function stubGridLayout() {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.hasAttribute('data-panel-scroll-owner')) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 400 });
      }
      const scrollOwner = this.closest<HTMLElement>('[data-panel-scroll-owner]');
      const grid = this.closest('[data-panel-collection-grid]');
      if (!scrollOwner || !grid || this === grid) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      }
      const columns = Number(grid.getAttribute('data-columns') ?? '1');
      const index = Array.from(grid.children).indexOf(this);
      if (index === -1) return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      const row = Math.floor(index / columns);
      return DOMRect.fromRect({
        x: 0,
        y: (row * ROW_HEIGHT) - scrollOwner.scrollTop,
        width: 400 / columns,
        height: ROW_HEIGHT,
      });
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
});
