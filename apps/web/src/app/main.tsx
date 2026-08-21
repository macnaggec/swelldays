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
import '@mantine/core/styles.css';
import '@mantine/carousel/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import 'shared/ui/design-system/tokens.css';
import './app.css';
import { router } from 'app/lib/router';
import { theme, cssVariablesResolver } from 'app/lib/theme';
import { TRPCProvider } from 'shared/lib/trpc';
import { queryClient } from 'shared/lib/queryClient';
import { trpcClient } from 'shared/lib/trpcClient';

ReactDOM
  .createRoot(document.getElementById('root')!)
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
