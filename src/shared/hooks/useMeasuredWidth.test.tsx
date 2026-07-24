import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { buildGalleryRows } from 'shared/lib/buildGalleryRows';
import { galleryColumns } from 'shared/lib/galleryColumns';
import { useMeasuredWidth } from './useMeasuredWidth';

/**
 * Stubs the global ResizeObserver in the shape used by DrawerShell.test.tsx: a class
 * capturing the callback passed by the hook under test, with observe/unobserve/disconnect
 * as no-ops. Exposes `emit(width)` to drive a resize entry carrying a chosen
 * `contentRect.width`, mirroring the real browser callback shape.
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

function WidthProbe() {
  const [width, ref] = useMeasuredWidth();
  return <div ref={ref} data-testid="width">{width}</div>;
}

/**
 * Mirrors the gallery's loading guard: the measured element is absent on first
 * render and appears only once `revealed` flips. A RefObject effect would have
 * run against the null ref and never re-observed the later node.
 */
function DeferredMountProbe() {
  const [width, ref] = useMeasuredWidth();
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <button onClick={() => setRevealed(true)}>reveal</button>
      {revealed && <div ref={ref} />}
      <span data-testid="width">{width}</span>
    </>
  );
}

const SAME_DAY_ITEMS = Array.from({ length: 7 }, (_, i) => ({
  id: `item-${i}`,
  capturedAt: new Date(Date.UTC(2024, 0, 1, 10, 0, 0)),
}));

function RechunkHarness() {
  const [width, ref] = useMeasuredWidth();
  const columns = galleryColumns(width, 'comfortable');
  const rows = buildGalleryRows(SAME_DAY_ITEMS, columns);

  return (
    <div ref={ref}>
      {rows.map((row) => (
        row.type === 'media'
          ? <div key={row.key} data-testid="row">{row.items.length}</div>
          : null
      ))}
    </div>
  );
}

describe('useMeasuredWidth adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('measures synchronously on mount and updates from a resize entry', () => {
    const resizeObserver = stubResizeObserver();

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 200, height: 0, x: 0, y: 0 }),
    );

    render(<WidthProbe />);

    expect(screen.getByTestId('width').textContent).toBe('200');

    resizeObserver.emit(480);

    expect(screen.getByTestId('width').textContent).toBe('480');
  });

  it('measures an element that mounts after the first render (behind a loading guard)', () => {
    stubResizeObserver();

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 300, height: 0, x: 0, y: 0 }),
    );

    render(<DeferredMountProbe />);

    // Element absent on first render → nothing to measure yet.
    expect(screen.getByTestId('width').textContent).toBe('0');

    act(() => {
      fireEvent.click(screen.getByText('reveal'));
    });

    // Callback ref attaches the observer as the node mounts → measured immediately.
    expect(screen.getByTestId('width').textContent).toBe('300');
  });
});

describe('resize→rechunk integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-chunks media rows when the measured width changes, without dropping or duplicating items', () => {
    const resizeObserver = stubResizeObserver();

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 100, height: 0, x: 0, y: 0 }),
    );

    render(<RechunkHarness />);

    // Narrow measured width → 1 column: 7 same-day items become 7 single-item rows.
    let rows = screen.getAllByTestId('row').map((el) => el.textContent);
    expect(rows).toEqual(['1', '1', '1', '1', '1', '1', '1']);
    expect(rows.reduce((sum, count) => sum + Number(count), 0)).toBe(SAME_DAY_ITEMS.length);

    // Wide measured width → 3 columns: the same 7 items re-chunk into 3/3/1.
    resizeObserver.emit(1020);

    rows = screen.getAllByTestId('row').map((el) => el.textContent);
    expect(rows).toEqual(['3', '3', '1']);
    expect(rows.reduce((sum, count) => sum + Number(count), 0)).toBe(SAME_DAY_ITEMS.length);
  });
});
