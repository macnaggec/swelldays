import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import { render } from 'test/setup/render';
import { GalleryDateJumpHeading } from './GalleryDateJumpHeading';

const AUG_2 = new Date('2026-08-02T12:00:00.000Z');
const AUG_1 = new Date('2026-08-01T12:00:00.000Z');
const JUL_13 = new Date('2026-07-13T12:00:00.000Z');
const JUL_12 = new Date('2026-07-12T12:00:00.000Z');

const DAY_HIGHLIGHTS = [
  { date: AUG_2, rowIndex: 0 },
  { date: AUG_1, rowIndex: 4 },
  { date: JUL_13, rowIndex: 8 },
  { date: JUL_12, rowIndex: 12 },
];

function labelDates() {
  return vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
    this: Date,
    _locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    const month = this.getUTCMonth() === 7 ? 'Aug' : 'Jul';
    const day = String(this.getUTCDate());
    if (options?.year === 'numeric' && options.month === undefined) return '2026';
    if (options?.month === 'short' && options.day === undefined) return month;
    if (options?.day === 'numeric' && options.month === undefined) return day;
    return `${month} ${day}, 2026`;
  });
}

describe('GalleryDateJumpHeading mobile rail', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the desktop date sequence as a grouped horizontal rail', async () => {
    labelDates();
    const onJump = vi.fn();

    render(
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider
          value={{ hidden: true, drawerPresentation: 'bottomSheet' }}
        >
          <GalleryDateJumpHeading
            date={AUG_1}
            dayHighlights={DAY_HIGHLIGHTS}
            onJump={onJump}
          />
        </PanelScrollChromeStateProvider>
      </MantineProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Jump to date' }));

    const rail = await screen.findByRole('navigation', { name: 'Dates' });
    expect(rail).toBeInTheDocument();
    expect(screen.getAllByText('2026')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Aug' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jul' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'date');

    await userEvent.click(screen.getByRole('button', { name: 'Jul' }));
    expect(onJump).toHaveBeenCalledWith(8);

    await userEvent.click(screen.getByRole('button', { name: '12' }));
    expect(onJump).toHaveBeenLastCalledWith(12);
  });
});
