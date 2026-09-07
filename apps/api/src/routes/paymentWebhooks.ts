import { Hono } from 'hono';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { paymentWebhookAdapters } from 'server/providers/payment/activeAdapter';
import type { IPaymentService } from 'server/services/PaymentService';
import { paymentService } from 'server/services/PaymentService';
import { createRateLimiter } from 'server/lib/rateLimiter';
import { getClientIp } from 'server/lib/getClientIp';
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
  const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

  for (const adapter of dependencies.adapters) {
    router.post(`/${adapter.provider}`, async (c) => {
      try {
        limiter(getClientIp(c));
      } catch {
        return c.json({ error: 'Too many requests' }, 429);
      }

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
        if (outcome.type === 'unknown-transaction' || outcome.type === 'mismatched-correlation') {
          return c.json({ error: 'Payment association conflict' }, 409);
        }
        if (outcome.type === 'rejected-receipt') {
          return c.json({ error: 'Payment validation failed' }, 409);
        }
        if (outcome.type === 'provider-unreachable') {
          return c.json({ error: 'Payment provider unreachable' }, 502);
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
