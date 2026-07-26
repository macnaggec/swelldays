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
import { STORAGE_STATE } from './tests/visual/auth.setup';

const BASE_URL = 'http://localhost:3000';

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
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],

  expect: {
    toHaveScreenshot: {
      // Start at zero and loosen deliberately, never silently: a tolerance added
      // to quiet a real diff is how a visual gate stops being one.
      maxDiffPixelRatio: 0,
    },
  },

  use: {
    baseURL: BASE_URL,
    // `reducedMotion` is a browser-context option in this Playwright version, so
    // it is set through contextOptions rather than as a top-level use option.
    contextOptions: { reducedMotion: 'reduce' },
    deviceScaleFactor: 1,
    storageState: STORAGE_STATE,
    trace: 'retain-on-failure',
    launchOptions: {
      // Mapbox needs WebGL; headless Chromium falls back to SwiftShader.
      args: ['--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--hide-scrollbars'],
    },
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { storageState: undefined } },
    ...wideViewports.map(({ name, width, height }) => ({
      name,
      testMatch: /matrix\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width, height } },
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
