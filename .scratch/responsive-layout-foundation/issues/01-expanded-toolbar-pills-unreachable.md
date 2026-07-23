# Expanded-mode filter pills overflow the viewport; unreachable in browse, scrollable in gallery

Status: needs-triage

## Symptom

In the expanded drawer presentation on wide viewports, the toolbar row
(search, upload, filter pills) overflows the viewport at 1280×800 and
1440×900. The two surfaces fail differently:

- **Browse (feed) expanded:** the overflowing pills (Date, Favorites) extend
  beyond the viewport edge with **no scroll affordance — they are
  unreachable**. Functional defect, not just visual clipping.
- **Gallery expanded:** the same overflow occurs but the toolbar row **has
  horizontal scroll**, so the pills remain reachable (ugly but functional).

Reported by the user on 2026-07-23. At 1920×1080 the toolbars fit (F00
measured client width == scroll width).

## Prior record

This refines the known F00 defect (browse toolbar 935px client / 1047px
scroll; gallery 895/1020 at 1280×800 — see
`docs/review/responsive-layout-reference/README.md` "Measured defects
excluded from parity"). The prior record captured only measured overflow;
static screenshots cannot distinguish reachable-scrollable from unreachable,
which is why the reachability difference was unrecorded until now.

## Evidence

- Scripted baseline captures reproduce the clipping:
  `docs/review/responsive-layout-matrix/wide/1280x800/browse-expanded.jpg`,
  `docs/review/responsive-layout-matrix/wide/1440x900/browse-expanded.jpg`,
  and the gallery-expanded counterparts.
- Toolbar composition: `src/widgets/SidePanel/FilterPills.tsx` (pills row),
  assembled with search/upload in the expanded toolbar inside
  `src/widgets/SidePanel/SidePanel.tsx`.

## Ownership

Roadmap task **D00 — Correct desktop toolbar containment**
(`docs/roadmaps/responsive-layout-foundation.md`, Phase D; depends on Gate 3
approval) owns the fix. D00's acceptance must verify **reachability on both
surfaces** (browse and gallery), not merely visual containment, and must use
the F12b scripted matrix plus an interaction check for the browse pills.

If the maintainer wants this pulled forward as a standalone fix before
Phase D (it is a functional accessibility gap in the live desktop
experience), it must still preserve the intended search/upload/filter
relationship per D00's scope.
