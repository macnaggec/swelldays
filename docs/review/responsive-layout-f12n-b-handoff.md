# Responsive layout F12n-b handoff

Completed 2026-07-27.

Task completed: F12n-b — Refactor: unify panel chrome provisioning onto one
seam.

Invariant: The pinned search/filter row has **exactly one mount** across all
nine panel screens, owned by `PanelLayout`, and **one seam** through which
content reaches it. No content surface can render the row or reintroduce a
second path.

Authority:
- `PanelLayout` renders the sticky row itself, as a direct child of the scroll
  owner, and owns its styling and hidden state.
- `PanelLayoutStickyChrome` is the single seam. Both `SidePanel` (with
  `subheader`) and the collections route (with its toolbar) publish through it.
- `scripts/check-style-boundaries.mjs`, rule `panel-sticky-chrome-has-one-mount`
  — now global — owns reintroduction.

## What this task did

1. **Collapsed two content paths into one.** `SidePanel` passed `subheader` down
   as a `stickyChrome` prop while the collections layout supplied its toolbar
   through a `PanelScrollChromeProvider` mounted *inside* the panel content —
   below the slot, so it could never reach it. That is why `PanelGalleryLayout`
   still carried its own mount after F12n-a. Both now publish into the one row
   via `PanelLayoutStickyChrome`, the portal pattern already used by
   `PanelLayoutFooter`, `PanelLayoutRail`, and `PanelLayoutMetadata`.

2. **Made the row the portal target, not a wrapper around it.** F12m proved a
   wrapper only as tall as the row leaves zero travel to stick within and the
   row scrolls away with the content. `PanelLayout` therefore renders the styled
   sticky row itself and content portals *into* it, with `:empty` so it costs
   nothing on screens that publish nothing.

3. **Invented no precedence rule.** `src/app/routes/_panel.tsx:286` gives
   `subheader` only to the spot page, the default index, and the all-gallery
   route; the collections screens never receive one. A route toolbar and a
   `subheader` cannot coexist, so the seam makes the collision impossible rather
   than defining a winner. Adding a rule for it would have been speculative
   flexibility.

4. **Retired the superseded authority.** `PanelScrollChrome` keeps only its
   hidden-state context, which `VirtualGallery` and `BaseGallery` read; the
   component, the content context, and `PanelScrollChrome.module.css` are gone,
   the styles moving to `PanelLayout.module.css` as `.stickyChrome`.

## Defect found and fixed during closeout

The user reported that a panel showing a single card still scrolled slightly,
and that using that scroll hid the search row. Root cause: the scroll owner
stacked the row above a content box declaring `min-height: 100%`, and that
percentage measures the scroll owner itself, blind to the row above it — so the
sum always exceeded the panel by exactly the row's height. With many cards the
surplus hides inside real scrolling; with one card it *was* the scroll range.

Present since F12m moved the row out of the content; surfaced now because
F12n-b put every panel screen on that one row. Fixed in `ecb6f94`: the scroll
owner became a flex column and the content flexes into what the row leaves,
preserving the fill-the-panel behaviour empty states rely on.

Focused verification:
- RED confirmed: the new `PanelLayout` test publishing from deep inside the
  children failed before `PanelLayoutStickyChrome` existed.
- `SidePanel`'s four chrome tests — single mount in the scroll owner, hide on
  scroll down, reveal on scroll up, no reveal on a momentum correction — pass
  **unchanged**, which is the proof that behaviour did not move.
- Authority scans: `PanelScrollChromeProvider` and `<PanelScrollChrome` return
  no matches in `src`; `data-panel-scroll-chrome` appears in exactly one runtime
  file, `PanelLayout.tsx`.
- Static enforcement, all three probed independently (probe applied, violation
  observed at the expected line, probe reverted, check green again):
  - `panel-sticky-chrome-has-one-mount`, now global across runtime TypeScript
    and stylesheets except `PanelLayout.{tsx,module.css}`;
  - `panel-layout-required-styles`, extended with the chrome-aware scroll
    stacking and flexing content that fix the scroll defect above;
  - `required-responsive-token-consumer`, whose chrome motion/layer token
    requirement was moved onto `PanelLayout.module.css`. The coder's deviation
    had deleted it along with the retired stylesheet — the rule must travel with
    the declarations, not die with the filename. Caught in review, fixed in the
    main session before commit.

Project gates (all green, re-run independently after the coder):
- `npx tsc --noEmit` — pass
- `npx tsc -p tsconfig.server.json --noEmit` — pass
- `npm run lint` — pass
- `npm run check:style-boundaries` — pass
- `npx vitest run --project client --project server` — 566 passed (107 files);
  baseline before this slice was 564.

Visual suite (`npm run test:visual`, run only as the final check after the
user's approval): 39 passed, 0 failed, 4 flaky — the `loading` state at all
three viewports plus one `upload-map-input`, each passing on retry. That is the
headless-WebGL and dev-server timing the config's `retries` note already
documents, not a snapshot mismatch. No baseline was touched.

Removed concepts: `PanelLayout`'s `stickyChrome` prop; the `PanelScrollChrome`
component, `PanelScrollChromeContext`, and `PanelScrollChromeProvider`;
`PanelScrollChrome.module.css`; the `panelStickyChromeMigratedSurfaces`
allow-list; `.content`'s `min-height: 100%`.

Browser verification: **confirmed by the user on 2026-07-27**, after the scroll
fix above. The row sits in the same place with the same hide-and-reveal
behaviour on browse, gallery, and all three collections tabs, and a panel whose
cards fit no longer scrolls.

Unrelated working-tree changes preserved: none — the tree was clean at the start
of this slice.

Next ready task: **M00 — Add compact bottom-sheet mechanics**, the first task of
Phase M. Phase F's remaining scope is complete; M00 depends on F12d and F12e,
both checked. Note that Phase M is gated on the mobile-foundation approval
(Gate 2) only at its *end* (M07), not its start.

Known follow-up outside this task: the cart lightbox routes its metadata and
Remove action through `renderFooter`, a superseded slot that forwards into the
icon control rail, so it renders unlike every other lightbox. Reported by the
user during this closeout and fixed separately.
