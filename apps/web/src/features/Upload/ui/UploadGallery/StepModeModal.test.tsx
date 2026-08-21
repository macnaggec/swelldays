import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GalleryCard } from '../../model';
import type { DraftMedia } from 'entities/Media';
import type { UseGallerySelectionReturn } from 'shared/hooks/gallery';
import { StepModeModal } from './StepModeModal';

vi.mock('shared/ui/BaseGallery', () => ({
  BaseGallery: ({ items }: { items: GalleryCard[] }) => (
    <div aria-label="Upload cards">
      {items.map((item) => <div key={item.id}>{item.id}</div>)}
    </div>
  ),
  SelectionToolbar: () => null,
}));

vi.mock('./UploadCardRenderer', () => ({
  UploadCardRenderer: ({ item }: { item: GalleryCard }) => <div>{item.id}</div>,
}));

function selectionStub(): UseGallerySelectionReturn<GalleryCard> {
  return {
    selectedIds: [],
    selectedCount: 0,
    isAllSelected: false,
    selectedItems: [],
    isSelected: () => false,
    toggle: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    deselectItems: vi.fn(),
    hasSelection: false,
    isSelectionMode: false,
    enableSelectionMode: vi.fn(),
    disableSelectionMode: vi.fn(),
  };
}

function renderModal(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('StepModeModal', () => {
  it('lets the photographer fold the modal while uploads are still active', async () => {
    const onClose = vi.fn();
    const onDiscardAll = vi.fn();
    const onRemove = vi.fn();
    const draftResult: DraftMedia = {
      id: 'media-1',
      sessionId: 'session-1',
      photographerId: 'photographer-1',
      type: 'PHOTO',
      spotId: null,
      capturedAt: new Date('2026-01-01T00:00:00Z'),
      price: null,
      lightboxUrl: 'https://cdn.example.com/media-1.jpg',
      thumbnailUrl: 'https://cdn.example.com/media-1-thumb.jpg',
      cloudinaryPublicId: 'media-1',
      status: 'DRAFT',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      resource: { resourceType: 'image', url: 'https://cdn.example.com/media-1.jpg', assetId: 'asset-media-1' },
    };
    const cards = [
      { kind: 'asset' as const, id: 'media-1', result: draftResult },
      {
        kind: 'attempt' as const,
        id: 'upload-2',
        source: 'LOCAL' as const,
        status: 'ACQUIRING' as const,
        previewUrl: 'blob:active',
        resourceType: 'image' as const,
        progress: 40,
      },
    ] satisfies GalleryCard[];

    renderModal(
      <StepModeModal
        opened
        onClose={onClose}
        items={cards}
        selection={selectionStub()}
        onDiscardAll={onDiscardAll}
        onRemove={onRemove}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onDiscardAll).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Continue with/ })).toBeNull();
  });
});
