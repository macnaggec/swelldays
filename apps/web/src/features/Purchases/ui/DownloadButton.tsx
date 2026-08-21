import { memo, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';

export interface DownloadButtonProps {
  mediaItemId: string;
  size: 'sm' | 'md';
  loading: boolean;
  disabled: boolean;
  onDownload: (mediaItemId: string) => void;
}

/**
 * DownloadButton — triggers a signed download for a purchased media item.
 *
 * Calls `onDownload` with the media item id.
 */
const DownloadButton = memo(function DownloadButton({
  mediaItemId,
  size,
  loading,
  disabled,
  onDownload,
}: DownloadButtonProps) {
  const isLightboxSize = size === 'md';
  const actionSize = isLightboxSize ? 44 : size;
  const iconSize = isLightboxSize ? 24 : 14;

  const handleClick = useCallback(
    (_event: MouseEvent<HTMLButtonElement>) => {
      onDownload(mediaItemId);
    },
    [mediaItemId, onDownload],
  );

  return (
    <Tooltip label="Download original" withArrow withinPortal zIndex={4000}>
      <ActionIcon
        data-lightbox-icon-action={isLightboxSize ? 'true' : undefined}
        data-lightbox-icon-frame={isLightboxSize ? 'chip' : undefined}
        data-lightbox-tooltip-layer={isLightboxSize ? 'above-media' : undefined}
        variant="subtle"
        size={actionSize}
        radius="xl"
        loading={loading}
        disabled={disabled}
        onClick={handleClick}
        aria-label="Download original file"
      >
        <IconDownload size={iconSize} stroke={2} />
      </ActionIcon>
    </Tooltip>
  );
});

export default DownloadButton;
