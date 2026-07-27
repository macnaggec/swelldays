import { createContext, useContext } from 'react';

const PanelScrollChromeStateContext = createContext({ hidden: false });

export const PanelScrollChromeStateProvider = PanelScrollChromeStateContext.Provider;

export function usePanelScrollChromeState() {
  return useContext(PanelScrollChromeStateContext);
}
