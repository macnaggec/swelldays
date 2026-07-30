# Responsive layout M02-e handoff

Task completed: M02-e — Fix: keep portrait Map search results above the map

Invariant: In portrait Map mode, the one existing spot-search result surface remains
fully inside the viewport, keyboard-reachable, hit-testable, scrollable when tall,
and selectable at every browse-sheet snap. Selecting a result preserves the existing
spot navigation and raises or retains the sheet at half height.

Authority: `SpotSearch` remains the sole search input/result owner. Mantine's
Combobox portal owns the result surface's escape from the intentionally clipped
DrawerShell substrate, and its autosizing ScrollArea owns long-result overflow.
SidePanel's one direction signal ignores explicitly isolated nested scrollers while
continuing to own Feed/Gallery content travel. The route still owns the resulting
spot selection and sheet transition.

Changed files: `src/features/SpotSearch/SpotSearch.tsx` restores the Combobox portal.
`src/app/routes/-_panel.test.tsx` renders the real search inside the real compact
panel route and covers focus, typing, portal containment, keyboard selection,
navigation, and the sheet transition. The tall-list correction adds a viewport-bound
result scroller in `SpotSearch`; `src/widgets/SidePanel/SidePanel.tsx` ignores that
isolated scroller for panel chrome direction, and its focused test owns the contract.
The active roadmap records completion.

Focused verification: The route-level test was RED because the result option was a
descendant of the peek sheet, then passed after the one-line portal correction.
The tall-list correction's SidePanel test was RED because an isolated result scroll
hid the search chrome, then passed after the direction-owner guard.
`npx vitest run --project client src/widgets/SidePanel/SidePanel.test.tsx
src/app/routes/-_panel.test.tsx` passed 67 tests.

DOM verification: At a 390×844 viewport, the peek drawer occupied the 84px bottom
strip and retained `overflow: hidden` at z-index 200. The dropdown was attached to
Mantine's shared portal under `body`, remained fully inside the viewport above the
search input, and used the existing z-index 300 overlay layer. At the 17px region
where dropdown and drawer bounds overlap, `elementFromPoint` resolved to the Bingin
option, not the drawer. ArrowDown/Enter navigated to the selected spot and changed
the drawer snap from `peek` to `half`.

At the reported 350×756 half-sheet state, eight results previously produced a 617px
dropdown whose top was −93px and whose list had no scroll range. The corrected
dropdown measured 362px from y=162 to y=524; its internal viewport measured 352px
with 627px of scroll content. Eight ArrowDown presses scrolled 275.5px, kept the
search chrome visible, placed the final Uluwatu option wholly inside the viewport,
and Enter selected it while retaining the `half` snap.

Project gates: `npx tsc --noEmit` passed; `npx tsc -p tsconfig.server.json --noEmit`
passed; `npm run lint` passed; `npm run check:style-boundaries` passed;
`npx vitest run --project client --project server` passed (114 files, 702 tests).

Removed concepts: The result surface's forced in-place rendering inside the clipped
sheet, its unbounded natural-height list, and the assumption that every nested
scroller represents panel-content travel. No search state, input, route lifecycle,
z-index token, or shell state was added.

Unrelated working-tree changes preserved: Yes. The pre-existing responsive-roadmap
audit and the M03-b through M03-g implementation changes remain unstaged and
unmodified except for this task's isolated files and roadmap completion hunk.

Next ready task: M02-f — Fix: stabilize landscape search chrome with one-card
content.
