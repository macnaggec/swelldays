import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@mantine/core/styles.css';
import '@mantine/carousel/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './app.css';
import { router } from 'app/lib/router';
import { theme, cssVariablesResolver } from 'app/lib/theme';
import { TRPCProvider } from 'shared/lib/trpc';
import { queryClient } from 'shared/lib/queryClient';
import { trpcClient } from 'shared/lib/trpcClient';
import { webConfig } from 'config/env';
import { releaseInitialSeoHead } from 'shared/lib/seoMeta';
import { preserveInitialWelcome } from './lib/preserveInitialWelcome';

const SENTRY_STARTUP_DELAY_MS = 1_000;

function initializeSentryAfterFirstPaint() {
  if (!webConfig.sentryDsn) return;

  const initialize = () => {
    void import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: webConfig.sentryDsn,
        environment: webConfig.isDevelopment ? 'development' : 'production',
      });
    });
  };

  const scheduleWhenIdle = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(initialize, { timeout: 2_000 });
    } else {
      initialize();
    }
  };

  const scheduleAfterStartup = () => {
    window.setTimeout(scheduleWhenIdle, SENTRY_STARTUP_DELAY_MS);
  };

  if (document.visibilityState === 'hidden') {
    scheduleAfterStartup();
    return;
  }

  window.requestAnimationFrame(scheduleAfterStartup);
}

async function startApp() {
  // Preserve the initial public document until its React route is ready.
  // The homepage loader is static: this does not wait for auth or inventory.
  if (['/', '/buy-surf-photos', '/sell-surf-photos'].includes(window.location.pathname)) {
    await router.load();
  }
  releaseInitialSeoHead();
  const root = document.getElementById('root')!;
  preserveInitialWelcome(root);
  ReactDOM
  .createRoot(root)
  .render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider
          trpcClient={trpcClient}
          queryClient={queryClient}
        >
          <MantineProvider theme={theme} defaultColorScheme="dark" cssVariablesResolver={cssVariablesResolver}>
            <Notifications
              position="top-right"
              zIndex={1000}
              limit={5}
              autoClose={5000}
            />

            <RouterProvider router={router} />
          </MantineProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );

  initializeSentryAfterFirstPaint();
}

export const applicationReady = startApp();
