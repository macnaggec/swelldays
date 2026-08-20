import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import PurchaseLightbox from './PurchaseLightbox';

const purchase = {
  previewUrl: 'https://cdn.example.com/purchased.jpg',
  mediaItem: {
    id: 'media-1',
    thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  },
};

describe('PurchaseLightbox', () => {
  it('uses matching frameless icon actions for close and download', () => {
    render(
      <PurchaseLightbox
        purchase={purchase}
        onClose={vi.fn()}
        isDownloading={false}
        isAnyDownloading={false}
        onDownload={vi.fn()}
      />,
    );

    const closeButton = screen.getByRole('button', { name: 'Close preview' });
    const downloadButton = screen.getByRole('button', { name: 'Download original file' });

    expect(closeButton).toHaveAttribute('data-lightbox-icon-action', 'true');
    expect(closeButton).toHaveAttribute('data-lightbox-icon-frame', 'chip');
    expect(downloadButton).toHaveAttribute('data-lightbox-icon-action', 'true');
    expect(downloadButton).toHaveAttribute('data-lightbox-icon-frame', 'chip');
    expect(downloadButton.closest('[data-lightbox-floating-actions]')).not.toBeNull();
  });
});
