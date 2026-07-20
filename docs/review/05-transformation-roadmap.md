# 05 — Transformation Roadmap

## Executive summary

- **Current state (verified 2026-07-20):** pre-launch solo-built marketplace, ~33.5k TypeScript LOC. The roadmap baseline through S7 passes all five mandatory gates locally (99 test files, 472/472 tests), and CI runs the full quality suite.
- **Completed risk reduction:** the in-flight refactor is landed; gates and CI are operational; upload cleanup is scheduled with the destructive-boundary inverse test; the ledger invariant and single money write path are enforced; the media contract lineage, public storage-id exclusion, and session lifecycle cache ownership are complete.
- **Top current risks:** paid-but-unfulfilled orders remain invisible until L1 adds alerting/replay; the dev database has unresolved migration-history drift; signed-out carts are persisted locally but cleared on reload even though users may build a cart before authenticating; S4's server dependency inconsistency remains but is not launch-critical.
- **Direction:** the roadmap has reached its stop-line, and the cheap product-truth decisions (S6 and Q4) plus opportunistic S7 are complete. Prefer product work unless the product backlog makes S4 immediately relevant. Keep S5 and L1–L6 deferred behind their documented triggers.
- **Next action:** leave the architecture roadmap at its stop-line and choose the next product outcome; do not start S4 merely because it is the next unchecked row.
- **Stop-line:** reached after S2+S3; do not start S4/S5 by default. Validated adversarially in `06-roadmap-validation.md`; verdicts below are reconciled.

---

**Confirmed constraints:** pre-launch, no users; solo developer, staying solo; no fixed launch date. Therefore: optimize for **low future refactoring**; serial, aggressive restructuring is acceptable; "minimize disruption" carries no weight; operational mechanisms defer behind seams with named triggers. The dominant pre-launch risk is *never launching* — hence the explicit stop-line after S2.

Reversibility classification per initiative: **[retrofit-expensive]** = do now; **[seam-deferred]** = seam exists, mechanism waits for its trigger.

Execution order = the order listed. T0 is a prerequisite for everything.

---

## T0 — Stabilize the base (prerequisite)

