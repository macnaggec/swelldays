import { createContext, useContext } from 'react';

export interface FirstVisitMapReadinessValue {
  isMapReady: boolean;
  markMapReady: () => void;
  markMapFailed: () => void;
  markMapLoading: () => void;
  mapAttempt: number;
}

export const FirstVisitMapReadinessContext = createContext<FirstVisitMapReadinessValue>({
  isMapReady: false,
  markMapReady: () => undefined,
  markMapFailed: () => undefined,
  markMapLoading: () => undefined,
  mapAttempt: 0,
});

export function useFirstVisitMapReadiness(): FirstVisitMapReadinessValue {
  return useContext(FirstVisitMapReadinessContext);
}
