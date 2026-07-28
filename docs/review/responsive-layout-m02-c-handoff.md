# M02-c handoff — the approved phone sheet: height, parked list, map chrome

Task completed: **M02-c — Match the approved phone sheet: height, parked list, map chrome**

## Invariant

On a phone, the browse sheet's top resting position leaves only a strip of map, and the
session list scrolls **only** there — at the lower positions an upward swipe raises the
sheet instead of moving the cards. While the list scrolls down the pinned search/filter
row gets out of the way and returns as soon as it scrolls up. The account and cart
controls sit on the map beneath the sheet, so raising the sheet covers them completely.

## Authority

- `src/shared/ui/DrawerShell/sheetSnapPolicy.ts` — resting heights.
- `src/shared/ui/DrawerShell/sheetScrollCoupling.ts` — whether the panel's scroll owner
  may scroll, published downward alongside the existing scroll-owner registration.
- `src/widgets/AppNavigation/AppNavigation.module.css` — the compact chrome arrangement.

## What changed

The top snap went from 0.90 to 0.92 of the dynamic viewport, set from the approved
prototype: it leaves a strip of map above the sheet rather than a portion of the screen.

**The parked list needed no gesture code.** `DrawerShell` publishes whether its content
may scroll — false below the top snap — and `PanelLayout` locks its scroll owner
accordingly. Because a locked list can never leave `scrollTop: 0`, the surface drag stays
enabled, so an upward swipe raises the sheet. This makes M00's scroll-to-promote path
unreachable: it was deleted along with `nextSheetSnapUp` and the promote threshold.

**Hide-on-scroll needed no work either.** The panel already tracks scroll direction and
the sticky-chrome slot already translates itself out of view on `data-hidden`, and neither
is presentation-specific — so both applied inside the sheet the moment the list could
scroll. A behavioural test now owns it rather than leaving it incidental.

Compact account/cart chrome is stacked vertically, sized from a new
`--wa-control-size-navigation-compact` (36px) inside a 44px touch target, offset below the
top snap's edge, and layered at `--wa-z-controls` so the sheet paints over it. The wide
and constrained arrangements are untouched and keep `--wa-z-floating-chrome`.

## Changed files

`sheetSnapPolicy.ts` (+ test), `sheetScrollCoupling.ts`, `DrawerShell.tsx` (+ test),
`DrawerShell/index.ts`, `PanelLayout.tsx` + `.module.css`, `SidePanel.sheet.test.tsx`,
`tokens.css`, `AppNavigation.module.css`, `scripts/check-style-boundaries.mjs`.

## Focused verification

- `DrawerShell.test.tsx` — content scrolling is refused at `peek` and `half` and allowed
  at `full`. The superseded scroll-to-promote test is gone with the mechanism it covered.
- `SidePanel.sheet.test.tsx` — at the top snap, a downward scroll hides the pinned row and
  an upward scroll past the direction threshold brings it back.
- `sheetSnapPolicy.test.ts` — heights follow the new top fraction.
- `check:style-boundaries` — the new compact control token is required of the navigation
  stylesheet, so the arrangement cannot regress to a raw pixel value.
- The two presentation-swap geometry tests added with the live-resize fix still pass, so
  this slice did not reintroduce stale geometry across a band crossing.

## Project gates

All five green: `tsc --noEmit`, `tsc -p tsconfig.server.json --noEmit`, `npm run lint`,
`npm run check:style-boundaries`, `vitest run --project client --project server`
(112 files, 656 tests — two fewer than before, both belonging to the retired promote path).

## Removed concepts

`nextSheetSnapUp`, `SHEET_SCROLL_PROMOTE_THRESHOLD_PX`, and the scroll handler branch that
promoted the sheet when the list scrolled.

## Verification the code cannot own

Appearance again: the top snap's map strip, the stacked chrome's position, and the row's
reveal all need the user's eyes. The checklist handed over with this slice covers them.

## Known residuals

- `SHEET_PEEK_HEIGHT_PX` is still the 132px constant. It has never been measured against
  the row it is supposed to fit, and M02-d changes that row by removing the scope switcher
  from the panel header — so it should be re-checked there.

## Unrelated working-tree changes preserved

Yes — the user's in-progress changes to `src/features/PublicGallery/PublicGallery.tsx` and
`src/shared/ui/DrawerShell/panelSettledWidth.ts` were not touched and are not in this
commit.

## Next ready task

**M02-d — Move sections into a bottom bar.**
