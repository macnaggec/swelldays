import { createRef } from 'react';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import { render } from 'test/setup/render';
import { VirtualGallery, type VirtualGalleryHandle } from './VirtualGallery';

const scrollToIndexMock = vi.hoisted(() => vi.fn());
const virtualItemsMock = vi.hoisted(() => vi.fn(() => [{ key: 'v', index: 0, start: 0, size: 220 }]));

vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: () => ({
      getVirtualItems: virtualItemsMock,
      getTotalSize: () => 1000,
      scrollToIndex: scrollToIndexMock,
      measureElement: () => 0,
    }),
  };
});

type Item = { id: string };

function mediaRow(id: string): GalleryRow<Item> {
  return { type: 'media', items: [{ id }], key: `media-${id}` };
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
