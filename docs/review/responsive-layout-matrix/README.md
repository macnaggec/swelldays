# Responsive-layout reference matrix — visual-regression gate (F12b → F12h)

The reference matrix is an automated Playwright snapshot suite. A re-run answers
"did any captured layout state change?" deterministically and at no review cost
when nothing changed, instead of a human or agent comparing screenshots by eye.
Roadmap tasks M07, T05, D00, and D03 consume `npm run test:visual` as their
execution vehicle.

**Status: the harness is in place; baselines have not been captured yet.** Until
a session runs `--update-snapshots` and commits the result, the suite has nothing
to compare against, and roadmap task F12h stays open. The superseded CDP harness
in `scripts/reference-matrix/` is therefore still present and still runnable —
it is deleted in the same slice that commits the first baselines, so the repo is
never left with no working visual verification at all.

## Running it

```bash
npm run capture:db:up && npm run capture:seed && npm run test:visual
```

First-time setup:

1. `cp .env.capture.example .env.capture` and fill in `VITE_MAPBOX_ACCESS_TOKEN`
   with a real token — `GlobeMapComponent` throws without one. Everything else
   in the file works as shipped.
2. `npx playwright install chromium` (Chromium only; no other browser is used).
3. `npm run capture:db:up` starts the capture database.
4. `npm run capture:seed` resets its schema and writes the capture records.

The capture database uses tmpfs, so stopping it discards the data: re-run
`capture:seed` after every `capture:db:up`.

Updating baselines is always explicit:

```bash
npm run test:visual -- --update-snapshots
```

Review the image diff before committing. A baseline change is a claim that the
layout *should* look different now — if you cannot say which change caused it,
do not commit it.

## Why this is not one of the five gates

The five project gates are hermetic and fast. This suite needs a dev server, a
browser, and a seeded database, so it runs as its own command. vitest keeps
owning unit and integration tests; folding this in would make gate 5
non-hermetic.

## Axes

The viewport axis is the Playwright project list in `playwright.config.ts`, one
project per captured viewport. It is mobile-first (roadmap F12b): wide is the
desktop-parity baseline, and the compact and constrained projects activate as
Phases M and T mount their presentations — enabling a band adds projects rather
than editing recipes.

| Band | Viewports | Status |
|---|---|---|
| compact | 390×844, 844×390, 430×932, 932×430 | pending Phase M |
| constrained | 768×1024, 1024×768 | pending Phase T |
| wide | 1280×800, 1440×900, 1920×1080 | projects active, baselines pending |

The state axis lives in `tests/visual/matrix.spec.ts`. Each test is one state's
reproduction recipe — the executable form of the F00 README "Reproduction"
column. The 14 states cover browse compact/expanded, gallery compact/expanded,
session detail, cart, account, collections, earnings, upload/map-input, loading,
empty, error, and dialog.

Baselines are stored at `tests/visual/__screenshots__/<project>/<state>.png` —
deliberately outside `docs/`, which is gitignored, so they commit normally. The
historical F12b JPEG artifacts under this directory needed `git add -f`; that
convention does not carry forward. One baseline store, not two.

## What makes a diff trustworthy

A visual gate is only worth having if a diff means the layout changed. Four
sources of noise are removed at their source rather than absorbed by a
tolerance:

- **Capture data.** Records come from a dedicated seeded database
  (`tests/visual/seed.ts`), never the dev database. Baselines captured against
  data you edit while working would rot on their own and report regressions that
  never happened.
- **Timestamps.** Every seeded date is fixed and in the past, so nothing
  re-renders differently tomorrow, and no seeded session ever matches the
  "Today" filter that the `empty-today` state depends on.
- **The map.** The Mapbox canvas is masked in every screenshot. The camera
  flight lands differently between runs; the matrix owns drawer and panel
  layout, not map framing.
- **Images.** Cloudinary requests are fulfilled locally with a placeholder
  carrying the same intrinsic dimensions as the seeded rows, so the suite never
  depends on an external host and every tile occupies the real asset's box.

`maxDiffPixelRatio` is 0. If local font rendering proves noisy, loosen it
deliberately and record why — never silently.

The `loading` state holds its API responses open until after the capture rather
than racing a throttled network, so it is a stable frame instead of whichever
frame the throttle happened to land on. This replaces the CDP harness's
best-effort throttled capture, which was explicitly not pixel-stable and could
not have been asserted against.

## Known wide-band defects excluded from parity

The F00 defect record carries over: the expanded browse/gallery toolbars
overflow at 1280×800 and clip at 1440×900. D00 owns the fix; these captures
document the defect, they do not approve it. Capture the first baselines with
the defect present, so D00's fix shows up as the deliberate diff it is.

User-reported refinement (2026-07-23): the overflowing browse (feed) pills
have no scroll affordance and are **unreachable**; the gallery toolbar
overflows identically but scrolls horizontally, so its pills stay reachable.
Screenshots cannot show this difference — D00 must verify reachability on
both surfaces, not just containment. Tracked in
`.scratch/responsive-layout-foundation/issues/01-expanded-toolbar-pills-unreachable.md`.

## Related

- `../responsive-layout-reference/` — the manual F00 captures, kept as the
  historical desktop reference.
- `docs/roadmaps/responsive-layout-foundation.md` — F12b (scripted matrix) and
  F12h (this gate).
