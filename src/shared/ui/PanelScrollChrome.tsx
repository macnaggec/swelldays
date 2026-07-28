import { createContext, useContext } from 'react';
import type { DrawerShellPresentation } from 'shared/ui/DrawerShell';

interface PanelScrollChromeState {
  hidden: boolean;
  drawerPresentation?: DrawerShellPresentation;
}

const PanelScrollChromeStateContext = createContext<PanelScrollChromeState>({ hidden: false });

export const PanelScrollChromeStateProvider = PanelScrollChromeStateContext.Provider;

export function usePanelScrollChromeState() {
  return useContext(PanelScrollChromeStateContext);
}
