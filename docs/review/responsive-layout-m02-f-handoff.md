# Responsive layout M02-f handoff

Task completed: M02-f — Fix: stabilize landscape search chrome with one-card content

Invariant: A short landscape panel without at least 8px of real vertical travel cannot hide or oscillate its search/filter chrome from boundary or layout-generated scroll corrections; genuinely scrollable Feed/Gallery content still produces one deliberate hide/reveal transition per qualifying direction change.

Authority: `SidePanel` remains the sole owner of the shared scroll-direction state, while `PanelLayout` remains the sole owner of the scroll container and its scoped browser scroll-anchoring behavior.

Changed files: `src/widgets/SidePanel/SidePanel.tsx`; `src/widgets/SidePanel/SidePanel.test.tsx`; `src/widgets/SidePanel/SidePanel.sheet.test.tsx`; the M02-f `overflow-anchor` hunk in `src/shared/ui/PanelLayout/PanelLayout.module.css`; `docs/roadmaps/responsive-layout-foundation.md`; this handoff.

Focused verification: RED reproduced the defect because a zero-range scroll owner hid the chrome after a synthetic 24px correction. GREEN passed both focused SidePanel suites: 2 files, 20 tests. The regression test also preserves the same card DOM node across repeated 24 → 0 corrections, and the long-content branch retains the existing 8px threshold.

Project gates: `npx tsc --noEmit` passed; `npx tsc -p tsconfig.server.json --noEmit` passed; `npm run lint` passed; `npm run check:style-boundaries` passed; `npx vitest run --project client --project server` passed (114 files, 703 tests).

Removed concepts: None. No new presentation conditional, card-count special case, layout formula, event listener, store, or direction authority was introduced.

Unrelated working-tree changes preserved: Yes. The audit roadmap, M03 data/date/lightbox work, the later PanelLayout sticky-chrome replacement hunks, static-rule work, server pagination work, and all other pre-existing dirty paths remain unstaged and unchanged by this slice.

Next ready task: M02-g — Fix: couple the portrait account/cart plate to live sheet motion. It requires a visible-motion approval before implementation.
