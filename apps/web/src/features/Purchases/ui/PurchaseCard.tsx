import { memo, useCallback } from 'react';
import { Text } from '@mantine/core';
import { formatPrice } from 'shared/lib/currency';
import { BaseCard } from 'shared/ui/BaseGallery';
import materials from 'shared/ui/design-system/materials.module.css';
import DownloadButton from './DownloadButton';
import classes from './PurchaseCard.module.css';

export interface PurchaseCardItem {
  id: string;
  amountPaid: number;
  previewUrl: string | null;
  mediaItem: { id: string; thumbnailUrl: string };
}

export interface PurchaseCardProps {
  purchase: PurchaseCardItem;
  isDownloading: boolean;
  isAnyDownloading: boolean;
  onDownload: (mediaItemId: string) => void;
  onPreview: (mediaItemId: string) => void;
}

function PurchaseCard({
  purchase,
  isDownloading,
  isAnyDownloading,
  onDownload,
  onPreview,
}: PurchaseCardProps) {
  const handleClick = useCallback(() => {
    if (purchase.previewUrl) onPreview(purchase.mediaItem.id);
  }, [purchase.previewUrl, purchase.mediaItem.id, onPreview]);

  return (
    <BaseCard
      imageUrl={purchase.mediaItem.thumbnailUrl}
      resourceType="image"
      alt="Purchased media"
      className={purchase.previewUrl ? classes.card : classes.cardStatic}
      onClick={handleClick}
      overlays={
        <Text size="xs" fw={700} className={materials.mediaTextOverlay}>
          {formatPrice(purchase.amountPaid)}
        </Text>
      }
      actions={
        <DownloadButton
          mediaItemId={purchase.mediaItem.id}
          size="sm"
          loading={isDownloading}
          disabled={isAnyDownloading}
          onDownload={onDownload}
        />
      }
    />
  );
}

export default memo(PurchaseCard);
