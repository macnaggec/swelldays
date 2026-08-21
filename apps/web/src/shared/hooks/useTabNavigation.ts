import { useCallback, useRef } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';

/**
 * Unifies URL-driven tab navigation used across drawer routes.
 *
 * @param tabRoutes - Map of tab key → route path (e.g. `{ gallery: '/$spotId', upload: '/$spotId/upload' }`)
 * @param params - Route params forwarded to `navigate` (e.g. `{ spotId }`)
 *
 * Active tab is derived by matching the current pathname suffix against route values.
 * More specific routes (longer paths) should come before generic ones in the map.
 * Pass module-level `const` objects — inline objects create new references each render.
 */
export function useTabNavigation(
  tabRoutes: Record<string, string>,
  params?: Record<string, string>,
) {
  const navigate = useNavigate();
  const routesRef = useRef(tabRoutes);
  const paramsRef = useRef(params);

  const activeTab = useRouterState({
    select: (s) => {
      const path = s.location.pathname;
      const entry = Object.entries(routesRef.current)
        .find(([, route]) => {
          const resolved = route.replace(/\$(\w+)/g, (_, key) => paramsRef.current?.[key] ?? `$${key}`);

          return path.endsWith(resolved);
        });

      return entry?.[0] ?? Object.keys(routesRef.current)[0];
    },
  });

  const handleTabChange = useCallback((tab: string | null) => {
    if (!tab || !(tab in routesRef.current)) return;

    void navigate({
      to: routesRef.current[tab] as never,
      params: paramsRef.current as never
    });
  }, [navigate]);

  return { activeTab, handleTabChange };
}
