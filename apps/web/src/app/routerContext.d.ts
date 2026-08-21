import type { QueryClient } from '@tanstack/react-query';
import type { DeclaredAppRouteIntent } from 'shared/model/appRouteIntent';

declare module '@tanstack/react-router' {
  interface RouterContext {
    queryClient: QueryClient;
  }

  interface StaticDataRouteOption {
    /** Panel header text — read by PanelFrame in _panel.tsx; no effect bridge needed. */
    panelHeader?: string;
    /** Semantic presentation intent inherited through the active route tree. */
    appRouteIntent?: DeclaredAppRouteIntent;
  }
}
