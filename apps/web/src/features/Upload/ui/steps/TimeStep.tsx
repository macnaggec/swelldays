import React, { useState, useCallback } from 'react';
import { Center, RangeSlider, Stack, Text } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { minutesToTime } from './helpers';
import styles from './TimeStep.module.css';

interface TimeStepProps {
  date: Date | null;
  range: [number, number];
  onChange: (date: Date | null, range: [number, number]) => void;
  onCommit: (date: Date | null, range: [number, number]) => void;
  hasTriedPublish?: boolean;
  hasError?: boolean;
  isFlashing?: boolean;
  isReady?: boolean;
}

export function TimeStep({
  date,
  range,
  onChange,
  onCommit,
  hasTriedPublish,
  hasError,
  isFlashing = false,
  isReady = false,
}: TimeStepProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDateChange = useCallback((val: Date | string | null) => {
    const newDate = !val ? null : typeof val === 'string' ? new Date(val) : val;
    onChange(newDate, range);
    onCommit(newDate, range);
  }, [range, onChange, onCommit]);

  const handleRangeChange = useCallback((newRange: [number, number]) => {
    setIsDragging(true);
    onChange(date, newRange);
  }, [date, onChange]);

  const dateError = hasError ?? (hasTriedPublish && !date);
  const validityRail = dateError
    ? 'inset 3px 0 0 var(--wa-status-danger)'
    : isReady
      ? 'inset 3px 0 0 var(--wa-accent-spot)'
      : 'none';

  return (
    <Stack gap={0} data-upload-block>
      <Text
        data-upload-block-title
        size="sm"
        fw={500}
        ta="center"
        className={dateError && isFlashing ? styles.titlePulse : undefined}
        data-validation-pulse={dateError && isFlashing ? 'true' : undefined}
        style={{
          alignSelf: 'center',
          paddingInline: 12,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)',
          boxShadow: validityRail,
          transition: 'box-shadow 120ms ease',
        }}
      >
        When did you shoot?
      </Text>

      <Stack gap="var(--upload-nested-gap)">
        <Center className={styles.dateCalendarTouch}>
          <DatePicker
            // Mantine only reads defaultDate once, at mount — remounting when the
            // month actually changes is what makes the calendar jump to a date set
            // programmatically (e.g. EXIF auto-fill) after the user's initial view.
            key={date ? `${date.getFullYear()}-${date.getMonth()}` : 'unset'}
            defaultDate={date ?? undefined}
            value={date}
            onChange={handleDateChange}
            maxDate={new Date()}
            size="sm"
            styles={{
              calendarHeader: { color: 'var(--wa-text-inverse)' },
              calendarHeaderLevel: { color: 'var(--wa-text-inverse)', background: 'transparent' },
              calendarHeaderControl: { color: 'var(--wa-text-upload-zone)' },
              weekday: { color: 'var(--wa-text-dimmed)' },
              day: { color: 'var(--wa-text-inverse)' },
            }}
          />
        </Center>

        <Stack gap="var(--upload-micro-gap)">
          <Text
            ta="center"
            style={{
              lineHeight: '22px',
              color: isDragging ? 'var(--wa-text-status)' : 'var(--wa-text-upload-zone)',
              fontSize: 'var(--wa-font-size-sm)',
              fontWeight: 400,
              transform: isDragging ? 'scale(1.1667)' : 'scale(1)',
              transition: 'color 120ms ease, transform 120ms ease',
            }}
          >
            {minutesToTime(range[0])} – {minutesToTime(range[1])}
          </Text>
          <RangeSlider
            value={range}
            onChange={handleRangeChange}
            onChangeEnd={(newRange) => {
              setIsDragging(false);
              onCommit(date, newRange);
            }}
            min={0}
            max={1440}
            step={15}
            minRange={15}
            label={null}
            size="xs"
            classNames={{ thumb: styles.rangeThumb }}
            styles={{
              root: {
                '--slider-radius': '2px',
                '--slider-track-bg': 'var(--wa-control-fill)',
                '--slider-color': 'var(--wa-glass-border-media-overlay-hover)',
              } as React.CSSProperties,
            }}
          />
        </Stack>
      </Stack>
    </Stack>
  );
}
