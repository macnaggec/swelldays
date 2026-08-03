import { createRef } from 'react';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import { render } from 'test/setup/render';
import { VirtualGallery, type VirtualGalleryHandle } from './VirtualGallery';

const scrollToIndexMock = vi.hoisted(() => vi.fn());
const scrollToOffsetMock = vi.hoisted(() => vi.fn());
const getOffsetForIndexMock = vi.hoisted(() => vi.fn(() => [100 as number, 'start'] as const));
const resizeItemMock = vi.hoisted(() => vi.fn());
const virtualItemsMock = vi.hoisted(() => vi.fn(() => [{ key: 'v', index: 0, start: 0, size: 220 }]));
// Captures VirtualGallery's real `measureElement` config function (not the mocked
// virtualizer's own returned ref-callback) so tests can invoke it directly to
// simulate a row's measured height changing, without needing a real layout engine.
const capturedMeasureElement = vi.hoisted(() => ({ current: null as ((el: Element) => number) | null }));
const capturedSizeAdjustment = vi.hoisted(() => ({
  current: null as ((item: { index: number; start: number }, delta: number, instance: {
    getScrollOffset: () => number;
  }) => boolean) | null,
}));

vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (config: { measureElement: (el: Element) => number }) => {
      capturedMeasureElement.current = config.measureElement;
      return {
        set shouldAdjustScrollPositionOnItemSizeChange(callback: typeof capturedSizeAdjustment.current) {
          capturedSizeAdjustment.current = callback;
        },
        getVirtualItems: virtualItemsMock,
        getTotalSize: () => 1000,
        getOffsetForIndex: getOffsetForIndexMock,
        scrollToIndex: scrollToIndexMock,
        scrollToOffset: scrollToOffsetMock,
        resizeItem: resizeItemMock,
        measureElement: () => 0,
      };
    },
  };
});

function fakeRowElement(index: number, height: number, paintedHeight = height): Element {
  return {
    offsetHeight: height,
    getAttribute: (name: string) => (name === 'data-index' ? String(index) : null),
    getBoundingClientRect: () => ({ height: paintedHeight }) as DOMRect,
  } as unknown as Element;
}

type Item = { id: string };

function mediaRow(id: string): GalleryRow<Item> {
  return { type: 'media', items: [{ id }], key: `media-${id}` };
}

function mediaRowOf(ids: string[]): GalleryRow<Item> {
  return { type: 'media', items: ids.map((id) => ({ id })), key: `media-${ids[0]}` };
}

describe('VirtualGallery prepend anchor preservation', () => {
  beforeEach(() => {
    scrollToIndexMock.mockClear();
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 0, start: 0, size: 220 }]);
  });

  it('snaps back to the row that was at the top when rows are prepended above it', () => {
    const initialRows = [mediaRow('a'), mediaRow('b'), mediaRow('c'), mediaRow('d')];
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 2, start: 0, size: 220 }]);

    const { rerender } = render(<VirtualGallery rows={initialRows} renderCard={() => null} />);

    // Two rows prepended above 'a' — 'c' (previously at index 2) is now at index 4.
    const prependedRows = [mediaRow('x'), mediaRow('y'), ...initialRows];
    rerender(<VirtualGallery rows={prependedRows} renderCard={() => null} />);

    expect(scrollToIndexMock).toHaveBeenCalledWith(4, { align: 'start' });
  });

  it('does not correct scroll position for a normal append at the end', () => {
    const initialRows = [mediaRow('a'), mediaRow('b')];
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 0, start: 0, size: 220 }]);

    const { rerender } = render(<VirtualGallery rows={initialRows} renderCard={() => null} />);

    const appendedRows = [...initialRows, mediaRow('c')];
    rerender(<VirtualGallery rows={appendedRows} renderCard={() => null} />);

    expect(scrollToIndexMock).not.toHaveBeenCalled();
  });

  it('does nothing on first mount, with no previous position to compare against', () => {
    const initialRows = [mediaRow('a'), mediaRow('b')];
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 0, start: 0, size: 220 }]);

    render(<VirtualGallery rows={initialRows} renderCard={() => null} />);

    expect(scrollToIndexMock).not.toHaveBeenCalled();
  });
});

