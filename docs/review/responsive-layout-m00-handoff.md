# M00 — Add compact bottom-sheet mechanics

```text
Task completed: M00 — Add compact bottom-sheet mechanics
Invariant: DrawerShell is the sole owner of bottom-sheet mechanics — the set of resting
  snap positions, the height each resolves to, which snap a released drag lands on, and
  the coupling between list scrolling and snap promotion. No route, feature, or
  stylesheet can express sheet snap geometry.
Authority: src/shared/ui/DrawerShell/sheetSnapPolicy.ts (pure snap policy) and
  src/shared/ui/DrawerShell/DrawerShell.tsx (the surface that realises it).
Changed files:
  src/shared/ui/DrawerShell/sheetSnapPolicy.ts (new)
  src/shared/ui/DrawerShell/sheetSnapPolicy.test.ts (new)
  src/shared/ui/DrawerShell/sheetScrollCoupling.ts (new)
  src/shared/ui/DrawerShell/DrawerShell.tsx
  src/shared/ui/DrawerShell/DrawerShell.module.css
  src/shared/ui/DrawerShell/DrawerShell.test.tsx
  src/shared/ui/DrawerShell/index.ts
  src/shared/model/viewportCapabilities.ts
  src/shared/model/viewportCapabilities.test.ts
  src/shared/ui/PanelLayout/PanelLayout.tsx
  src/widgets/SidePanel/SidePanel.tsx
  src/widgets/SidePanel/SidePanel.bandTransition.test.tsx
  src/app/routes/_panel.tsx
  scripts/check-style-boundaries.mjs
Focused verification:
  sheetSnapPolicy.test.ts — 16 tests, RED confirmed first (module unresolved).
  DrawerShell.test.tsx — 9 tests (3 pre-existing + 6 new).
  viewportCapabilities.test.ts — 8 tests. PanelLayout.test.tsx — 9 tests, unchanged.
  New style rule proven to bite: `[data-drawer-snap="full"] {}` added to
  SidePanel.module.css was reported as drawer-shell-owns-sheet-snap-geometry, then
  removed and the check passed again.
Project gates: all five green (109 test files, 591 tests).
Removed concepts: none — this slice is purely additive. Nothing superseded yet; the
  duplicate authorities this phase will retire (D01) are still in use by the wide band.
Unrelated working-tree changes preserved: none existed; the tree was clean at start.
Next ready task: M01 — Implement compact navigation.
```

## This slice changes nothing on screen

Mechanics only, by the user's decision on 2026-07-27. No call site mounts the
`bottomSheet` presentation; all three still use
`deriveDesktopFoundationAppShellLayoutPolicy`, which always returns `persistent`. The
absence of a mount is a compile-time fact rather than a comment: `SidePanel`'s
`drawerPresentation` is narrowed to `DrawerShellPanelPresentation`, and the guard in
`src/app/routes/_panel.tsx` excludes `bottomSheet` alongside `hidden`. M02 deletes both
narrowings when it supplies the snap props.

## Design pinned by the user (2026-07-27)

The compact browse surface is the Google Maps pattern: the map fills the screen and the
session list rides over it as one continuous surface, at three resting positions.

| Snap   | Sheet height                | Map visible | Reached by |
|--------|-----------------------------|-------------|------------|
| `peek` | its own content (search row + upload control) | ~85% | the start state; dragging down from `half` |
| `half` | 34% of the dynamic viewport | ~66% | selecting a spot; dragging from either neighbour |
| `full` | 90% of the dynamic viewport | ~10% | scrolling the list down while below `full`; dragging up |

The start screen's search bar and upload button **are** the sheet at `peek`, not separate
floating controls — which is why the surface never appears from nowhere. Returning
downward: dragging the handle, flicking down, or pulling down while the list is already
scrolled to its top.

`peek` is the one snap sized by its own content rather than the viewport, so it is a
constant (`SHEET_PEEK_HEIGHT_PX`) until M02 mounts the search row and can measure it.
That seam is deliberate; the mechanism is one number.

## Two defects found in review and fixed here

**The presentation swap rebuilt the panel subtree.** The sheet branch originally wrapped
`children` in an extra `SheetScrollOwnerContext.Provider` while the panel branch did not.
That changes the element type at that position, so React unmounted and rebuilt the entire
panel on a compact↔wide crossing — discarding the half-typed draft, the focus, and the
scroll position that F12d exists to preserve. Both providers now mount in every
presentation; outside a sheet the registration is inert because the arbitration effect
returns early with no snap. The continuity test asserted only the surface `<aside>`'s
identity, which never changes, and used a plain text child — so it could not see this. It
now mounts a stateful field, types into it, focuses it, and asserts the DOM node, the
value, and `document.activeElement` all survive the swap. Verified it fails against the
old code.

**Four exports the gate forbids anyone to use.** The contract exported
`resolveSheetSnapHeights`, `nearestSheetSnap`, `SHEET_SNAP_FRACTIONS` and
`SHEET_PEEK_HEIGHT_PX` from the barrel while the new static rule bans every module
outside the folder from naming them. Only the snap *vocabulary* (`type SheetSnap`) is
public now; the heights, fractions, and landing decision stay internal, matching the
rule.

## Carried forward

- **Vertical map occlusion is unowned — M02 must resolve it.**
  `deriveDrawerViewportOcclusionPx` takes only `left`/`right`, so it describes a panel
  beside the map, not a sheet below it. The moment the sheet mounts, a selected surf spot
  will keep centring underneath it instead of in the strip of map still showing — which
  is precisely the "spot marker centers on the rest of map area" behaviour the user
  specified. The measured bounds already carry `top`/`bottom`; only the projection is
  horizontal. Out of scope here because nothing mounts the sheet yet.
- **The drag handle is unstyled and keyboard-inaccessible.** It is a bare 24px strip with
  no visible grip and no keyboard path to change snaps. Acceptable while unmounted; M02
  owns giving it an affordance and a non-pointer route between snaps.
- **`tsconfig.server.json` compiles `src/shared/**` but does not include `vitest.d.ts`**,
  so jest-dom matchers are untyped in any test under `src/shared` and break gate 2 —
  while the identical matcher passes in `src/widgets`. Worked around here with a plain
  property assertion. Pre-existing and unrelated to this task; worth an issue, since the
  next person to reach for `toHaveValue` in a shared test will hit it too.
- **Drag feel is unverified and cannot be verified headlessly.** The landing decision is
  a pure function with unit coverage, and the scroll coupling has an integration test,
  but snap timing, elasticity, and scroll-versus-drag arbitration under a real finger are
  judged in M02 when the sheet is first mounted and the user can touch it.
