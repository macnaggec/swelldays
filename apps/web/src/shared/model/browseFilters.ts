export type BrowseDateFilter = 'today' | 'yesterday' | 'last7' | { date: Date } | null;

export interface BrowseFilters {
  date: BrowseDateFilter;
  favoriteSpotsOnly: boolean;
}

export const EMPTY_BROWSE_FILTERS: BrowseFilters = {
  date: null,
  favoriteSpotsOnly: false,
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

export function toBrowseDateRange(filter: BrowseDateFilter): { dateFrom?: Date; dateTo?: Date } {
  if (!filter) return {};

  const today = new Date();
  if (filter === 'today') return { dateFrom: startOfDay(today), dateTo: endOfDay(today) };
  if (filter === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { dateFrom: startOfDay(yesterday), dateTo: endOfDay(yesterday) };
  }
  if (filter === 'last7') {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { dateFrom: startOfDay(from), dateTo: endOfDay(today) };
  }

  return { dateFrom: startOfDay(filter.date), dateTo: endOfDay(filter.date) };
}