describe('VirtualGallery recolumn anchor preservation', () => {
  beforeEach(() => {
    scrollToIndexMock.mockClear();
    scrollToOffsetMock.mockClear();
    getOffsetForIndexMock.mockReset();
    getOffsetForIndexMock.mockReturnValue([100, 'start']);
    resizeItemMock.mockClear();
  });

  it('measures a row from layout while the gallery is visually scaled', () => {
    render(<VirtualGallery rows={[mediaRow('a')]} renderCard={() => null} />);

    expect(capturedMeasureElement.current?.(fakeRowElement(0, 220, 660))).toBe(220);
  });

  it('adjusts resized rows before the visible row but not the visible row itself', () => {
    const rows = [
      mediaRowOf(['a', 'b', 'c']),
      mediaRowOf(['d', 'e', 'f']),
      mediaRowOf(['g', 'h', 'i']),
    ];
    virtualItemsMock.mockReturnValue([
      { key: 'v-0', index: 0, start: 0, size: 300 },
      { key: 'v-1', index: 1, start: 300, size: 300 },
      { key: 'v-2', index: 2, start: 600, size: 300 },
    ]);

    const { container } = render(
      <div data-panel-scroll-owner>
        <VirtualGallery rows={rows} columns={3} renderCard={() => null} />
      </div>,
    );
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const virtualCanvas = container.querySelector('[data-virtual-gallery-canvas]') as HTMLElement;
    scrollOwner.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    virtualCanvas.getBoundingClientRect = () => ({ top: -350 }) as DOMRect;
    scrollOwner.scrollTop = 350;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });

    const instance = { getScrollOffset: () => scrollOwner.scrollTop };
    expect(capturedSizeAdjustment.current?.({ index: 0, start: 0 }, -200, instance)).toBe(true);
    expect(capturedSizeAdjustment.current?.({ index: 1, start: 300 }, -200, instance)).toBe(false);
    expect(capturedSizeAdjustment.current?.({ index: 2, start: 600 }, -200, instance)).toBe(false);
  });

  it('updates every row without per-row scroll adjustment, then restores the anchor once', () => {
    const rows = [
      mediaRow('a'),
      mediaRow('b'),
      mediaRow('c'),
      mediaRow('d'),
    ];
    virtualItemsMock.mockReturnValue([
      { key: 'v-1', index: 1, start: 300, size: 300 },
      { key: 'v-2', index: 2, start: 600, size: 300 },
    ]);

    const { container, rerender } = render(
      <div data-panel-scroll-owner>
        <VirtualGallery rows={rows} columns={3} dense={false} renderCard={() => null} />
      </div>,
    );
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const virtualCanvas = container.querySelector('[data-virtual-gallery-canvas]') as HTMLElement;
    const renderedRows = container.querySelectorAll<HTMLElement>('[data-index]');
    let canvasTop = -240;
    scrollOwner.getBoundingClientRect = () => ({ top: 10 }) as DOMRect;
    virtualCanvas.getBoundingClientRect = () => ({ top: canvasTop }) as DOMRect;
    scrollOwner.scrollTop = 350;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });

    Object.defineProperty(renderedRows[0], 'offsetHeight', { configurable: true, value: 100 });
    Object.defineProperty(renderedRows[1], 'offsetHeight', { configurable: true, value: 100 });
    resizeItemMock.mockClear();
    canvasTop = 20;

    rerender(
      <div data-panel-scroll-owner>
        <VirtualGallery rows={rows} columns={3} dense renderCard={() => null} />
      </div>,
    );

    expect(resizeItemMock.mock.calls).toEqual([
      [0, 100],
      [1, 100],
      [2, 100],
      [3, 100],
    ]);
    expect(capturedSizeAdjustment.current?.(
      { index: 0, start: 0 },
      -200,
      { getScrollOffset: () => scrollOwner.scrollTop },
    )).toBe(false);
    expect(scrollToOffsetMock).toHaveBeenCalledOnce();
    // The saved row was 50px below the scroll viewport (60 - 10). In the new
    // layout it would be 110px below it (root 20 - viewport 10 + row start 100),
    // so one 60px correction preserves the exact on-screen position.
    expect(scrollToOffsetMock).toHaveBeenCalledWith(410, { align: 'start' });
  });

  it('anchors the first row actually visible below the panel chrome', () => {
    const rows = [mediaRow('a'), mediaRow('b'), mediaRow('c')];
    virtualItemsMock.mockReturnValue([
      { key: 'v-0', index: 0, start: 0, size: 100 },
      { key: 'v-1', index: 1, start: 100, size: 100 },
      { key: 'v-2', index: 2, start: 200, size: 100 },
    ]);

    const { container, rerender } = render(
      <div data-panel-scroll-owner data-panel-chrome-height="50">
        <VirtualGallery rows={rows} columns={3} dense={false} renderCard={() => null} />
      </div>,
    );
    const scrollOwner = container.querySelector('[data-panel-scroll-owner]') as HTMLElement;
    const virtualCanvas = container.querySelector('[data-virtual-gallery-canvas]') as HTMLElement;
    scrollOwner.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    virtualCanvas.getBoundingClientRect = () => ({ top: -30 }) as DOMRect;
    scrollOwner.scrollTop = 80;
    act(() => {
      scrollOwner.dispatchEvent(new Event('scroll'));
    });
    getOffsetForIndexMock.mockClear();

    rerender(
      <div data-panel-scroll-owner data-panel-chrome-height="50">
        <VirtualGallery rows={rows} columns={3} dense renderCard={() => null} />
      </div>,
    );

    expect(getOffsetForIndexMock).toHaveBeenCalledWith(0, 'start');
  });

  it('retains the same anchor item across repeated recolumns', () => {
    // 10 items in one day, chunked at 3 columns: [a,b,c], [d,e,f], [g,h,i], [j].
    // The anchor sits on the second row ('d,e,f' — not the group's first
    // chunk), matching "scrolled a couple of screens down" from the bug
    // report. A recolumn to 6 columns re-chunks to [a..f], [g..j] — 'd' is
    // now in the row at index 0, not index 1 — so a correction must fire.
    const threeColumnRows = [
      mediaRowOf(['a', 'b', 'c']),
      mediaRowOf(['d', 'e', 'f']),
      mediaRowOf(['g', 'h', 'i']),
      mediaRowOf(['j']),
    ];
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 1, start: 0, size: 220 }]);

    const { rerender } = render(
      <VirtualGallery rows={threeColumnRows} columns={3} renderCard={() => null} />,
    );

    const sixColumnRows = [
      mediaRowOf(['a', 'b', 'c', 'd', 'e', 'f']),
      mediaRowOf(['g', 'h', 'i', 'j']),
    ];
    getOffsetForIndexMock.mockReturnValue([0, 'start']);
    rerender(<VirtualGallery rows={sixColumnRows} columns={6} renderCard={() => null} />);

    expect(scrollToIndexMock).not.toHaveBeenCalled();
    expect(scrollToOffsetMock).toHaveBeenCalledOnce();
    expect(scrollToOffsetMock).toHaveBeenCalledWith(0, { align: 'start' });

    getOffsetForIndexMock.mockClear();
    rerender(<VirtualGallery rows={threeColumnRows} columns={3} renderCard={() => null} />);

    expect(getOffsetForIndexMock).toHaveBeenCalledWith(1, 'start');
  });
});

