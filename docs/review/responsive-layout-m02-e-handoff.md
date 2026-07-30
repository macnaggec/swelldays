# Responsive layout M02-e handoff

Task completed: M02-e — Fix: keep portrait Map search results above the map

Invariant: In portrait Map mode, the one existing spot-search result surface remains
visible, keyboard-reachable, hit-testable, and selectable while the browse sheet is
parked at peek. Selecting a result preserves the existing spot navigation and raises
the sheet to half height.

Authority: `SpotSearch` remains the sole search input/result owner. Mantine's
Combobox portal owns the result surface's escape from the intentionally clipped
DrawerShell substrate; the route still owns the resulting spot selection and sheet
transition.

Changed files: `src/features/SpotSearch/SpotSearch.tsx` restores the Combobox portal.
`src/app/routes/-_panel.test.tsx` renders the real search inside the real compact
panel route and covers focus, typing, portal containment, keyboard selection,
navigation, and the sheet transition. The active roadmap records completion.

Focused verification: The route-level test was RED because the result option was a
descendant of the peek sheet, then passed after the one-line portal correction.
`npx vitest run --project client src/app/routes/-_panel.test.tsx` passed 56 tests.

DOM verification: At a 390×844 viewport, the peek drawer occupied the 84px bottom
strip and retained `overflow: hidden` at z-index 200. The dropdown was attached to
Mantine's shared portal under `body`, remained fully inside the viewport above the
search input, and used the existing z-index 300 overlay layer. At the 17px region
where dropdown and drawer bounds overlap, `elementFromPoint` resolved to the Bingin
option, not the drawer. ArrowDown/Enter navigated to the selected spot and changed
the drawer snap from `peek` to `half`.

Project gates: `npx tsc --noEmit` passed; `npx tsc -p tsconfig.server.json --noEmit`
passed; `npm run lint` passed; `npm run check:style-boundaries` passed;
`npx vitest run --project client --project server` passed (114 files, 701 tests).

Removed concepts: The result surface's forced in-place rendering inside the clipped
sheet. No search state, input, route lifecycle, z-index token, or shell state was
added.

Unrelated working-tree changes preserved: Yes. The pre-existing responsive-roadmap
audit and the M03-b through M03-g implementation changes remain unstaged and
unmodified except for this task's isolated files and roadmap completion hunk.

Next ready task: M02-f — Fix: stabilize landscape search chrome with one-card
content.
