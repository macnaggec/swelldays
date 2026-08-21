import type { ReactNode } from 'react';
import { Group, Text, Divider } from '@mantine/core';

export function StepPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <>
      <Group px="md" py="xs" gap="xs">
        {icon}
        <Text size="sm" fw={500} style={{ color: 'var(--wa-text-inverse)' }}>{label}</Text>
      </Group>
      <Divider />
    </>
  );
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function combineDateAndTime(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const result = new Date(date);
  result.setHours(h || 0, m || 0, 0, 0);
  return result;
}
