import { Hono } from 'hono';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { paymentWebhookAdapters } from 'server/providers/payment/activeAdapter';
import type { IPaymentService } from 'server/services/PaymentService';
import { paymentService } from 'server/services/PaymentService';
import { logger } from 'server/lib/logger';

export type PaymentWebhookRouterDependencies = {
  adapters: readonly PaymentAdapter[];
  payments: Pick<IPaymentService, 'acceptVerifiedNotification'>;
};

// Provider callbacks are small (a JSON notification, or a form-encoded one at
// most a few KB). An unbounded body is a cheap denial-of-service surface —
// reject anything implausibly large before it reaches signature verification
// or JSON parsing.
const MAX_WEBHOOK_BODY_BYTES = 65_536;

export function createPaymentWebhookRouter(
  dependencies: PaymentWebhookRouterDependencies,
): Hono {
  const router = new Hono();
  for (const adapter of dependencies.adapters) {
    router.post(`/${adapter.provider}`, async (c) => {
      const rawBody = await c.req.text();
      if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
        return c.json({ error: 'Payload too large' }, 413);
      }
      const headers = Object.fromEntries(
        [...c.req.raw.headers.entries()].map(([name, value]) => [name.toLowerCase(), value]),
      );
      try {
        const outcome = await dependencies.payments.acceptVerifiedNotification(
          adapter,
          rawBody,
          headers,
        );
        if (outcome.type === 'invalid-signature') {
          return c.json({ error: 'Invalid signature' }, 401);
        }
        return c.json({ ok: true });
      } catch (err) {
        logger.error('[payment-webhook] Processing failed', {
          err,
          provider: adapter.provider,
        });
        return c.json({ error: 'Payment processing error' }, 500);
      }
    });
  }
  return router;
}

export const paymentWebhookRouter = createPaymentWebhookRouter({
  adapters: paymentWebhookAdapters,
  payments: paymentService,
});
