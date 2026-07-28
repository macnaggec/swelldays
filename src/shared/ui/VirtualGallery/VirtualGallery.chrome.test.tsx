import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import { render } from 'test/setup/render';
import { VirtualGallery } from './VirtualGallery';

vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();

  return {
    ...actual,
    useVirtualizer: (options: {
      rangeExtractor: (range: {
        startIndex: number;
        endIndex: number;
        overscan: number;
        count: number;
      }) => number[];
    }) => {
      options.rangeExtractor({
        startIndex: 0,
        endIndex: 0,
        overscan: 0,
        count: 1,
      });
      return {
        getVirtualItems: () => [{ key: 'date', index: 0, start: 0, size: 32 }],
        getTotalSize: () => 32,
        scrollToIndex: vi.fn(),
      };
    },
  };
});

const ROWS: GalleryRow<{ id: string }>[] = [{
  type: 'divider',
  date: new Date('2026-07-13T12:00:00.000Z'),
  key: 'date',
  mediaRowCount: 0,
}];

function gallery(hidden: boolean, drawerPresentation: 'bottomSheet' | 'persistent') {
  return (
    <PanelScrollChromeStateProvider value={{ hidden, drawerPresentation }}>
      <VirtualGallery
        rows={ROWS}
        stickyDividers
        renderDivider={() => <button type="button">Jump to date</button>}
        renderCard={() => null}
      />
    </PanelScrollChromeStateProvider>
  );
}

describe('VirtualGallery mobile sticky date replacement', () => {
  it('shows either search chrome or the sticky date bar from the shared scroll direction', () => {
    const view = render(gallery(false, 'bottomSheet'));

    expect(screen.queryByRole('button', { name: 'Jump to date' })).toBeNull();

    view.rerender(gallery(true, 'bottomSheet'));
    expect(screen.getByRole('button', { name: 'Jump to date' })).not.toBeNull();

    view.rerender(gallery(false, 'persistent'));
    expect(screen.getByRole('button', { name: 'Jump to date' })).not.toBeNull();
  });
});
