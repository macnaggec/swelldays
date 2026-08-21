import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePurchaseDownload } from './usePurchaseDownload';

const mocks = vi.hoisted(() => ({
  getSignedMediaAccess: vi.fn(),
  notifyError: vi.fn(),
  open: vi.fn(),
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPCClient: () => ({
    checkout: {
      getSignedMediaAccess: {
        query: mocks.getSignedMediaAccess,
      },
    },
  }),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { error: mocks.notifyError },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('usePurchaseDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', mocks.open);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores another download while signed access is pending', async () => {
    const access = deferred<{ downloadUrl: string }>();
    mocks.getSignedMediaAccess.mockReturnValue(access.promise);
    const { result } = renderHook(() => usePurchaseDownload());

    let firstDownload!: Promise<void>;
    let secondDownload!: Promise<void>;
    act(() => {
      firstDownload = result.current.download('media-1');
      secondDownload = result.current.download('media-2');
    });

    expect(mocks.getSignedMediaAccess).toHaveBeenCalledTimes(1);
    expect(result.current.isDownloading('media-1')).toBe(true);
    expect(result.current.isAnyDownloading).toBe(true);

    access.resolve({ downloadUrl: 'https://example.com/download' });
    await act(async () => {
      await Promise.all([firstDownload, secondDownload]);
    });

    expect(result.current.isAnyDownloading).toBe(false);
  });

  it('opens the signed URL returned for the purchased media item', async () => {
    mocks.getSignedMediaAccess.mockResolvedValue({
      downloadUrl: 'https://example.com/download',
    });
    const { result } = renderHook(() => usePurchaseDownload());

    await act(async () => {
      await result.current.download('media-1');
    });

    expect(mocks.getSignedMediaAccess).toHaveBeenCalledWith({ mediaItemId: 'media-1' });
    expect(mocks.open).toHaveBeenCalledWith(
      'https://example.com/download',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('notifies the buyer and clears pending state when signed access fails', async () => {
    mocks.getSignedMediaAccess.mockRejectedValue(new Error('Access failed'));
    const { result } = renderHook(() => usePurchaseDownload());

    await act(async () => {
      await result.current.download('media-1');
    });

    expect(mocks.notifyError).toHaveBeenCalledWith('Access failed', 'Download Failed');
    expect(result.current.isAnyDownloading).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
