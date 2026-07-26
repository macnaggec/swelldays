# F12h handoff — Playwright visual-regression gate (harness landed, baselines pending)

**F12h is NOT complete and its checkbox stays unchecked.** This slice lands the
harness; the baseline set is deliberately deferred to a session that can run a
browser. Read "What remains" before picking it up.

## What landed

The reference matrix now exists as a Playwright snapshot suite, per the approved
spec in `.scratch/responsive-layout-foundation/issues/02-playwright-visual-regression-gate.md`.

- `playwright.config.ts` — one project per captured viewport (wide 1280×800,
  1440×900, 1920×1080), a `setup` project for authentication, `reducedMotion`,
  deviceScaleFactor 1, `maxDiffPixelRatio: 0`, and a `webServer` that boots the
  dev server against the capture database.
- `tests/visual/matrix.spec.ts` — the 14 F12b state recipes as Playwright tests
  asserting `toHaveScreenshot`, with the Mapbox canvas masked and Cloudinary
  images fulfilled locally.
- `tests/visual/fixtures.ts` — the capture-id and fixed-timestamp contract,
  replacing the `SEEDED` block in `scripts/reference-matrix/matrix.mjs`.
- `tests/visual/seed.ts` — the seed fixture: capture account (created through
  better-auth's own API, so sign-in works over the real endpoint), Canggu spot
  and session, 24 published media, a SAVED workspace for the error state, and a
  payout in progress for earnings.
- `tests/visual/auth.setup.ts` — signs in once and persists `storageState`.
- `docker-compose.capture.yml` + `.env.capture.example` — the dedicated capture
  database on port 5434, separate from dev (5432) and integration (5433).
- npm scripts: `test:visual`, `capture:db:up`, `capture:db:down`, `capture:seed`.
- `docs/review/responsive-layout-matrix/README.md` rewritten for the automated
  workflow, baseline-update policy, and the determinism rationale. The F00
  defect record (D00's toolbar overflow) is preserved.

Two decisions worth carrying forward:

- **Baselines live at `tests/visual/__screenshots__/`**, outside `docs/` — which
  is gitignored, and which forced the `git add -f` convention on the F12b JPEGs.
  This settles the spec's open question: one baseline store, committed normally.
- **The `loading` state holds its API responses open** instead of racing a
  throttled network. The CDP harness's throttled capture was explicitly
  best-effort and not pixel-stable, so it could never have been asserted against.

## What remains (the completing session)

1. `cp .env.capture.example .env.capture`, fill in a real
   `VITE_MAPBOX_ACCESS_TOKEN`, `npx playwright install chromium`.
2. `npm run capture:db:up && npm run capture:seed`.
3. `npm run test:visual -- --update-snapshots`, then **look at every generated
   baseline** — this is the in-session visual verification the roadmap requires,
   and it is the whole reason F12h is not a headless-coder task. Capture the
   wide band with D00's toolbar-overflow defect present, so D00's fix later
   reads as a deliberate diff.
4. Confirm acceptance criterion 2: a deliberate 1px change in a drawer surface
   fails the run; map-camera movement alone does not.
5. Commit the baselines, then delete `scripts/reference-matrix/` and the
   `capture:reference-matrix` script, and drop `chrome-remote-interface` if
   nothing else uses it. Check the F12h box.

The CDP harness was **not** deleted in this slice. The roadmap rule is to remove
a superseded authority as its consumer migrates; with no baselines the migration
has not happened, and deleting the only working harness would leave the repo with
no visual verification at all.

Nothing here has been executed. The suite has never been run — no dev server, no
browser, no database was started (CLAUDE.md §6; the user explicitly chose to
defer baselines). Everything is verified statically only: the five gates,
including typecheck and lint now covering the new files.

## Changed files

- `playwright.config.ts` (new)
- `tests/visual/{fixtures,seed,auth.setup}.ts`, `tests/visual/matrix.spec.ts` (new)
- `docker-compose.capture.yml`, `.env.capture.example` (new)
- `package.json` — `@playwright/test` devDependency; `test:visual`,
  `capture:db:up`, `capture:db:down`, `capture:seed` scripts; `lint` extended
- `tsconfig.json` — `tests` and `playwright.config.ts` added to `include`
- `.gitignore` — `.env.capture`, `tests/visual/.auth/`, `test-results/`,
  `playwright-report/`
- `docs/review/responsive-layout-matrix/README.md` — rewritten
- `docs/roadmaps/responsive-layout-foundation.md` — F12h progress note; F12k
  column-cap decision recorded

## Verification

Gate coverage was extended as part of this slice, because adding TypeScript that
no gate reads would be a hole in the project's machine-enforcement discipline:

- `tsconfig.json` now includes `tests` and `playwright.config.ts`, so gate 1
  typechecks the config, specs, setup, seed, and fixtures. This caught a real
  error: `reducedMotion` is a browser-context option in Playwright 1.62, not a
  top-level `use` option, and is now set via `contextOptions`.
- `npm run lint` now runs `eslint src tests playwright.config.ts`. Verified that
  ESLint genuinely covers the new files (all 5 linted, 0 problems) rather than
  silently ignoring them. The gate's meaning for `src` is unchanged.

Project gates — all five green:

- `npx tsc --noEmit` — pass
- `npx tsc -p tsconfig.server.json --noEmit` — pass
- `npm run lint` — pass
- `npm run check:style-boundaries` — pass
- `npx vitest run --project client --project server` — 106 files, 551 tests
  passed (unchanged from the pre-change baseline; this slice adds no vitest tests,
  correctly — the snapshot assertion owns the visual invariant, and asserting
  config shapes in vitest is prohibited by AGENTS.md §0.3)

Baseline before starting: all five gates were already green on a clean tree.

## Removed concepts

None yet. `scripts/reference-matrix/` and `capture:reference-matrix` are
scheduled for deletion in the baseline-capturing session (see above).

## Unrelated working-tree changes preserved

None — the tree was clean at session start.

## Next ready task

F12h's remaining half (capture and commit baselines, delete the CDP harness) in
a session cleared to run a browser. After that, F12k — whose column decision is
now pinned to the 3-column cap, and which gains this gate as its verifier for
the reflow work.
