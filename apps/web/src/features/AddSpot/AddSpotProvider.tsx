import {
  createContext,
  useContext,
  useMemo,
} from 'react';
import { useAddSpotStore } from './model/addSpotStore';

interface AddSpotContextValue {
  /** Start the Add Spot flow, optionally pre-filling the spot name. */
  startAddSpot: (initialName?: string) => void;
}

const AddSpotContext = createContext<AddSpotContextValue | null>(null);

export function AddSpotProvider({ children }: { children: React.ReactNode }) {
  const enter = useAddSpotStore((s) => s.enter);

  const value = useMemo(
    () => ({ startAddSpot: (name = '') => enter(name) }),
    [enter],
  );

  return (
    <AddSpotContext.Provider value={value}>
      {children}
    </AddSpotContext.Provider>
  );
}

export function useAddSpot(): AddSpotContextValue {
  const ctx = useContext(AddSpotContext);
  if (!ctx) throw new Error('useAddSpot must be used within AddSpotProvider');
  return ctx;
}
