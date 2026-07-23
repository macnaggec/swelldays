# F12b handoff — script the reference matrix, compact-first

Task completed: F12b — Fix: script the reference matrix, compact-first

Invariant: Browser-owned layout invariants are re-runnable by any session — the
viewport × drawer-intent × drawer-state matrix is captured by a scripted
harness into stored artifacts instead of being re-derived by hand. The wide
band is captured as the desktop-parity baseline; M07, T05, D00, and D03 must
consume this harness rather than one-off inspection.

Authority: `scripts/reference-matrix/matrix.mjs` owns the matrix definition
(mobile-first viewport axis and the 14 state reproduction recipes);
`scripts/reference-matrix/capture.mjs` owns the capture mechanism (headless
Chrome over CDP via the existing `chrome-remote-interface` dependency);
`docs/review/responsive-layout-matrix/` owns the stored baseline artifacts.

Changed files:
- `scripts/reference-matrix/matrix.mjs` (new)
- `scripts/reference-matrix/capture.mjs` (new)
- `package.json` (`capture:reference-matrix` npm script)
- `docs/review/responsive-layout-matrix/README.md` (new) and 42 wide-band JPEGs
- `docs/roadmaps/responsive-layout-foundation.md` (F12b checkbox)

Focused verification: full wide-band run (3 viewports × 14 states) completed
with zero failures; 17 artifacts visually inspected in-session — all 14 states
at 1440×900 plus cross-width spot checks at 1280×800 and 1920×1080. State
labels confirmed on screen: "No sessions found" with the Today pill selected
(empty), "This upload workspace is unavailable" (error), the delete-account
dialog open on the payout-in-progress guard (no destructive action executed),
and skeleton cards plus the map spinner in the throttled loading capture. The
known F00 defects reproduce faithfully: expanded toolbars overflow at 1280×800
and clip at 1440×900, and fit at 1920×1080 (excluded from parity; D00 owns the
fix).

Project gates: all five green after the change — `npx tsc --noEmit`,
`npx tsc -p tsconfig.server.json --noEmit`, `npm run lint`,
`npm run check:style-boundaries`, `npx vitest run --project client
--project server` (100 files / 492 tests). The same five were green at
baseline before the change.

Removed concepts: none in code. Process-wise, hand-derived browser inspection
is superseded as the verification vehicle for layout states; the F00 manual
captures remain as historical reference only.

Unrelated working-tree changes preserved: yes — the tree was clean at session
start; every change traces to F12b.

Discovered record gap (pre-existing, surfaced not fixed): the blanket `docs`
rule in `.gitignore` silently kept the F00 reference JPEGs and all
F01–F12a handoff notes out of version control — only the roadmap document and
`docs/review/05-transformation-roadmap.md` are tracked (both force-added).
F12a's handoff claims the record was committed; it exists only in the working
tree. This slice force-adds its own handoff and artifacts following the
established selective `git add -f` precedent. Deciding whether to track the
back catalog (and whether to carve `docs/review` out of `.gitignore`) is left
to the user.

Harness credentials: the capture account credentials live in `.env` as
`REFERENCE_EMAIL` / `REFERENCE_PASSWORD` (gitignored, dev-only, required to
re-run the harness).

Next ready task: F12c — Fix: retire the stray viewport breakpoints.
