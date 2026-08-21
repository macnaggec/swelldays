import { memo } from 'react';
import { BaseLightbox } from 'shared/ui/BaseLightbox';
import DownloadButton from './DownloadButton';

export interface PurchaseLightboxItem {
  previewUrl: string | null;
  mediaItem: { id: string; thumbnailUrl: string };
}

export interface PurchaseLightboxProps {
  purchase: PurchaseLightboxItem | null;
  onClose: () => void;
  isDownloading: boolean;
  isAnyDownloading: boolean;
  onDownload: (mediaItemId: string) => void;
}

/**
 * PurchaseLightbox — full-size preview modal for a purchased media item.
 *
 * Shows a clean (no-watermark) preview via the stored previewUrl and
 * provides a download action for the original file.
 * Closes (item = null) when previewUrl is unavailable.
 */
const PurchaseLightbox = memo(function PurchaseLightbox({
  purchase,
  onClose,
  isDownloading,
  isAnyDownloading,
  onDownload,
}: PurchaseLightboxProps) {
  const item =
    purchase && purchase.previewUrl
      ? { id: purchase.mediaItem.id, url: purchase.previewUrl }
      : null;

  return (
    <BaseLightbox
      item={item}
      onClose={onClose}
      renderActions={() =>
        purchase && (
          <DownloadButton
            mediaItemId={purchase.mediaItem.id}
            size="md"
            loading={isDownloading}
            disabled={isAnyDownloading}
            onDownload={onDownload}
          />
        )
      }
    />
  );
});

export default PurchaseLightbox;
