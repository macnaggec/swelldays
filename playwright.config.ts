/**
 * Visual-regression gate for the responsive-layout reference matrix (roadmap F12h).
 *
 * Deliberately NOT part of the five project gates and NOT run by vitest: vitest
 * stays hermetic and owns unit/integration, while this suite needs a dev server,
 * a browser, and a seeded database. Run it with `npm run test:visual`.
 *
 * The viewport axis lives here as one project per captured viewport. The band
 * axis is mobile-first (roadmap F12b): wide is the desktop-parity baseline
 * captured today; the compact and constrained projects are commented out below
 * and activate as Phases M and T mount their presentations, so enabling a band
 * is a config change rather than a rewrite of the recipes.
 *
 * Environment: `node --env-file=.env.capture` supplies DATABASE_URL (the
 * dedicated capture database) plus REFERENCE_EMAIL / REFERENCE_PASSWORD. The
 * dev server inherits them; `src/server/index.ts` loads `.env` via dotenv, which
 * does not overwrite variables already present, so the capture DATABASE_URL wins.
 */

import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './tests/visual/fixtures';

/**
 * The capture run uses its own ports (set in `.env.capture`) so it can run
 * alongside an ordinary `npm run dev` without colliding — and, more importantly,
 * so it can never silently capture against the dev server and its database.
 */
const BASE_URL = `http://localhost:${process.env.CLIENT_PORT ?? 3100}`;

/** One project per captured viewport; `name` becomes the baseline directory. */
const wideViewports = [
  { name: 'wide-1280x800', width: 1280, height: 800 },
  { name: 'wide-1440x900', width: 1440, height: 900 },
  { name: 'wide-1920x1080', width: 1920, height: 1080 },
];

export default defineConfig({
  testDir: './tests/visual',
  // Baselines live outside `docs/`, which is gitignored — so they commit
  // normally instead of needing the `git add -f` convention the F12b JPEG
  // artifacts required.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: true,
  // Retries absorb environment flakiness (headless WebGL map load and dev-server
  // contention produced intermittent timeouts in roughly 0–2 of 43 states per
  // run), NOT snapshot mismatches: a real layout change is deterministic and
  // fails every attempt. Raising this to paper over a repeatable diff would
  // destroy the gate — don't.
  retries: 2,
  reporter: [['html', { open: 'never' }], ['list']],

  expect: {
    toHaveScreenshot: {
      // Started at zero. Loosened to 0.002 on 2026-07-27 with the user's
      // explicit approval, after they inspected the diffs and judged them not a
      // defect — this is the "deliberately, never silently" case the original
      // note anticipated, not a tolerance added to quiet a real diff.
      //
      // Evidence: three states (browse-expanded, gallery-compact,
      // upload-map-input) differed from their baselines by ~0.0005–0.0008 of
      // pixels at every viewport, confined to glyph edges in the filter pills
      // and card titles — the screens are indistinguishable side by side. Part
      // of that was repeatable (identical pixel counts across all three
      // attempts) and part wandered between attempts (505/426/512), and the
      // extra state that went flaky moved from run to run. Chromium font flags
      // (--font-render-hinting=none, --disable-font-subpixel-positioning,
      // --disable-lcd-text) were tried first as a root-cause fix and changed
      // nothing: headless Chromium already renders text without LCD subpixel
      // smoothing, so they were no-ops and were reverted rather than left as
      // dead configuration.
      //
      // 0.002 sits ~2.5x above the largest observed jitter and ~30x below the
      // smallest real difference this suite has produced: genuine layout
      // changes measured 0.06–0.29 (a mid-animation panel width, a wrong column
      // count). It must never be raised to absorb a diff whose cause is
      // unexplained — diagnose that instead.
      maxDiffPixelRatio: 0.002,
    },
  },

  use: {
    baseURL: BASE_URL,
    // `reducedMotion` is a browser-context option in this Playwright version, so
    // it is set through contextOptions rather than as a top-level use option.
    contextOptions: { reducedMotion: 'reduce' },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    launchOptions: {
      // Mapbox needs WebGL; headless Chromium falls back to SwiftShader.
      args: ['--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--hide-scrollbars'],
    },
  },

  projects: [
    // `storageState` is set only on the capture projects, never at the top
    // level: the setup project is what writes that file, and inheriting it
    // would make setup fail trying to read a file that does not exist yet.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    ...wideViewports.map(({ name, width, height }) => ({
      name,
      testMatch: /matrix\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width, height },
        storageState: STORAGE_STATE,
      },
    })),
    // Phase M activates compact (390×844, 844×390, 430×932, 932×430) and
    // Phase T activates constrained (768×1024, 1024×768). Both bands add
    // projects here; the state recipes are already band-agnostic.
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
