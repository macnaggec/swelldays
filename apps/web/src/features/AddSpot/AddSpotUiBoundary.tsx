import { lazy, type LazyExoticComponent } from 'react';

let addSpotUiPromise: Promise<typeof import('./ui/AddSpotPanel')> | null = null;

export function loadAddSpotUi(): Promise<typeof import('./ui/AddSpotPanel')> {
  if (!addSpotUiPromise) {
    addSpotUiPromise = import('./ui/AddSpotPanel').catch((error: unknown) => {
      addSpotUiPromise = null;
      throw error;
    });
  }

  return addSpotUiPromise;
}

export const LazyAddSpotPanel: LazyExoticComponent<
  typeof import('./ui/AddSpotPanel')['AddSpotPanel']
> = lazy(() => (
  loadAddSpotUi().then(({ AddSpotPanel }) => ({ default: AddSpotPanel }))
));
