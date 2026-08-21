import { memo } from 'react';
import { Badge, Button, Group, ActionIcon, Loader, rem, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import classes from './UploadCardRenderer.module.css';
import { IconRefresh, IconX } from '@tabler/icons-react';
import { DraftMedia, MEDIA_STATUS } from 'entities/Media';
import { formatPrice } from 'shared/lib/currency';
import { formatDimensions } from 'shared/lib/formatDimensions';
import { GalleryCard, AttemptCardStatus } from '../../model';
import DraftCard from '../cards/DraftCard';

interface UploadCardRendererProps {
  item: GalleryCard;
  /** Called when the user clicks the remove (X) button */
  onRemove?: (kind: GalleryCard['kind'], id: string) => void;
  /** Callback to retry failed upload */
  onRetry?: (id: string) => void;
  /** Whether the item has a date validation error (computed by parent) */
  hasDateError?: boolean;
  /** When true, suppresses the remove button (e.g. item is in committed 'saving' state) */
  hideRemove?: boolean;
}

/**
 * UploadCardRenderer - Memoized card renderer
 *
 * Dispatches rendering by card.kind:
 *   'existing' / 'asset' — ready workspace media, always shows DraftCard overlays
 *   'attempt'            — pipeline item, shows progress/error overlays until completed
 *
 * Handles both uploading and completed states.
 */
export const UploadCardRenderer = memo<UploadCardRendererProps>(({
  item,
  onRemove,
  onRetry,
  hasDateError,
  hideRemove,
}) => {
  if (item.kind === 'attempt' && item.status === 'ACQUIRING') {
    return <Skeleton radius="md" className={classes.importingCard} />;
  }

  const mediaItem = item.kind !== 'attempt' ? item.result : null;

  // Use thumbnailUrl (JPEG poster frame) for both image and video drafts.
  // Video attempts use previewUrl which is a blob URL — renders fine as <img>
  // only for images; video attempts show an empty card with the progress overlay.
  const imageUrl = mediaItem
    ? mediaItem.thumbnailUrl
    : item.kind === 'attempt' ? (item.resourceType === 'image' ? item.previewUrl : '') : '';

  const resourceType = (mediaItem
    ? mediaItem.resource.resourceType
    : item.kind === 'attempt' ? item.resourceType : 'image') as 'image' | 'video';

  const alt = mediaItem
    ? `Media ${mediaItem.resource.assetId}`
    : 'Upload preview';

  const overlays = item.kind !== 'attempt'
    ? (mediaItem ? renderDraftOverlay(mediaItem) : null)
    : renderUploadOverlay(
        item.status,
        item.progress ?? 0,
        item.errorCode,
        item.id,
        item.source === 'LOCAL' ? onRetry : undefined,
      );

  const actionButton = !hideRemove && onRemove ? (
    <ActionIcon
      variant="transparent"
      size="sm"
      radius="xl"
      aria-label="Remove"
      className={classes.actionBtn}
      onClick={(e) => {
        e.stopPropagation();
        onRemove(item.kind, item.id);
      }}
    >
      <IconX style={{ width: rem(12), height: rem(12) }} />
    </ActionIcon>
  ) : undefined;

  return (
    <DraftCard
      imageUrl={imageUrl}
      resourceType={resourceType}
      alt={alt}
      overlays={overlays}
      actions={actionButton}
      validation={hasDateError ? { hasError: true, message: 'Date required for publishing' } : undefined}
    />
  );
});

UploadCardRenderer.displayName = 'UploadCardRenderer';

function renderDraftOverlay(mediaItem: DraftMedia) {
  const isDateFromExif = mediaItem.dateSource === 'exif';
  const formattedDate = mediaItem.capturedAt
    ? new Date(mediaItem.capturedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const badges = [];

  if (mediaItem.status === MEDIA_STATUS.DRIVE_PENDING) {
    badges.push(<Badge key="drive" size="sm" color="blue" variant="light">Drive</Badge>);
  }

  if (mediaItem.price != null) {
    badges.push(
      <Badge key="price" size="sm" color="green" variant="filled">{formatPrice(mediaItem.price)}</Badge>
    );
  }

  const dimensions = formatDimensions(mediaItem.width, mediaItem.height);
  if (dimensions) {
    badges.push(<Badge key="size" size="sm" color="gray" variant="light">{dimensions}</Badge>);
  }

  if (formattedDate) {
    badges.push(<Badge key="date" size="sm" color="blue" variant="filled">{formattedDate}</Badge>);
  } else {
    badges.push(<Badge key="missing-date" size="sm" color="red" variant="filled">Missing Date</Badge>);
  }

  if (isDateFromExif) {
    badges.push(<Badge key="auto" size="xs" color="cyan" variant="light">Auto</Badge>);
  }

  return <Group gap="xs">{badges}</Group>;
}

function renderUploadOverlay(
  status: AttemptCardStatus,
  progress: number,
  errorCode: string | undefined,
  itemId: string,
  onRetry: ((id: string) => void) | undefined,
) {
  if (status === 'FAILED' || errorCode) {
    return (
      <Stack gap={4} align="center">
        <Tooltip label={errorCode ?? 'Upload failed'} multiline maw={200}>
          <Text size="xs" c="red" lineClamp={1} ta="center">{errorCode ?? 'Upload failed'}</Text>
        </Tooltip>
        {onRetry && (
          <Button
            size="compact-xs"
            variant="light"
            color="blue"
            leftSection={<IconRefresh size={12} />}
            onClick={(e) => { e.stopPropagation(); onRetry(itemId); }}
          >
            Retry
          </Button>
        )}
      </Stack>
    );
  }

  let label: string | null = null;
  if (status === 'pending' || status === 'READY') label = progress > 0 ? `${progress}%` : 'Preparing…';
  else if (status === 'FINALIZING') label = 'Saving…';
  else if (progress === 100) label = 'Processing…';
  else if (progress > 0) label = `${progress}%`;

  return (
    <Group gap="xs">
      <Loader size="xs" />
      {label && <Text size="xs" c="dimmed">{label}</Text>}
    </Group>
  );
}
