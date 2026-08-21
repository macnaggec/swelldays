import React, { FC, ReactNode, useState } from 'react';
import { Popover, Button, Stack, Group } from '@mantine/core';
import { DatePicker, TimeInput } from '@mantine/dates';
import { IconCalendar, IconChevronDown, IconClock } from '@tabler/icons-react';

// Helper to get current time formatted as HH:MM
const getCurrentTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

// Helper to get time 2 hours before current time
const getTwoHoursBefore = () => {
  const now = new Date();
  now.setHours(now.getHours() - 2);
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

// Check if selected date is today
const isToday = (date: Date) => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

/**
 * Props for DatePickerPopover component
 */
export interface DatePickerPopoverProps {
  /** Current date value to display */
  value?: Date | null;

  /** Callback when Apply is clicked */
  onApply: (date: Date, fromTime?: string, toTime?: string) => void;

  /** Callback when Cancel is clicked */
  onCancel?: () => void;

  /** Whether to show time range inputs */
  showTimeRange?: boolean;

  /** Whether the popover is disabled */
  disabled?: boolean;

  /** Button color */
  color?: string;

  /** Optional footer content (e.g., "Applying to 5 items") */
  renderFooter?: () => ReactNode;

  /** Custom button label override */
  buttonLabel?: string;

  /** Maximum selectable date (dates after this will be disabled) */
  maxDate?: Date;
  /** Optional style overrides for the trigger button */
  buttonClassName?: string;
}

/**
 * DatePickerPopover - Reusable pill-style button with DatePicker popover
 *
 * Base component for date selection with optional time range.
 * Can be customized with footer content for different use cases.
 */
export const DatePickerPopover: FC<DatePickerPopoverProps> = ({
  value,
  onApply,
  onCancel,
  showTimeRange = false,
  disabled = false,
  color = 'blue',
  renderFooter,
  buttonLabel,
  maxDate,
  buttonClassName,
}) => {
  const [opened, setOpened] = useState(false);
  const [draftDate, setDraftDate] = useState<Date>(value || new Date());
  const [fromTime, setFromTime] = useState<string>(getTwoHoursBefore());
  const [toTime, setToTime] = useState<string>(getCurrentTime());

  // Get max time for today (current time)
  const getMaxTime = () => {
    return isToday(draftDate) ? getCurrentTime() : '23:59';
  };

  const maxTimeValue = getMaxTime();

  const displayDate = value || new Date();
  const formattedDate = buttonLabel || displayDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleApply = () => {
    if (draftDate) {
      if (showTimeRange) {
        // Combine date with from time
        const [hours, minutes] = fromTime.split(':').map(Number) as [number, number];
        const finalDate = new Date(draftDate);
        finalDate.setHours(hours, minutes, 0, 0);
        onApply(finalDate, fromTime, toTime);
      } else {
        onApply(draftDate);
      }
      setOpened(false);
    }
  };

  const handleCancel = () => {
    setDraftDate(value || new Date());
    setFromTime(getTwoHoursBefore());
    setToTime(getCurrentTime());
    setOpened(false);
    onCancel?.();
  };

  // Validate and cap time if needed
  const handleTimeChange = (newTime: string, setter: (time: string) => void) => {
    if (isToday(draftDate)) {
      const maxTime = getMaxTime();
      // Compare times as strings (HH:MM format)
      if (newTime > maxTime) {
        setter(maxTime);
        return;
      }
    }
    setter(newTime);
  };

  // Reset times when date changes to today
  const handleDateChange = (date: string | Date | null) => {
    if (date) {
      const newDate = typeof date === 'string' ? new Date(date) : date;
      setDraftDate(newDate);

      // If switching to today, cap times at current time
      if (isToday(newDate)) {
        const maxTime = getMaxTime();
        if (fromTime > maxTime) setFromTime(maxTime);
        if (toTime > maxTime) setToTime(maxTime);
      }
    }
  };

  const handleFromTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleTimeChange(e.currentTarget.value, setFromTime);
  };

  const handleToTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleTimeChange(e.currentTarget.value, setToTime);
  };

  const togglePopover = () => setOpened((o) => !o);

  return (
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
          color={color}
          leftSection={<IconCalendar size={13} />}
          rightSection={<IconChevronDown size={11} />}
          disabled={disabled}
          onClick={togglePopover}
          radius="xl"
          size="xs"
          className={buttonClassName}
        >
          {formattedDate}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="md">
          {/* Calendar */}
          <DatePicker
            value={draftDate}
            onChange={handleDateChange}
            maxDate={maxDate}
          />

          {/* Time Range - Optional */}
          {showTimeRange && (
            <Group gap="xs" grow>
              <TimeInput
                label="FROM"
                value={fromTime}
                onChange={handleFromTimeChange}
                leftSection={<IconClock size={14} />}
                max={maxTimeValue}
                size="md"
                radius="xl"
                variant="filled"
              />
              <TimeInput
                label="TO"
                value={toTime}
                onChange={handleToTimeChange}
                leftSection={<IconClock size={14} />}
                max={maxTimeValue}
                size="md"
                radius="xl"
                variant="filled"
              />
            </Group>
          )}

          {/* Footer slot */}
          {renderFooter && renderFooter()}

          {/* Action buttons */}
          <Group gap="xs" grow>
            <Button radius="xl" onClick={handleApply}>
              Apply
            </Button>

            <Button radius="xl" variant="subtle" onClick={handleCancel}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

export default DatePickerPopover;
