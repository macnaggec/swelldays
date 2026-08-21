import type { ReactNode } from 'react';
import { Popup } from 'react-map-gl';
import { Group, Paper, Text } from '@mantine/core';
import { materialClasses } from 'shared/ui/design-system';
import type { MapSpotProjection } from '../model/mapSpotProjection';

interface SelectedSpotPopupProps {
  spot: MapSpotProjection;
  /** Feature-owned content (e.g. a favorite toggle) rendered next to the spot name — GlobeMap stays feature-agnostic. */
  renderExtra?: (spot: MapSpotProjection) => ReactNode;
}

export function SelectedSpotPopup({ spot, renderExtra }: SelectedSpotPopupProps) {
  return (
    <Popup
      longitude={spot.coords.lng}
      latitude={spot.coords.lat}
      offset={20}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
    >
      <Paper p="xs" shadow="xs" radius="lg" withBorder className={materialClasses.chrome}>
        <Group gap="xs" wrap="nowrap" justify="space-between">
          <Text size="sm" fw={500}>{spot.name}</Text>
          {renderExtra?.(spot)}
        </Group>
      </Paper>
    </Popup>
  );
}
