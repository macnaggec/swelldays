import { createContext, useContext } from 'react';
import type { PublicMedia } from '@swelldays/contracts/core';
import type { SurfSessionItem } from 'entities/SurfSession';

type CollectionsContextValue = {
  sessions: SurfSessionItem[];
  visibleUploads: SurfSessionItem[];
  isLoadingUploads: boolean;
  favorites: PublicMedia[];
  visibleFavorites: PublicMedia[];
  isLoadingFavorites: boolean;
};

export const CollectionsContext = createContext<CollectionsContextValue | null>(null);

export function useCollectionsContext() {
  const context = useContext(CollectionsContext);
  if (!context) {
    throw new Error('useCollectionsContext must be used inside CollectionsLayout');
  }

  return context;
}
