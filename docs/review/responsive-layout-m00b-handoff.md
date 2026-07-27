# M00b handoff — measured drawer occlusion generalized into map camera insets

Task completed: **M00b — Generalize measured drawer occlusion into map camera insets**

## Invariant

The map camera reserves **four-sided** insets (`top`, `right`, `bottom`, `left`) derived
behind one projection from the measured drawer bounds, the continuous viewport metrics,
and the policy-owned drawer presentation. A selected spot can therefore center in the
actually visible map rectangle for an inline-end panel *and* for a block-end sheet.
Neither `GlobeScene` nor `GlobeMap` infers where the drawer sits: the view forwards the
semantic presentation value, the widget receives already-resolved pixels per edge.

## Authority

- `src/views/GlobeScene/model/mapCameraInsets.ts` — the edge arithmetic (which edge a
  presentation occludes, and the clipped overlap with the viewport on that axis).
- `src/widgets/GlobeMap/model/mapCameraInsets.ts` — the `MapCameraInsets` contract type
  and its zero value, following the established split where the widget owns the prop type
  and the view owns the derivation (as with `GlobeMotionPolicy`).

## What changed

`deriveDrawerViewportOcclusionPx` returned a single right-edge number, which models a
panel beside the map and nothing else. It is deleted. `deriveMapCameraInsets` replaces it
with a presentation-keyed decision:

- `persistent` / `sideOverlay` → the clipped horizontal overlap becomes the `right` inset;
- `bottomSheet` → the clipped vertical overlap becomes the `bottom` inset;
- `fullScreen` / `hidden` → no insets, since the map is either fully covered or the drawer
  is not rendered and there is no visible rectangle to center within;
- no measured bounds yet → no insets.

`GlobeMap` composes the insets with its existing selected-spot preview offset: the
preview's 300px is added onto whatever `top` inset arrives, and all four sides are now
passed explicitly to `flyTo`/`easeTo`/`setPadding` (Mapbox merges a partial padding object
with the transform's current padding, so naming every side is the honest form). The insets
prop is destructured into four number primitives on entry, so a fresh object per parent
render cannot restart a camera flight — geometry changes still reach the camera only
through `setPadding`.

`top` and `left` are always `0` today. They exist because Mapbox padding is four-sided and
the preview offset composes onto `top`; no derivation logic was added for them.

## Changed files

- Created: `src/widgets/GlobeMap/model/mapCameraInsets.ts`,
  `src/views/GlobeScene/model/mapCameraInsets.ts`,
  `src/views/GlobeScene/model/mapCameraInsets.test.ts`
- Modified: `src/widgets/GlobeMap/index.ts`, `src/widgets/GlobeMap/GlobeMapComponent.tsx`,
  `src/widgets/GlobeMap/GlobeMapComponent.test.tsx`, `src/views/GlobeScene/GlobeScene.tsx`,
  `src/views/GlobeScene/GlobeScene.test.tsx`, `scripts/check-style-boundaries.mjs`
- Deleted: `src/views/GlobeScene/model/drawerViewportOcclusion.ts` and its test

## Focused verification

- `src/views/GlobeScene/model/mapCameraInsets.test.ts` (6 cases) owns the edge arithmetic:
  no bounds, `persistent` and `sideOverlay` clipping to the right inset, `bottomSheet`
  clipping to the bottom inset, and `fullScreen`/`hidden` yielding nothing despite present
  bounds. Confirmed RED before the module existed.
- `GlobeMapComponent.test.tsx` owns the composition and the no-restarted-flight behavior,
  with two new cases: a bottom inset composes into `padding.bottom` on focus, and a
  changing bottom inset updates padding via `setPadding` while `easeTo`/`flyTo` are not
  called.
- `GlobeScene.test.tsx` owns the wide-band seam: measured bounds `left: 1200 … right: 2000`
  at a 2000px viewport still produce a right inset of `800` and a bottom inset of `0`.
- Static rule `no-legacy-right-edge-map-occlusion` (new, same change) bans
  `rightOccludedPx`, `sidebarOccludedPx`, `deriveDrawerViewportOcclusionPx`, and
  `drawerViewportOcclusion` across all TS/TSX including tests. Verified by probe: a file
  naming `rightOccludedPx` fails `check:style-boundaries` with that rule's message. The
  former `globe-occlusion-uses-measured-drawer` rule is renamed
  `globe-camera-insets-use-measured-drawer` and now points at the new projection file.

## Project gates

All five green after the change: `tsc --noEmit`, `tsc -p tsconfig.server.json --noEmit`,
`npm run lint`, `npm run check:style-boundaries`, `vitest run --project client --project
server` (111 files, 635 tests). The baseline was verified green before implementation.

## Removed concepts

`deriveDrawerViewportOcclusionPx`, `DrawerViewportOcclusionInput`, the `rightOccludedPx`
prop, and the right-edge-only occlusion vocabulary — now statically banned.

## Note for M02

Composed vertical padding is deliberately **not** clamped. At the sheet's `full` snap the
bottom inset is ~90% of the viewport height, and adding the 300px preview offset on top
can exceed the canvas. That is a real case only once M02 mounts the sheet with a selected
spot and a popup, so the behavior belongs to that slice rather than to speculative
defensive code here.

## Unrelated working-tree changes preserved

Yes — the user's in-progress changes to `src/features/PublicGallery/PublicGallery.tsx` and
`src/shared/ui/DrawerShell/panelSettledWidth.ts` (live panel width for the photo grid) were
not touched and are not part of this commit.

## Next ready task

**M01 — Implement mobile navigation** (build only; activates no cell).
