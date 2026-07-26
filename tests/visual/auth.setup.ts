/**
 * Signs the capture account in once and stores the session cookie, so every
 * capture project starts already authenticated instead of re-running sign-in
 * per state (roadmap F12h).
 *
 * The request goes through the browser context's own request object rather than
 * the standalone `request` fixture: cookies must land in the context that
 * `storageState` later serialises, otherwise the saved file is empty and every
 * signed-in state silently captures a logged-out screen.
 *
 * better-auth rejects a cross-origin credential post without an `Origin`
 * header, so it is set explicitly.
 */

import { test as setup, expect } from '@playwright/test';
import { readCaptureCredentials, STORAGE_STATE } from './fixtures';

setup('authenticate the capture account', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL must be configured for the capture projects.');
  const { email, password } = readCaptureCredentials();

  const response = await page.context().request.post('/api/auth/sign-in/email', {
    headers: { 'Content-Type': 'application/json', Origin: baseURL },
    data: { email, password },
  });

  expect(
    response.ok(),
    `Sign-in failed (${response.status()}): ${await response.text()}. `
      + 'Has the capture database been seeded (npm run capture:seed)?',
  ).toBe(true);

  const { cookies } = await page.context().storageState({ path: STORAGE_STATE });
  expect(cookies, 'Sign-in returned no session cookie.').not.toHaveLength(0);
});
