import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { initializePaddle, CheckoutEventNames } from '@paddle/paddle-js';
import { Center, Loader } from '@mantine/core';
import { webConfig } from 'config/env';
import { parsePaddleCheckoutParameters } from 'entities/Commerce';

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
  const navigate = useNavigate();
  useEffect(() => {
    const parameters = parsePaddleCheckoutParameters(window.location.search, window.location.origin);
    if (!parameters) {
      void navigate({ href: '/cart' });
      return;
    }

    let cancelled = false;

    void initializePaddle({
      token: webConfig.paddle.clientToken,
      environment: webConfig.paddle.environment === 'sandbox' ? 'sandbox' : 'production',
      eventCallback: (event) => {
        if (!cancelled && event.name === CheckoutEventNames.CHECKOUT_CLOSED) {
          void navigate({ href: parameters.failHref });
        }
      },
    }).then((paddle) => {
      if (cancelled) return;
      if (!paddle) {
        void navigate({ href: parameters.failHref });
        return;
      }
      paddle.Checkout.open({
        transactionId: parameters.transactionId,
        settings: { successUrl: parameters.successUrl },
      });
    }).catch(() => {
      if (!cancelled) void navigate({ href: parameters.failHref });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <Center mih={400}>
      <Loader />
    </Center>
  );
}
