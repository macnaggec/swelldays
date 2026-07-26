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
