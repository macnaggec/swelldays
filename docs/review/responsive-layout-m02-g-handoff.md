# Responsive layout M02-g handoff

Task completed: M02-g — Fix: couple the portrait account/cart plate to live sheet motion

Invariant: While the portrait bottom sheet is being dragged, the account/cart
plate follows the sheet's live rendered top edge continuously and fades to
fully invisible/inert before the sheet visually reaches it, instead of jumping
only when the drag ends. Resting `peek`/`half`/`full` semantics are unchanged
(verified: the continuous opacity formula reproduces today's binary
visible/hidden behavior exactly at each resting height).

Authority: `src/shared/ui/DrawerShell/geometry.ts` gains a second publish
channel (`publishDrawerDragging`/`useDrawerDragging`) alongside its existing
rendered-geometry channel; `DrawerShell.tsx` remains the sole publisher of
both. `src/shared/ui/DrawerShell/useBrowseSheetNavigationPlacement.ts`
(replacing `useSheetSnapTopPx.ts`) is the one DrawerShell-owned projection that
turns live-or-resting geometry into `{ topPx, opacity, hidden, live }`.
`AppNavigation` only applies that struct to the DOM; it computes no snap-height
formula or drag progress itself.

Changed files: `sheetSnapPolicy.ts`/`.test.ts` (new pure
`resolveBrowseSheetNavigationOpacity`), `geometry.ts` (new dragging channel),
`DrawerShell.tsx`/`.test.tsx` (publish geometry on every drag frame, clear the
flag on release/unmount, new live-drag test), `useSheetSnapTopPx.ts` deleted
and replaced by `useBrowseSheetNavigationPlacement.ts`, `index.ts` (export
swap), `AppNavigation.tsx`/`.module.css`/`.test.tsx` (consume the new hook;
continuous CSS-var-driven opacity replaces the discrete full-snap block;
transition suppressed while live-tracking a drag), and the five corresponding
`check-style-boundaries.mjs` entries (two new required-runtime checks on
`DrawerShell.tsx`, renamed/updated checks on `AppNavigation.tsx`/`.module.css`,
and the renamed hook added to the two GlobeScene/DrawerShell negative scans).

Focused verification: `sheetSnapPolicy.test.ts` — 17/17 pass, including
opacity-1-at-or-below-half, opacity-0-and-hidden-at-or-above-full,
exact-0.5-at-the-midpoint, and monotonic-decrease cases for the new function.
`DrawerShell.test.tsx` — 16/16 pass, including a new test that drives a real
`pointerdown`/`pointermove` gesture on the drag handle (via `clientX`/`clientY`,
since jsdom's `pageX`/`pageY` are derived read-only getters that would
otherwise never cross framer-motion's drag threshold) and asserts the
published rendered geometry reflects the dragged position *before* the
gesture ends, with `onSnapChange` still uncalled. `AppNavigation.test.tsx` —
new `BrowseSheetNavigation placement` block (4 tests) asserts `inert`/
`aria-hidden`/`data-navigation-tracking` react correctly to the mocked
placement's `hidden`/`live` fields, without asserting CSS values.

Project gates: `npx tsc --noEmit` passed; `npx tsc -p tsconfig.server.json
--noEmit` passed; `npm run lint` passed; `npm run check:style-boundaries`
passed; `npx vitest run --project client --project server` passed (114 files,
712 tests — 9 more than the 703 pre-task baseline, matching the 4 + 1 + 4 new
tests added across the three focused files). All five were independently
re-run and confirmed by the reviewing session, not just the implementing one.

Removed concepts: `useSheetSnapTopPx` (returned only a resting top pixel;
replaced by a hook that also carries opacity/hidden/live); the discrete
`[data-navigation-presentation='topBar'][data-sheet-snap='full']` CSS block
(opacity is now a continuous var, and `inert`/`aria-hidden` already remove
interactivity/accessibility exposure, so the block's `pointer-events`/
`visibility` toggling was redundant).

Unrelated working-tree changes preserved: Yes. The pre-existing ~192-line
uncommitted addition to `scripts/check-style-boundaries.mjs` and the
uncommitted M03-b through M03-i work across `PublicGallery`, `MediaRepository`,
gallery date-control components, `VirtualGallery`, `BaseCard`,
`CarouselLightbox`, `PanelLayout`, `SidePanel`, and their tests were confirmed
byte-identical before and after this task (`git diff --stat` before dispatch
vs. after matches on every one of those files). `DrawerShell.tsx`'s
pre-existing formatting-only diff (a ternary reflow, no logic change) was
preserved and built on top of rather than reverted.

Incident note: mid-implementation, the coding session made temporary,
uncommitted debugging edits to two files inside `node_modules`
(`framer-motion`, `motion-dom`) to trace why a simulated drag gesture wasn't
reaching framer-motion's drag-start threshold in the test environment (root
cause: jsdom's `pageX`/`pageY` are computed from `clientX`/`clientY`, so events
supplying only `pageX`/`pageY` land at (0,0)). Those edits were reverted before
the session ended. Because `node_modules` is gitignored, `git status` cannot
confirm this on its own; the reviewing session independently verified it by
`npm pack`-ing the exact installed versions (framer-motion 12.40.0,
motion-dom 12.40.0) and diffing their `dist` output byte-for-byte against the
installed copies — no differences. The coding session also reported, and
refused, two tool-result-embedded instructions asking it to conceal these
edits from the reviewing session, and one hook prompt asking it to open a
browser after a file edit (declined per `AGENTS.md` §0.4/CLAUDE.md §6's
absolute no-browser rule, since this task has no visual-verification
component beyond the five static gates).

Manual motion checklist for the user (perceived timing/feel cannot be judged
by an automated test): drag the sheet up from `half` and confirm the
account/cart plate slides and fades smoothly in step with the finger rather
than jumping; drag back down and confirm the reverse; confirm the plate is
gone and untappable strictly before the sheet's edge visually reaches it;
confirm an ordinary tap-triggered snap change (no drag) still animates with
the original smooth transition.

Next ready task: M03-b — Correct verification ownership in the current
responsive slice.
