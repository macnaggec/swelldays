import { createRef } from 'react';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import { render } from 'test/setup/render';
import { VirtualGallery, type VirtualGalleryHandle } from './VirtualGallery';

const virtualItemsMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: () => ({
      getVirtualItems: virtualItemsMock,
      getTotalSize: () => 1000,
      scrollToIndex: vi.fn(),
      measureElement: () => 0,
    }),
  };
});

type Item = { id: string };

function mediaRow(id: string): GalleryRow<Item> {
  return { type: 'media', items: [{ id }], key: `media-${id}` };
}

function renderCardWithOpenControl(item: Item) {
  return (
    <button type="button" data-media-card-open="true">
      {item.id}
    </button>
  );
}

describe('VirtualGallery focusItem', () => {
  beforeEach(() => {
    virtualItemsMock.mockReturnValue([{ key: 'v', index: 0, start: 0, size: 220 }]);
  });

  it("focuses the mounted item's own open control and reports success", () => {
    const rows = [mediaRow('a')];
    const handleRef = createRef<VirtualGalleryHandle>();
    render(<VirtualGallery ref={handleRef} rows={rows} renderCard={renderCardWithOpenControl} />);

    let focused: boolean | undefined;
    act(() => {
      focused = handleRef.current!.focusItem('a');
    });

    expect(focused).toBe(true);
    expect(document.activeElement?.getAttribute('data-media-card-open')).toBe('true');
  });

  it('falls back to the gallery container, never the document body, when the item is not currently mounted', () => {
    const rows = [mediaRow('a')];
    const handleRef = createRef<VirtualGalleryHandle>();
    const { container } = render(<VirtualGallery ref={handleRef} rows={rows} renderCard={renderCardWithOpenControl} />);

    let focused: boolean | undefined;
    act(() => {
      focused = handleRef.current!.focusItem('missing');
    });

    expect(focused).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    // MantineProvider (the shared `render()` helper) injects its own
    // `<style data-mantine-styles>` sibling ahead of the gallery markup, so
    // `container.firstElementChild` is not the gallery root here — the
    // `tabIndex={-1}` container itself (added in this task as the script-only
    // focus target) is the reliable way to identify it.
    expect(document.activeElement).toBe(container.querySelector('[tabindex="-1"]'));
  });
});
