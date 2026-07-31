# Responsive layout M03-g handoff (partial — PanelLayout mechanism only)

Task in progress: M03-g — Add a stable transition between search and date
chrome. This handoff covers the slice committed now; the roadmap checkbox
stays unchecked until the remainder (below) lands too.

## The problem this replaces

At HEAD, the panel's one pinned sticky-chrome row hid by sliding the whole
row off-screen (`.stickyChrome[data-hidden] { transform: translateY(-100%) }`)
regardless of what replaced it. Once M03-f's still-uncommitted
`PanelLayoutStickyChromeReplacement` scaffolding gave the mobile gallery an
active-date row of a *different* height than the search/filter row it
replaces, that slide-and-swap read as the card grid jumping vertically the
instant the two rows traded places — UI-05.

## The fix: one constant-geometry grid cell, cross-faded

`PanelLayout.module.css`'s `.stickyChrome` now stacks both
`[data-panel-scroll-chrome-primary]` (search/filter) and
`[data-panel-scroll-chrome-replacement]` (active date) in the same CSS grid
cell (`grid-area: 1 / 1`) instead of one occupying the row while the other is
`display: none`. Both are always present in normal flow, so the row's own
height is the max of the two *regardless of which is currently shown* — the
grid below it never has anything to shift for. The active one is `opacity: 1`
with pointer events on; the other is `opacity: 0` with pointer events off,
cross-fading between the two states over the same `0.28s`
`cubic-bezier(0.4, 0, 0.2, 1)` timing already used for the panel's other
motion (`DrawerShell`'s `DRAWER_SHELL_TRANSITION`), so the swap doesn't
introduce a new bespoke feel. `@media (prefers-reduced-motion: reduce)` drops
the `transition` entirely — the swap becomes instant — while the grid
stacking (and therefore the no-jump guarantee) is unaffected, since that part
of the fix isn't animation at all. Accessibility visibility is unchanged from
the pre-existing scaffolding: each row still carries `aria-hidden`/`inert`
based on the same `hidden` fact from `usePanelScrollChromeState()` — no new
state was introduced, per the task's own scope.

`check:style-boundaries`'s `requiredPanelLayoutStyles` now asserts the
grid-cell stacking, the opacity cross-fade, and the reduced-motion removal by
pattern, so this can't silently regress back to a height-shifting swap.

## User verification

Announced the visible change (crossfade instead of instant swap; grid stops
moving; reduced motion keeps the swap instant but still doesn't move the
grid) and got explicit approval before implementing, per this roadmap's own
gate. After implementing, handed the user a three-item checklist (fade down,
fade back up, reduced-motion instant swap — grid never jumps in any of the
three) since the change can only be judged by eye; user confirmed all three
hold.

## Changed files (this commit)

- `src/shared/ui/PanelLayout/PanelLayout.tsx` — `PanelLayoutStickyChromeReplacement`
  (the alternate-content portal for the same slot) and the `onScrollCapture`
  callback's `pinnedChromeHeightPx` second argument. Both existed as
  uncommitted scaffolding already; this commit is their first landing.
- `src/shared/ui/PanelLayout/PanelLayout.module.css` — the grid-stacking,
  cross-fade, and reduced-motion rules described above.
- `src/shared/ui/PanelLayout/PanelLayout.test.tsx` — asserts the primary/
  replacement rows share one `[data-panel-scroll-chrome]` ancestor, flip
  visibility with the `hidden` fact, and (new) stay mounted in the DOM on
  both sides of that flip rather than being conditionally unmounted.
- `src/shared/ui/PanelLayout/index.ts` — barrel export for
  `PanelLayoutStickyChromeReplacement`.
- `scripts/check-style-boundaries.mjs` — only the three
  `requiredPanelLayoutStyles` entries covering this mechanism; nothing else
  in this file (see commit-hygiene note).

## Focused verification

`PanelLayout.test.tsx`: 11/11 pass, including the new
"keeps both rows mounted in the same slot across the switch" assertion. No
`PublicGallery`-level integration test yet — see "still open" below.

## Project gates

All five gates pass against this commit's exact file set, verified in
isolation (working tree temporarily reverted to HEAD for every file *not* in
this commit, via `git stash push --keep-index -u`, to prove no hidden
dependency on the still-uncommitted remainder): 115 files / 704 tests
(client + server). Re-verified again after restoring the full working tree:
116 files / 719 tests.

## Commit-hygiene note

`scripts/check-style-boundaries.mjs` mixes unrelated concerns in the working
tree: this task's `requiredPanelLayoutStyles` entries, M03-f's still-open
mobile-gallery-large-text and `GalleryDateMonthList`-consumer rules, and a
completely unrelated, unstarted "standalone map toolbar" feature's rules.
Reconstructed the committed version by taking HEAD's copy of the file and
replacing only the `requiredPanelLayoutStyles` array with its current
working-tree content — every other rule in the file stays exactly as
uncommitted WIP left it, untouched by this commit.

## Still open

The invariant's own `PublicGallery`-level integration test (proving the real
gallery's first card row keeps the same measured position across a live
handoff) and the Playwright computed-style/animation check aren't written
yet, because `PublicGallery.tsx` — the only real consumer of this slot today
— stays uncommitted per M03-d/f's own notes. This checkbox stays open until
that consumer lands and can carry those tests. Per this roadmap's own
browser-verification rule, the visual suite (`npm run test:visual`) is
deliberately held until the full M03 UI sequence is approved, not run
per-task.

Next ready task: M03-h — unify compact-desktop gallery date chrome with
mobile. Its own text requires announcing the visible change and waiting for
explicit approval before implementing — not yet done.
