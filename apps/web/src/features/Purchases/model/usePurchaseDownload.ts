import { useCallback, useRef, useState } from 'react';
import { TRPCClientError } from '@trpc/client';
import { useTRPCClient } from 'shared/lib/trpc';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';

const DOWNLOAD_SERVICE_UNAVAILABLE = 'Download service is temporarily unavailable. Please try again.';

function getDownloadErrorMessage(error: unknown): string {
  if (error instanceof TRPCClientError && error.cause instanceof SyntaxError) {
    return DOWNLOAD_SERVICE_UNAVAILABLE;
  }

  return getErrorMessage(error);
}

export function usePurchaseDownload() {
  const trpcClient = useTRPCClient();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const downloadingIdRef = useRef<string | null>(null);

  const download = useCallback(async (mediaItemId: string) => {
    if (downloadingIdRef.current !== null) return;
    downloadingIdRef.current = mediaItemId;
    setDownloadingId(mediaItemId);
    try {
      const { downloadUrl } = await trpcClient.checkout.getSignedMediaAccess.query({ mediaItemId });
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      notify.error(getDownloadErrorMessage(err), 'Download Failed');
    } finally {
      downloadingIdRef.current = null;
      setDownloadingId(null);
    }
  }, [trpcClient]);

  const isDownloading = useCallback(
    (mediaItemId: string) => downloadingId === mediaItemId,
    [downloadingId],
  );

  const isAnyDownloading = downloadingId !== null;

  return { download, isDownloading, isAnyDownloading };
}
