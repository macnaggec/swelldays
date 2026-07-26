import React, { FC, memo, useMemo, useCallback, useRef } from 'react';
import { Box, Button, Divider, Group, Loader, Menu, Modal, rem, Text } from '@mantine/core';
import { IconAlertCircle, IconBrandGoogleDrive, IconFolderOpen } from '@tabler/icons-react';
import { GalleryCard, getItemId, getUploadQueueStatus } from '../../model';
import { BaseGallery, SelectionToolbar } from 'shared/ui/BaseGallery';
import { UseGallerySelectionReturn } from 'shared/hooks/gallery';
import { UploadCardRenderer } from './UploadCardRenderer';
import { handleFileSelection } from '../../lib/fileSelection';
import materials from 'shared/ui/design-system/materials.module.css';
import styles from './StepModeModal.module.css';

export interface StepModeModalProps {
  opened: boolean;
  onClose: () => void;
  items: GalleryCard[];
  selection: UseGallerySelectionReturn<GalleryCard>;
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
  selection,
  onDiscardAll,
  onRemove,
  onAddFiles,
  onDriveImport,
  driveLoading,
  onRetry,
}) => {
  const queueStatus = useMemo(() => getUploadQueueStatus(items), [items]);
  const { errorCards, hasActiveUploads, uploadingCount } = queueStatus;

  // ========================================================================
  // FILE HANDLING
  // ========================================================================

  const handleAddFiles = useCallback((files: File[]) => {
    selection.disableSelectionMode();
    onAddFiles?.(files);
  }, [onAddFiles, selection]);

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

  const handleBulkDelete = useCallback(
    async (selectedCards: GalleryCard[]) => {
      await Promise.all(selectedCards.map(card => onRemove(card.kind, card.id)));
      selection.clearSelection();
    },
    [onRemove, selection]
  );

  const renderActions = useCallback(
    (selectedCards: GalleryCard[]) => (
      <Menu.Item
        color="red"
        leftSection={<IconAlertCircle style={{ width: rem(14), height: rem(14) }} />}
        onClick={() => handleBulkDelete(selectedCards)}
      >
        Delete {selectedCards.length} {selectedCards.length === 1 ? 'item' : 'items'}
      </Menu.Item>
    ),
    [handleBulkDelete]
  );

  const renderCard = useCallback(
    (card: GalleryCard, context: { isSelectionMode: boolean }) => {
      const isSaving = card.kind === 'attempt' && card.status === 'FINALIZING';
      const hasDateError = card.kind !== 'attempt' && !card.result.capturedAt;
      return (
        <UploadCardRenderer
          item={card}
          onRetry={onRetry}
          onRemove={context.isSelectionMode ? undefined : (kind, id) => onRemove(kind, id)}
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
      title="Selected media"
      classNames={{
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
            selection={selection}
            toolbar={
              <SelectionToolbar
                selection={selection}
                renderActions={renderActions}
              />
            }
            renderCard={renderCard}
          />
        </Box>
      </div>

      <Divider className={materials.divider} />
      <Group px="sm" py="xs" justify="space-between">
        <Button
          variant="transparent" size="xs" radius="xl"
          className={styles.footerAction}
          onClick={handleCancelAll}
        >
          Discard
        </Button>
        <Group gap="xs">
          {onAddFiles && (
            <Menu position="top-end" zIndex={501}>
              <Menu.Target>
                <Button
                  variant="transparent" size="xs" radius="xl"
                  className={styles.footerAction}
                  loading={driveLoading}
                >
                  Add more
                </Button>
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
          {hasActiveUploads ? (
            <Group gap="xs">
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
          <Button
            variant="transparent" size="xs" radius="xl"
            className={materials.controlButton}
            onClick={onClose}
          >
            Close
          </Button>
        </Group>
      </Group>
    </Modal>
  );
});

StepModeModal.displayName = 'StepModeModal';
