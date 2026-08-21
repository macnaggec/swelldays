import { FC, useEffect, useState } from 'react';
import { Popover, Button, Stack, NumberInput, Text, Box, Group, Tooltip } from '@mantine/core';
import { IconCurrencyDollar, IconChevronDown } from '@tabler/icons-react';
import { MIN_MEDIA_PRICE_CENTS } from 'entities/Media';
import materials from 'shared/ui/design-system/materials.module.css';

const MIN_PRICE = MIN_MEDIA_PRICE_CENTS / 100;

/**
 * Props for PriceEditPopover component
 */
export interface PriceEditPopoverProps {
  /** Current price value to display in dollars */
  value?: number;

  /** Callback when price is applied */
  onApply: (price: number) => void;

  /** Number of selected items (for Apply button text) */
  selectedCount?: number;
  /** Total number of applicable items (shown when selectedCount is 0) */
  totalCount?: number;
  /** Whether the popover is disabled */
  disabled?: boolean;
  /** Tooltip text to show when disabled */
  tooltip?: string;
  /** Optional label prefix shown in the trigger button (e.g. "Photos", "Videos") */
  label?: string;
}

/**
 * PriceEditPopover - Pill-style button with NumberInput popover
 *
 * Shows as a clickable pill that opens a popover for bulk price editing.
 * Used in Upload feature for editing prices on selected draft items.
 */
export const PriceEditPopover: FC<PriceEditPopoverProps> = ({
  value = 0,
  onApply,
  selectedCount = 0,
  totalCount = 0,
  disabled = false,
  tooltip,
  label,
}) => {
  const [opened, setOpened] = useState(false);
  const [draftPrice, setDraftPrice] = useState<number | string>(value >= MIN_PRICE ? value : MIN_PRICE);

  const numericValue = typeof draftPrice === 'number'
    ? draftPrice
    : parseFloat(String(draftPrice));

  const canApply = !isNaN(numericValue) && numericValue >= MIN_PRICE;

  const priceError = draftPrice === ''
    ? 'Enter a price'
    : !isNaN(numericValue) && numericValue < MIN_PRICE
      ? `Minimum price is $${MIN_PRICE.toFixed(2)}`
      : null;

  const displayPrice = value > 0 ? `$${value.toFixed(2)}` : 'Set price';
  const buttonLabel = label ? `${label} · ${displayPrice}` : displayPrice;

  const itemLabel = label ? label.toLowerCase() : (selectedCount === 1 ? 'item' : 'items');
  const footerMessage = selectedCount > 0
    ? `Applying to ${selectedCount} ${itemLabel}`
    : `Applying to all ${itemLabel}`;

  const footer = (selectedCount > 0 || totalCount > 0) ? (
    <Box p="xs" bg="blue.0" style={{ borderRadius: 'var(--mantine-radius-sm)' }}>
      <Text size="sm" c="dimmed" ta="center">
        {footerMessage}
      </Text>
    </Box>
  ) : null;

  useEffect(() => {
    if (opened) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: initialise draft price when popover opens
      setDraftPrice(value >= MIN_PRICE ? value : MIN_PRICE);
    }
  }, [opened, value]);

  const handleApply = () => {
    if (!canApply) return;
    onApply(numericValue);
    setOpened(false);
  };

  const handleCancel = () => {
    setDraftPrice(value >= MIN_PRICE ? value : MIN_PRICE);
    setOpened(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleApply();
    else if (e.key === 'Escape') handleCancel();
  };

  const popover = (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom"
      withArrow
      shadow="md"
    >
      <Popover.Target>
        <Button
          variant="transparent"
          size="xs"
          leftSection={<IconCurrencyDollar size={13} />}
          rightSection={<IconChevronDown size={11} />}
          disabled={disabled}
          radius="xl"
          className={materials.controlButton}
          onClick={() => setOpened((o) => !o)}
        >
          {buttonLabel}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="md">
          <NumberInput
            label="Price"
            placeholder="Enter price"
            value={draftPrice}
            onChange={setDraftPrice}
            onKeyDown={handleKeyDown}
            min={MIN_PRICE}
            step={0.01}
            decimalScale={2}
            fixedDecimalScale
            prefix="$"
            autoFocus
            size="md"
            radius="xl"
            error={priceError}
          />

          {footer}

          <Group gap="xs" grow>
            <Button onClick={handleApply} disabled={!canApply} radius="xl">
              Apply
            </Button>
            <Button variant="subtle" onClick={handleCancel} radius="xl">
              Cancel
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );

  if (disabled && tooltip) {
    return (
      <Tooltip label={tooltip} withinPortal>
        <Box>{popover}</Box>
      </Tooltip>
    );
  }

  return popover;
};

export default PriceEditPopover;
