# F12d handoff — establish band-transition continuity at the shell seam

Task completed: F12d — Refactor: establish band-transition continuity at the
shell seam

Invariant: Crossing a viewport capability band cannot discard user state. The
route's mounted subtree, in-progress drafts held in component state, the
focused element, the panel scroll position, and the session expansion
preferences all survive a drawer presentation swap. Because only the wide-band
presentation is mounted, the contract is exercised with simulated capability
changes: the owning tests derive real policy outputs for different bands and
swap them at the shell seam. M07, T05, and D03 must re-verify with real
rotation and resize per the roadmap.

Authority:
- `src/shared/ui/DrawerShell/DrawerShell.tsx` owns surface/subtree identity
  and focus continuity across every non-hidden presentation/state/modality
  change (contract documented on the component; presentation changes are
  attribute/animation changes only, never a different element tree).
- `src/shared/model/appShellLayoutPolicy.ts` owns policy-layer continuity:
  band is a pure input, derivation is deterministic, and preferences are
  never written by derivation.

Changed files:
- `src/shared/ui/DrawerShell/DrawerShell.tsx` — focus-continuity mechanism:
  the unmount focus-restore effect now runs once per mount (immune to
  `restoreFocusRef` identity changes mid-life, which previously fired the
  cleanup and yanked focus while the drawer was still mounted) and reclaims
  focus only when the drawer actually held it (focus orphaned to `body` by
  the surface's removal); focus resting on another live control is never
  stolen.
- `src/shared/ui/DrawerShell/DrawerShell.test.tsx` — two behavioral
  focus-continuity tests (both RED against the previous implementation,
  verified by stashing the fix).
- `src/widgets/SidePanel/SidePanel.bandTransition.test.tsx` (new) — the
  shell-seam integration test: wide↔constrained routeWorkspace crossing
  (persistent→sideOverlay, nonmodal→modal) preserves surface element identity
  (same node re-labelled complementary→dialog), scroller identity and
  scrollTop, draft input focus and value, and the expansion-preference store;
  wide↔constrained browse crossing honors the expansion preference in both
  bands and leaves the store untouched. Props are mapped from real
  `deriveAppShellLayoutPolicy` outputs exactly as `_panel.tsx` maps them.
- `src/shared/model/appShellLayoutPolicy.test.ts` — band-crossing continuity
  units: re-deriving after crossing wide→constrained→compact→wide returns a
  deep-equal policy for every route intent and preference combo, and
  derivation never mutates a frozen preferences input.

Focused verification: `npx vitest run --project client
src/shared/ui/DrawerShell/DrawerShell.test.tsx
src/widgets/SidePanel/SidePanel.bandTransition.test.tsx
src/widgets/SidePanel/SidePanel.test.tsx
src/shared/model/appShellLayoutPolicy.test.ts` — green (4 files, 43 tests).
RED evidence: both new DrawerShell focus tests failed against the unpatched
implementation (focus was stolen by the restore target in both scenarios);
the pre-existing `SidePanel` focus-restore test stayed green throughout, so
legitimate restoration (focus inside the drawer at unmount) is unchanged.

Project gates: all five green — `npx tsc --noEmit`,
`npx tsc -p tsconfig.server.json --noEmit`, `npm run lint`,
`npm run check:style-boundaries`,
`npx vitest run --project client --project server` (101 files / 498 tests;
baseline was 100 / 492).

Removed concepts: the unconditional unmount focus-restore (which stole focus
from live controls outside the drawer) and the `restoreFocusRef`-keyed effect
lifecycle (which fired restoration on prop identity change while mounted).

Scope notes: compact-band drawer states (`collapsed`/`full`) and bottom-sheet
mechanics remain out of scope — M00 owns extending `DrawerShellState` and the
sheet gesture contract. No live wiring of `useViewportCapabilities` into the
mount sites; the app stays pinned to the wide band until F12e/M00.

Unrelated working-tree changes preserved: yes — the tree was clean at session
start; every change traces to F12d.

Next ready task: F12e — Refactor: make compact the base band.
