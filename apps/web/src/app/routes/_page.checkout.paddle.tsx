import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { initializePaddle, CheckoutEventNames } from '@paddle/paddle-js';
import { Center, Loader } from '@mantine/core';
import { webConfig } from 'config/env';

export const Route = createFileRoute('/_page/checkout/paddle')({
  staticData: { appRouteIntent: 'fullPage' },
  component: PaddleCheckoutPage,
});

/**
 * PaddleCheckoutPage — the "checkoutUrl" PaddleAdapter hands back to the
 * cart. Unlike CryptoCloud's hosted invoice page, Paddle's checkout runs as
 * an overlay on OUR OWN domain, so this page's only job is to read the
 * transaction id Paddle appended (`_ptxn`) and the successUrl/failUrl
 * PaddleAdapter round-tripped through this page's own query string, then
 * open that overlay.
 */
function PaddleCheckoutPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get('_ptxn');
    const successUrl = params.get('successUrl');
    const failUrl = params.get('failUrl');

    if (!transactionId || !successUrl || !failUrl) {
      window.location.href = failUrl ?? '/cart';
      return;
    }

    let cancelled = false;

    void initializePaddle({
      token: webConfig.paddle.clientToken,
      environment: webConfig.paddle.environment === 'sandbox' ? 'sandbox' : 'production',
      eventCallback: (event) => {
        if (event.name === CheckoutEventNames.CHECKOUT_CLOSED) {
          window.location.href = failUrl;
        }
      },
    }).then((paddle) => {
      if (cancelled || !paddle) return;
      paddle.Checkout.open({
        transactionId,
        settings: { successUrl },
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Center mih={400}>
      <Loader />
    </Center>
  );
}
