# Responsive layout F12f handoff

Completed 2026-07-24.

Task completed: F12f — Build the measured virtual-gallery adapter.

Invariant: The public gallery's column count is derived from the gallery's
**measured** rendered width, and row chunking and rendered columns cannot
disagree because both read one value. No viewport or mirrored panel-width
arithmetic decides gallery columns anymore.

Authority:
- `src/shared/lib/galleryColumns.ts` owns the pure column policy —
  `galleryColumns(measuredWidthPx, density)`, band-agnostic (count falls out of
  width ÷ target tile), clamped to `GALLERY_MIN_COLUMNS`(1)–`GALLERY_MAX_COLUMNS`(6).
- `src/shared/hooks/useMeasuredWidth.ts` owns the measured-width adapter (a
  ResizeObserver hook returning the element's content-box width; 0 pre-measurement).
- `src/features/PublicGallery/PublicGallery.tsx` composes the two into a single
  `columns` value that feeds both `buildGalleryRows` (chunking) and `VirtualGallery`
  (rendering).

What this task did:

1. **Pure column policy.** New `galleryColumns.ts`: `Math.round(width / targetTile)`
   clamped to [1, 6], with target tiles 120px (`compact`) / 340px (`comfortable`) —
   the two constants preserved from the deleted hook. Band-agnostic by construction,
   so Phase M consumes it unchanged with no per-band table to pin (this sidesteps the
   still-open tablet/mobile column decisions recorded under F12k/F12l). Density uses
   the `'compact' | 'comfortable'` vocabulary to match the drawer policy's
   `contentDensity`. Floor lowered from the old hook's 2 to 1 per the task scope
   ("one column at compact widths"); at the current wide-only mounted panel widths
   this does not change the rendered count (a ~320px compact panel still yields ~3).

2. **Measured-width adapter.** New `useMeasuredWidth(ref)`: ResizeObserver plus one
   synchronous `getBoundingClientRect` measurement in `useLayoutEffect` so the first
   painted frame already has the measured width; rounds and bails on unchanged to
   avoid a render loop. Exported from `src/shared/hooks/index.ts`.

3. **PublicGallery wiring.** Replaced `usePanelGalleryColumns(expanded)` with the
   composed `galleryColumns(useMeasuredWidth(ref), density)`. Added a measuring
   wrapper `<div>` around `VirtualGallery` only (not the date sidebar), so the
   measured width is the true gallery slot. The loading skeleton renders before that
   wrapper exists, so its grid uses a neutral `LOADING_SKELETON_COLUMNS = 3` (its
   `--wa-panel-grid-gap` spacing prop is preserved for the style-boundary rule).

Focused verification:
- `galleryColumns.test.ts` — 7 pure-policy cases (floor at/below 0, sub-tile clamp
  to 1, mid-width per density, clamp to 6, compact ≥ comfortable at equal width).
- `useMeasuredWidth.test.tsx` — adapter unit (synchronous mount measurement + resize
  update via a stubbed ResizeObserver) and the resize→rechunk integration test: 7
  same-day items go from 1 column (7 rows) to 3 columns (3/3/1) on a measured-width
  change, with no item dropped or duplicated. This is the roadmap's named verifier.

Project gates (all green, re-run independently after the coder):
- `npx tsc --noEmit` — pass
- `npx tsc -p tsconfig.server.json --noEmit` — pass
- `npm run lint` — pass
- `npm run check:style-boundaries` — pass
- `npx vitest run --project client --project server` — 509 passed (103 files)

Removed concepts: `src/features/PublicGallery/model/usePanelGalleryColumns.ts`
deleted — its viewport × `PANEL_WIDTH_VW` fraction arithmetic, `PANEL_PADDING`/
`SIDEBAR_ALLOWANCE` fudge terms, and `MIN_COLUMNS = 2` floor are all gone. The
measured width makes the padding/sidebar allowances unnecessary.

Unrelated working-tree changes preserved: none — the tree was clean at the start
of this slice.

Next ready task: F12g (Make date navigation container-aware) is now unblocked
(depended on F12f). F12h, F12i, and F12l are also eligible; F12h and F12i are
noted as main-session/browser-verified work.
