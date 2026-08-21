

import React, { FC, useMemo, useCallback } from 'react';
import { Box, Text, Stack, Tooltip } from '@mantine/core';
import { DatePickerPopover } from 'shared/ui/DatePickerPopover';
import materials from 'shared/ui/design-system/materials.module.css';

/**
 * Props for DateEditPopover component
 */
export interface DateEditPopoverProps {
  /** Current date value to display (or default) */
  value?: Date | null;

  /** Callback when date is applied */
  onApply: (date: Date) => void;

  /** Number of selected items (for Apply button text) */
  selectedCount?: number;
  /** Total number of applicable items (shown when selectedCount is 0) */
  totalCount?: number;
  /** Whether any items have EXIF dates that will be overwritten */
  hasExifDates?: boolean;
  /** Whether the popover is disabled */
  disabled?: boolean;
  /** Tooltip text to show when disabled */
  tooltip?: string;
}

/**
 * DateEditPopover - Bulk date editing wrapper for DatePickerPopover
 *
 * Wraps the base DatePickerPopover with bulk editing context (shows item count).
 * Used in Upload feature for editing dates on multiple selected draft items.
 *
 * @example
 * ```tsx
 * <DateEditPopover
 *   value={new Date()}
 *   onApply={(date) => handleBulkDateEdit(selectedIds, date)}
 *   selectedCount={5}
 * />
 * ```
 */
export const DateEditPopover: FC<DateEditPopoverProps> = ({
  value,
  onApply,
  selectedCount = 0,
  totalCount = 0,
  hasExifDates = false,
  disabled = false,
  tooltip,
}) => {
  // Memoize maxDate to avoid creating new Date object on every render
  // Date is captured at mount time, which is acceptable since popover
  // is typically closed/reopened frequently
  const maxDate = useMemo(() => new Date(), []);

  // Memoize footer renderer for stable reference
  // Note: Dependencies change frequently (selectedCount, hasExifDates),
  // so performance gain is minimal but it's good practice
  const renderFooter = useCallback(() => {
    if (selectedCount === 0 && totalCount === 0) return null;

    return (
      <Stack gap="xs">
        {hasExifDates && (
          <Box p="xs" bg="yellow.0" style={{ borderRadius: 'var(--mantine-radius-sm)' }}>
            <Text size="xs" c="orange.7" ta="center" fw={500}>
              ⚠️ This will overwrite camera-detected dates
            </Text>
          </Box>
        )}
        <Box p="xs" bg="blue.0" style={{ borderRadius: 'var(--mantine-radius-sm)' }}>
          <Text size="sm" c="dimmed" ta="center">
            {selectedCount > 0
              ? `Applying to ${selectedCount} ${selectedCount === 1 ? 'item' : 'items'}`
              : 'Applying to all items'}
          </Text>
        </Box>
      </Stack>
    );
  }, [selectedCount, totalCount, hasExifDates]);

  const datePicker = (
    <DatePickerPopover
      value={value}
      onApply={onApply}
      disabled={disabled}
      color="gray"
      showTimeRange
      maxDate={maxDate}
      renderFooter={renderFooter}
      buttonClassName={materials.controlButton}
    />
  );

  if (disabled && tooltip) {
    return (
      <Tooltip label={tooltip} withinPortal>
        <Box>{datePicker}</Box>
      </Tooltip>
    );
  }

  return datePicker;
};

export default DateEditPopover;
