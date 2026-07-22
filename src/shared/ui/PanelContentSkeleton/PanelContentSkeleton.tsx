

import { Skeleton, Stack } from '@mantine/core';
import { PanelCollectionGrid } from 'shared/ui/PanelCollectionGrid';

const CARD_COUNT = 9;

/**
 * PanelContentSkeleton — loading placeholder for the spot panel tab body.
 *
 * Mirrors BaseGallery's panel-container grid so the transition from skeleton
 * to content is visually stable. Used as the Suspense fallback in SpotLayout
 * while the async view (gallery or upload) is in-flight.
 */
export function PanelContentSkeleton() {
  return (
    <Stack gap="md">
      <PanelCollectionGrid preview>
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <Skeleton key={i} height={110} radius="sm" />
        ))}
      </PanelCollectionGrid>
    </Stack>
  );
}
