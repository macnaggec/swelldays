# Responsive layout M03-d handoff (partial — server/model layer only)

Task in progress: M03-d — Decide calendar-day semantics; establish the compact
index and direct day location. This handoff covers the slice committed now;
the roadmap checkbox stays unchecked until the remainder (below) lands too.

## Calendar-day semantics decision

Resolved without a schema migration or per-spot timezone data. `capturedAt`'s
UTC-labeled `Date` fields already hold the camera's local wall-clock time at
the moment of capture — `shared/lib/exifExtractor.ts`'s `toCameraLocalAsUTC`
deliberately encodes it that way so the value survives JSON serialization
without corruption. Since the photographer's camera is physically at the surf
spot, that encoded day already **is** the spot's local day; no lookup from
coordinates to an IANA timezone is needed. The only defect was reading it back
through the *viewer's own browser* timezone (`toLocaleDateString(undefined,
...)` with no `timeZone` option) instead of treating it as UTC-literal, which
could show a different calendar day than the one the photo was taken on
depending on the viewer's offset.

Fix: `shared/lib/dateUtils.ts`'s `getVisibleCalendarDayKey` now passes
`timeZone: 'UTC'`, and a new `formatCapturedAtDate` helper does the same for
full display strings. Both are documented inline with the reasoning above so
a future reader doesn't reintroduce the bug. Fixed at every capturedAt display
site within reach of this slice: `PublicCard.tsx`, `MediaLightbox.tsx`, and
the default divider label in `VirtualGallery.tsx` (that one rides along
uncommitted with the rest of VirtualGallery's changes — see below). Left
alone: `shared/model/browseFilters.ts`'s `today`/`yesterday`/`last7` quick
filters, which are a viewer-relative "what day is it for me right now"
concept — a different question from the photo's own encoded capture day, and
not something this task asked to change.

## Compact per-day index

`MediaRepository.findPublishedDates` returned every matching media timestamp
before (the task's own "current index returns every timestamp" complaint).
It now de-duplicates to one `Date` per distinct calendar day, keeping the
first-encountered row in the requested sort order (so descending keeps the
*latest* timestamp of a day, not the earliest — covered by a test). Considered
and rejected: a raw-SQL `GROUP BY date_trunc('day', captured_at)` query. The
repository already projects only the `capturedAt` column (no joins, no full
rows), so at this app's real data volume the JS-side dedupe is proportionate;
raw SQL was deferred rather than introduced speculatively, consistent with the
audit's own L2 deferred-mechanism entry (materialize only once a measured p95
justifies it).

## Direct day-jump, no fetch-through loop

`findPublishedBySpot` gained an `anchorCapturedAt` filter, consulted only when
no `cursor` is present (a cursor already fully determines position; re-applying
the anchor on every subsequent page would wrongly cap how far back toward the
present a later `fetchPreviousPage` could reach). `useSpotMediaFeed` exposes
this as `jumpAnchor?: Date` — part of the query's own input, so changing it is
a fresh, separately-cached query key, and jumping to a distant day costs
exactly one request instead of the old loop that walked `fetchNextPage` until
the target day appeared.

## True bidirectional pagination

New: `beforeMediaCursorWhere` (the mirror of M03-c's `afterMediaCursorWhere`),
`findPublishedBySpotBefore` (fetches items newer than a cursor by querying in
reverse-sorted order then reversing the result back to display order), and a
`prevCursor` field on `SpotMediaPage`/`PublicMediaPage` alongside the existing
`nextCursor`. `prevCursor` is computed cheaply (from the page's own first item)
whenever a `cursor` or `anchorCapturedAt` was supplied — never wrong, since
having continued from *somewhere* proves something exists before this page;
the one case that needs to be exact (a completely unfiltered, un-anchored
first fetch) is naturally `null` since nothing can precede the true start.
`useSpotMediaFeed` wires `getPreviousPageParam` so `fetchPreviousPage`/
`hasPreviousPage`/`isFetchingPreviousPage` fall out of TanStack Query's
existing bidirectional infinite-query support — no bespoke query layer.

Repository integration tests prove: walking backward from the oldest page
reconstructs the full set with no skip/duplicate even across tied
`capturedAt` values; chaining after→before reconstructs the exact original
page and its seam continues correctly the other way; and fetching before the
newest item returns an empty page with both cursors null.

## Changed files (this commit)

- `src/shared/lib/dateUtils.ts` — `getVisibleCalendarDayKey` UTC fix,
  new `formatCapturedAtDate`.
- `src/shared/types/media.ts` — `PublicMediaPage.prevCursor`.
- `src/server/repositories/MediaRepository.ts` — `beforeMediaCursorWhere`,
  `anchorMediaWhere`, `findPublishedBySpotBefore`, `anchorCapturedAt` support
  in `findPublishedBySpot`, de-duplicated `findPublishedDates`.
- `src/server/repositories/MediaRepository.integration.test.ts` — new
  `findPublishedBySpotBefore` describe block (3 tests) plus a dedup case
  added to the existing `findPublishedDates` test.
- `src/server/routes/spots.ts` — `mediaFeed` gains `direction`/
  `anchorCapturedAt` input, routes to `findPublishedBySpotBefore` when
  `direction === 'backward'` (the value TanStack's bidirectional infinite
  query sends for `fetchPreviousPage`).
- `src/server/services/MediaService.ts` — `findPublishedBySpotBefore`
  passthrough mirroring `findPublishedBySpot`.
- `src/entities/Spot/model/useSpotMediaFeed.ts` — `jumpAnchor` param,
  `getPreviousPageParam`.
- `src/features/PublicGallery/ui/cards/PublicCard.tsx`,
  `src/features/PublicGallery/ui/MediaLightbox.tsx` — capturedAt display
  fixed to `formatCapturedAtDate`.
- Corresponding `*.test.ts`/`*.test.tsx` updates for all of the above.

## Focused verification

Repository integration suite: 15/15 pass (`MediaRepository.integration.test.ts`).
`useSpotMediaFeed.test.tsx`: 2/2 pass, including a new test proving
`jumpAnchor` reaches the query as `anchorCapturedAt`.

## Project gates

All five gates plus the full Postgres integration suite pass against this
commit's exact file set, verified in isolation (working tree temporarily
reverted to HEAD for every file *not* in this commit, to prove no hidden
dependency on the still-uncommitted remainder): 114 files/701 tests (client +
server), 10 files/48 tests (integration).

## Commit-hygiene note

Same pattern as M03-b/M03-c: the working tree carries substantial unrelated,
uncommitted M03-f/g/h progress (the shared `GalleryDateMonthList` control, the
`PanelLayoutStickyChromeReplacement` chrome-swap slot, and more). Unlike
M03-c, this task's own UI-layer pieces (`galleryDateHighlights.ts`'s
`mergeGalleryDateHighlights`, `PublicGallery.tsx`'s jump-anchor wiring,
`VirtualGallery.tsx`'s bidirectional-scroll support) turned out **not** to be
cleanly separable from that M03-f/g/h scaffolding: `GalleryDateHighlight`'s
`rowIndex` type went from `number` to `number | null` as part of this task,
and every consumer of that type (`GalleryDateJumpHeading.tsx`,
`GalleryDateSidebar.tsx`, the new `GalleryDateMonthList.tsx`) was already
mid-rewrite for M03-f/h in the same working tree — reverting just this task's
files to HEAD while leaving those consumers at their current WIP shape does
not compile. Rather than hand-reconstruct a merge across five entangled files
(real risk of introducing a mistake for a bookkeeping-only benefit), this
commit captures only the genuinely independent server/model/hook layer and
one small display fix each in `PublicCard.tsx`/`MediaLightbox.tsx`. The
remainder stays uncommitted, exactly as before, still passing all gates in
the combined working tree.

Next ready task: finish committing M03-d's remainder (or fold it into
whichever of M03-e/M03-f/M03-g/M03-h next produces an approved, committable
slice touching the same files), then M03-e.
