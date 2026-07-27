# Responsive layout F12n-a handoff

Completed 2026-07-27.

Task completed: F12n-a — Refactor: collapse `PanelGalleryLayout`'s private
scroll owner onto the panel scroll owner.

## Why the task was split

The roadmap's original F12n bundled two independent intents. Splitting it into
F12n-a and F12n-b was recorded in the roadmap on 2026-07-26:

- **Scroll ownership** (this slice) — mechanical, no open questions: the seven
  screens built on `PanelGalleryLayout` scrolled inside a second, private
  scroller nested in `PanelLayout`'s.
- **Chrome provisioning** (F12n-b) — carries two genuine architectural
  decisions, because the collections route publishes its toolbar from a
  `PanelScrollChromeProvider` mounted *below* the `stickyChrome` slot F12m
  established, and content below a slot cannot reach it by context.

Nothing in F12n-a depends on those decisions: none of the seven screens supplies
a `subheader`, so their single chrome row keeps working from where it is mounted
today.

Invariant: **Exactly one scroll owner exists per panel** —
`PanelLayout`'s `[data-panel-scroll-owner]` — across cart, my page, earnings,
the three collections tabs, and session detail. Second, user-visible half: the
session-detail meta row (spot · location · photographer) stays pinned while the
photo grid scrolls beneath it, as it did before.

Authority:
- `PanelLayout` now owns **every** pinned panel region: header, metadata, sticky
  chrome, rail, footer. `PanelGalleryLayout` owns only stacking and insets.
- `scripts/check-style-boundaries.mjs`, rule
  `panel-layout-owns-standard-scrolling`, owns reintroduction.

## What this task did

1. **Retired the second scroll owner.** Deleted `PanelGalleryLayout`'s
   `.scroller` wrapper (`overflow-y: auto`) and the `data-panel-gallery-scroller`
   attribute with it, so `<PanelScrollChrome />` and the gallery inset became
   direct children of the layout root and the seven screens scroll in the one
   `PanelLayout` scroll owner. F09 mandates a single panel scroll owner; this was
   the parallel authority violating it, and the one that made "one home for the
   pinned row" impossible after F12m alone.

2. **Gave the meta row a portal seam instead of a prop.** The meta row was
   pinned only because it sat *outside* the private scroller as a sibling;
   removing that scroller would have let it scroll away with the grid. The user
   chose (2026-07-26) to keep it frozen, so it is now projected out of the scroll
   owner via a new `PanelLayoutMetadata` portal, mirroring `PanelLayoutFooter` /
   `PanelLayoutRail`. This **replaces** `PanelLayout`'s `metadata` prop, which
   had zero callers and was unreachable anyway: `SessionDetail` renders inside
   the scroll owner and cannot pass a prop upward.

   A local `position: sticky` was never an option — the pre-existing
   `panel-layout-owns-footer-placement` rule already bans `position:
   absolute|sticky` in `PanelGalleryLayout.{tsx,module.css}`, so the projection
   path was the only gate-legal one. That constraint removed the last apparent
   design choice from this slice and is why it was dispatchable.

3. **Sized the root to its content.** `.root` went from `flex: 1` +
   `min-height: 0` to `flex: 1 0 auto`. With no inner scroller, the root must
   size to its content rather than being allowed to shrink below it; otherwise
   the sticky chrome's travel is clamped to a short box and the row stops pinning
   part-way down the grid — the same class of defect F12m hit with its wrapper
   div, recorded in that handoff.

## Contract defect found during dispatch

The first dispatch **stopped without implementing**, correctly. The contract
specified `PanelLayoutMetadata` as portal-only (renders `null` outside a
`PanelLayout`) while also requiring `SessionDetail.test.tsx:118` to pass
unchanged — but that test rendered `SessionDetail` bare under `MantineProvider`
with no `PanelLayout` ancestor, so the portaled meta row had no target and never
mounted.

Resolution: the *test environment* was wrong, not the interface. `SessionDetail`
is only ever a `_panel` route child in the running app
(`src/app/routes/_panel.$spotId.session.$sessionId.tsx`), so the contract was
amended to wrap that single render in a `PanelLayout`, exactly as
`PanelGalleryLayout.test.tsx` already does. The assertion itself is byte
identical. The portal-only interface stands.

Focused verification:
- New behavioral test in `PanelGalleryLayout.test.tsx`: meta content resolves
  **outside** `[data-panel-scroll-owner]` while gallery children resolve inside
  it. RED confirmed before the fix — it cannot pass while the meta row is a
  sibling inside the private scroller.
