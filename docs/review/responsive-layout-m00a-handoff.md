# M00a handoff — one live policy projection, metrics split from capabilities

Task completed: **M00a — Refactor: establish one live policy projection and split metrics
from capabilities**

## Invariant

The app has exactly one live semantic shell-policy projection, produced at the composition
root and read by every consumer through a zero-argument hook. An unmounted presentation
cannot become live implicitly, and a cell that is not yet implemented resolves to the
**complete** wide/regular lifecycle — never a field-level mix of target and fallback
policy. Raw pixel size cannot re-enter the capability channel: the capability type no
longer carries pixels, so TypeScript owns that.

## Authority

- `src/shared/model/appShellPresentation.tsx` — the activation matrix, the pure policy
  projection, the composition-root provider, and the consumer hook.
- `src/shared/model/viewportMetrics.ts` — continuous layout-viewport measurement. This is
  the module M05 extends with visual-viewport geometry; the doc comment records that it
  will be the only permitted reader of `window.visualViewport`.
- `src/shared/model/viewportCapabilities.ts` — discrete capability only (`sizeBand`,
  `heightBand`, `primaryPointer`, `supportsHover`, `prefersReducedMotion`).

## What changed, and why it was two coupled defects

**Nothing consumed the detector.** The capability adapter has owned band detection since
F02 and CSS has carried no viewport width query since F12c, but all three shell decision
points called `deriveDesktopFoundationAppShellLayoutPolicy`, which hardcoded wide/regular.
The app never asked what it was running on, and each of the three sites independently
derived route intent and read both expansion preferences — three copies of one fact.
`AppShell.tsx` went from 29 lines to 14 as a result of collapsing them: it now reads the
policy and renders, nothing else.

**The detector mixed two change rates on one channel.** `ViewportCapabilities` carried
`viewportWidthPx`/`viewportHeightPx`, so every pixel of a window drag produced a new
snapshot and re-rendered every consumer, including ones that only needed "compact or
wide". Those pixels are a continuous measurement consumed for geometry (drawer-adjacent
inset, sheet snap heights, map occlusion), not a capability.

## Activation matrix

`ACTIVE_CELLS` lists one cell per `sizeBand × heightBand × routeIntent`, currently the six
`wide × regular × *` cells. An inactive cell substitutes the **whole** band pair, never one
field. At `wide` the height band cannot affect the policy (presentation is `persistent`,
and the height adjustment only applies to `bottomSheet`), so every viewport — including
`wide × short` — resolves to exactly the policy rendered before this change.

**Navigation is not separately activatable** (decision 2026-07-27). The task as originally
written let navigation activate per capability cell while the drawer/map/chrome cells
stayed on the wide fallback. That is itself the field-level hybrid the matrix exists to
forbid: the mobile top bar would sit over the 25vw desktop panel — about 98px on a 390px
phone — a screen nobody designed. M01 and T00 were amended to build their navigation
presentations without activating anything; M02 and T01 activate navigation together with
the browse lifecycle. The matrix has no exception.

## Changed files

Created: `src/shared/model/viewportMetrics.ts` (+ test),
`src/shared/model/appShellPresentation.tsx` (+ test).

Modified: `src/shared/model/viewportCapabilities.ts` (+ test),
`src/shared/model/appShellLayoutPolicy.ts` (+ test), `src/app/routes/__root.tsx`,
`src/app/AppShell.tsx` (+ test), `src/app/routes/_panel.tsx` (+ `-_panel.test.tsx`),
`src/views/GlobeScene/GlobeScene.tsx` (+ test),
`src/shared/ui/DrawerShell/DrawerShell.tsx`, `src/shared/ui/DrawerShell/geometry.ts`,
`scripts/check-style-boundaries.mjs`.

## Focused verification

- Exhaustive matrix test: all 36 `sizeBand × heightBand × routeIntent` combinations. Each
  asserts against `isCellActive` rather than a hard-coded list, so the test keeps its
  meaning as Phase M and T add cells. This owns the no-hybrid invariant — an inactive
  cell's policy equals the complete wide policy field for field.
- Split behavior: a resize from 1280→1300 returns the **identical** capability snapshot
  reference while the metrics channel reports the new width; 1280→900 returns a new
  capability snapshot with `sizeBand: 'constrained'`.
- `useAppShellLayoutPolicy` outside a provider throws — a missing provider is a wiring
  bug, not a runtime state.
- Import scans: no surviving reference to the removed size channel; the pure policy is
  reached only from the provider (plus the policy's own test and
  `SidePanel.bandTransition.test.tsx`, which passes policy as props and is not a context
  consumer).
- **Both new static rules were verified non-vacuous** by throwaway files that trip them,
  and the earlier seam rule likewise. Rules confirmed firing:
  `activation-matrix-vocabulary-is-confined-to-the-policy-provider`,
  `app-shell-policy-provider-is-mounted-at-the-composition-root`,
  `app-shell-policy-is-reached-through-the-presentation-seam`. Also extended:
  `viewport-capabilities-have-one-owner` now permits `viewportMetrics.ts`, and
  `app-shell-layout-policy-has-one-owner` now bans the deleted desktop-foundation wrapper.

## Project gates

All five green, re-run independently of the implementing agent: `tsc --noEmit`,
`tsc -p tsconfig.server.json --noEmit`, `lint`, `check:style-boundaries`, and
`vitest run --project client --project server` (111 files, 629 tests — up from 594).

Not run: `npm run test:visual`. This slice makes no visual change at any width, and the
suite is held for the tasks that do.

## Removed concepts

`deriveDesktopFoundationAppShellLayoutPolicy` (the hardcoded wide wrapper, and its three
call sites); `ViewportSizePx` / `indeterminateViewportSizePx` /
`getViewportSizePxSnapshot` / `useViewportSizePx` (an intermediate shape from the first
pass of this task, superseded by the named metrics module); the pixel fields on
`ViewportCapabilities`.

## Note for M05

`viewportMetrics.ts` is deliberately the extension point. When the software keyboard opens
the layout viewport and the visual viewport diverge, which is why the fields are named
`layoutViewportWidthPx`/`layoutViewportHeightPx` rather than plain width/height — the
shorter names could not carry both meanings.

## Unrelated working-tree changes preserved

Yes. `src/features/PublicGallery/PublicGallery.tsx` and
`src/shared/ui/DrawerShell/panelSettledWidth.ts` carry user-owned in-progress work (the
photo grid tracking the panel's live width) and were excluded from this commit.

## Next ready task

**M00b — Generalize measured drawer occlusion into map camera insets.** It blocks M02 and
does not depend on M01.
