import { waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';

const mocks = vi.hoisted(() => {
  let eventCallback: ((event: { name: string }) => void) | undefined;
  let routeComponent: ComponentType | undefined;
  return {
    initializePaddle: vi.fn(),
    navigate: vi.fn(),
    open: vi.fn(),
    eventCallback,
    routeComponent,
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    mocks.routeComponent = options.component;
    return options;
  },
  useNavigate: () => mocks.navigate,
}));

vi.mock('@paddle/paddle-js', () => ({
  CheckoutEventNames: { CHECKOUT_CLOSED: 'checkout.closed' },
  initializePaddle: (options: { eventCallback: (event: { name: string }) => void }) => {
    mocks.eventCallback = options.eventCallback;
    return mocks.initializePaddle(options);
  },
}));

vi.mock('config/env', () => ({
  webConfig: { paddle: { clientToken: 'test_token', environment: 'sandbox' } },
}));

import { parsePaddleCheckoutParameters } from 'entities/Commerce/model/paddleCheckoutParameters';
import './_page.checkout.paddle';

function paddleCheckoutPage(): ComponentType {
  if (!mocks.routeComponent) throw new Error('Paddle checkout route component was not registered');
  return mocks.routeComponent;
}

describe('parsePaddleCheckoutParameters', () => {
  const origin = 'https://swelldays.example';

  it('returns validated same-origin destinations', () => {
    const search = new URLSearchParams({
      _ptxn: 'txn_1',
      successUrl: '/me/collections/purchases?order=1',
      failUrl: '/cart?retry=1#checkout',
    });
    expect(parsePaddleCheckoutParameters(`?${search}`, origin)).toEqual({
      transactionId: 'txn_1',
      successUrl: 'https://swelldays.example/me/collections/purchases?order=1',
      failHref: '/cart?retry=1#checkout',
    });
  });

  it.each([
    '',
    '_ptxn=&successUrl=%2Fok&failUrl=%2Fcart',
    '_ptxn=txn&successUrl=https%3A%2F%2Fevil.example%2Fok&failUrl=%2Fcart',
    '_ptxn=txn&successUrl=%2Fok&failUrl=%2F%2Fevil.example%2Fcart',
    '_ptxn=txn&successUrl=javascript%3Aalert%281%29&failUrl=%2Fcart',
    '_ptxn=txn&successUrl=%2Fok&failUrl=https%3A%2F%2Fswelldays.example.evil.test%2Fcart',
    '_ptxn=txn&successUrl=https%3A%2F%2Fuser%3Apass%40swelldays.example%2Fok&failUrl=%2Fcart',
  ])('rejects unsafe or incomplete parameters %#', (search) => {
    expect(parsePaddleCheckoutParameters(`?${search}`, origin)).toBeNull();
  });
});

describe('PaddleCheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventCallback = undefined;
    mocks.initializePaddle.mockResolvedValue({ Checkout: { open: mocks.open } });
    const params = new URLSearchParams({
      _ptxn: 'txn_1',
      successUrl: '/me/collections/purchases?order=1',
      failUrl: '/cart?retry=1',
    });
    window.history.replaceState({}, '', `/checkout/paddle?${params}`);
  });

  it('opens Paddle with only the validated transaction and success URL', async () => {
    const Component = paddleCheckoutPage();
    render(<Component />);

    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith({
      transactionId: 'txn_1',
      settings: { successUrl: `${window.location.origin}/me/collections/purchases?order=1` },
    }));
  });

  it('uses the safe failure route when Paddle is unavailable or rejects', async () => {
    const Component = paddleCheckoutPage();
    mocks.initializePaddle.mockResolvedValueOnce(undefined);
    const first = render(<Component />);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ href: '/cart?retry=1' }));
    first.unmount();

    mocks.navigate.mockClear();
    mocks.initializePaddle.mockRejectedValueOnce(new Error('unavailable'));
    render(<Component />);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ href: '/cart?retry=1' }));
  });

  it('routes checkout close to the validated failure destination', async () => {
    const Component = paddleCheckoutPage();
    render(<Component />);
    await waitFor(() => expect(mocks.eventCallback).toBeDefined());

    mocks.eventCallback?.({ name: 'checkout.closed' });

    expect(mocks.navigate).toHaveBeenCalledWith({ href: '/cart?retry=1' });
  });

  it('does not route a late checkout-close event after unmount', async () => {
    const Component = paddleCheckoutPage();
    const view = render(<Component />);
    await waitFor(() => expect(mocks.eventCallback).toBeDefined());
    view.unmount();
    mocks.navigate.mockClear();

    mocks.eventCallback?.({ name: 'checkout.closed' });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('falls back to cart for invalid parameters', () => {
    window.history.replaceState({}, '', '/checkout/paddle?_ptxn=txn_1&successUrl=https://evil.example');
    const Component = paddleCheckoutPage();
    render(<Component />);
    expect(mocks.navigate).toHaveBeenCalledWith({ href: '/cart' });
    expect(mocks.initializePaddle).not.toHaveBeenCalled();
  });
});
