# Automate the reference matrix: Playwright Test visual-regression gate

Status: ready-for-agent

## Goal

Replace agent/human eyeballing of the F12b reference matrix with a fully
automated compare: a re-run must answer "did any captured state change?"
deterministically, at zero token cost, and surface only actual diffs for
review. Slot this before M07 — M07, T05, D00, and D03 are contracted to
consume the matrix, and this converts each of those verification passes from
~100k+ vision tokens to approximately zero when clean.

## Design (approved direction, 2026-07-23)

- **Runner: Playwright Test**, as its own command — NOT wedged into vitest.
  Vitest keeps owning unit/integration (gate 5, hermetic). The visual matrix
  needs a dev server, Chrome, and seeded data, so it is a separate
  `npm run test:visual` (plus `-- --update-snapshots` for intentional
  baseline updates). It does not join the five project gates.
- **Loki was evaluated and rejected**: it is Storybook/component-oriented and
  cannot reproduce app-level states (auth, seeded DB, live map, drawer
  lifecycle). If component-level visual tests are ever wanted, vitest 4
  browser-mode `toMatchScreenshot` is already in the installed major version.
- **Matrix semantics carry over from F12b**: the 14 state reproduction
  recipes in `scripts/reference-matrix/matrix.mjs` become Playwright tests;
  the band/viewport axis becomes Playwright projects (wide now; compact and
  constrained activate as Phases M/T land). Sign-in reuses the
  `REFERENCE_EMAIL`/`REFERENCE_PASSWORD` env contract via a storageState
  setup project (better-auth requires an Origin header — see
  `signIn()` in `scripts/reference-matrix/capture.mjs`).
- **Assertion: `toHaveScreenshot`** with:
  - `mask` over the Mapbox canvas — kills the map-camera variance documented
    in `docs/review/responsive-layout-matrix/README.md`;
  - `animations: 'disabled'` and context `reducedMotion: 'reduce'`;
  - deviceScaleFactor 1, JPEG or PNG per Playwright default (PNG preferred
    for lossless diffing; the F12b JPEGs were density-matched to F00, not a
    contract);
  - a small `maxDiffPixelRatio` tolerance only if local font rendering
    proves noisy — start at zero and loosen deliberately, never silently.
- **Pin the data (the load-bearing piece):** captures run against a dedicated
  seeded capture database, not the mutable dev DB — otherwise baselines rot
  as the user works in the app. Reuse the `docker-compose.test.yml`
  infrastructure pattern with a fixed seed fixture that reproduces the F00
  reference records (Canggu session, non-draft workspace, payout-in-progress
  earnings, media items). The seed fixture becomes the single owner of
  capture data; the SEEDED id block in `matrix.mjs` migrates into it.
- **Baselines are committed** (note: `docs` is gitignored — either store
  snapshots outside `docs/` e.g. `tests/visual/__screenshots__/`, or keep the
  established `git add -f` convention; decide once, record in the README).
- **The CDP harness is superseded**: delete `scripts/reference-matrix/` and
  the `capture:reference-matrix` npm script in the same slice (roadmap rule:
  remove the superseded authority as its consumer migrates). The F12b JPEG
  artifacts remain as the historical wide-band record unless regenerating
  them as Playwright baselines makes them redundant — prefer one baseline
  store, not two.

## Acceptance criteria

1. `npm run test:visual` runs green from a clean checkout with only Docker,
   Playwright browsers, and the env credentials — no manual data setup.
2. A deliberate 1px layout change in a drawer surface fails the run with a
   visual diff report; map camera movement alone does not.
3. Baseline update is an explicit `--update-snapshots` invocation.
4. The five project gates remain green and unchanged in meaning.
5. `docs/review/responsive-layout-matrix/README.md` is rewritten to describe
   the automated system, the diff/review workflow, and baseline-update policy.
6. M07/T05/D00/D03 consume `npm run test:visual` as their execution vehicle
   (roadmap references updated when each task runs).

## Verification ownership (AGENTS.md §0.3)

The Playwright snapshot assertion owns the visual invariant. The seed fixture
plus docker compose own data determinism. No vitest unit tests asserting
screenshot bytes, config shapes, or Playwright's documented behavior.

## Open items for the implementing session

- New devDependency `@playwright/test` + browser install step (document in
  README; keep Chromium only).
- Whether the dev server is auto-started by Playwright `webServer` config
  (preferred: point it at the capture DB via env) or expected running.
- Roadmap placement: add as a checkbox task before M07 in
  `docs/roadmaps/responsive-layout-foundation.md` (F12h or equivalent) when
  picked up, per the same-commit record discipline.

## Comments

Filed from the F12b session on 2026-07-23 after the user approved the
Playwright direction and rejected Loki per the evaluation recorded here.
