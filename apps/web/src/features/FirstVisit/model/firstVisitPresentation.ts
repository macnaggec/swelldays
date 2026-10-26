import { createContext, useContext } from 'react';

export const FirstVisitPresentationContext = createContext<{ open: () => void } | null>(null);

export function useFirstVisitPresentation() {
  return useContext(FirstVisitPresentationContext);
}