describe('VirtualGallery imperative scrollToIndex isolates the resulting scroll', () => {
  beforeEach(() => {
    scrollToIndexMock.mockClear();
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 0, start: 0, size: 220 }]);
  });

  async function nextFrame() {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  }

  it('marks the scroll owner isolated for the jump, then clears it once the scroll has settled', async () => {
    const rows = [mediaRow('a'), mediaRow('b')];
    const handleRef = createRef<VirtualGalleryHandle>();

    const { container } = render(<VirtualGallery ref={handleRef} rows={rows} renderCard={() => null} />);

    act(() => {
      handleRef.current?.scrollToIndex(1, { align: 'start' });
    });

    expect(scrollToIndexMock).toHaveBeenCalledWith(1, { align: 'start' });
    expect(container.querySelector('[data-scroll-direction-isolated]')).not.toBeNull();

    // A single frame is not enough — react-virtual's own remeasurement can
    // still correct scrollTop a frame or two later, which is exactly the
    // flakiness this settle-detection replaces.
    await nextFrame();
    expect(container.querySelector('[data-scroll-direction-isolated]')).not.toBeNull();

    await nextFrame();
    await nextFrame();
    expect(container.querySelector('[data-scroll-direction-isolated]')).toBeNull();
  });

  it('keeps the scroll owner isolated while a jumped-to row is still correcting its measured height', async () => {
    const rows = [mediaRow('a'), mediaRow('b')];
    const handleRef = createRef<VirtualGalleryHandle>();

    const { container } = render(<VirtualGallery ref={handleRef} rows={rows} renderCard={() => null} />);

    // Baseline measurement for the row the jump lands near, as if it had already
    // been measured once before this jump started.
    capturedMeasureElement.current?.(fakeRowElement(1, 220));

    act(() => {
      handleRef.current?.scrollToIndex(1, { align: 'start' });
    });
    expect(container.querySelector('[data-scroll-direction-isolated]')).not.toBeNull();

    await nextFrame();

    // The row corrects its measured height mid-settle — e.g. its first real
    // measurement replacing the estimate, or an image inside it finishing load.
    // This must reset the settle countdown, not just extend the previous one.
    capturedMeasureElement.current?.(fakeRowElement(1, 340));

    // Three frames after the jump started is exactly how long the sibling test
    // above takes to lift isolation from scrollTop stability alone — here it must
    // still be isolated, since the measurement reset the countdown one frame in.
    await nextFrame();
    await nextFrame();
    expect(container.querySelector('[data-scroll-direction-isolated]')).not.toBeNull();

    await nextFrame();
    await nextFrame();
    expect(container.querySelector('[data-scroll-direction-isolated]')).toBeNull();
  });
});

