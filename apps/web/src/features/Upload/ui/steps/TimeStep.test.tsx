import { readFileSync } from 'node:fs';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it, vi } from 'vitest';
import { TimeStep } from './TimeStep';

const timeStepCss = readFileSync('apps/web/src/features/Upload/ui/steps/TimeStep.module.css', 'utf8');

function coarsePointerRangeThumbRule() {
  const match = timeStepCss.match(/@media \(pointer: coarse\) \{\s*\.rangeThumb \{([^}]*)\}/);
  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
}

function renderTimeStep(overrides: Partial<ComponentProps<typeof TimeStep>> = {}) {
  return render(
    <MantineProvider>
      <TimeStep
        date={null}
        range={[360, 600]}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        {...overrides}
      />
    </MantineProvider>,
  );
}

describe('TimeStep', () => {
  it('marks a valid shoot time with the spot-style ready rail', () => {
    renderTimeStep({
      date: new Date('2026-01-01T00:00:00Z'),
      isReady: true,
    });

    expect(screen.getByText('When did you shoot?')).toHaveStyle({
      color: 'rgba(255,255,255,0.4)',
      boxShadow: 'inset 3px 0 0 var(--wa-accent-spot)',
    });
  });

  it('marks an invalid shoot time with the spot-style danger rail and title pulse', () => {
    renderTimeStep({
      hasTriedPublish: true,
      hasError: true,
      isFlashing: true,
    });

    const title = screen.getByText('When did you shoot?');
    expect(title).toHaveStyle({
      color: 'rgba(255,255,255,0.4)',
      boxShadow: 'inset 3px 0 0 var(--wa-status-danger)',
    });
    expect(title).toHaveAttribute('data-validation-pulse', 'true');
  });

  it('grows the range-slider thumb under a coarse pointer as a small pill, not the base circle', () => {
    expect(coarsePointerRangeThumbRule()).toBe('width: 32px; height: 18px;');
  });

  it('navigates the calendar to the month of a date set after mount (e.g. EXIF auto-fill)', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const { rerender } = renderTimeStep({ date: null, onChange, onCommit });

    rerender(
      <MantineProvider>
        <TimeStep
          date={new Date(2022, 11, 31)}
          range={[360, 600]}
          onChange={onChange}
          onCommit={onCommit}
        />
      </MantineProvider>,
    );

    const selectedDay = document.querySelector('[data-selected]');
    expect(selectedDay?.textContent).toBe('31');
  });
});
