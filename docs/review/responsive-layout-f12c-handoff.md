# F12c handoff — retire the stray viewport breakpoints

Task completed: F12c — Fix: retire the stray viewport breakpoints

Invariant: No unpoliced viewport breakpoint exists in feature or shared CSS.
The only two raw width queries in `src/` — `AddSpotPanel.module.css`
(`max-width: 480px`) and `CarouselLightbox.module.css` (`max-width: 760px`) —
are retired, and no `.css` file outside the design-system owner can
reintroduce a `@media … width …` query.

Authority: `scripts/check-style-boundaries.mjs` rule
`no-viewport-width-breakpoints` owns the prohibition (all `src/**/*.css`,
excluding `isDesignSystemOwner` as the sanctioned owner for any future
CSS-side breakpoint projection — currently unused). The lightbox's responsive
styling is now owned by a container query on its own surface: `.inner`
(Mantine Modal's viewport-spanning fixed wrapper) declares
`container: lightbox / inline-size`, and the wide presentation is a
`@container lightbox (min-width: 760px)` enhancement over a compact base,
anticipating the min-width convention F12e will codify.

Changed files:
- `scripts/check-style-boundaries.mjs` (new rule)
- `src/shared/ui/CarouselLightbox/CarouselLightbox.module.css` (mobile-first
  container-query restructure; `.inner` padding lower bound 1.25rem → 1rem
  since a container cannot query itself — computed padding at the wide
  baseline widths 1280/1440/1920 is unchanged at 64/72/72px)
- `src/features/AddSpot/ui/AddSpotPanel.module.css` (sub-480px block deleted;
  the base `width: min(340px, calc(100vw - 24px))` remains the only sizing —
  the compact Add Spot presentation is owned by M05's bottom sheet)
- `src/shared/ui/CarouselLightbox/CarouselLightbox.test.tsx` (pre-existing
  CSS-declaration assertions on `.controlRail` updated to coverage-equivalent
  assertions on the new compact base + wide container override)
- `docs/roadmaps/responsive-layout-foundation.md` (F12c checkbox)

Focused verification: the new rule ran RED before migration with exactly the
two expected violations, then GREEN after. `grep -rn "@media" src
--include="*.css"` now shows only `prefers-reduced-motion` queries.
`CarouselLightbox.test.tsx` 10/10 green. Wide-band parity holds by
construction: the deleted queries applied only at ≤480px/≤760px viewports and
the padding clamp change only binds below 320px, so no wide-band (≥1280)
computed style changed; the F12b baseline needs no recapture.

Project gates: all five green at baseline before the change and after —
`npx tsc --noEmit`, `npx tsc -p tsconfig.server.json --noEmit`,
`npm run lint`, `npm run check:style-boundaries`,
`npx vitest run --project client --project server` (100 files / 492 tests).

Removed concepts: the two raw viewport breakpoints; the AddSpot compact
tweak (superseded, M05 owns the compact presentation); the lightbox's
desktop-first override cascade (replaced by compact base + min-width
container enhancement).

Design smell surfaced (pre-existing, not fixed): the
"shrink-wraps lightbox chrome" test in `CarouselLightbox.test.tsx` regex-reads
the raw CSS module and asserts declaration strings — the category the roadmap
forbids adding and that D00 removes elsewhere. This slice updated only the
assertions their CSS restructure invalidated; deleting the test outright needs
user approval and has no owning roadmap entry yet.

Unrelated working-tree changes preserved: yes — the tree was clean at session
start; every change traces to F12c.

Next ready task: F12d — Refactor: establish band-transition continuity at the
shell seam.
