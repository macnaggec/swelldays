# M02-a handoff — the compact-regular browse bottom sheet is live

Task completed: **M02-a — Implement the compact-regular browse bottom sheet** (first half of
the M02 split recorded in the roadmap on 2026-07-28)

## Invariant

On a phone held upright, browse is a bottom sheet over a live map with three resting
positions, and the user's browse-extent preference survives a band crossing in both
directions. Sheet position is rendered state seeded from the preference — never a second
copy of it — and landing on a snap is the only path that writes the preference back.

## Authority

- `src/shared/model/panelExpansionStore.ts` — still the sole preference authority
  (`browsingExpanded`, unchanged shape).
- `src/app/routes/_panel.tsx` — owns sheet position as rendered state, beside the existing
  rendered panel expansion state.
- `src/shared/ui/DrawerShell/` — unchanged; it already owned snaps, drag, scroll-promotion
  and safe areas from M00.

## This is the first task that changes what is on screen

Only at compact widths with a regular height — a phone held upright. Wide and constrained
widths are untouched: the single cell added to the activation matrix is
`compact × regular × browse`, and every other cell still resolves to the complete wide
lifecycle.

## What changed

- `SidePanel` accepts the sheet: `drawerPresentation` widens to the full presentation union
  and two sheet props (`sheetSnap`, `onSheetSnapChange`) are threaded to `DrawerShell`'s
  sheet branch. The `DrawerShellPanelPresentation` narrowing that M00 used to make "not
  mounted yet" a compile-time fact is retired. The expand/collapse button is not rendered
  in a sheet — dragging the handle is the control — while a back control still renders in
  every presentation.
- The panel content tree is shared between both branches as one element, so a band crossing
  is still a prop change rather than a different element tree (F12d).
- `_panel.tsx` owns `sheetSnap`, seeded from `browsingExpanded` (`full` when expanded,
  otherwise `half`) and **re-seeded at the moment the surface becomes a sheet**. Landing on
  `full` sets the preference to expanded; `peek` and `half` both clear it.
- In-sheet chrome follows the snap rather than the wide-band expansion state: the value
  handed to the panel, the expansion context, and the search toolbar is `snap !== 'peek'`.
  That is what places the filter pills with the search row at `half` and `full`, and keeps
  `peek` down to the search row and the upload button. The floating adjacent pills are
  already gated on `panelControls === 'adjacent'`, which is false at compact, so they do
  not appear.

## Two defects found in architect review, fixed with failing-first coverage

Both were in the route, and both were invisible to the widget-level tests because those
mirror the route's wiring rather than mount it.

1. **Choosing a spot from search did nothing on a phone.** The spot-search select handler
   was still gated on the wide-band expansion value, which is always false at compact
   (its derivation waits on feed layout, which the policy grants to wide browse only). It
   now uses the same snap-derived value as the rest of the in-sheet chrome.
2. **The sheet did not re-read the preference at the crossing.** Seeding only at mount
   meant narrowing an expanded desktop window opened the sheet at `half`, discarding the
   preference the F12d contract exists to carry across the crossing.

Both fixes are covered at the **real panel route** (`src/app/routes/-_panel.test.tsx`, which
mounts `PanelFrame` through the real policy provider with a mutable capability band), and
both new tests were verified to fail against the unfixed code.

## Changed files

- `src/shared/model/appShellPresentation.tsx` + its test — one cell activated
- `src/widgets/SidePanel/SidePanel.tsx`
- `src/widgets/SidePanel/SidePanel.sheet.test.tsx` (new)
- `src/widgets/SidePanel/SidePanel.bandTransition.test.tsx`
- `src/app/routes/_panel.tsx`
- `src/app/routes/-_panel.test.tsx`

## Project gates

All five green: `tsc --noEmit`, `tsc -p tsconfig.server.json --noEmit`, `npm run lint`,
`npm run check:style-boundaries`, `vitest run --project client --project server`
(112 files, 656 tests).

## Verification the code cannot own

Appearance was not verified: `AGENTS.md` §6 forbids browser verification here, so the
sheet's proportions, the peek height, and the map strip above it need the user's eyes. The
checklist handed over with this slice covers: the sheet's three resting positions, what is
visible at `peek`, dragging and flicking between snaps, scrolling the list to promote it,
selecting a spot from search, the filter pills appearing above `peek`, and resizing a
desktop window down and back up with the panel expanded.

## Known residuals

- `SHEET_PEEK_HEIGHT_PX` is still the 132px constant M00 left. It was chosen to match the
  handle, header row and search row, but it has never been measured against the real
  content. If `peek` clips or leaves a gap, that is this one number.
- `src/widgets/SidePanel/SidePanel.bandTransition.test.tsx` verifies the sheet wiring
  through a harness that mirrors the route's mapping. It is the file's existing pattern,
  but a mirror cannot catch a defect in the thing it mirrors — which is precisely how both
  defects above survived. The route-level tests added in this slice are the stronger
  verifier; prefer them for future cell activations.

## Unrelated working-tree changes preserved

Yes — the user's in-progress changes to `src/features/PublicGallery/PublicGallery.tsx` and
`src/shared/ui/DrawerShell/panelSettledWidth.ts` were not touched and are not in this
commit.

## Next ready task

**M02-b — Implement the short-height browse presentation** (landscape phones). It needs a
design decision first: `sideOverlay` has no styling of its own today and falls through to
the wide panel's 25/75vw widths.
