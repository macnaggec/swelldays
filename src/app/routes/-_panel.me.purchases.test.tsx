import { waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from 'entities/Commerce/model/cartStore';
import type { CartItem } from 'entities/Commerce/model/types';
import { render } from 'test/setup/render';
import { Route } from './_panel.me.collections.purchases';

const mocks = vi.hoisted(() => ({
  isLoading: false,
  invalidateQueries: vi.fn(),
  purchases: [] as {
    id: string;
    purchasedAt: Date;
    amountPaid: number;
    previewUrl: string | null;
    mediaItem: { id: string; thumbnailUrl: string };
  }[],
  useSearch: vi.fn(() => ({ order: 'order-1' })),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: mocks.useSearch,
  }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({
      data: mocks.purchases,
      isLoading: mocks.isLoading,
    }),
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    checkout: {
      myPurchases: {
        queryKey: () => ['checkout', 'myPurchases'],
        queryOptions: () => ({ queryKey: ['checkout', 'myPurchases'] }),
      },
    },
  }),
}));

vi.mock('entities/Commerce', async () => {
  const { useCartStore } = await import('entities/Commerce/model/cartStore');
  return {
    useCartStore,
  };
});

vi.mock('features/Purchases', () => ({
  PurchaseCard: () => <article>Purchase</article>,
  PurchaseLightbox: () => null,
  usePurchaseDownload: () => ({
    download: vi.fn(),
    isDownloading: () => false,
    isAnyDownloading: false,
  }),
}));

vi.mock('./_panel.me.collections', () => ({
  useCollectionsContext: () => ({ galleryMaxColumns: undefined }),
}));

describe('PurchasesTab', () => {
  const purchasedItem: CartItem = {
    id: 'media-1',
    label: 'Pipeline · Jan 1, 2026',
    spotName: 'Pipeline',
    capturedAt: '2026-01-01T00:00:00.000Z',
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    lightboxUrl: 'https://example.com/preview-1.jpg',
    priceCents: 300,
  };
  const unpaidItem: CartItem = {
    id: 'media-2',
    label: 'Pipeline · Jan 2, 2026',
    spotName: 'Pipeline',
    capturedAt: '2026-01-02T00:00:00.000Z',
    thumbnailUrl: 'https://example.com/thumb-2.jpg',
    lightboxUrl: 'https://example.com/preview-2.jpg',
    priceCents: 400,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLoading = false;
    mocks.purchases = [{
      id: 'purchase-1',
      purchasedAt: new Date('2026-01-03T00:00:00.000Z'),
      amountPaid: 300,
      previewUrl: null,
      mediaItem: { id: 'media-1', thumbnailUrl: 'https://example.com/thumb-1.jpg' },
    }];
    localStorage.clear();
    useCartStore.setState({ items: [purchasedItem, unpaidItem] });
  });

  it('removes fulfilled purchase items from the cart after a paid return', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    await waitFor(() => {
      expect(useCartStore.getState().items).toEqual([unpaidItem]);
    });
  });

  it('refreshes purchases from the server after a paid return', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    await waitFor(() => {
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['checkout', 'myPurchases'],
      });
    });
  });

  it('renders purchase cards inside the shared panel gallery inset', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(document.querySelector('article')?.closest('[data-panel-gallery-inset]')).not.toBeNull();
    expect(document.querySelector('[role="grid"][aria-label="Purchases"]')).not.toBeNull();
  });
});