### T0.1 Land the in-flight refactor `[retrofit-expensive]` — effort S-M — verdict: yes
The working tree has 286 dirty paths (~6.9k+/7.6k− — the `me/collections` consolidation). Roadmap work cannot start on an uncommitted pile. The refactor also introduced ~11 genuine type-drift errors in test files (`uploadQueuePolicy.test.ts` — `"draft"` removed from the `GalleryCard` union; `GlobeScene.test.tsx` — missing new props); they land with this initiative, not Q1.
- **Benefit:** clean base; every later item gets an honest diff. **Risk:** low. **Depends on:** nothing.
- **Done when:** `git status --porcelain` is empty on `main` (2–4 coherent commits is fine — don't gold-plate the split); `npx vitest run --project client --project server` passes at the landing commit; the ~11 refactor-caused type errors are fixed.

## Quick wins

### Q1 Make all four gates green `[retrofit-expensive]` — effort S — verdict: yes
Wire jest-dom matcher types into the tsconfig the test files resolve (`vitest.d.ts` imports jest-dom but `tsconfig.json` `types`/`include` never sees it) — clears ~171 tsc errors; fix the 8 `no-explicit-any` lint errors and 5 style-boundary findings; the 2 real `PublicGallery.tsx` errors may take an interim cast documented as debt paid by S2.
- **Benefit:** real errors stop hiding in noise (R4). **Risk:** low. **Depends on:** T0.1.
- **Done when:** `npx tsc --noEmit`, `npx tsc -p tsconfig.server.json --noEmit`, `npm run lint`, `npm run check:style-boundaries`, and `npx vitest run --project client --project server` all exit 0.

### Q2 CI pipeline `[retrofit-expensive]` — effort S — verdict: yes
GitHub Actions (or equivalent) running the five commands above on every push. Workflow only — no badge polish; integration tests optional initially (include if the Postgres service container is cheap).
- **Benefit:** the enforced-architecture advantage stops decaying (R4) — the repo's own red gates prove the human doesn't run them by hand. **Risk:** none. **Depends on:** Q1.
- **Done when:** a workflow file exists and the latest run on main is green.

### Q3 Schedule the upload reconciler `[retrofit-expensive]` — effort S — verdict: yes
Call `reconcileUploadAttempts` from server startup on an interval (single instance — in-process timer is proportionate). The job **deletes Cloudinary assets**, so two tests are required: stale attempts/assets are drained, and — the important one — **an active/in-window attempt is NOT reclaimed** (a boundary bug would silently destroy in-flight uploads every run).
- **Benefit:** closes D9/R5; cleanup states stop being dead ends. **Risk:** low-medium (destructive job; mitigated by the inverse test). **Depends on:** T0.1.
- **Done when:** grep shows a production caller; both tests exist; a manually seeded stale attempt is cleaned on a dev run while an active one survives.

### Q4 True-up `docs/requirements.md` — effort S — verdict: partial
The value is the payments section: Lemon Squeezy → CryptoCloud (`requirements.md:262`). Also mark virus scan + daily cap as "not implemented — pre-launch checklist (L1)" and record the S6 decision. Timebox the rest to 30 minutes — full doc polish waits for L1's trigger.
- **Benefit:** the stated product truth stops misleading on payments (D10). **Risk:** none. **Depends on:** S6 decision for the Drive entry.
- **Done when:** the payments section names the real provider; unimplemented safeguards carry a "deferred" marker.

## High-leverage refactors

### S1 Ledger invariant, then single money write path `[retrofit-expensive]` — split by the validation review
**S1a — invariant + fulfillment tests first (effort S) — verdict: yes.** Add the integration-test invariant `balance == Σ amount over transactions in {COMPLETED, PENDING}` — *not* COMPLETED-only: `reservePayout` decrements balance while creating the PAYOUT transaction as PENDING with a negative amount (`LedgerRepository.ts:72-98`); SALEs are created COMPLETED (`FulfillmentRepository.ts:55-61`). Cover sale, payout request, payout rejection. Add the missing fulfillment integration test and a callable reconciliation script/admin check. This is the single highest-value artifact in the plan — it guards money regardless of whether S1b ever runs.
**S1b — consolidate the write path (effort M) — verdict: yes.** Move the balance increment out of `FulfillmentRepository` so all `User.balance` mutations go through the Ledger domain's one path (same DB transaction). Both current writers are individually atomic and correct today — the risk is future drift, which is why the test lands first as the refactor's safety net.
- **Depends on:** Q1/Q2 (green gates); S1a strictly before S1b.
- **Done when:** invariant + fulfillment tests exist and pass (S1a); balance *mutations* exist in exactly one module — grep for mutations, not the word "balance", which also matches reads (S1b).

### S2 Collapse the media contract lineage `[retrofit-expensive]` — effort M — verdict: yes
Replace the six shapes in `shared/types/media.ts` with one core + named projections (draft: nullable price; published: non-null price + spot; public: published minus internal fields + entitlement). Update mappers/services to return the named projections. Properly fixes the two `PublicGallery.tsx` errors Q1 papered over. Effort verified: ~91 references across ~29 files, almost all mechanical, with tsc + 416 tests as the net.
- **Benefit:** ends D8/R7; publishing becomes a type-level event. **Risk:** medium-wide but mechanical; pre-launch = free disruption. **Depends on:** Q1.
- **Done when:** `shared/types/media.ts` exports one core lineage; no `as`-cast bridges remain at feed/favorite call sites; tsc green.

### S3 Exclude storage ids from public projections — effort S (inside S2) — verdict: partial
Downgraded by verification: uploads and delivery are `type: 'authenticated'` with `sign_url: true` (`providers/cloudinary.ts:19-20`, `CloudinaryService.ts:106,122`), so a leaked `cloudinaryPublicId` does **not** grant access to originals — this is information hygiene, not a security hole. Do the sliver only: the S2 `PublicMedia` projection excludes `cloudinaryPublicId` (keep it in photographer upload contracts); **grep client consumers first** — this is a client-visible contract change. CI grep guard dropped.
- **Depends on:** S2 (same files). **Risk:** low.
- **Done when:** a route test shows public feed responses contain no storage ids; client grep came back clean or consumers were updated; the Cloudinary verification result is recorded here: **verified 2026-07-14, authenticated + signed delivery.**

## Structural refactors

### S4 One server convention: routes → services only — effort M — verdict: partial
High-value sliver: flip the two lint rules (`server/routes/**` may not import `server/repositories/**`; `server/services/**` may not import `server/db`) and move the cross-domain reach (`routes/spots.ts` → `mediaRepository.findDraftsBySpot`) behind the Media service. Violation surface verified small: 4 repo imports across 3 route files. Low-value tail: pass-through CRUD ceremony — thin delegating services (or a documented exception list for pure CRUD) are acceptable; don't manufacture a fat `SpotService` just to satisfy the rule.
- **Benefit:** ends the two-conventions tax (D1); the layer contract becomes total. **Risk:** low-medium, mechanical. **Depends on:** Q2 (CI enforces the rules).
- **Done when:** both lint rules are active (exception list empty or documented) and `npm run lint` passes.

### S5 Extract UploadWorkspaceRepository — effort M — verdict: partial (conditional)
`UploadWorkspaceService` (499 lines) is the only service importing `server/db`. Its integration test already covers service+persistence together, so extraction is forced mainly by S4's lint rule. Do it only bundled with S4 if momentum is there; otherwise a single documented lint exception buys ~80% of the guard value at ~0% of the risk to the system's best-built flow. **Reactivation trigger:** the service needs unit tests the integration suite can't express, or a second service copies the inline-Prisma pattern.
- **Done when (if executed):** `UploadWorkspaceService` no longer imports `server/db`; existing integration tests pass unchanged.

### S6 Decide Google Drive import: real feature or dead weight — effort S (decide); removal may be M — verdict: yes (the decision)
At audit time it appeared in no requirement but was woven through 17 files plus schema fields (`DRIVE_PENDING`, `remoteFileId`). **Decision (2026-07-20): keep.** Google Drive import is a fully working supported feature; `docs/requirements.md` now records it as an upload source.
- **Done when:** requirements and code agree; no orphaned `DRIVE_*`/`remoteFileId` artifacts on the losing side.

### S7 Entity-owned cache invalidation helpers — effort S — verdict: yes
One `invalidateSessionLifecycle(...)` in the owning entity; `usePublishUploadSession`, `useStartSessionEdit`, `useRetireSurfSession` compose it. Duplication verified divergent (9 vs 6 vs 5 hand-copied invalidations across two files).
- **Benefit:** closes D3; the refresh list is written once. **Risk:** low. **Depends on:** T0.1.
- **Done when:** the three hooks share one helper; no hook hand-lists >2 domain-external invalidations.

### ~~S8 De-Cloudinary the port vocabulary~~ — verdict: no — moved to deferred
Pure vocabulary aesthetics behind a hypothetical provider swap; Cloudinary is load-bearing far beyond the port (named transforms, watermark pipeline, authenticated delivery, setup script), so a real swap rewrites the adapter anyway. See L6.

---

## ⛔ Stop-line (added by validation)

**After S2 (+S3 sliver), stop and deliberately re-decide "more structure vs product work."** The audit cannot see the product backlog; draining this list by default is not a decision. S4/S5/S7 may proceed opportunistically when those files are already being touched.

---

## Long-term evolution (deferred behind named triggers)

| Initiative | Seam that exists today | Trigger that reactivates it |
|---|---|---|
| L1 Pre-launch ops checklist: error tracker both runtimes, alert + manual replay for failed fulfillment, upload daily cap + content scanning, backup/restore story, deploy pipeline, full requirements true-up | logger call sites; idempotent `fulfillOrder` (replayable); `UploadService.beginLocal` (cap check slot); Prisma migrations | **A launch date is set.** Decision gate, not a euphemism — the roadmap is not "done" for launch until L1 is. |
| L2 Spatial index / geo tiling | `SpotRepository.findSpotsByBounds/Nearby` | Spot count > ~5k or bounds p95 > 200 ms |
| L3 Distributed rate limiting + broader limiter coverage | `createRateLimiter` interface | Second server instance (auth-endpoint coverage folds into L1) |
| L4 Server-side cart | cart isolated in `entities/Commerce/cartStore` | A real multi-device user request |
| L5 Automated payouts (Wise API) | `PayoutRequest` model + manual flow | Payout volume makes manual ops painful (requirements §4.7) |
| L6 Port vocabulary rename (ex-S8) | `server/ports/UploadAssetStorage.ts` | A second storage provider is actually evaluated, or a second port consumer appears |

## Working notes (verification session, 2026-07-15)

Findings from a live browser pass (signed-out + signed-in) and test audit that executors need but that predate any initiative landing:

- **T0.1 executor:** the working tree intentionally contains two NEW tests in `src/features/PublicGallery/ui/cards/PublicCard.test.tsx` ("PublicCard standard overlays" — normal-mode price badge, capture date, thumbnail src, Purchased badge). They are S2-prep characterization tests, all passing — keep them in the landed refactor, don't treat them as stray diff.
- **T0.1 manual verification already done:** all moved flows verified working in the dev app (me/collections tabs incl. entitlement badges, earnings, upload workspace resume, cart, auth guards); zero console/server errors. No regressions found — the only pre-commit work is the ~11 test-file type errors.
- **Q3 symptom observed live:** the dev photographer's active workspace shows a stale attempt stuck at "Preparing…" forever (transfer died with a prior browser session). Confirms both the reconciler gap and that manual cancel is the only current recovery.
- **S1a confirmed against real data:** dev ledger shows balance $0.00 with pending payout $29.00 — the invariant MUST be Σ{COMPLETED, PENDING}, as specified.
- **Dev-DB seed rot (cosmetic, not a bug):** purchase/favorite rows carry dead pre-rename URLs (`t_wave_atlas_*`, `wave-atlas/users/...`) from before the swelldays rename, so their thumbnails 404 in dev. Reseed if it annoys. Real lesson for L1: `Purchase.previewUrl` is denormalized at fulfillment — a production rename of Cloudinary transforms/folders would break purchased previews the same way.
- **Signed-out cart reload behavior (product decision, out of roadmap scope):** visitors can build a cart before authentication, but checkout opens the authentication modal. The Zustand store persists to local storage while `useCartSessionSync` clears it on every signed-out initial page load, so a pre-auth cart survives same-page sign-in but not a reload. Decide whether reload persistence is intended when this behavior enters the product backlog.
- **Responsive nits (cosmetic):** at narrow panel widths the collections segmented control wraps to two lines and the earnings copy wraps one word per line.
- **Agent gate discipline active:** AGENTS.md §0.4 and the machine-local CLAUDE.md encode stop-the-line + same-commit enforcement. The temporary bootstrap exception was removed when Q1 made all five gates green.

## Working notes (S1a session, 2026-07-19)

- **Pre-existing migration drift found and partially fixed:** commit `532927c` ("feat(schema): add media width/height fields") added `width`/`height` to `MediaItem` and `UploadWorkspaceAsset` in `prisma/schema.prisma` without ever generating a migration. The test DB (fresh, migration-only) lacked the columns entirely, breaking every `mediaItem.create()`/`uploadWorkspaceAsset.create()` call across ~9 pre-existing integration test files — invisible to the 5 blocking gates because none of them hit a real Postgres. Fixed by hand-authoring `prisma/migrations/20260719193000_add_media_dimensions/` and applying it to the test DB only.
- **Dev DB migration history is separately corrupted — NOT fixed, needs explicit decision:** `npx prisma migrate dev` against the dev DB (`surfdb`, localhost:5432) reports drift: the dev DB already has `width`/`height` and the `FORFEIT` enum variant (informally patched, likely via `prisma db push`, bypassing migration tracking), and two migration files (`20260623090957_add_upload_attempts`, `20260708190000_add_upload_workspaces`) were hand-modified after being marked applied. Prisma's own fix path is `prisma migrate reset`, which **drops all dev data** — refused, since the dev DB holds real seeded verification data (ledger balances, 63 media items, 3 users referenced in earlier working notes). Reconciling without data loss needs manual `prisma migrate resolve --applied` bookkeeping per migration — a separate, deliberate task, not a byproduct of S1a. The new `add_media_dimensions` migration is safe to apply to dev via `migrate deploy` (it only adds nullable columns dev already has, so `migrate resolve --applied 20260719193000_add_media_dimensions` is the correct next step, not a raw apply).
- **`resetDb.ts` gap found and fixed:** the shared integration-test helper (`src/test/helpers/resetDb.ts`) never deleted `SurfSession` rows (only auth `Session`). S1a's new tests were the first to combine `SurfSession` + `Order` fixtures through this shared helper, which surfaced it: leftover sessions blocked `user.deleteMany()`, silently rolling back the whole cleanup transaction (it's one `$transaction([...])` array) and leaking stale `Order`/`MediaItem` rows into the next test file. Fixed by inserting `prisma.surfSession.deleteMany()` between `mediaItem` and `spot` in the deletion order.

