import { create } from 'zustand';
import type { LngLat } from '@swelldays/contracts';

interface AddSpotState {
  isActive: boolean;
  /** Temporary map position while creating a new spot. */
  tempPin: LngLat | null;
  /** Name pre-filled from the search query that started Add Spot. */
  pendingSpotName: string;
}

interface AddSpotActions {
  enter: (initialName?: string) => void;
  exit: () => void;
  setTempPin: (pos: LngLat) => void;
  clearTempPin: () => void;
}

export const useAddSpotStore = create<AddSpotState & AddSpotActions>((set) => ({
  isActive: false,
  tempPin: null,
  pendingSpotName: '',

  enter: (initialName = '') => set({ isActive: true, tempPin: null, pendingSpotName: initialName }),
  exit: () => set({ isActive: false, tempPin: null, pendingSpotName: '' }),
  setTempPin: (pos) => set({ tempPin: pos }),
  clearTempPin: () => set({ tempPin: null }),
}));