- New `PanelLayoutMetadata` tests in `PanelLayout.test.tsx`: content lands in
  `[data-panel-layout-metadata]` and outside the scroll owner; renders nothing
  outside a `PanelLayout`.
- Rewritten (authorized) assertion: the third `PanelGalleryLayout` test asserted
  chrome sat inside `[data-panel-gallery-scroller]`, an attribute this slice
  deletes; it now asserts `[data-panel-scroll-owner]`. This is a retired
  authority, not a weakened assertion — no other existing assertion changed.
- The four route tests asserting `[data-panel-gallery-inset]` and
  `SessionDetail.test.tsx`'s `[data-panel-gallery-meta]` assertion pass
  untouched, proving the seven screens needed no edits.
- Static enforcement probed independently (probe applied, violation observed at
  the exact line, probe reverted, check green again): rule
  `panel-layout-owns-standard-scrolling`, include list extended to
  `PanelGalleryLayout.{tsx,module.css}`, fired on a temporary
  `overflow-y: auto`. Its pattern and message were not modified.
- Authority scans: `grep -rn "data-panel-gallery-scroller" src scripts` and
  `grep -rn "overflow" src/shared/ui/PanelGalleryLayout.module.css` both return
  no matches.

Project gates (all green, re-run independently after the coder):
- `npx tsc --noEmit` — pass
- `npx tsc -p tsconfig.server.json --noEmit` — pass
- `npm run lint` — pass
- `npm run check:style-boundaries` — pass
- `npx vitest run --project client --project server` — 564 passed (107 files);
  baseline before this slice was 561.

Removed concepts: `PanelGalleryLayout`'s `.scroller` rule and its
`data-panel-gallery-scroller` attribute; `PanelLayout`'s unused `metadata` prop
and its conditional render; `.root`'s `min-height: 0`.

Browser verification: **confirmed by the user on 2026-07-27**. Across all seven
screens the panel scrolls as one surface with no nested scroller, the
session-detail meta row stays pinned while photos scroll beneath it, the
collections filter/tab row still pins and reveals, footers stay fixed, and
empty/loading states are unchanged.

Visual suite (`npm run test:visual`, run only as the final check after the
user's approval): 34 passed, 8 failed, 1 flaky — `browse-expanded`,
`gallery-compact`, and `upload-map-input` at all three wide viewports.
**Pre-existing, not caused by this slice**, and verified rather than assumed:
the identical nine specs fail at `c5071d9` (F12k), the commit before this one.
None of the three scenarios uses `PanelGalleryLayout`. The baselines were
committed at `a49af10` (F12h) and F12k — which changed panel column counts and
made the reflow animatable — landed after them without a baseline refresh. The
wide-band reference matrix has therefore been red since F12k and needs its own
decision: refresh the baselines if F12k's visual result was approved, or treat
the diff as a defect. Not folded into this slice.

Resolved separately in `4670b3e`: the user inspected the reference/actual/diff
images, judged the difference not a defect, and approved refreshing those nine
baselines and widening `maxDiffPixelRatio` from 0 to 0.002. Chromium font flags
were tried first as a root-cause fix and were no-ops in headless Chromium, so
they were reverted. The suite is now 41 passed / 0 failed.

Followed up 2026-07-27: that refresh papered over a second, larger cause. Run at
`--retries=0`, `browse-expanded` still failed at 1440×900 by 0.01 — five times
the new tolerance — with the mid-animation signature (0.29, 0.29, then 0.01
across the three stability attempts). The capture was firing while the panel was
still animating; the two states affected are exactly the two whose recipe toggles
it. Fixed at source in `tests/visual/matrix.spec.ts`, together with three other
false failures. The tolerance stays at 0.002 for the genuine glyph-edge residue.
See the correction section in `docs/review/responsive-layout-f12h-handoff.md`.

Unrelated working-tree changes preserved: none — the only pre-existing edit was
the roadmap split that created this task, committed with the slice.

Next ready task: **F12n-b** — unify panel chrome provisioning onto one seam.
Not dispatchable as-is: it carries two open architectural decisions (the
publish-upward seam that lets a route-supplied toolbar reach `stickyChrome`, and
precedence plus hide-on-scroll semantics when a toolbar and a `subheader` are
both present). Resolve both in a main session before writing a contract.
