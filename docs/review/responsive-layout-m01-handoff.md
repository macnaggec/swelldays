# M01 handoff — mobile navigation presentations, built but not activated

Task completed: **M01 — Implement mobile navigation**

## Invariant

The account menu and the cart are reachable from one set of controls in **every**
navigation arrangement — `leftStrip`, `topBar`, `compactBar` — with no duplicated
navigation state, and one module decides which arrangement is shown (including showing
none). No navigation cell is live: the activation matrix still lists wide cells only, so
the policy returns `leftStrip` or `hidden` and nothing else can appear.

## Authority

`src/widgets/AppNavigation/` owns all three arrangements plus the account and cart
controls. `src/app/AppShell.tsx` mounts it exactly once and hands it the policy's
navigation value; the shell no longer branches on that value, and hiding is decided in
one place.

## What changed

`widgets/LeftStrip` was named after a position, not a role, and cross-widget imports are
banned — so a second widget could not have reused the account and cart controls. The
folder is renamed `widgets/AppNavigation` (`git mv`, history preserved) and its component
takes the policy's navigation value as a prop. `UserControl` and `CartControl` moved
byte-for-byte.

Arrangements, all the same floating chrome pill and the same 44px touch-sized controls,
differing only in corner and direction:

| Presentation | Band | Placement |
|---|---|---|
| `leftStrip` | wide | top-left, buttons stacked vertically — unchanged |
| `topBar` | compact (phone portrait) | top-right, buttons in a row |
| `compactBar` | constrained (incl. landscape phone) | top-left, buttons in a row |

Pinned by user requirements 2026-07-27: the phone keeps the floating pill rather than
gaining a full-width bar, so the map stays visible behind it and the top-left stays free
for a back control. `compactBar` deliberately stays at the top-left instead of mirroring
the phone's corner: in that band the drawer occupies the inline end and floating chrome
paints above the drawer, so a right-pinned pill would sit on top of the side sheet.

Edge offsets are now safe-area aware. This is a no-op on desktop, where
`env(safe-area-inset-*)` resolves to `0px`.

## Changed files

- Renamed: `src/widgets/LeftStrip/` → `src/widgets/AppNavigation/` (component, stylesheet,
  test, and index rewritten; `UserControl`/`CartControl` and their tests moved unchanged)
- Modified: `src/app/AppShell.tsx`, `src/app/AppShell.test.tsx`,
  `scripts/check-style-boundaries.mjs`

## Focused verification

- `AppNavigation.test.tsx`: a case per presentation proves both destinations are reachable
  and the cart control renders exactly once — same controls, no duplicated authority — plus
  a case proving `hidden` renders neither. The two pre-existing cart-visibility cases are
  kept. No class-name or CSS-declaration assertions: placement is appearance and is
  verified when M02 mounts these cells.
- `AppShell.test.tsx`: navigation is still absent throughout the add-spot flow and on
  full-page overlay routes.
- `appShellPresentation.test.tsx` passes untouched (38 tests) — the evidence that no cell
  was activated. `git diff` on the activation matrix is empty.
- New static rules, same change: `app-navigation-is-mounted-once-by-the-shell` (only
  `AppShell` and the widget itself may name `AppNavigation`) and
  `no-legacy-navigation-placement-vocabulary` (the retired `LeftStrip` name cannot return).
  Both verified to fire against probe files, which were then deleted. The navigation
  stylesheet's required-token entry now also demands the safe-area tokens.

## Project gates

All five green: `tsc --noEmit`, `tsc -p tsconfig.server.json --noEmit`, `npm run lint`,
`npm run check:style-boundaries`, `vitest run --project client --project server`
(111 files, 639 tests).

## Removed concepts

The `LeftStrip` module and name, and the shell-side `navigation === 'leftStrip'`
conditional — statically banned from returning.

## Note for M02

Activating a compact cell now switches navigation and drawer together, because both come
from the same policy value and the widget already handles every arrangement. Appearance of
the two new arrangements has never been seen in a browser; M02 is the first task where a
user checklist can judge them.

## Unrelated working-tree changes preserved

Yes — the user's in-progress changes to `src/features/PublicGallery/PublicGallery.tsx` and
`src/shared/ui/DrawerShell/panelSettledWidth.ts` were not touched and are not in this
commit.

## Next ready task

**M02 — Implement mobile browse presentations** — the first task at which anything mobile
becomes visible. Depends on M00, M00b, M01, F12, F12e, all complete.
