import { create } from 'zustand';
import type { BrowserTransfer } from './types';

interface TransferState {
  transfers: Map<string, BrowserTransfer>;   // keyed by clientRequestId
}

interface TransferActions {
  addTransfer: (t: BrowserTransfer) => void;
  updateTransfer: (clientRequestId: string, updates: Partial<BrowserTransfer>) => void;
  removeTransfer: (clientRequestId: string) => void;
  clearTransfers: () => void;
  getAll: () => BrowserTransfer[];
}

export const useUploadStore = create<TransferState & TransferActions>()((set, get) => ({
  transfers: new Map(),

  addTransfer: (t) =>
    set(s => { const m = new Map(s.transfers); m.set(t.clientRequestId, t); return { transfers: m }; }),

  updateTransfer: (id, updates) =>
    set(s => {
      const existing = s.transfers.get(id);
      if (!existing) return s;
      const m = new Map(s.transfers);
      m.set(id, { ...existing, ...updates } as BrowserTransfer);
      return { transfers: m };
    }),

  removeTransfer: (id) =>
    set(s => { const m = new Map(s.transfers); m.delete(id); return { transfers: m }; }),

  clearTransfers: () => set({ transfers: new Map() }),

  getAll: () => Array.from(get().transfers.values()),
}));
