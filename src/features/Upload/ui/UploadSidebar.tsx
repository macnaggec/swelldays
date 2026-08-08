import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { notify } from 'shared/lib/notifications';
import { getViewportCapabilitiesSnapshot } from 'shared/model/viewportCapabilities';
import { MIN_MEDIA_PRICE_CENTS } from 'entities/Media';
import {
  useUploadManager,
  usePublishUploadSession,
  useUploadQueue,
  getUploadQueueStatus,
  isVideoItem,
  type UploadPublishViolation,
  type UploadWorkspaceSeed,
} from '../model';
import { useTRPC } from 'shared/lib/trpc';
import { UploadStep } from './steps/UploadStep';
import { PriceStep } from './steps/PriceStep';
import { TimeStep } from './steps/TimeStep';
import { combineDateAndTime, minutesToTime } from './steps/helpers';
import { PanelLayoutFooter } from 'shared/ui/PanelLayout';
import styles from './UploadSidebar.module.css';
import type { UploadWorkspaceState } from 'shared/types/uploadWorkspace';

interface UploadSidebarProps {
  header?: ReactNode;
  /** Registers the panel's chevron back control. Going back is non-destructive:
   *  the draft workspace and in-flight transfers survive it. */
  onBackActionChange?: (action: { onBack: () => void; disabled: boolean } | null) => void;
  workspaceState?: UploadWorkspaceState;
  spotId?: string | null;
  /** Leave the panel without touching the workspace (back chevron, after discard/publish). */
  onClose: () => void;
  onComplete: (sessionId: string) => void;
  /** Fired once a new-upload workspace is lazily created by the first file/drive upload. */
  onWorkspaceCreated?: (workspaceId: string) => void;
  /** Fired after the media gallery successfully discards its workspace. */
  onWorkspaceDiscarded?: () => void;
}

function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function UploadSidebar({
  workspaceState,
  ...props
}: UploadSidebarProps) {
  return (
    <UploadSidebarContent
      key={workspaceState?.workspace.id ?? 'new-upload'}
      workspaceState={workspaceState}
      {...props}
    />
  );
}

