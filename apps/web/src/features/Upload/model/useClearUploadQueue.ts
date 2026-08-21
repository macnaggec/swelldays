import { useCallback } from 'react';
import { useUploadStore } from './uploadStore';
import { releaseBrowserTransferResources } from './browserTransferResources';

/**
 * Post-publish cleanup. Releases browser-only resources (blob URLs, XHR aborts).
 * Does NOT call the server — the publish policy ensures no nonterminal attempts remain.
 */
export function useClearUploadQueue() {
  return useCallback(() => {
    const transfers = useUploadStore.getState().getAll();
    transfers.forEach((transfer) => releaseBrowserTransferResources(transfer));
    useUploadStore.getState().clearTransfers();
  }, []);
}
