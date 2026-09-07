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
import { reconcileUploadAttempts } from 'server/jobs/reconcileUploadAttempts';
import { logger } from 'server/lib/logger';
import { apiConfig } from 'server/config/env';
import { publicPagesRouter } from 'server/routes/publicPages';
import { paymentWebhookRouter } from 'server/routes/paymentWebhooks';

// Initialized here rather than via Sentry's recommended preloaded instrument
// file — that pattern exists to auto-instrument I/O (pg, http) for tracing
// spans, which this app doesn't use. The Hono middleware below only needs
// init() to have run before app.use(sentry(app)) is reached, which it has.
Sentry.init({ dsn: apiConfig.sentryDsn ?? undefined, environment: apiConfig.nodeEnv });

const app = new Hono();

app.use(sentry(app));

app.use('/api/*', cors({
  origin: apiConfig.frontendOrigin,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Better Auth — handles /api/auth/* (sign in, sign up, session, sign out).
// Must be a single `*`, not `**` — combined with the `/:spotId`-style dynamic
// routes in publicPagesRouter below, a `**` wildcard here silently breaks
// Hono's router and every /api/auth/* request 404s instead of reaching auth.handler.
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

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

app.route('/api/webhook', paymentWebhookRouter);

// Server-rendered metadata for crawlers/share-bots (docs/roadmaps/seo-optimization.md,
// Phase 2). Mounted outside /api/* because these mirror the web app's real
// public URLs, not API endpoints — an edge proxy can route bot traffic here
// on the exact same path with no rewriting.
app.route('/', publicPagesRouter);

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
