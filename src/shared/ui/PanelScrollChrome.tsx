import { createContext, useContext } from 'react';
import type { DrawerShellPresentation, SheetSnap } from 'shared/ui/DrawerShell';

interface PanelScrollChromeState {
  hidden: boolean;
  /** True after the panel's own scroll owner has left its initial top edge. */
  scrolledFromTop?: boolean;
  drawerPresentation?: DrawerShellPresentation;
  sheetSnap?: SheetSnap;
  /**
   * Freezes `hidden` at its current value regardless of scroll direction —
   * for a consumer (e.g. an open date-jump menu) whose own trigger must not
   * be swapped out from under it while the user scrolls the gallery beneath.
   * Call with `false` to release the freeze and resume scroll-driven swaps.
   */
  pinChromeHidden?: (pinned: boolean) => void;
}

const PanelScrollChromeStateContext = createContext<PanelScrollChromeState>({ hidden: false });

export const PanelScrollChromeStateProvider = PanelScrollChromeStateContext.Provider;

export function usePanelScrollChromeState() {
  return useContext(PanelScrollChromeStateContext);
}
