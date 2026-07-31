import { fireEvent, render, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GalleryDateSidebar } from './GalleryDateSidebar';
import type { VirtualGalleryHandle } from 'shared/ui/VirtualGallery/VirtualGallery';

function galleryRef() {
  return {
    current: {
      scrollToIndex: vi.fn(),
    },
  } satisfies RefObject<VirtualGalleryHandle | null>;
}

function mockDateLabels(labelsByTimestamp: Map<number, { month: string; day: string; title: string }>) {
  return vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
    this: Date,
    _locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    const label = labelsByTimestamp.get(this.getTime());
    if (!label) return '';
    if (options?.month === 'short' && options?.day === 'numeric' && options?.year === 'numeric') {
      return label.title;
    }
    if (options?.month === 'short') return label.month;
    if (options?.day === 'numeric') return label.day;
    return label.title;
  });
}

const JUL_21 = new Date('2026-07-21T12:00:00.000Z');
const JUL_18 = new Date('2026-07-18T12:00:00.000Z');
const JUN_25 = new Date('2026-06-25T12:00:00.000Z');
const JUN_20 = new Date('2026-06-20T12:00:00.000Z');

const TWO_MONTHS = [
  { date: JUL_21, rowIndex: 0 },
  { date: JUL_18, rowIndex: 4 },
  { date: JUN_25, rowIndex: 8 },
  { date: JUN_20, rowIndex: 12 },
];

function labelAllMonths() {
  return mockDateLabels(new Map([
    [JUL_21.getTime(), { month: 'Jul', day: '21', title: 'Jul 21, 2026' }],
    [JUL_18.getTime(), { month: 'Jul', day: '18', title: 'Jul 18, 2026' }],
    [JUN_25.getTime(), { month: 'Jun', day: '25', title: 'Jun 25, 2026' }],
    [JUN_20.getTime(), { month: 'Jun', day: '20', title: 'Jun 20, 2026' }],
  ]));
}

describe('GalleryDateSidebar', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unfolds only the in-view month, showing every other month as a header', () => {
    labelAllMonths();

    render(
      <GalleryDateSidebar highlights={TWO_MONTHS} firstVisibleIndex={0} galleryRef={galleryRef()} />,
    );

    // Newest month (July) is in view, so its days show; June stays a header.
    expect(screen.getByRole('button', { name: 'Jul' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '21' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '18' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jun' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '25' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '20' })).not.toBeInTheDocument();
  });

  it('hands the open section to whichever month scrolls into view', () => {
    labelAllMonths();

    const { rerender } = render(
      <GalleryDateSidebar highlights={TWO_MONTHS} firstVisibleIndex={0} galleryRef={galleryRef()} />,
    );

    // Scroll into June's rows: June unfolds, July folds back to a header.
    rerender(
      <GalleryDateSidebar highlights={TWO_MONTHS} firstVisibleIndex={8} galleryRef={galleryRef()} />,
    );

    expect(screen.getByRole('button', { name: '25' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '21' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '18' })).not.toBeInTheDocument();
  });

  it('tapping a month only unfolds its days locally — it never scrolls the gallery', () => {
    labelAllMonths();
    const ref = galleryRef();

    render(
      <GalleryDateSidebar highlights={TWO_MONTHS} firstVisibleIndex={0} galleryRef={ref} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Jun' }));

    expect(ref.current.scrollToIndex).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '25' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
  });

  it('jumps to a day’s row when a day in the open month is tapped', () => {
    labelAllMonths();
    const ref = galleryRef();

    render(
      <GalleryDateSidebar highlights={TWO_MONTHS} firstVisibleIndex={0} galleryRef={ref} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '18' }));

    expect(ref.current.scrollToIndex).toHaveBeenCalledWith(4, { align: 'start' });
  });

  it('deduplicates days by the visible calendar date before grouping', () => {
    const lateUtc = new Date('2026-06-23T22:30:00.000Z');
    const sameVisibleDay = new Date('2026-06-24T06:00:00.000Z');
    const nextVisibleDay = new Date('2026-06-25T06:00:00.000Z');
    mockDateLabels(new Map([
      [lateUtc.getTime(), { month: 'Jun', day: '24', title: 'Jun 24, 2026' }],
      [sameVisibleDay.getTime(), { month: 'Jun', day: '24', title: 'Jun 24, 2026' }],
      [nextVisibleDay.getTime(), { month: 'Jun', day: '25', title: 'Jun 25, 2026' }],
    ]));

    render(
      <GalleryDateSidebar
        highlights={[
          { date: lateUtc, rowIndex: 0 },
          { date: sameVisibleDay, rowIndex: 4 },
          { date: nextVisibleDay, rowIndex: 8 },
        ]}
        firstVisibleIndex={0}
        galleryRef={galleryRef()}
      />,
    );

    // One June section, two distinct days inside it.
    expect(screen.getByRole('button', { name: 'Jun' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^2[45]$/ }).map((b) => b.textContent)).toEqual(['24', '25']);
  });
});
