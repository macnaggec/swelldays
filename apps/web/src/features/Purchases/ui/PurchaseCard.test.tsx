import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import PurchaseCard from './PurchaseCard';

const purchase = {
  id: 'purchase-1',
  amountPaid: 300,
  previewUrl: 'https://example.com/preview.jpg',
  mediaItem: {
    id: 'media-1',
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
  },
};

describe('PurchaseCard', () => {
  it('opens the purchased media preview when the card is selected', () => {
    const onPreview = vi.fn();

    render(
      <PurchaseCard
        purchase={purchase}
        isDownloading={false}
        isAnyDownloading={false}
        onDownload={vi.fn()}
        onPreview={onPreview}
      />,
    );

    fireEvent.click(screen.getByAltText('Purchased media'));

    expect(onPreview).toHaveBeenCalledWith('media-1');
  });

  it('downloads the item without opening its preview', () => {
    const onDownload = vi.fn();
    const onPreview = vi.fn();

    render(
      <PurchaseCard
        purchase={purchase}
        isDownloading={false}
        isAnyDownloading={false}
        onDownload={onDownload}
        onPreview={onPreview}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download original file' }));

    expect(onDownload).toHaveBeenCalledWith('media-1');
    expect(onPreview).not.toHaveBeenCalled();
  });
});
