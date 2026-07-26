/**
 * Responsive-layout reference matrix as a visual-regression gate (roadmap F12h).
 *
 * Each test is one state's reproduction recipe — the executable form of the
 * "Reproduction" column in the F00 manual reference — ending in a screenshot
 * comparison against a committed baseline. The viewport axis is the Playwright
 * project list in `playwright.config.ts`; this file owns the state axis only, so
 * activating the compact and constrained bands in Phases M and T adds projects
 * rather than editing recipes.
 *
 * Determinism rules that keep a baseline meaningful:
 *  - the Mapbox canvas is hidden, because the camera flight lands differently
 *    between runs and would otherwise report a layout regression on every pass;
 *  - Cloudinary images are fulfilled locally, so the gate never depends on an
 *    external host and every tile has the same intrinsic 1600×1067 box;
 *  - data comes from the seeded capture database (see ./seed.ts), never the dev
 *    database.
 */

import { test, expect, type Page } from '@playwright/test';
import { CAPTURE_IDS } from './fixtures';

/**
 * Stand-in for every remote image. An SVG carries the same intrinsic dimensions
 * as the seeded media rows, so tiles occupy exactly the box the real asset would
 * and a layout diff means layout actually changed.
 */
const PLACEHOLDER_IMAGE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067">'
  + '<rect width="100%" height="100%" fill="#c9d6de"/></svg>';

/** Requests the app must not make during a capture: they are served locally instead. */
const REMOTE_IMAGE_PATTERN = '**res.cloudinary.com/**';

async function stubRemoteImages(page: Page): Promise<void> {
  await page.route(REMOTE_IMAGE_PATTERN, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: PLACEHOLDER_IMAGE }),
  );
}

/**
 * Hide everything whose pixels depend on where the map camera happens to be.
 *
 * Playwright's `mask` cannot be used here: `.globeContainer` is
 * `position: absolute; inset: 0`, so the map fills the viewport and the panel
 * floats above it. A mask paints over the element's bounding box regardless of
 * stacking, so masking the canvas blanks the entire UI — including the layout
 * this suite exists to compare.
 *
 * `visibility: hidden` keeps every box in place, so nothing reflows: only the
 * camera-dependent pixels go, and the globe container's own background colour
 * remains as a stable backdrop.
 */
async function hideMapPixels(page: Page): Promise<void> {
  // Injected after navigation rather than via addInitScript: an init script runs
  // before the document exists, so appending to `document.documentElement` there
  // silently does nothing and the map renders into the baseline.
  await page.addStyleTag({
    content: `
      .mapboxgl-canvas,
      .mapboxgl-marker,
      .mapboxgl-ctrl-bottom-left,
      .mapboxgl-ctrl-bottom-right { visibility: hidden !important; }
    `,
  });
}

/** Screenshot options shared by every state. */
function captureOptions() {
  return {
    fullPage: false,
    animations: 'disabled' as const,
  };
}

/**
 * Wait until the app shell has mounted and the panel surface exists.
 * `toHaveScreenshot` then holds until two consecutive frames match, which
 * absorbs the remaining paint/font settling without a fixed sleep.
 */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('#root').locator('*').first()).toBeAttached();
  await hideMapPixels(page);
  await expect(page.getByRole('complementary')).toBeVisible();
  // GlobeMap renders a spinner overlay while the map is still loading. Whether
  // the capture races it varies between runs, so wait it out: its presence or
  // absence would otherwise be the difference between two "identical" runs.
  // The selector matches the CSS-module classes GlobeMap declares, which keep
  // their authored names in the generated class.
  await expect(
    page.locator('[class*="globeContainer"] [class*="loading"]'),
  ).toHaveCount(0, { timeout: 30_000 });
}

/**
 * Drive the shared expand/collapse control into `wanted`. The control's
 * accessible name is the action it offers, so its presence reports the current
 * state: an "Expand panel" button means the panel is currently collapsed.
 */
async function ensurePanelExpansion(page: Page, wanted: 'expanded' | 'compact'): Promise<void> {
  const action = wanted === 'expanded' ? 'Expand panel' : 'Collapse panel';
  const control = page.getByRole('button', { name: action });
  if (await control.isVisible().catch(() => false)) {
    await control.click();
  }
  // The opposite affordance is now the one on offer: the toggle has committed.
  const settled = wanted === 'expanded' ? 'Collapse panel' : 'Expand panel';
  await expect(page.getByRole('button', { name: settled })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await stubRemoteImages(page);
});

test('browse-compact', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await ensurePanelExpansion(page, 'compact');
  await expect(page).toHaveScreenshot('browse-compact.png', captureOptions());
});

test('browse-expanded', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await ensurePanelExpansion(page, 'expanded');
  await expect(page).toHaveScreenshot('browse-expanded.png', captureOptions());
});

test('gallery-compact', async ({ page }) => {
  await page.goto('/gallery');
  await settle(page);
  await ensurePanelExpansion(page, 'compact');
  await expect(page).toHaveScreenshot('gallery-compact.png', captureOptions());
});

test('gallery-expanded', async ({ page }) => {
  await page.goto('/gallery');
  await settle(page);
  await ensurePanelExpansion(page, 'expanded');
  await expect(page).toHaveScreenshot('gallery-expanded.png', captureOptions());
});

test('session-detail', async ({ page }) => {
  await page.goto(`/${CAPTURE_IDS.cangguSpotId}/session/${CAPTURE_IDS.cangguSessionId}`);
  await settle(page);
  await expect(page).toHaveScreenshot('session-detail.png', captureOptions());
});

test('cart', async ({ page }) => {
  await page.goto('/cart');
  await settle(page);
  await expect(page).toHaveScreenshot('cart.png', captureOptions());
});

test('account', async ({ page }) => {
  await page.goto('/me');
  await settle(page);
  await expect(page).toHaveScreenshot('account.png', captureOptions());
});

test('collections', async ({ page }) => {
  await page.goto('/me/collections');
  await settle(page);
  await expect(page).toHaveScreenshot('collections.png', captureOptions());
});

test('earnings', async ({ page }) => {
  await page.goto('/me/earnings');
  await settle(page);
  await expect(page).toHaveScreenshot('earnings.png', captureOptions());
});

test('upload-map-input', async ({ page }) => {
  await page.goto('/upload');
  await settle(page);
  await expect(page).toHaveScreenshot('upload-map-input.png', captureOptions());
});

/**
 * The loading state is held open deliberately rather than raced under network
 * throttling: the API responses are withheld until after the capture, so the
 * skeleton is a stable frame instead of whichever frame the throttle happened to
 * land on. That is what makes it comparable at all.
 */
test('loading', async ({ page }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/trpc/**', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#root').locator('*').first()).toBeAttached();
  await hideMapPixels(page);
  await expect(page).toHaveScreenshot('loading.png', captureOptions());

  release();
  await page.unroute('**/api/trpc/**');
});

test('empty-today', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page).toHaveScreenshot('empty-today.png', captureOptions());
});

test('error-upload-workspace', async ({ page }) => {
  await page.goto(`/upload?workspaceId=${CAPTURE_IDS.unavailableWorkspaceId}`);
  await settle(page);
  await expect(page.getByText('This upload workspace is unavailable')).toBeVisible();
  await expect(page).toHaveScreenshot('error-upload-workspace.png', captureOptions());
});

test('dialog-delete-account', async ({ page }) => {
  await page.goto('/me');
  await settle(page);
  await page.getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveScreenshot('dialog-delete-account.png', captureOptions());
});
