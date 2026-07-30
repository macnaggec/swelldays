# Responsive layout M03-c handoff

Task completed: M03-c — Make public-media pagination total

Invariant: Media sharing an identical `capturedAt` is neither skipped nor
duplicated across pages of the public gallery feed, in both ascending and
descending traversal. `MediaRepository.findPublishedBySpot` owns this by
ordering on `[{ capturedAt: sortOrder }, { id: 'asc' }]` and, when a cursor is
present, filtering with an explicit `(capturedAt, id)` tuple comparison
(`capturedAt` strictly past the cursor in `sortOrder`, OR equal `capturedAt`
with `id` greater) built by hand rather than Prisma's `cursor`/`skip` option.

Root cause, verified by direct inspection: I instantiated a throwaway
`PrismaClient` with query-event logging against the test database and printed
the exact SQL Prisma generated for `cursor: { id }` combined with
`orderBy: { capturedAt }`. It compiles to
`WHERE captured_at <= (SELECT captured_at FROM media_items WHERE id = $cursor) ORDER BY captured_at DESC OFFSET 1`.
This is only correct if Postgres returns every row tied on `capturedAt` in the
same physical order on both the query that produced the cursor and the query
that consumes it — true for a small, static, unchanging table in a single
Postgres session (which is why a naive integration test passes against the
old code too), but not something the SQL standard or Postgres guarantees
across separate query executions, different scan plans, concurrent writes, or
autovacuum. The fix removes reliance on that incidental ordering entirely by
comparing the tuple explicitly.

Changed files:
- `src/server/repositories/MediaRepository.ts` — added `MediaCursor`,
  `encodeMediaCursor`/`decodeMediaCursor` (base64url of a `[capturedAt ISO
  string, id]` pair), and `afterMediaCursorWhere`; `findPublishedBySpot` now
  builds its `orderBy` and cursor `WHERE` from these instead of Prisma's
  built-in cursor/skip.
- `src/server/routes/spots.ts` — `mediaFeed`'s input schema changed
  `cursor: z.string().uuid()` to `z.string()`, since the cursor is no longer a
  raw `MediaItem.id`.
- `src/server/repositories/MediaRepository.integration.test.ts` — added
  "paginates media sharing an identical capturedAt without skipping or
  duplicating, in both directions": creates 5 media rows with one shared
  `capturedAt`, walks every page at `limit: 2` in both `desc` and `asc`, and
  asserts the collected ids equal the created set exactly once each.

No client code changes: the cursor stays an opaque string end to end
(`useSpotMediaFeed.ts` already forwards `lastPage.nextCursor` without
inspecting it), so nothing downstream needed updating.

Focused verification: `MediaRepository.integration.test.ts` — 12/12 pass,
including the new tied-timestamp test in isolation and combined with the
existing sort/pagination/filter tests.

Project gates: all five passed (`tsc` client, `tsc` server, lint,
check:style-boundaries, vitest client+server — 114 files, 698 tests), plus the
full Postgres integration suite (10 files, 44 tests), verified against a
tree containing only this task's three files changed.

Commit-hygiene note: the working tree already carried unrelated, uncommitted
M03-d/f/g/h progress touching two of these same three files (a partial
compact date-index feature). Per the pattern the M03-b handoff established,
I stashed the full working tree (`git stash push -u`), reapplied only this
task's exact edits against clean `HEAD`, verified all five gates plus the
integration suite green in that isolated state, and committed it. The stash
is then restored on top, unchanged, so the M03-d/f/g/h work continues exactly
where it was.

Unrelated working-tree changes preserved: yes — the pre-existing M03-d/f/g/h
partial implementation (spanning `PublicGallery.tsx`, `GalleryDateJumpHeading`,
the new `GalleryDateMonthList` component, `PanelLayout`'s chrome-replacement
slot, `VirtualGallery`, `SidePanel`, `BaseCard`, and others) is restored
uncommitted on top of this commit, exactly as it was before this task started.

Next ready task: M03-d — Decide calendar-day semantics; build the compact
index and direct locator. Calendar-day semantics were decided during this
session: **surf-spot-local** (each `Spot` gets a timezone; requires an
additive migration, since no spot has timezone data today).
