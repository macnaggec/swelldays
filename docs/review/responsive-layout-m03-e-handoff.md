# Responsive layout M03-e handoff

Task completed: M03-e — Complete the public-media projection lifecycle

Invariant: Every app-owned mutation that can change what the public gallery
feed or its date-jump menu shows now refreshes both together in the current
`QueryClient`. `entities/Media/model/useMediaPublicProjectionInvalidation.ts`
is the one place that names both query families:

```ts
export function useMediaPublicProjectionInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useCallback(async function invalidateMediaPublicProjection() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.spots.mediaFeed.pathFilter()),
      queryClient.invalidateQueries(trpc.spots.mediaDateIndex.pathFilter()),
    ]);
  }, [queryClient, trpc]);
}
```

`pathFilter()` matches every cached variant of a query by path prefix — any
`spotId`, `cursor`, `direction`, or `favoriteSpotsOnly` combination — in one
call, so a mutation doesn't need to know which exact variant a viewer
currently has open. This mirrors the existing `useSessionLifecycleInvalidation`
(S7) hook's shape exactly, composed by callers rather than duplicating query
lists inline.

## Composed into every existing mutation that can affect the public projection

- **Publish** — `usePublishUploadSession.ts`'s `saveWorkspace` success handler.
- **Un-publish for edit** — `usePublishedSession.ts`'s `useStartSessionEdit`
  (reopening a published session for editing pulls its media back out of the
  public view).
- **Retire** — `usePublishedSession.ts`'s `useRetireSurfSession`.
- **Delete** — `useDeleteMedia.ts` (the server soft-deletes when the item was
  published; invalidating when it wasn't is a harmless no-op refetch).
- **Favorite-spot toggle** — `useFavoriteSpot.ts` already invalidated
  `spots.mediaFeed` alone; it was missing `spots.mediaDateIndex`, so a
  favorites-only date-jump menu could show a day whose only photo just
  dropped out of (or into) the favorited set. Now invalidates both.

## Explicitly not wired: capture-date edit and spot reassignment

The task names these as mutations to compose the helper into, but neither has
a client mutation hook today. `MediaService.updatePublishedBatch` (accepts
`price`/`capturedAt` for published media) exists server-side but no client
code calls it. `MediaService.updateBatch` is draft-only (throws if any item
isn't a draft) and doesn't carry `spotId` through on the published path
regardless. There is currently no way for a photographer to edit a published
item's capture date or reassign its spot from the UI — so there is nothing to
compose the invalidation into yet. The helper is ready the moment those flows
are built; this is not a gap in this task, just an honest note that the
mutation itself doesn't exist.

## Changed files

- `src/entities/Media/model/useMediaPublicProjectionInvalidation.ts` (new)
  and its test.
- `src/entities/Media/index.ts` — barrel export.
- `src/features/Upload/model/usePublishUploadSession.ts`,
  `src/entities/SurfSession/model/usePublishedSession.ts`,
  `src/entities/Media/model/useDeleteMedia.ts`,
  `src/entities/Spot/model/useFavoriteSpot.ts` — composed the new
  invalidation into each `onSuccess`.
- Corresponding `*.test.ts`/`*.test.tsx` updates: each mutation hook's mock
  `trpc` object gained `spots.mediaFeed`/`spots.mediaDateIndex` `pathFilter`
  stubs, and each test asserts the new invalidation fires.

Focused verification: `useMediaPublicProjectionInvalidation.test.tsx` proves
the query-family contract (both keys invalidated, an unrelated key stays
fresh) in isolation, mirroring `useSessionLifecycleInvalidation.test.tsx`'s
own style. All four composing hooks' existing test suites pass with the new
assertions (14 tests total across the four files).

Project gates: all five passed (116 files, 716 tests — 1 new file, 1 new
test), plus the full Postgres integration suite (10 files, 48 tests,
unchanged — this task touches no repository code).

Commit-hygiene note: unlike M03-d, this task's files are entirely
independent of the still-uncommitted M03-f/g/h scaffolding — none of the ten
changed/new files here are shared with that tangle, so this commit captures
M03-e in full.

Next ready task: M03-f — implement the approved one-sequence mobile date
control. Its own text requires announcing the visible correction and waiting
for explicit approval before implementing — not yet done.
