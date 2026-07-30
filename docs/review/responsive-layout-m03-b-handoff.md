# Responsive layout M03-b handoff

Task completed: M03-b — Correct verification ownership in the current responsive slice

Invariant: User-visible containment and interaction are verified through
semantic DOM, computed style, geometry, accessibility, scroll checks, the
Playwright visual-regression suite, or a manual checklist — never by a
runtime test that regex-parses CSS declaration text off disk, and never by a
static rule keyed to an exact local variable/handler name, JSX attribute
order, or a whole CSS block. Architecture rules keep enforcing real ownership
facts (import/dependency direction, forbidden raw APIs, token usage) so they
stay stable under a harmless implementation refactor.

Changed files: `src/shared/ui/PanelRouteLayout.test.tsx` (removed the
`readFileSync`/`cssRule` CSS-parsing helper and the three tests built on it;
kept the five semantic-DOM/geometry tests unchanged) and
`scripts/check-style-boundaries.mjs` (six edits: dropped two whole-CSS-block
`requiredDrawerShellStyles` entries and two brittle multi-line
`requiredDrawerShellRuntime` entries; relaxed two more in that same array to
drop their local-variable-name requirement; deleted
`requiredMobileGalleryDateRuntime`/`requiredMobileGalleryDateStyles` and their
consuming loops outright, since every entry encoded the current separate
month/day-row implementation the roadmap's own M03 status note already calls
a contradiction of the approved one-sequence design M03-f/M03-h will build).

Residual fix folded in, found while verifying this commit's gate-cleanliness
in isolation (not part of M03-b's own scope, but touching the same file and
array): `requiredResponsiveTokensByFile`'s `PanelLayout.module.css` entry
still required `--wa-motion-duration-chrome`/`--wa-motion-easing-standard`,
which that file no longer uses (grep-confirmed) — a stale requirement
resurrected by an earlier reconstruction (see the M02-g handoff's commit-split
note) that predates this session. Removed both; `--wa-z-panel-chrome` is
still required and still present.

Left untouched, deliberately out of scope: every other array/rule in
`check-style-boundaries.mjs`, including the standalone-map-toolbar rules
(M03-a, already committed and stable), the PanelLayout sticky-chrome rules
(M03-g, still in progress), `requiredCompactBrowseNavigationRuntime/Styles`
(M02-g, fresh), and the entire import/dependency-direction `rules` array.

Focused verification: `PanelRouteLayout.test.tsx` — 5/5 pass, no reference to
`cssRule`/`readFileSync` remains. `check:style-boundaries` passes with no
production file changed.

Project gates: all five passed, verified independently by the reviewing
session against the final committed state (114 files, 709 tests — 3 fewer
than the 712 after M02-g, matching the 3 removed tests).

Commit-hygiene note: this task's commit was built the same way as M02-g's —
reconstructed from a clean `git show HEAD` base with only this task's exact
edits reapplied, then the working tree's remaining ~151 lines of unrelated
M03-c/f/g/h work were restored on top, uncommitted. `git diff --stat` before
and after this task confirms none of that unrelated work changed.

Next ready task: M03-c — Make public-media pagination total.
