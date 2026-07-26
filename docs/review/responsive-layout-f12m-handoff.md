# Responsive layout F12m handoff

Completed 2026-07-25.

Task completed: F12m — Fix: mount the panel search/filter chrome once in the
PanelLayout scroll owner (browse + gallery).

Invariant: On browse and gallery the pinned search/filter row has **exactly one
mount**, and that mount lives directly in `PanelLayout`'s single scroll owner
(`[data-panel-scroll-owner]`). It reveals and hides from the panel's own scroll
direction, and no content surface can trap it by declaring its own overflow
context.

Authority:
- `src/widgets/SidePanel/SidePanel.tsx` is now the sole mounter of the chrome:
  it passes `stickyChrome={subheader ? <PanelScrollChrome /> : undefined}` to
  `PanelLayout`, whose slot already renders inside the scroll owner.
- Content surfaces (`SessionFeed`, `VirtualGallery`, `PublicGallery`) may only
  *read* the hidden state via `usePanelScrollChromeState`; they no longer mount
  the chrome.
- `scripts/check-style-boundaries.mjs` owns the ownership rule.

What this task did:

1. **Root cause: the sticky-chrome slot was dead code.** `SidePanel` gated the
   slot on `!hideSubheaderOnScroll && subheader`. In `_panel.tsx` the caller
   computed `hideSubheaderOnScroll = Boolean(subheader && (spotMatch ||
   isDefaultIndex || allGalleryMatch))`, and `subheader` itself is defined
   *only* for exactly those three route matches — so the flag was true whenever
   `subheader` existed, making the guard always false. The chrome was therefore
   *always* hand-mounted inside each content surface instead.

2. **One mount in the scroll owner.** Moved `PanelScrollChromeStateProvider` up
   so it wraps the whole drawer subtree rather than only `children`; the chrome
   rendered in `PanelLayout`'s slot now resolves the hidden state that
   `SidePanel`'s `onScrollCapture` handler already computed. The slot is mounted
   whenever a `subheader` exists. Deleted the `<PanelScrollChrome />` mounts in
   `SessionFeed`, `VirtualGallery`, and both `PublicGallery` branches (loading
   and empty state), unwrapping the fragments those mounts had required.

3. **Removed the overflow trap.** `SessionFeed`'s `.feed` wrapper declared
   `overflow-x: hidden`, which per CSS computes `overflow-y` to `auto` — making
   it a scroll container that captured the sticky row and detached it from the
   panel scroll owner and its scroll-direction signal. That declaration is gone.
   This supersedes the transitional feed/gallery overflow fixes (the gallery's
   equivalent was stripped ad hoc in F12g).

4. **Retired the bypass.** `hideSubheaderOnScroll` is deleted from
   `SidePanelProps` and from its single call site in `_panel.tsx`; no references
   remain in the codebase.

Focused verification:
- `SidePanel.test.tsx` — the three chrome tests were rewritten to the production
  prop shape (no `hideSubheaderOnScroll`, no hand-mounted child chrome). RED
  confirmed independently: with `SidePanel.tsx` reverted to HEAD, those three
  tests fail (`Expected the element to have attribute: data-hidden`); they pass
  after the fix. 10/10 in the file.
- One added test asserts the structural invariant (exactly one
  `[data-panel-scroll-chrome]`, contained by the scroll owner and *not* by a
  content surface that declares its own overflow context). Recorded honestly:
  this test **also passes against the pre-fix code**, so it is a structural
  guard against double-mounting, not the RED for this slice. The RED is the
  three rewritten tests above, and the static rules below own reintroduction.
- Static enforcement, both probed independently (probe applied, violation
  observed, probe reverted, check green again):
  - new rule `panel-sticky-chrome-has-one-mount` — scoped to the three migrated
    files; fired at `SessionFeed.tsx:77` when a `<PanelScrollChrome />` mount was
    temporarily re-added. `PanelGalleryLayout` is deliberately *not* covered; it
    remains a recorded exception until F12n.
  - existing rule `panel-layout-owns-standard-scrolling` — pattern extended to
    the horizontal axis (`overflow-x: auto|hidden|scroll`, `overflowX`); fired on
    `SessionFeed.module.css` when `overflow-x: hidden` was temporarily restored.
- `npx vitest run --project client src/widgets/SidePanel/SessionFeed.test.tsx
  src/features/PublicGallery/PublicGallery.test.tsx
  src/shared/ui/PanelLayout/PanelLayout.test.tsx
  src/shared/ui/PanelGalleryLayout.test.tsx` — pass (the F12n path is untouched).

Project gates (all green, re-run independently after the coder):
- `npx tsc --noEmit` — pass
- `npx tsc -p tsconfig.server.json --noEmit` — pass
- `npm run lint` — pass
- `npm run check:style-boundaries` — pass
- `npx vitest run --project client --project server` — 551 passed (106 files);
  baseline before this slice was 550.

Removed concepts: the `hideSubheaderOnScroll` prop and its call-site
computation; four content-mounted `<PanelScrollChrome />` instances; the
`overflow-x: hidden` scroll-container trap on `.feed`.

## Follow-up defect found after the first commit (d920b8f)

The user reported the row still did not slide back on scroll up, in both the
feed and the gallery. Root cause: `PanelLayout` rendered the slot content inside
a bare wrapper `<div data-panel-layout-sticky-chrome>`. A `position: sticky`
element is constrained to **its parent's box**, and that wrapper was only as
tall as the chrome itself (52px) sitting at the top of a 5443px scroll range —
so the row had zero travel to stick within and simply scrolled away with the
content. It only reappeared once the panel was scrolled back to the top, which
is exactly the reported symptom. Before this slice the chrome was a direct child
of a tall content box (`.feed`, the gallery container), which is why the defect
only surfaced once the chrome moved into the slot.

Fix: render `{stickyChrome}` as a direct child of the scroll owner, with a
comment recording why the wrapper must not come back. The wrapper had no CSS and
no queries pointing at it, so nothing else depended on it.

Status: structurally proven and gates green, but the *visual* result is
unconfirmed — see the checklist below.

Browser verification: **confirmed by the user on 2026-07-26**, after the
follow-up fix above. On both browse and gallery the search/filter row hides on
scroll down, slides back on scroll up, and stays pinned while the content
scrolls beneath it; the session cards are not clipped horizontally after the
`overflow-x: hidden` removal. F12h's Playwright gate will own the static end
states once it lands, so this behaviour stops depending on manual checking.

Unrelated working-tree changes preserved: none — the tree was clean at the start
of this slice.

Next ready task: F12n (collapse `PanelGalleryLayout`'s private scroll owner onto
the panel scroll owner), which depended on F12m and is now unblocked. F12h and
F12k remain eligible but are flagged for a main session rather than a headless
dispatch (see below).
