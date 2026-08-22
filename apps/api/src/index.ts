import 'dotenv/config';
import * as Sentry from '@sentry/hono/node';
import { sentry } from '@sentry/hono/node';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { auth } from 'server/auth';
import { appRouter } from 'server/router';
import { createContext } from 'server/trpc';
import { paymentAdapter } from 'server/providers/payment/activeAdapter';
import { purchaseFulfillmentService } from 'server/services/PurchaseFulfillmentService';
import { reconcileUploadAttempts } from 'server/jobs/reconcileUploadAttempts';
import { createRateLimiter } from 'server/lib/rateLimiter';
import { getClientIp } from 'server/lib/getClientIp';
import { logger } from 'server/lib/logger';
import { apiConfig } from 'server/config/env';

// Initialized here rather than via Sentry's recommended preloaded instrument
// file — that pattern exists to auto-instrument I/O (pg, http) for tracing
// spans, which this app doesn't use. The Hono middleware below only needs
// init() to have run before app.use(sentry(app)) is reached, which it has.
Sentry.init({ dsn: apiConfig.sentryDsn ?? undefined, environment: apiConfig.nodeEnv });

// 20 webhook requests per IP per minute — prevents replay-flood DoS
const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

const app = new Hono();

app.use(sentry(app));

app.use('/api/*', cors({
  origin: apiConfig.frontendOrigin,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Better Auth — handles /api/auth/* (sign in, sign up, session, sign out)
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

// tRPC
app.use('/api/trpc/*', trpcServer({
  router: appRouter,
  createContext: (_opts, c) => createContext(c),
}));

app.get('/api/health', (c) => c.json({ ok: true }));

// Response shaping only — the sentry() middleware above already reports
// unhandled errors on its own; calling logger.error here too would report
// the same error to Sentry twice.
app.onError((err, c) => {
  console.error('[api] unhandled error', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// CryptoCloud webhook — raw body required for HMAC verification, must NOT go through tRPC
app.post('/api/webhook/cryptocloud', async (c) => {
  try {
    webhookLimiter(getClientIp(c));
  } catch {
    return c.json({ error: 'Too many requests' }, 429);
  }

  const rawBody = await c.req.text();
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  if (!paymentAdapter.verifyWebhook(rawBody, headers)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const event = paymentAdapter.parseWebhookEvent(rawBody);
  if (event.type === 'order.completed') {
    try {
      await purchaseFulfillmentService.fulfillOrder(
        event.customData.orderId,
        event.externalOrderId,
      );
    } catch (err) {
      logger.error('[webhook] Fulfillment failed', { err });
      return c.json({ error: 'Fulfillment error' }, 500);
    }
  }

  return c.json({ ok: true });
});

const RECONCILE_INTERVAL_MS = 15 * 60_000;
const runReconciler = () => reconcileUploadAttempts().catch((err) => logger.error('[reconciler] run failed', { err }));
runReconciler();
setInterval(runReconciler, RECONCILE_INTERVAL_MS);

// Configurable so a second instance (e.g. the visual-capture run, which needs a
// different database) can run alongside an ordinary dev server. Default unchanged.
const serverPort = apiConfig.serverPort;

serve({ fetch: app.fetch, port: serverPort }, () => {
  console.log(`Server running on http://localhost:${serverPort}`);
});