## Working notes (S1b session, 2026-07-19)

- **Third balance writer found and consolidated:** the audit counted two `User.balance` writers, but `UserRepository.anonymizeAndDelete` was a third — it zeroed the balance and hand-created the FORFEIT transaction during account deletion. S1b moved all three behind tx-scoped `LedgerRepository.recordSale`/`forfeitBalance` (callers pass their `Prisma.TransactionClient`, so multi-table commits stay atomic). Enforcement: `ledger-owns-money-writes` rule in `check-style-boundaries.mjs` fails on balance-mutation shapes or `transaction.create` in any non-test `src/server/**` file outside `LedgerRepository.ts` (verified to fire on a deliberate violation).

## Working notes (S7 session, 2026-07-20)

- **Session lifecycle refresh policy is entity-owned:** `useSessionLifecycleInvalidation` is the single interface for invalidating the seven session-derived projections (session collections/detail/media, published uploads, draft presence, and draft media). Publish retains only active-workspace invalidation; start-edit retains active-workspace and workspace-state invalidation; retire has no operation-specific invalidation. The `surf-session-owns-lifecycle-invalidation` style-boundary rule rejects direct session projection invalidations in those callers (verified to fire on a deliberate violation).

## Working notes (S2 session, 2026-07-19)

- **Lineage landed as `MediaCore` → `DraftMedia` / `PublishedMedia` / `PublicMedia` (+`PublicMediaPage`).** The full internal photographer shape is named `DraftMedia` (upload/own-media contract — the only projection carrying `cloudinaryPublicId`/`resource`); `PublicMedia` = `PublishedMedia` + `photographer` + `viewerEntitlement`. The three public endpoints (spot feed, session media, favorites) now return the identical `PublicMedia` shape — the feed previously leaked the full internal record and the endpoints disagreed on `photographer` presence. `AttributedPublishedMedia` (= `Omit<PublicMedia,'viewerEntitlement'>`) is the repo-layer pre-entitlement alias.
- **S3's field exclusion landed as a byproduct:** the public feed wire response verified in the dev app carries no `cloudinaryPublicId`/`sessionId`/`status`. S3's remaining artifacts (route test asserting the exclusion + recording) are still open — S3 stays ⬜.
- **Both Q1 debt casts paid:** the `as PublicSpotMediaItem` bridge in PublicGallery and the `FavoriteCandidate` Omit-and-patch bridge in useMediaFavorites are deleted; `toggleFavorite` takes `PublicMedia` directly.
- **Verified live (signed-out):** gallery feed renders, video cards show play glyphs from the new `type` field, lightbox plays a signed video (readyState 4), zero console errors. Signed-in surfaces (favorites tab, session detail) covered by tsc + unit tests only.
- **S3 closed (same session):** client grep clean — every remaining client `cloudinaryPublicId` reference is in photographer upload contracts (Upload feature + upload/uploadWorkspace shared types + `DraftMedia`), where S3 permits them. Regression test added to `MediaRepository.integration.test.ts` ("exposes no storage-internal fields on the public feed projection") running through the real `MediaService`; probe-verified to fail if the mapper is rewritten with a row spread.

