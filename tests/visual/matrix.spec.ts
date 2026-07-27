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
      /* The selected-spot popup is anchored to a map coordinate, so where it
         lands - and whether it is on screen at all - is decided by the camera,
         exactly like a marker. The session-detail baseline captured it present
         at one viewport and absent at the others purely by chance. */
      .mapboxgl-popup,
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

/** Consecutive unchanged frames that count as "everything has come to rest". */
const MOTION_SETTLE_FRAMES = 3;
/** A surface still moving after this long is a defect, not slow settling. */
const MOTION_SETTLE_TIMEOUT_MS = 10_000;

/**
 * Hold until nothing on the page is still moving.
 *
 * `animations: 'disabled'` fast-forwards CSS animations and transitions only. The
 * panel's expand/collapse is neither: `DrawerShell` animates its width and
 * `PanelChromeSlot` FLIPs its position, both through framer-motion, which drives
 * `style` from its own frame loop. Playwright cannot skip those to their end
 * state, and `toHaveScreenshot`'s two-frame stability check compares frames
 * 100–250ms apart — far enough into the tail of a 280ms ease that the two match
 * while the surface is still a fraction of a pixel short of its resting place.
 * That is the whole of the residual `browse-expanded` and `gallery-compact`
 * failures: a diff confined to whichever element was last in flight, differing by
 * a few hundred pixels and by a different count every run.
 *
 * Geometry is the signal rather than a motion flag from the app, because it is
 * true of every source of movement at once — the width animation, the chrome
 * FLIP, and the gallery virtualiser's first measured pass — and it stays true if
 * a later slice animates something new. Only boxes are sampled, so a colour or
 * opacity animation (which cannot move a layout) never holds the capture up.
 */
async function waitForMotionToSettle(page: Page): Promise<void> {
  const stillMoving = await page.evaluate(
    async ({ frames, timeoutMs }) => {
      const sample = () => {
        const geometry = new Map<Element, string>();
        for (const element of document.querySelectorAll('body *')) {
          const { x, y, width, height } = element.getBoundingClientRect();
          geometry.set(element, `${x},${y},${width},${height}`);
        }
        return geometry;
      };
      const nextFrame = () => new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const describe = (element: Element) => {
        const classes = String(element.getAttribute('class') ?? '').split(' ')[0];
        return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
      };

      const deadline = performance.now() + timeoutMs;
      let previous = sample();
      let still = 0;

      while (still < frames) {
        await nextFrame();
        const next = sample();
        // A mount reads as movement too: an element absent from the previous
        // sample has no recorded geometry, so it never matches.
        const moved = [...next].filter(([element, box]) => previous.get(element) !== box);
        const changed = moved.length > 0 || next.size !== previous.size;
        previous = next;
        still = changed ? 0 : still + 1;

        if (changed && performance.now() > deadline) {
          return moved.slice(0, 5).map(([element]) => describe(element));
        }
      }
      return null;
    },
    { frames: MOTION_SETTLE_FRAMES, timeoutMs: MOTION_SETTLE_TIMEOUT_MS },
  );

  if (stillMoving) {
    throw new Error(
      `Nothing should still be moving ${MOTION_SETTLE_TIMEOUT_MS}ms after the state was reached, `
        + `but these are: ${stillMoving.join(', ')}.`,
    );
  }
}

/**
 * Wait until the app shell has mounted, the panel surface exists, and everything
 * has stopped moving.
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
  await waitForMotionToSettle(page);
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
  // The label flips on the state change, which is the *start* of the panel's
  // width animation, not its end. Without this the capture lands mid-glide.
  await waitForMotionToSettle(page);
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
  // `commit` returns before a single module has been fetched, so this is the one
  // state that starts its clock at the very beginning of a cold page load. Under
  // the dev server's own load — three viewport projects navigating at once — that
  // takes longer than the 5s implicit timeout, which is why `loading` was the
  // state that needed a retry most often. The wait itself is unchanged; only the
  // patience is, matched to the same order as the map-load wait in `settle`.
  await expect(page.locator('#root').locator('*').first()).toBeAttached({ timeout: 30_000 });
  await hideMapPixels(page);
  await expect(page).toHaveScreenshot('loading.png', captureOptions());

  release();
  await page.unroute('**/api/trpc/**');
});

test('empty-today', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await page.getByRole('button', { name: 'Today' }).click();
  await waitForMotionToSettle(page);
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
  await waitForMotionToSettle(page);
  await expect(page).toHaveScreenshot('dialog-delete-account.png', captureOptions());
});
