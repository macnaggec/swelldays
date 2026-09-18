import { act, waitFor } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from 'entities/Commerce/model/cartStore';
import type { CartItem } from 'entities/Commerce/model/types';
import { render } from 'test/setup/render';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import type { BuyerCheckoutStatus } from '@swelldays/contracts/validation/checkout';
import './_panel.me.collections.purchases';

// Purchases inherits the siteWorkspace intent from /_panel/me (M06c); PanelCollectionGrid
// (inside BaseGallery) now derives its own column density from the shell policy, so every
// render here needs a real AppShellLayoutPolicyProvider ancestor.
function renderPurchases(ui: ReactNode) {
  return render(
    <AppShellLayoutPolicyProvider routeIntent="siteWorkspace" browseExpanded={false} galleryExpanded={false}>
      {ui}
    </AppShellLayoutPolicyProvider>,
  );
}

const mocks = vi.hoisted(() => {
  const initialCheckoutStatus = (): BuyerCheckoutStatus => ({ state: 'paid', orderId: 'order-1' });
  let routeComponent: ComponentType | undefined;
  return {
    isLoading: false,
    invalidateQueries: vi.fn(),
    purchases: [] as {
    id: string;
    purchasedAt: Date;
    amountPaid: number;
    previewUrl: string | null;
    mediaItem: { id: string; thumbnailUrl: string };
    }[],
    checkoutStatus: initialCheckoutStatus(),
    navigate: vi.fn(),
    notifySuccess: vi.fn(),
    useSearch: vi.fn(() => ({ order: 'order-1' })),
    routeComponent,
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    mocks.routeComponent = options.component;
    return { ...options, useSearch: mocks.useSearch };
  },
  useNavigate: () => mocks.navigate,
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { success: mocks.notifySuccess },
}));

function purchasesTab(): ComponentType {
  if (!mocks.routeComponent) throw new Error('Purchases route component was not registered');
  return mocks.routeComponent;
}

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (options: { queryKey?: string[] }) => options.queryKey?.includes('status')
      ? { data: mocks.checkoutStatus, isLoading: false }
      : { data: mocks.purchases, isLoading: mocks.isLoading },
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
      status: {
        queryOptions: () => ({ queryKey: ['checkout', 'status'] }),
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
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.isLoading = false;
    mocks.checkoutStatus = { state: 'paid', orderId: 'order-1' };
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
    const Component = purchasesTab();

    renderPurchases(<Component />);

    await waitFor(() => {
      expect(useCartStore.getState().items).toEqual([unpaidItem]);
    });
  });

  it('refreshes purchases from the server after a paid return', async () => {
    const Component = purchasesTab();

    renderPurchases(<Component />);

    await waitFor(() => {
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['checkout', 'myPurchases'],
      });
    });
  });

  it('shows a success toast for the server-confirmed paid state', async () => {
    const Component = purchasesTab();

    renderPurchases(<Component />);

    await waitFor(() => {
      expect(mocks.notifySuccess).toHaveBeenCalledWith(
        'Your purchase is ready to download.',
        'Payment complete',
      );
    });
    expect(document.body).not.toHaveTextContent('Payment complete.');
  });

  it('removes the completed order from the URL after showing the success toast', async () => {
    const Component = purchasesTab();

    renderPurchases(<Component />);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/me/collections/purchases',
        search: {},
        replace: true,
      });
    });
  });

  it('keeps the paid order in the URL until refreshed purchases are removed from the cart', async () => {
    let finishRefresh: (() => void) | undefined;
    mocks.purchases = [];
    mocks.invalidateQueries.mockReturnValue(new Promise<void>((resolve) => {
      finishRefresh = resolve;
    }));
    const Component = purchasesTab();
    const view = renderPurchases(<Component />);

    await waitFor(() => {
      expect(mocks.invalidateQueries).toHaveBeenCalled();
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toEqual([purchasedItem, unpaidItem]);

    mocks.purchases = [{
      id: 'purchase-1',
      purchasedAt: new Date('2026-01-03T00:00:00.000Z'),
      amountPaid: 300,
      previewUrl: null,
      mediaItem: { id: 'media-1', thumbnailUrl: 'https://example.com/thumb-1.jpg' },
    }];
    view.rerender(
      <AppShellLayoutPolicyProvider routeIntent="siteWorkspace" browseExpanded={false} galleryExpanded={false}>
        <Component />
      </AppShellLayoutPolicyProvider>,
    );
    await act(async () => {
      finishRefresh?.();
    });

    await waitFor(() => {
      expect(useCartStore.getState().items).toEqual([unpaidItem]);
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/me/collections/purchases',
        search: {},
        replace: true,
      });
    });
  });

  it('does not refresh purchases or remove cart items before server-confirmed payment', async () => {
    mocks.checkoutStatus = { state: 'processing', orderId: 'order-1' };
    const Component = purchasesTab();

    renderPurchases(<Component />);

    await waitFor(() => {
      expect(useCartStore.getState().items).toEqual([purchasedItem, unpaidItem]);
      expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    });
  });

  it('renders purchase cards inside the shared panel gallery inset', () => {
    const Component = purchasesTab();

    renderPurchases(<Component />);

    expect(document.querySelector('article')?.closest('[data-panel-gallery-inset]')).not.toBeNull();
    expect(document.querySelector('[role="grid"][aria-label="Purchases"]')).not.toBeNull();
  });
});