function UploadSidebarContent({
  header,
  onBackActionChange,
  workspaceState,
  spotId = null,
  onClose,
  onComplete,
  onWorkspaceCreated,
  onWorkspaceDiscarded,
}: UploadSidebarProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: updateWorkspace } = useMutation(trpc.uploads.updateWorkspace.mutationOptions());
  const workspace = workspaceState?.workspace;
  const workspaceId = workspace?.id;
  const isEditMode = workspace?.kind === 'SESSION_EDIT';
  const [photoPrice, setPhotoPrice] = useState(workspace?.photoPrice ?? MIN_MEDIA_PRICE_CENTS);
  const [videoPrice, setVideoPrice] = useState(workspace?.videoPrice ?? MIN_MEDIA_PRICE_CENTS);
  const [sessionDate, setSessionDate] = useState<Date | null>(
    workspace?.startsAt ? new Date(workspace.startsAt) : null,
  );
  const [sessionRange, setSessionRange] = useState<[number, number]>(() => (
    workspace?.startsAt && workspace?.endsAt
      ? [dateToMinutes(new Date(workspace.startsAt)), dateToMinutes(new Date(workspace.endsAt))]
      : [360, 600]
  ));
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const spotSectionRef = useRef<HTMLElement | null>(null);
  const mediaSectionRef = useRef<HTMLElement | null>(null);
  const priceSectionRef = useRef<HTMLElement | null>(null);
  const timeSectionRef = useRef<HTMLElement | null>(null);
  const pulseFrameRef = useRef<number | null>(null);
  const [flashingViolation, setFlashingViolation] = useState<UploadPublishViolation | null>(null);

  const { queue, hasActiveUploads, selectableItems } = useUploadQueue(workspaceState);

  const saveWorkspaceFields = useCallback((changes: {
    spotId?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    photoPrice?: number;
    videoPrice?: number;
  }) => {
    if (!workspaceId) return Promise.resolve(true);
    const save = saveQueueRef.current.then(async () => {
      try {
        await updateWorkspace({ workspaceId, ...changes });
        await queryClient.invalidateQueries({
          queryKey: trpc.uploads.getWorkspaceState.queryKey({ workspaceId }),
        });
        return true;
      } catch (error) {
        notify.error(getErrorMessage(error), 'Workspace Save Failed');
        return false;
      }
    });
    saveQueueRef.current = save.then(() => undefined);
    return save;
  }, [queryClient, trpc, updateWorkspace, workspaceId]);

  const seed: UploadWorkspaceSeed = {
    spotId,
    startsAt: sessionDate ? combineDateAndTime(sessionDate, minutesToTime(sessionRange[0])) : null,
    endsAt: sessionDate ? combineDateAndTime(sessionDate, minutesToTime(sessionRange[1])) : null,
    photoPrice,
    videoPrice,
  };

  const {
    addFiles,
    addDriveSelections,
    remove,
    retry,
    discardAll,
    abortAllTransfers,
  } = useUploadManager(workspaceId, seed, onWorkspaceCreated);

  const handleGalleryDiscard = useCallback(async () => {
    await discardAll();
    onWorkspaceDiscarded?.();
  }, [discardAll, onWorkspaceDiscarded]);

  const showPhotoPrice = queue.length === 0 || queue.some((card) => !isVideoItem(card));
  const showVideoPrice = queue.length === 0 || queue.some(isVideoItem);

  const { canPublish, hasTriedPublish, isPending, publish, violations } = usePublishUploadSession({
    workspaceId,
    spot: spotId ? { id: spotId } : null,
    queue,
    sessionDate,
    sessionRange,
    photoPrice,
    videoPrice,
    onComplete,
  });

  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const queueStatus = useMemo(() => getUploadQueueStatus(queue), [queue]);

  const handleDiscard = useCallback(async () => {
    setIsConfirmingDiscard(false);
    setIsDiscarding(true);
    try {
      if (workspaceId) {
        try {
          await discardAll();
        } catch {
          return; // discardAll already notified the failure
        }
      } else {
        abortAllTransfers();
      }
      onClose();
    } finally {
      setIsDiscarding(false);
    }
  }, [workspaceId, discardAll, abortAllTransfers, onClose]);

  // Confirm only when there is something to lose; an empty draft discards silently.
  const handleCancelClick = useCallback(() => {
    if (queue.length > 0) {
      setIsConfirmingDiscard(true);
    } else {
      void handleDiscard();
    }
  }, [handleDiscard, queue.length]);

  useEffect(() => {
    if (!onBackActionChange) return undefined;
    onBackActionChange({
      disabled: isPending || isDiscarding,
      onBack: onClose,
    });
    return () => onBackActionChange(null);
  }, [isDiscarding, isPending, onBackActionChange, onClose]);

  useEffect(() => () => {
    if (pulseFrameRef.current !== null) window.cancelAnimationFrame(pulseFrameRef.current);
  }, []);

  const handleTimeChange = useCallback((date: Date | null, range: [number, number]) => {
    setSessionDate(date);
    setSessionRange(range);
  }, []);

  const handleTimeCommit = useCallback((date: Date | null, range: [number, number]) => {
    void saveWorkspaceFields({
      startsAt: date ? combineDateAndTime(date, minutesToTime(range[0])) : null,
      endsAt: date ? combineDateAndTime(date, minutesToTime(range[1])) : null,
    });
  }, [saveWorkspaceFields]);

  const handlePublish = useCallback(async () => {
    if (!canPublish) {
      const firstViolation = violations[0];
      setFlashingViolation(null);
      await publish();

      if (firstViolation) {
        const target = firstViolation === 'spot'
          ? spotSectionRef.current
          : firstViolation === 'media'
            ? mediaSectionRef.current
            : firstViolation === 'price'
              ? priceSectionRef.current
              : timeSectionRef.current;
        const { prefersReducedMotion } = getViewportCapabilitiesSnapshot();

        target?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'center',
        });

        if (!prefersReducedMotion) {
          if (pulseFrameRef.current !== null) window.cancelAnimationFrame(pulseFrameRef.current);
          pulseFrameRef.current = window.requestAnimationFrame(() => {
            setFlashingViolation(firstViolation);
            pulseFrameRef.current = null;
          });
        }
      }
      return;
    }
    const saved = await saveWorkspaceFields({
      spotId,
      startsAt: sessionDate ? combineDateAndTime(sessionDate, minutesToTime(sessionRange[0])) : null,
      endsAt: sessionDate ? combineDateAndTime(sessionDate, minutesToTime(sessionRange[1])) : null,
      photoPrice,
      videoPrice,
    });
    if (!saved) return;
    await publish();
  }, [canPublish, photoPrice, publish, saveWorkspaceFields, sessionDate, sessionRange, spotId, videoPrice, violations]);

  const validationProps = (violation: UploadPublishViolation) => {
    const isInvalid = hasTriedPublish && violations.includes(violation);
    const isFlashing = isInvalid && flashingViolation === violation;
    const sectionClassName = violation === 'spot'
      ? styles.spotSection
      : violation === 'media'
        ? `${styles.mediaSection} ${styles.detailSection}`
        : styles.detailSection;
    return {
      'aria-invalid': isInvalid ? true : undefined,
      'data-ready': violations.includes(violation) ? 'false' : 'true',
      'data-validation-pulse': isFlashing ? 'true' : undefined,
      className: `${styles.validationSection} ${sectionClassName}`,
      onAnimationEnd: () => { if (isFlashing) setFlashingViolation(null); },
    };
  };

  return (
    <Stack gap="var(--upload-section-gap)" className={styles.sidebar}>
      {header && (
        <Box
          component="section"
          ref={spotSectionRef}
          aria-label="Spot"
          {...validationProps('spot')}
        >
          {header}
        </Box>
      )}

      {/* Files */}
      <Box component="section" ref={mediaSectionRef} aria-label="Media" {...validationProps('media')}>
        <UploadStep
          queue={queue}
          hasActiveUploads={hasActiveUploads}
          selectableItems={selectableItems}
          addFiles={addFiles}
          addDriveSelections={addDriveSelections}
          remove={remove}
          retry={retry}
          discardAll={handleGalleryDiscard}
        />
      </Box>

      {/* Price */}
      <Box component="section" ref={priceSectionRef} aria-label="Price" {...validationProps('price')}>
        <PriceStep
          hasTriedPublish={hasTriedPublish}
          photoPrice={photoPrice}
          videoPrice={videoPrice}
          onPhotoPriceChange={setPhotoPrice}
          onVideoPriceChange={setVideoPrice}
          onPhotoPriceCommit={(nextPhotoPrice) => { void saveWorkspaceFields({ photoPrice: nextPhotoPrice }); }}
          onVideoPriceCommit={(nextVideoPrice) => { void saveWorkspaceFields({ videoPrice: nextVideoPrice }); }}
          showPhotoPrice={showPhotoPrice || (hasTriedPublish && photoPrice < MIN_MEDIA_PRICE_CENTS)}
          showVideoPrice={showVideoPrice || (hasTriedPublish && videoPrice < MIN_MEDIA_PRICE_CENTS)}
          isFlashing={flashingViolation === 'price'}
        />
      </Box>

      {/* Date / Time */}
      <Box component="section" ref={timeSectionRef} aria-label="Shoot time" {...validationProps('time')}>
        <TimeStep
          date={sessionDate}
          range={sessionRange}
          onChange={handleTimeChange}
          onCommit={handleTimeCommit}
          hasTriedPublish={hasTriedPublish}
          hasError={hasTriedPublish && violations.includes('time')}
          isFlashing={flashingViolation === 'time'}
          isReady={!violations.includes('time')}
        />
      </Box>

      <PanelLayoutFooter>
        {/* Cancel discards the draft; Publish finalizes it. PanelLayout owns placement. */}
        <Box component="footer" className={styles.publishFooter} data-ready={canPublish ? 'true' : 'false'}>
          <Group className={styles.footerActions} gap="sm" justify="center">
          <Popover
            opened={isConfirmingDiscard}
            onChange={setIsConfirmingDiscard}
            position="top"
            withArrow
            shadow="md"
            transitionProps={{ duration: 0 }}
          >
            <Popover.Target>
              <Button
                className={styles.cancelButton}
                variant="transparent"
                disabled={isPending}
                loading={isDiscarding}
                onClick={handleCancelClick}
              >
                Cancel
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="sm" maw={240}>
                <Text size="sm" fw={600}>
                  {isEditMode ? 'Discard changes to this session?' : 'Discard this upload?'}
                </Text>
                <Text size="xs" c="dimmed">
                  {isEditMode
                    ? 'The session stays published. Staged changes will be reverted.'
                    : [
                      queueStatus.readyItems.length > 0
                        && `${queueStatus.readyItems.length} uploaded ${queueStatus.readyItems.length === 1 ? 'file' : 'files'} will be deleted.`,
                      queueStatus.uploadingCount > 0
                        && `${queueStatus.uploadingCount} ${queueStatus.uploadingCount === 1 ? 'upload' : 'uploads'} in progress will stop.`,
                      queueStatus.errorCards.length > 0
                        && `${queueStatus.errorCards.length} failed ${queueStatus.errorCards.length === 1 ? 'upload' : 'uploads'} will be removed.`,
                    ].filter(Boolean).join(' ')}
                </Text>
                <Group gap="xs" grow>
                  <Button
                    size="xs"
                    radius="xl"
                    color="red"
                    variant="light"
                    onClick={() => { void handleDiscard(); }}
                  >
                    Discard
                  </Button>
                  <Button
                    size="xs"
                    radius="xl"
                    variant="subtle"
                    onClick={() => setIsConfirmingDiscard(false)}
                  >
                    Keep
                  </Button>
                </Group>
              </Stack>
            </Popover.Dropdown>
          </Popover>
          <Button
            className={styles.publishButton}
            variant="transparent"
            disabled={isDiscarding}
            loading={isPending}
            onClick={() => { void handlePublish(); }}
          >
            {isEditMode ? 'Save' : 'Publish session'}
          </Button>
          </Group>
        </Box>
      </PanelLayoutFooter>

    </Stack>
  );
}
