

import { FC, memo, useCallback, useState } from 'react';
import { Popover, Button, Indicator, CloseButton, Group } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCalendar, IconChevronDown } from '@tabler/icons-react';
import { isSameCalendarDay } from 'shared/lib/dateUtils';

export interface DateFilterPopoverProps {
  /** Currently active filter date */
  value?: Date | null;

  /** Called immediately when a date is selected; null when same date clicked (toggle off) */
  onChange: (date: Date | null) => void;

  /** Dates that have media — shown with a dot indicator */
  highlightedDates?: Date[];

  /** Maximum selectable date */
  maxDate?: Date;

  /** Button and indicator color */
  color?: string;

  /** Button label shown when no date is selected */
  placeholder?: string;

  /** Whether the button is disabled */
  disabled?: boolean;
}

/**
 * DateFilterPopover - Lightweight pill button + calendar popover for gallery filtering
 *
 * Selecting a date immediately applies the filter (no Apply/Cancel).
 * Clicking an already-selected date toggles it off.
 * Days with media are highlighted with a dot indicator.
 *
 * For the full edit use case (time range, apply/cancel), use DatePickerPopover.
 *
 * @example
 * ```tsx
 * <DateFilterPopover
 *   value={dateFilter}
 *   onChange={setDateFilter}
 *   highlightedDates={mediaDates}
 *   maxDate={new Date()}
 * />
 * ```
 */
const DateFilterPopover: FC<DateFilterPopoverProps> = memo(({
  value,
  onChange,
  highlightedDates,
  maxDate,
  color = 'blue',
  placeholder = 'Filter by date',
  disabled = false,
}) => {
  const [opened, setOpened] = useState(false);

  const formattedLabel = value
    ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder;

  const handleButtonClick = useCallback(() => {
    setOpened((o) => !o);
  }, []);

  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const handleDaySelect = useCallback((date: string | Date | null) => {
    if (!date) return;
    const selected = typeof date === 'string' ? new Date(date) : date;
    // Toggle off if same day clicked again
    const isAlreadySelected = value && isSameCalendarDay(selected, value);
    onChange(isAlreadySelected ? null : selected);
    setOpened(false);
  }, [value, onChange]);

  const renderDay = useCallback((date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = d.getDate();
    const hasMedia = highlightedDates?.some((h) => isSameCalendarDay(h, d)) ?? false;
    return (
      <Indicator size={6} color={color} offset={-2} disabled={!hasMedia}>
        <div>{day}</div>
      </Indicator>
    );
  }, [highlightedDates, color]);

  return (
    <Group gap={4} wrap="nowrap">
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom"
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <Button
            variant={value ? 'filled' : 'light'}
            color={color}
            leftSection={<IconCalendar size={16} />}
            rightSection={<IconChevronDown size={14} />}
            disabled={disabled}
            onClick={handleButtonClick}
            radius="xl"
          >
            {formattedLabel}
          </Button>
        </Popover.Target>

        <Popover.Dropdown>
          <DatePicker
            value={value ?? null}
            onChange={handleDaySelect}
            maxDate={maxDate}
            renderDay={renderDay}
          />
        </Popover.Dropdown>
      </Popover>

      {value && (
        <CloseButton
          onClick={handleClear}
          size={36}
          iconSize={14}
          radius="xl"
          aria-label="Clear date filter"
        />
      )}
    </Group>
  );
});

DateFilterPopover.displayName = 'DateFilterPopover';

export default DateFilterPopover;
