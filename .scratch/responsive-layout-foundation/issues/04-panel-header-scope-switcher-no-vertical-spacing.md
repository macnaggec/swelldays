# Wide-band panel header (Feed/Gallery switcher) is flush to the panel top and the search row below it

Status: needs-triage

## Symptom

Reported by the user on 2026-08-09, with a screenshot. Surface: **wide band,
persistent panel, browse intent, default index route** — desktop, not mobile.
The "Feed | Gallery" scope switcher pill sits with no gap above it (flush to
the very top edge of the panel) and no gap below it before the search/filter
row starts. Needs at least a couple of pixels of breathing room on both
sides.

## Root cause

Nothing in the chain reserves vertical space around the header slot:

- `PanelLayout`'s header wrapper (`data-panel-layout-header`, mounted at
  `src/shared/ui/PanelLayout/PanelLayout.tsx:136`) is styled at
  `src/shared/ui/PanelLayout/PanelLayout.module.css:188-193` — that rule sets
  only `width`, no `padding-block` or margin.
- The header's own content on this route, `ScopeSwitcher`
  (`src/widgets/SidePanel/ScopeSwitcher.tsx`), is styled via
  `src/widgets/SidePanel/ModeSwitcher.module.css`. Its `.root` padding
  (`padding: 3px`, line 4) is internal — space around the two segments inside
  the pill — not spacing between the pill and its neighbors.

So the pill's rendered box is exactly its own content box, placed directly at
the top of the panel and directly against whatever chrome sits below it.

## Evidence

User screenshot, 2026-08-09: wide desktop viewport, default browse index
route, "Feed | Gallery" switcher flush against the top edge and against the
"Search for a spot…" row beneath it.

## Ownership

No existing task owns this. Not yet triaged into a roadmap task or scoped to
a fix — likely belongs with `PanelLayout`'s header slot picking up a
panel-chrome spacing token (F11 established the semantic spacing/inset
tokens this would draw from) rather than a one-off fix local to
`ScopeSwitcher`, since any other content mounted in that same header slot
would have the identical gap.
