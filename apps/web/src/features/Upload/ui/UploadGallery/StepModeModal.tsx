import React, { FC, memo, useMemo, useCallback, useRef } from 'react';
import { Box, Divider, Group, Loader, Menu, Modal, rem, Text } from '@mantine/core';
import { IconBrandGoogleDrive, IconFolderOpen } from '@tabler/icons-react';
import { GalleryCard, getItemId, getUploadQueueStatus } from '../../model';
import { BaseGallery } from 'shared/ui/BaseGallery';
import { resolveModalWorkspacePresentation, useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { UploadCardRenderer } from './UploadCardRenderer';
import { handleFileSelection } from '../../lib/fileSelection';
import materials from 'shared/ui/design-system/materials.module.css';
import { AppButton } from 'shared/ui/AppButton';
import styles from './StepModeModal.module.css';

export interface StepModeModalProps {
  opened: boolean;
  onClose: () => void;
  items: GalleryCard[];
  /** Required — ensures Cloudinary cleanup path is never silently dropped. */
  onDiscardAll: () => Promise<void>;
  onRemove: (kind: GalleryCard['kind'], id: string) => Promise<void>;
  onAddFiles?: (files: File[]) => void;
  onDriveImport?: () => void;
  driveLoading?: boolean;
  onRetry?: (id: string) => void;
}

export const StepModeModal: FC<StepModeModalProps> = memo(({
  opened,
  onClose,
  items,
  onDiscardAll,
  onRemove,
  onAddFiles,
  onDriveImport,
  driveLoading,
  onRetry,
}) => {
  const queueStatus = useMemo(() => getUploadQueueStatus(items), [items]);
  const { errorCards, hasActiveUploads, uploadingCount } = queueStatus;

  const { sizeBand, heightBand } = useViewportCapabilities();
  const presentation = resolveModalWorkspacePresentation(sizeBand, heightBand);

  // ========================================================================
  // FILE HANDLING
  // ========================================================================

  const handleAddFiles = useCallback((files: File[]) => {
    onAddFiles?.(files);
  }, [onAddFiles]);

  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const handleAddMoreChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    handleFileSelection(files, handleAddFiles);
  }, [handleAddFiles]);

  // ========================================================================
  // BULK ACTIONS
  // ========================================================================

  const handleCancelAll = useCallback(async () => {
    try {
      await onDiscardAll();
      onClose();
    } catch {
      // Modal stays open; error notification is handled inside discardAll/coordinator.
    }
  }, [onDiscardAll, onClose]);

  const renderCard = useCallback(
    (card: GalleryCard) => {
      const isSaving = card.kind === 'attempt' && card.status === 'FINALIZING';
      const hasDateError = card.kind !== 'attempt' && !card.result.capturedAt;
      return (
        <UploadCardRenderer
          item={card}
          onRetry={onRetry}
          onRemove={(kind, id) => onRemove(kind, id)}
          hideRemove={isSaving}
          hasDateError={hasDateError}
        />
      );
    },
    [onRemove, onRetry]
  );

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <Modal
      opened={opened && items.length > 0}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={false}
      size={1000}
      centered
      fullScreen={presentation !== 'dialog'}
      title="Selected media"
      data-upload-presentation={presentation}
      classNames={{
        root: styles.root,
        body: styles.body,
        content: styles.content,
        header: styles.header,
        title: styles.title,
        close: styles.close,
      }}
    >
      <input
        ref={addMoreInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleAddMoreChange}
        style={{ display: 'none' }}
      />
      <div className={styles.scroller}>
        <Box p="md">
          <BaseGallery<GalleryCard>
            items={items}
            getId={getItemId}
            renderCard={renderCard}
          />
        </Box>
      </div>

      <Divider className={materials.divider} />
      <div className={styles.footer}>
        <AppButton
          tone="destructive"
          className={styles.footerStart}
          onClick={handleCancelAll}
        >
          Discard
        </AppButton>

        <div className={styles.footerStatus}>
          {hasActiveUploads ? (
            <Group gap="xs" justify="center" wrap="nowrap">
              <Loader size="xs" />
              <Text size="xs" className={styles.footerText}>
                {uploadingCount} of {items.length} uploading…
              </Text>
            </Group>
          ) : errorCards.length > 0 ? (
            <Text size="xs" c="orange.4">
              Remove or retry failed uploads to continue
            </Text>
          ) : null}
        </div>

        <Group gap="xs" className={styles.footerEnd} wrap="nowrap">
          {onAddFiles && (
            <Menu position="top-end" zIndex={501}>
              <Menu.Target>
                <AppButton
                  loading={driveLoading}
                >
                  Add more
                </AppButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconFolderOpen style={{ width: rem(14), height: rem(14) }} />}
                  onClick={() => addMoreInputRef.current?.click()}
                >
                  From device
                </Menu.Item>
                {onDriveImport && (
                  <Menu.Item
                    leftSection={<IconBrandGoogleDrive style={{ width: rem(14), height: rem(14) }} />}
                    onClick={onDriveImport}
                  >
                    From Google Drive
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
          <AppButton
            onClick={onClose}
          >
            Close
          </AppButton>
        </Group>
      </div>
    </Modal>
  );
});

StepModeModal.displayName = 'StepModeModal';
