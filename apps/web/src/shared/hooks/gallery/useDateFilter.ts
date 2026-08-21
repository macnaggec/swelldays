import { useCallback, useMemo, useState } from 'react';
import { isSameCalendarDay } from 'shared/lib/dateUtils';

export interface UseDateFilterOptions<T> {
  /** Full unfiltered item list */
  items: T[];
  /** Extracts the date to filter against from each item */
  getDate: (item: T) => Date;
}

export interface UseDateFilterReturn<T> {
  /** Currently active filter date, or null */
  activeDate: Date | null;
  /** Filtered subset — equals `items` when no filter is active */
  filteredItems: T[];
  /** All unique dates found in the item list, for calendar indicators */
  highlightedDates: Date[];
  /** Set or clear the active filter date */
  setDate: (date: Date | null) => void;
}

/**
 * useDateFilter - Manages date-based filtering for a gallery item list
 *
 * Extracts state, derived filtered list, and highlighted dates so
 * the parent component only handles rendering.
 *
 * @example
 * ```ts
 * const filter = useDateFilter({ items: allItems, getDate: (m) => m.capturedAt });
 *
 * <DateFilterPopover
 *   value={filter.activeDate}
 *   onChange={filter.setDate}
 *   highlightedDates={filter.highlightedDates}
 * />
 * ```
 */
export function useDateFilter<T>({
  items,
  getDate,
}: UseDateFilterOptions<T>): UseDateFilterReturn<T> {
  const [activeDate, setActiveDate] = useState<Date | null>(null);

  const highlightedDates = useMemo(
    () => items.map(getDate),
    [items, getDate],
  );

  const filteredItems = useMemo(() => {
    if (!activeDate) return items;
    return items.filter((item) => isSameCalendarDay(getDate(item), activeDate));
  }, [items, activeDate, getDate]);

  const setDate = useCallback((date: Date | null) => {
    setActiveDate(date);
  }, []);

  return { activeDate, filteredItems, highlightedDates, setDate };
}
