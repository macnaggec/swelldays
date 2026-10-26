import { createContext, useContext } from 'react';

/** Whether the prepared application is exposed beneath the welcome transition. */
export const AppVisibilityContext = createContext(true);

export function useAppVisibility(): boolean {
  return useContext(AppVisibilityContext);
}
