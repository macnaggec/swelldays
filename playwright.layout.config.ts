import { defineConfig, devices } from '@playwright/test';

const PORT = 3200;
const BASE_URL = `https://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/visual',
  testMatch: /(?:auth-layout|mobile-layout|upload-time-range)-contract\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev:client -- --port ${PORT}`,
    url: `${BASE_URL}/__mobile-layout-contract.html`,
    reuseExistingServer: false,
    ignoreHTTPSErrors: true,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
