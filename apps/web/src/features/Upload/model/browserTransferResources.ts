import type { BrowserTransfer } from './types';

export function abortBrowserTransfer(transfer: BrowserTransfer): void {
  if (transfer.source !== 'local' || !transfer.abort) return;

  try { transfer.abort(); } catch { /* already settled */ }
}

export function releaseBrowserTransferPreview(transfer: BrowserTransfer): void {
  if (transfer.source !== 'local') return;

  if (transfer.previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(transfer.previewUrl);
  }
}

export function releaseBrowserTransferResources(
  transfer: BrowserTransfer,
  { abort = true }: { abort?: boolean } = {},
): void {
  if (abort) abortBrowserTransfer(transfer);
  releaseBrowserTransferPreview(transfer);
}
