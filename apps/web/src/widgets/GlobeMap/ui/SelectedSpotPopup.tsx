import type { ReactNode } from 'react';
import { Popup } from 'react-map-gl';
import { ActionIcon, Group, Paper, Text, rem } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { materialClasses } from 'shared/ui/design-system';
import type { MapSpotProjection } from '../model/mapSpotProjection';
import classes from './SelectedSpotPopup.module.css';

interface SelectedSpotPopupProps {
  spot: MapSpotProjection;
  /** Feature-owned content (e.g. a favorite toggle) rendered next to the spot name — GlobeMap stays feature-agnostic. */
  renderExtra?: (spot: MapSpotProjection) => ReactNode;
  /** Clears the spot selection. Omit to render the popup without a close control. */
  onClear?: () => void;
}

export function SelectedSpotPopup({ spot, renderExtra, onClear }: SelectedSpotPopupProps) {
  return (
    <Popup
      longitude={spot.coords.lng}
      latitude={spot.coords.lat}
      offset={20}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
    >
      <Paper p="xs" shadow="xs" radius="lg" withBorder className={`${materialClasses.chrome} ${classes.paper}`}>
        <Group gap="xs" wrap="nowrap" justify="space-between">
          <Text size="sm" fw={500}>{spot.name}</Text>
          {renderExtra?.(spot)}
        </Group>
        {onClear && (
          <ActionIcon
            variant="transparent"
            size={18}
            radius="xl"
            aria-label="Clear selected spot"
            className={classes.clearButton}
            // Inline, not the CSS module: Mantine's own hover state overrides an
            // externally stylesheeted color, and the icon must stay white regardless.
            style={{ color: 'var(--wa-text-inverse)' }}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            <IconX style={{ width: rem(11), height: rem(11) }} />
          </ActionIcon>
        )}
      </Paper>
    </Popup>
  );
}
