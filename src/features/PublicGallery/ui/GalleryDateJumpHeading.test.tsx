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

  it('opens the active month first, jumps and closes on a day pick, and returns focus to the bar', async () => {
    labelDates();
    const onJump = vi.fn();

    const mobileHeading = (date: Date) => (
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider
          value={{ hidden: true, drawerPresentation: 'bottomSheet' }}
        >
          <GalleryDateJumpHeading
            date={date}
            dayHighlights={DAY_HIGHLIGHTS}
            onJump={onJump}
          />
        </PanelScrollChromeStateProvider>
      </MantineProvider>
    );
    render(mobileHeading(AUG_1));

    const trigger = screen.getByRole('button', { name: 'Jump to date' });
    await userEvent.click(trigger);

    const rail = await screen.findByRole('navigation', { name: 'Dates' });
    expect(rail).toBeInTheDocument();
    const monthControls = screen.getByRole('group', { name: 'Months' });
    const dayControls = screen.getByRole('group', { name: 'Days' });
    expect(monthControls).toContainElement(screen.getByRole('button', { name: 'Aug' }));
    expect(monthControls).toContainElement(screen.getByRole('button', { name: 'Jul' }));
    expect(dayControls).toContainElement(screen.getByRole('button', { name: '1' }));
    expect(screen.getAllByText('2026')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Aug' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Jul' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'date');
    expect(screen.queryByRole('button', { name: '13' })).not.toBeInTheDocument();
    // Browsing months/days is contained from the panel's scroll-direction
    // signal (SidePanel.test.tsx proves the mechanism itself): scrolling here
    // must not be mistaken for the user scrolling the gallery.
    expect(monthControls).toHaveAttribute('data-scroll-direction-isolated');
    expect(dayControls).toHaveAttribute('data-scroll-direction-isolated');

    // Picking a day in the open (active) month jumps, closes the menu, and returns focus.
    await userEvent.click(screen.getByRole('button', { name: '2' }));

    expect(onJump).toHaveBeenCalledWith(DAY_HIGHLIGHTS[0]);
    expect(screen.queryByRole('navigation', { name: 'Dates' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('pins the panel chrome while open so scrolling the gallery cannot swap the bar out from under it', async () => {
    labelDates();
    const onJump = vi.fn();
    const pinChromeHidden = vi.fn();

    render(
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider
          value={{ hidden: true, drawerPresentation: 'bottomSheet', pinChromeHidden }}
        >
          <GalleryDateJumpHeading
            date={AUG_1}
            dayHighlights={DAY_HIGHLIGHTS}
            onJump={onJump}
          />
        </PanelScrollChromeStateProvider>
      </MantineProvider>,
    );

    expect(pinChromeHidden).toHaveBeenLastCalledWith(false);

    await userEvent.click(screen.getByRole('button', { name: 'Jump to date' }));
    expect(pinChromeHidden).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(pinChromeHidden).toHaveBeenLastCalledWith(false);
  });

  it('tapping a month only unfolds its days locally — it never jumps or closes the menu', async () => {
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

    const trigger = screen.getByRole('button', { name: 'Jump to date' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Jul' }));

    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Dates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jul' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '13' })).toBeInTheDocument();
  });
});
