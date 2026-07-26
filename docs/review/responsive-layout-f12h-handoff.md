# F12h handoff — Playwright visual-regression gate

Task completed: **F12h — Refactor: automate the reference matrix as a Playwright
visual-regression gate**

## Invariant

A change to any captured layout state cannot land unnoticed, and costs no review
effort when nothing changed. The Playwright snapshot suite owns verification: a
deliberate layout change fails it, while map-camera movement alone cannot,
because the map is hidden rather than compared.

## Authority

`tests/visual/` owns the captured layout states end to end — the state recipes
(`matrix.spec.ts`), the capture-data contract (`fixtures.ts`), the seed that
writes it (`seed.ts`), and the committed baselines
(`__screenshots__/<project>/<state>.png`). `playwright.config.ts` owns the
viewport axis. The superseded CDP harness is deleted.

## What landed

- `playwright.config.ts` — one project per captured viewport (wide 1280×800,
  1440×900, 1920×1080) plus a `setup` project, `reducedMotion`,
  deviceScaleFactor 1, `maxDiffPixelRatio: 0`, and a `webServer` that boots the
  dev server against the capture database on isolated ports.
- `tests/visual/matrix.spec.ts` — the 14 F12b state recipes as Playwright tests.
- `tests/visual/fixtures.ts` — capture ids, fixed timestamps, storage-state path.
- `tests/visual/seed.ts` — the capture account (created through better-auth's own
  API so sign-in works over the real endpoint), 6 spots/sessions, 39 media, a
  SAVED workspace for the error state, and a payout in progress.
- `tests/visual/auth.setup.ts` — signs in once, persists `storageState`.
- `tests/visual/__screenshots__/` — **42 committed baselines** (14 states × 3
  wide viewports).
- `docker-compose.capture.yml`, `.env.capture.example` — the capture database on
  port 5434, separate from dev (5432) and integration (5433).
- npm scripts: `test:visual`, `capture:db:up`, `capture:db:down`, `capture:seed`.
- `docs/review/responsive-layout-matrix/README.md` rewritten.
- **Deleted:** `scripts/reference-matrix/` and the `capture:reference-matrix`
  script. `chrome-remote-interface` was **kept** — `scripts/chrome-reset.mjs`
  still uses it.

## Design decisions worth carrying forward

- **Masking cannot work in this app.** `.globeContainer` is
  `position: absolute; inset: 0`, so the map fills the viewport and the panel
  floats above it. Playwright's `mask` paints over an element's bounding box
  regardless of stacking, so masking the map canvas blanked the entire UI — the
  first baseline set was 42 images of solid magenta. The map is now hidden with
  injected CSS (`visibility: hidden`, which preserves every layout box) applied
  after navigation. An `addInitScript` injection does **not** work: it runs
  before the document exists, so the append silently no-ops.
- **The feed needed more than one session.** With a single seeded session the
  browse feed rendered one card, which looks identical at one, two, or three
  columns — the baseline would have been blind to exactly the
  `PanelCollectionGrid` change F12k makes. Five extra spots/sessions were seeded
  so the feed renders a real multi-column grid.
- **Wait out the map loading spinner.** GlobeMap renders a spinner overlay while
  the map loads; whether a capture raced it varied per run. `settle()` now waits
  for that overlay to disappear.
- **Baselines live outside `docs/`**, which is gitignored and forced the
  `git add -f` convention on the F12b JPEGs. One baseline store, committed
  normally.
- **The `loading` state holds its API responses open** rather than racing a
  throttled network, so it is a stable frame.

## Ports (behaviour change, defaults unchanged)

The capture run needs its own dev server against its own database, and port 3000
was occupied by an ordinary `npm run dev`. `src/server/index.ts` and
`vite.config.ts` now read `SERVER_PORT` / `CLIENT_PORT`, defaulting to 3001/3000
exactly as before. The capture run uses 3101/3100, so it can never silently
capture against the dev server and its database.

## Focused verification

- **The gate catches a real change (acceptance criterion 2).** A deliberate 3px
  `PanelCollectionGrid` gap change failed all three attempts with a ~9,700-pixel
  diff, then was reverted. Verified, not assumed.
- **Every baseline was reviewed on screen**, not just generated — this is the
  in-session visual verification the roadmap required. The first two attempts
  were rejected on that review (all-magenta masking; then a visible globe and
  Mapbox logo because the init-script injection never applied).
- **Full suite green against the committed baselines.**

### Known flakiness (measured)

0–2 states per 43 fail on first attempt and pass on retry, most often
`gallery-compact` — the virtualised gallery in the narrow panel, still settling
when the capture fires. `retries: 2` absorbs this.

Retries do not weaken the assertion: a genuine layout change is deterministic and
fails every attempt, as the 3px experiment showed. A state that passes only on
retry *with a pixel diff* rather than a timeout is a real defect, not flakiness.
Fixing `gallery-compact` at its source (an explicit wait for the virtualiser) is
worth doing and is **not** done.

The setup project also hit one transient auth 500 that passed on retry; cause not
identified. Worth watching rather than acting on yet.

## Project gates

All five green:

- `npx tsc --noEmit` — pass
- `npx tsc -p tsconfig.server.json --noEmit` — pass
- `npm run lint` — pass
- `npm run check:style-boundaries` — pass
- `npx vitest run --project client --project server` — 106 files, 551 tests passed

Gate coverage was extended in this slice: `tsconfig.json` now includes `tests`
and `playwright.config.ts`, and `npm run lint` runs
`eslint src tests playwright.config.ts`, so the new TypeScript is actually read
by a gate. This caught `reducedMotion` being a browser-context option in
Playwright 1.62 rather than a top-level `use` option. Meaning for `src` is
unchanged.

## Removed concepts

- `scripts/reference-matrix/capture.mjs` and `matrix.mjs` — the CDP harness.
- The `capture:reference-matrix` npm script.
- The `SEEDED` id block, replaced by `tests/visual/fixtures.ts`.
- The throttled best-effort `loading` capture, replaced by a held-response frame.

## Unrelated working-tree changes preserved

None — the tree was clean at session start.

## Next ready task

**F12k** — make panel collection columns measured and the reflow animatable. Its
column decision is pinned to the 3-column cap (recorded in the roadmap), and it
now has this gate as its verifier: if the ownership collapse is truly
behaviour-preserving, `npm run test:visual` should pass unchanged.