describe('VirtualGallery default divider', () => {
  beforeEach(() => {
    scrollToIndexMock.mockClear();
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 0, start: 0, size: 32 }]);
  });

  it('renders a plain, non-interactive date label when no custom divider is given', () => {
    const rows: GalleryRow<Item>[] = [
      { type: 'divider', date: new Date('2026-07-21T12:00:00.000Z'), key: 'd', mediaRowCount: 0 },
    ];

    render(<VirtualGallery rows={rows} renderCard={() => null} />);

    expect(screen.getByText('July 21, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('VirtualGallery onStartReached', () => {
  beforeEach(() => {
    scrollToIndexMock.mockClear();
  });

  it('fires when scrolled near the top of the rendered range', () => {
    const rows = [mediaRow('a'), mediaRow('b'), mediaRow('c')];
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 1, start: 0, size: 220 }]);
    const onStartReached = vi.fn();

    render(<VirtualGallery rows={rows} renderCard={() => null} onStartReached={onStartReached} />);

    expect(onStartReached).toHaveBeenCalled();
  });

  it('does not fire once scrolled well past the top', () => {
    const rows = [mediaRow('a'), mediaRow('b'), mediaRow('c'), mediaRow('d'), mediaRow('e'), mediaRow('f')];
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 5, start: 0, size: 220 }]);
    const onStartReached = vi.fn();

    render(<VirtualGallery rows={rows} renderCard={() => null} onStartReached={onStartReached} />);

    expect(onStartReached).not.toHaveBeenCalled();
  });
});
