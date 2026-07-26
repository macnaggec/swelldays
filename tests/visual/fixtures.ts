/**
 * Capture-data contract for the visual-regression matrix (roadmap F12h).
 *
 * These ids are the single owner of the records the state recipes navigate to.
 * They live here — not in the recipes and not in a mutable dev database — so a
 * baseline can only change when this fixture or the layout changes. The seed
 * (`./seed.ts`) writes exactly these records; `./matrix.spec.ts` reads them to
 * build URLs. Nothing else may hard-code a capture id.
 *
 * Every timestamp is fixed and in the past. Relative or "today" formatting in
 * the UI would otherwise re-render differently tomorrow and rot every baseline,
 * and the `empty-today` recipe depends on no seeded session matching today.
 */

/**
 * Where the signed-in session cookie is persisted between the setup project and
 * the capture projects.
 *
 * It lives here rather than in `auth.setup.ts` because `playwright.config.ts`
 * needs it: importing it from the setup file would execute that file's `setup()`
 * registration in config context, which Playwright rejects.
 */
export const STORAGE_STATE = 'tests/visual/.auth/capture.json';

export const CAPTURE_IDS = {
  cangguSpotId: '6f712023-7ad5-48a2-b1a5-077bffd1e654',
  cangguSessionId: '7356deba-0497-4132-9704-0ba26891a52d',
  /** Non-draft (SAVED) workspace: opening it renders the "unavailable" lifecycle state. */
  unavailableWorkspaceId: '5247ca97-57cf-45ae-8f57-000b14d2cc72',
  payoutTransactionId: 'b1d0c6e2-8f43-4a71-9c25-2f6a0d3e7c18',
  payoutRequestId: 'c4a7f905-31be-4d62-8e07-9ab5d1c3f240',
} as const;

/** Fixed capture timestamps. Chosen well in the past so no filter ever matches "today". */
export const CAPTURE_DATES = {
  sessionStartsAt: new Date('2025-06-14T22:30:00.000Z'),
  sessionEndsAt: new Date('2025-06-15T01:00:00.000Z'),
  capturedAt: new Date('2025-06-14T23:15:00.000Z'),
  payoutRequestedAt: new Date('2025-06-20T09:00:00.000Z'),
} as const;

/** Media rows seeded into the Canggu session — enough to fill the gallery grid at 1920px. */
export const CAPTURE_MEDIA_COUNT = 24;

export interface CaptureCredentials {
  email: string;
  password: string;
}

/**
 * The capture account's credentials. Dev-only and never committed: the seed
 * creates the account with them and the Playwright setup project signs in with
 * them, so both sides must read the same environment contract.
 */
export function readCaptureCredentials(): CaptureCredentials {
  const email = process.env.REFERENCE_EMAIL;
  const password = process.env.REFERENCE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing REFERENCE_EMAIL / REFERENCE_PASSWORD. Copy .env.capture.example to '
        + '.env.capture and fill them in (see docs/review/responsive-layout-matrix/README.md).',
    );
  }
  return { email, password };
}
