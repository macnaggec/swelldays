import { useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { Center, Loader, Skeleton, Stack, Text } from '@mantine/core';
import { IconPhoto, IconMapPin } from '@tabler/icons-react';
import { useSessionFeed, type SurfSessionItem } from 'entities/SurfSession';
import type { BrowseFilters } from 'shared/model/browseFilters';
import { formatDateRange } from 'shared/lib/dateUtils';
import { PanelScrollChrome } from 'shared/ui/PanelScrollChrome';
import { DRAWER_SHELL_TRANSITION } from 'shared/ui/DrawerShell';
import { PanelCollectionGrid } from 'shared/ui/PanelCollectionGrid';
import styles from './SessionFeed.module.css';

// ─── Session card

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
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useSessionFeed({ spotId: spotIdProp, filters });

  const sessions = data?.pages.flatMap((p) => p.items) ?? [];

  useLayoutEffect(() => {
    if (isLoading) return;
    onLayoutReadyChange?.(true);
    return () => onLayoutReadyChange?.(false);
  }, [isLoading, onLayoutReadyChange]);

  return (
    <div className={styles.feed}>
      <PanelScrollChrome />
      {isLoading ? (
        <PanelCollectionGrid
          className={styles.grid}
          preview
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i}>
              <Skeleton height={0} className={styles.skeletonMedia} />
              <Skeleton height={14} mb={4} radius="sm" />
              <Skeleton height={11} width="60%" radius="sm" />
            </div>
          ))}
        </PanelCollectionGrid>
      ) : sessions.length === 0 ? (
        <Center h={200}>
          <Text size="sm" c="dimmed">No sessions found</Text>
        </Center>
      ) : (
        <>
          <PanelCollectionGrid className={styles.grid}>
            {sessions.map((s) => (
              <motion.div
                key={s.id}
                layout="position"
                transition={{ layout: DRAWER_SHELL_TRANSITION }}
              >
                <SessionCard
                  session={s}
                  onClick={() => onSessionClick?.(s)}
                />
              </motion.div>
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