## Status tracker

Status legend: ⬜ pending · 🚧 in progress · ✅ done · ⏸ deferred (needs its trigger or an explicit id to start).

| # | Initiative | Effort | Verdict (Phase 6) | Status |
|---|---|---|---|---|
| T0.1 | Land in-flight refactor (tests green at landing) | S-M | yes | ✅ |
| Q1 | All gates green | S | yes | ✅ |
| Q2 | CI pipeline (workflow only) | S | yes | ✅ |
| Q3 | Schedule reconciler + inverse test | S | yes | ✅ |
| Q4 | Requirements true-up (payments section) | S | partial | ✅ |
| S1a | Ledger invariant + fulfillment tests | S | yes | ✅ |
| S1b | Single money write path | M | yes | ✅ |
| S2 | Media contract lineage | M | yes | ✅ |
| S3 | Storage ids out of public projections (sliver) | S | partial | ✅ |
| ⛔ | **Stop-line: re-decide structure vs product** | — | added | ⬜ |
| S4 | Routes → services lint rules (sliver) | M | partial | ⬜ |
| S5 | UploadWorkspaceRepository extraction | M | partial (conditional) | ⏸ |
| S6 | Drive import: decide keep/remove | S (+M if remove) | yes (decision) | ✅ keep |
| S7 | Entity-owned invalidation helpers | S | yes | ✅ |
| L1–L6 | Deferred (see triggers) | — | yes (as deferrals) | ⏸ |
