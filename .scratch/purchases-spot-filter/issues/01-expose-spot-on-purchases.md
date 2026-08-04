# Add a spot filter to the Purchases tab in My Collections

Status: ready-for-agent

## Reported

Manual mobile testing, 2026-08-03. The Uploads and Favorites tabs in My
Collections (`/me/collections`) both let a photographer/buyer filter their
items down to one spot via a dropdown in `CollectionsToolbar`. Purchases
does not — it's the only one of the three collection tabs missing it.

## Root cause

`CollectionsToolbar`'s spot filter is gated on `activeTab` in
[`src/features/Collections/ui/CollectionsToolbar.tsx`](../../../src/features/Collections/ui/CollectionsToolbar.tsx)
and only renders for `uploads`/`favorites`. That's a symptom, not the real
gap: Purchases' own read path never carries spot data to the client at all,
so there is nothing to filter by yet.

Traced the full chain:

- `src/app/routes/_panel.me.collections.purchases.tsx` fetches
  `trpc.checkout.myPurchases`.
- `src/server/routes/checkout.ts` → `CheckoutService.getPurchases(userId)`.
- `src/server/services/CheckoutService.ts` returns a hand-typed DTO —
  `{ id, purchasedAt, amountPaid, previewUrl, mediaItem: { id, thumbnailUrl } }`
  — no spot field.
- `src/server/repositories/PurchaseRepository.ts` — `PurchaseWithMedia`
  type and `PURCHASE_WITH_MEDIA_SELECT` select only
  `mediaItem: { id, type, cloudinaryPublicId, thumbnailUrl }`. `spotId`/
  `spot` are not selected from Prisma anywhere in this repository
  (`findByBuyer`, `findByBuyerAndMedia`, `findByDownloadToken`,
  `findByIdAndOrder`).
- `src/features/Purchases/ui/PurchaseCard.tsx` — `PurchaseCardItem` is
  typed to match that narrow DTO; no spot data reaches the UI layer.

The data itself already exists and is reachable — no schema/migration
needed: `prisma/schema.prisma` has `MediaItem.spotId` (optional `String?`)
and the `MediaItem.spot` relation, and `Purchase.mediaItem` already relates
to `MediaItem`. It's just never selected/passed through on this specific
read path.

By contrast, Favorites already carries `spotId`/`spot` end-to-end
(`MediaFavoriteRepository.ts` selects `spot: { select: { id, name } }` and
maps it through) — that's why Favorites could get the same filter added as
a same-session UI-only fix, while Purchases could not.

## Before implementing

`CheckoutService.getPurchases`'s narrow return type has a comment about
deliberately stripping `cloudinaryPublicId` before it reaches the client —
that comment is about a different field, not spot data, but it's worth a
second look before widening the DTO: confirm there's no privacy/business
reason purchases intentionally omit spot attribution (e.g. anonymizing
where a buyer bought media from) before wiring it through.

## Scope if approved

1. `PurchaseRepository.ts`: add `spotId`/`spot: { select: { id, name } }`
   to `PURCHASE_WITH_MEDIA_SELECT`'s `mediaItem` select; extend
   `PurchaseWithMedia`'s type accordingly.
2. `CheckoutService.ts`: extend `getPurchases`'s mapped return shape to
   include `spotId`/`spot`.
3. `PurchaseCard.tsx` / `PurchaseCardItem`: extend the type to match.
4. `_panel.me.collections.tsx`: compute `purchaseSpotOptions` the same way
   `uploadSpotOptions`/`favoriteSpotOptions` already are, and filter
   purchases by the shared `spotFilter` state (mirrors the pattern just
   added for Favorites).
5. `CollectionsToolbar.tsx`: extend the render gate to include
   `'purchases'`.

This is a small, well-scoped change once the "before implementing" check
above is resolved — not a schema change, just widening one query/DTO and
reusing the filter-wiring pattern already established for Uploads and
Favorites.

## Not in scope

This ticket is unrelated to `docs/roadmaps/responsive-layout-foundation.md`
(no viewport/pointer/motion concern) — filed here rather than added to that
roadmap.
