import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Box } from '@mantine/core';
import classes from './_page.module.css';
import { NOINDEX_HEAD } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_page')({
  staticData: { appRouteIntent: 'fullPage' },
  head: () => NOINDEX_HEAD,
  component: PageLayout,
});

/**
 * PageLayout — pathless layout route for full-page views (account, gallery,
 * admin, etc.).
 *
 * Renders as a fixed full-screen overlay above the globe so these routes
 * are not constrained by the drawer. Any route nested under /_page gets
 * proper full-page real estate.
 */
function PageLayout() {
  return (
    <Box className={classes.page}>
      <Outlet />
    </Box>
  );
}
