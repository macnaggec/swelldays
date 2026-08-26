import { createContext, useContext } from 'react';

export interface FirstVisitMapReadinessValue {
  isMapReady: boolean;
  markMapReady: () => void;
}

export const FirstVisitMapReadinessContext = createContext<FirstVisitMapReadinessValue>({
  isMapReady: false,
  markMapReady: () => undefined,
});

export function useFirstVisitMapReadiness(): FirstVisitMapReadinessValue {
  return useContext(FirstVisitMapReadinessContext);
}
