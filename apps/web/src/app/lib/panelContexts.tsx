import { createContext, useContext } from 'react';
import { EMPTY_BROWSE_FILTERS, type BrowseDateFilter, type BrowseFilters } from 'shared/model/browseFilters';

export interface PanelFilterContextValue {
  filters: BrowseFilters;
  setDateFilter: (date: BrowseDateFilter) => void;
  setFavoriteSpotsOnly: (value: boolean) => void;
  clearFilters: () => void;
}

export interface PanelRouteBackAction {
  /** Omitted for a chevron-only back control. */
  label?: string;
  onBack: () => void;
  disabled?: boolean;
}

export const PanelFilterContext = createContext<PanelFilterContextValue>({
  filters: EMPTY_BROWSE_FILTERS,
  setDateFilter: () => { },
  setFavoriteSpotsOnly: () => { },
  clearFilters: () => { },
});

export const PanelExpandedContext = createContext(false);
export const PanelFeedLayoutReadyContext = createContext<(ready: boolean) => void>(() => { });
export const PanelRouteBackActionContext = createContext<(action: PanelRouteBackAction | null) => void>(() => { });

export function usePanelFilter() {
  return useContext(PanelFilterContext);
}

export function usePanelExpanded() {
  return useContext(PanelExpandedContext);
}

export function usePanelFeedLayoutReadyChange() {
  return useContext(PanelFeedLayoutReadyContext);
}

export function useSetPanelRouteBackAction() {
  return useContext(PanelRouteBackActionContext);
}
