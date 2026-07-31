# Responsive layout M03-d/f/h handoff

Tasks completed: M03-d's remaining UI wiring (server/model layer was already
committed, see `responsive-layout-m03-d-handoff.md`), M03-f, and M03-h.

These landed as one commit (`fd0ed18`) because they turned out not to be
separable: `GalleryDateJumpHeading`'s `onJump` signature change (M03-d),
its chrome-slot mount point (M03-f/g), and the shared month/day list it
delegates to (M03-f, reused by M03-h) all thread through the same handful
of files at once. Every attempt to isolate one task's slice hit a real
compile-time or behavioral dependency on another's, not just incidental
proximity — documented at each attempt in the roadmap's own progress notes
as the work happened.

## What changed on screen

- **Mobile / narrow desktop** (M03-f): tapping the active-date bar opens one
  grouped month/day list — months collapse to short labels, tapping a month
  only reveals its days locally, tapping a day jumps and closes the menu
  with focus returned to the bar.
- **Compact-desktop** (M03-h, previously the same width band as mobile but
  without the fix): now gets the identical control instead of a different,
  older flat day list rendered as an interactive sticky divider inside the
  photo grid. In-grid date dividers there are now plain, non-interactive
  text.
- **Wide desktop** (unchanged): the docked date sidebar beside the grid
  still works exactly as before, now sharing its month/day rendering with
  the control above instead of duplicating it.
- **Any panel with an open date menu**: scrolling the gallery underneath no
  longer swaps the bar back to search out from under the open menu.
- **Picking a spot** (map click or search) while browsing the gallery now
  stays in the gallery, filtered to that spot, instead of always landing on
  its session list.

## Key files

- `src/features/PublicGallery/PublicGallery.tsx` — single anchored-query
  jump (`jumpAnchor`) replacing the old fetch-until-found loop; bidirectional
  pagination wired into `VirtualGallery`; date-chrome choice driven by
  `showsDateRail(measuredWidth)` alone, not `drawerPresentation`.
- `src/features/PublicGallery/ui/GalleryDateMonthList.tsx` (new) — the one
  grouped month/day list every compact presentation and the wide sidebar
  all share.
- `src/features/PublicGallery/ui/GalleryDateJumpHeading.tsx` — the
  chrome-slot active-date control; always renders `GalleryDateMonthList`.
- `src/features/PublicGallery/ui/GalleryDateSidebar.tsx` — wide-rail
  presentation, now delegating to `GalleryDateMonthList` instead of its own
  duplicated rendering.
- `src/shared/ui/VirtualGallery/VirtualGallery.tsx` — `onStartReached`/
  prepend-anchor preservation for the bidirectional feed; settle-detection
  around imperative `scrollToIndex` jumps; the sticky-divider mechanism
  (`stickyDividers`, `getActiveStickyIndex`, `.stickyRow`) removed entirely,
  since its only caller no longer exists.
- `src/shared/ui/PanelScrollChrome.tsx` / `src/widgets/SidePanel/SidePanel.tsx`
  (committed earlier, `30263e4`) — `pinChromeHidden` freezes the panel's
  scroll-driven chrome state while a child menu is open.
- `src/shared/ui/PanelLayout/PanelLayout.module.css` (committed earlier,
  `344959b`/`92c95bd`/`6b0a53f`) — the search/date cross-fade for panels with
  a replacement, and the slide-through-the-top-edge motion for panels
  without one.
- `src/views/GlobeScene/GlobeScene.tsx` / `src/app/routes/_panel.tsx`
  (committed earlier, `b334afb`) — spot selection preserves the current
  browse scope (gallery vs. sessions).

## Verification

All five gates pass. Deferred to the visual suite (per this roadmap's
browser-verification rule, held until the user approves the full M03 UI
sequence by eye): DOM bounding-box non-overlap between chrome and content,
and computed-style/animation presence for the cross-fade and slide motions.

## Commit-hygiene note

`scripts/check-style-boundaries.mjs` mixes this task's own rules with an
unrelated, unstarted "standalone map toolbar" feature's rules and an
unrelated M03-i ("large-text") in-progress slice (`src/shared/ui/BaseGallery/
BaseCard.tsx`, `src/shared/ui/CarouselLightbox/CarouselLightbox.module.css`
and their check-style-boundaries entries). Neither is touched by this
commit; both remain uncommitted for whoever picks up that work next.

Next ready task: M03-i — complete lightbox, large-text, and cross-shell
verification. Some of its groundwork (`BaseCard.tsx`'s accessible open
button, `CarouselLightbox.module.css`'s caption width fix) already sits
uncommitted in the working tree from earlier work; not evaluated or touched
this session.
