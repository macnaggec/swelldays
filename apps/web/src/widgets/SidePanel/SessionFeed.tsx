import { useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { Center, Loader, Skeleton, Stack, Text } from '@mantine/core';
import { IconPhoto, IconMapPin } from '@tabler/icons-react';
import { useSessionFeed, type SurfSessionItem } from 'entities/SurfSession';
import { PanelCollectionEmptyState } from 'shared/ui/PanelCollectionEmptyState';
import { PanelQueryError } from 'shared/ui/PanelQueryError';
import type { BrowseFilters } from 'shared/model/browseFilters';
import { formatDateRange } from 'shared/lib/dateUtils';
import { DRAWER_SHELL_TRANSITION } from 'shared/ui/DrawerShell';
import { PanelCollectionGrid, usePanelCollectionColumns } from 'shared/ui/PanelCollectionGrid';
import styles from './SessionFeed.module.css';

// ─── Session card

/**
 * A card in its grid slot, which glides between slots when the panel re-columns.
 *
 * Its own component rather than inline markup so it sits *inside* the grid and can read
 * the column count from it: the glide only happens if the card re-renders when the
 * count changes, and a card rendered by this file's parent would be skipped by React
 * and jump instead. `layoutDependency` then limits re-measuring to exactly that change,
 * so ordinary feed updates do not pay for it.
 */
function FeedCardSlot({ session, onClick }: { session: SurfSessionItem; onClick: () => void }) {
  const columns = usePanelCollectionColumns();
  return (
    <motion.div
      layout="position"
      layoutDependency={columns}
      transition={{ layout: DRAWER_SHELL_TRANSITION }}
    >
      <SessionCard session={session} onClick={onClick} />
    </motion.div>
  );
}

function SessionCard({ session, onClick }: { session: SurfSessionItem; onClick: () => void }) {
  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardMedia}>
        {session.thumbnailUrl ? (
          <img
            src={session.thumbnailUrl}
            alt={session.spot.name}
            className={styles.thumbnail}
          />
        ) : (
          <Center className={styles.emptyMedia}>
            <IconPhoto size={24} className={styles.emptyMediaIcon} />
          </Center>
        )}
      </div>

      <Stack gap={2} className={styles.cardMeta}>
        <Text size="sm" fw={600} truncate>
          {session.spot.name}
        </Text>
        <Text size="xs" c="dimmed" truncate className={styles.locationText}>
          <IconMapPin size={10} className={styles.locationIcon} />
          {session.spot.location}
        </Text>
        <Text size="xs" c="dimmed">
          {formatDateRange(session.startsAt, session.endsAt)}
        </Text>
      </Stack>
    </div>
  );
}

// ─── Feed

interface SessionFeedProps {
  filters?: BrowseFilters;
  onSessionClick?: (session: SurfSessionItem) => void;
  /** Route-driven spot filter — takes precedence over mapStore.selection. */
  spotId?: string;
  /** Reports whether real cards are committed for a route-driven panel transition. */
  onLayoutReadyChange?: (ready: boolean) => void;
}

export function SessionFeed({
  filters,
  onSessionClick,
  spotId: spotIdProp,
  onLayoutReadyChange,
}: SessionFeedProps) {
  const { data, isLoading, isError, refetch, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useSessionFeed({ spotId: spotIdProp, filters });

  const sessions = data?.pages.flatMap((p) => p.items) ?? [];

  const hasDateFilter = !!filters?.date;
  const hasFavoriteFilter = !!filters?.favoriteSpotsOnly;
  const hasActiveFilters = hasDateFilter || hasFavoriteFilter;
  const emptyDescription = hasDateFilter && hasFavoriteFilter
    ? 'Try another date or turn off Favorites to widen the feed.'
    : hasDateFilter
      ? 'Try another date to widen the feed.'
      : hasFavoriteFilter
        ? 'Turn off Favorites to widen the feed.'
        : 'Published sessions will show up here. Use Upload above to add the first one.';

  useLayoutEffect(() => {
    if (isLoading) return;
    onLayoutReadyChange?.(true);
    return () => onLayoutReadyChange?.(false);
  }, [isLoading, onLayoutReadyChange]);

  return (
    <div className={styles.feed}>
      {isLoading ? (
        <PanelCollectionGrid
          className={styles.grid}
          preview
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i}>
              <Skeleton height={0} className={styles.skeletonMedia} />
              <Skeleton height={14} mb={4} radius="sm" />
              <Skeleton height={11} width="70%" mb={4} radius="sm" />
              <Skeleton height={11} width="45%" radius="sm" />
            </div>
          ))}
        </PanelCollectionGrid>
      ) : isError ? (
        <PanelQueryError
          title="Couldn't load the feed"
          description="Something went wrong loading these sessions. Try again."
          onRetry={refetch}
        />
      ) : sessions.length === 0 ? (
        <PanelCollectionEmptyState
          title={hasActiveFilters ? 'No sessions match this view' : 'No sessions here yet'}
          description={emptyDescription}
        />
      ) : (
        <>
          <PanelCollectionGrid className={styles.grid}>
            {sessions.map((s) => (
              <FeedCardSlot
                key={s.id}
                session={s}
                onClick={() => onSessionClick?.(s)}
              />
            ))}
          </PanelCollectionGrid>

          {hasNextPage && !isFetchingNextPage && (
            <Center py="md">
              <Loader size="sm" onClick={() => fetchNextPage()} className={styles.loadMore} />
            </Center>
          )}
          {isFetchingNextPage && (
            <Center py="md"><Loader size="sm" /></Center>
          )}
        </>
      )}
    </div>
  );
}
