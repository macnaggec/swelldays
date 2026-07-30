# Responsive layout M03-a handoff

Task completed: M03-a — Restore one DrawerShell geometry projection

Invariant: The map cannot construct a second bottom-sheet target rectangle. One
DrawerShell-owned projection now supplies rendered and destination bounds for
persistent panels, side overlays, and bottom sheets, so selected spots retarget
against the surface destination during snap/open/close motion.

Authority: `src/shared/ui/DrawerShell/geometry.ts` owns the read-only geometry
channels, and `src/shared/ui/DrawerShell/DrawerShell.tsx` is their sole runtime
publisher. `GlobeScene` translates those bounds into camera insets without learning
sheet snaps or drawer formulas.

Changed files: The reconciled M03-a slice contains the app panel-route and root
composition, DrawerShell/browse-surface/geometry, PanelLayout's peek-snap projection
and panel chrome, PanelRouteLayout's standalone Map toolbar, GlobeScene/map-inset
projection, GlobeMap camera retargeting, AppNavigation, BrowseSectionBar, SidePanel,
their focused tests/styles, and the matching style-boundary rules. The active and
architecture roadmaps record completion.

Focused verification: The ownership rule was RED on four GlobeScene sheet-geometry
references before the runtime correction. The drawer/globe behavior test was RED
because the camera used the prior measured 287px sheet inset instead of the 84px
destination. After implementation, six focused test files passed (132 tests).
`npm run check:style-boundaries` passed; the GlobeScene snap-geometry negative scan
returned no matches; the publisher scan found publishers only in
`DrawerShell.tsx` and `geometry.ts`.

Project gates: `npx tsc --noEmit` passed; `npx tsc -p tsconfig.server.json --noEmit`
passed; `npm run lint` passed; `npm run check:style-boundaries` passed;
`npx vitest run --project client --project server` passed in the reconciled working
tree (114 files, 700 tests) and in the isolated M03-a staged tree (114 files, 688
tests).

Removed concepts: GlobeScene's bottom-sheet rectangle reconstructed from sheet snap
and viewport metrics; the separate `BrowseSheetPosition` seam; route-local
short-side-panel visibility; gallery-preserving marker selection. The browse surface
now owns Map/results composition while DrawerShell owns all surface geometry.

Unrelated working-tree changes preserved: Yes. M03-b's CSS-text/source-verifier
hunks, M03-c's pagination work, M03-d's calendar index/direct-location work, M03-e's
invalidation work, M03-f's date-control work, and M03-g's lightbox/large-text work
remain unstaged and unmodified except where a shared file required hunk-level
separation.

Next ready task: M03-b — Correct verification ownership in the current responsive
slice.
