# 05 — Transformation Roadmap

## Executive summary

- **Current state (verified 2026-07-30):** pre-launch solo-built marketplace, about 40.3k TypeScript/TSX LOC. The audited implementation baseline has 60 dirty paths (57 tracked changes plus three untracked files); this audit additionally changes the two existing tracked roadmap files.
- **Baseline:** all five mandatory gates pass (114 client/server test files, 699 tests). The Postgres integration suite also passes (10 files, 44 tests) after starting its documented test database.
- **Top risks:** the public feed and its date index can show different lifecycle versions; date navigation scans every matching media row and may fetch every intervening page; equal capture timestamps make cursor order unstable; the implemented mobile date control contradicts its approved product contract; bottom-sheet target geometry has two producers.
- **Direction:** stop adding responsive scope to the current diff. Reconcile the active M03 work through the Media and DrawerShell ownership seams, then resume the existing responsive roadmap.
- **Existing roadmap policy:** completed initiatives remain historical. Partially implemented work is split and left open. Unimplemented work remains unchecked. No replacement roadmap is created.
- **Highest-value sequence:** finish A0's decisions/hunk ownership → A2 → narrow A3 → H1a → the H2/H3 vertical slice → A1 → H4. Then resume M04. H1b is a focused follow-up; A4, S4, and S5 are outside this critical path.
- **Deferred mechanisms:** materialized calendar index, caching tier, spatial index, distributed rate limiting, server cart, and automated payouts retain named triggers.

---

**Confirmed constraints (2026-07-30):** pre-launch, no users; solo developer, staying solo; no fixed launch date. Optimize for **low future refactoring**. Present disruption has no prioritization weight. Boundary, ownership, source-of-truth, and contract work that is expensive to retrofit happens now; speculative scale mechanisms remain deferred behind seams.

**Roadmap ownership:** this file is the architecture-wide source of truth. `docs/roadmaps/responsive-layout-foundation.md` remains the executable task list for the active responsive programme. This audit updates that roadmap in place; it does not create a parallel implementation plan.

Status legend: ⬜ pending · 🚧 in progress · ✅ done · ⏸ deferred · ⛔ approval/decision gate.

Reversibility:

- **[retrofit-expensive]** — ownership, ordering, domain values, contracts, and dependency direction. Schedule now.
- **[seam-deferred]** — the seam is required now; the scale mechanism waits for its trigger.

## Current execution order

The executive sequence and each item's dependency line determine execution. The headings below classify the kind of work; they do not override those dependencies.

### Quick wins

#### A0 — Reconcile the current worktree with the living roadmap `[retrofit-expensive]`

- **Priority:** P0
- **Expected benefit:** prevents a 60-path mixed diff from silently redefining completed shell behavior, M03's product decision, and verification policy.
- **Risk:** low; documentation/commit-boundary work can expose that code must be revised, but it does not invent new product behavior.
- **Dependencies:** none.
- **Scope:** classify every current path as an M03 slice, a post-M02 shell correction, an architectural repair, or unrelated/user-owned work. Preserve completed F/M history, but do not let a historical checkbox certify a newly regressed invariant. Update the existing responsive roadmap and handoff record before more feature scope is added.
- **Completion condition:** every dirty hunk—not merely every file—maps to one named open task; files shared by several tasks have an explicit hunk/staging split; viewer-local versus surf-spot-local calendar days is decided; the approved single-sequence/month-jump contract has no contradictory "done" note; no current-diff task is marked complete before all five gates pass.

#### A1 — Complete public-media lifecycle invalidation `[retrofit-expensive]`

- **Priority:** P0
- **Expected benefit:** within the current client cache, the cards and date navigator seen in the gallery refresh together after publishing, retiring, capture-date editing, spot reassignment, deletion, or favorite-spot changes.
- **Risk:** low; invalidation may cause extra refetches until later optimization, which is preferable to stale public state.
- **Dependencies:** H2, H3; build the helper against the final query contract rather than the temporary `mediaDateIndex` shape.
- **Scope:** extend the Media-owned public projection lifecycle to cover both `spots.mediaFeed` and `spots.mediaDateIndex`. Compose it from session/upload mutations and from favorite-spot mutation when the favorites filter can observe the change. Do not hand-copy query lists into hooks.
- **Owning verification:** focused invalidation-policy behavior tests. TypeScript owns typed query propagation; do not mock internal layers merely to assert field forwarding.
- **Completion condition:** one Media-owned helper names both public projections; app-owned lifecycle callers compose it; a focused test proves the two projections are invalidated together in the current QueryClient. Any static enforcement matches stable imports/calls rather than exact hook source text. Cross-tab or external-writer transactional versioning is explicitly out of scope.

#### A2 — Restore DrawerShell as the sole geometry producer `[retrofit-expensive]`

- **Priority:** P0
- **Expected benefit:** selected spots stay centered in the actually visible map during bottom-sheet and side-panel movement without competing sheet formulas.
- **Risk:** low-medium because camera behavior changes during animation.
- **Dependencies:** A0.
- **Scope:** DrawerShell publishes the current and destination geometry/camera-inset projection for every presentation. Remove GlobeScene's bottom-sheet rectangle reconstruction from sheet snap plus viewport metrics.
- **Owning verification:** drawer/globe seam behavior test with changing measured/target bounds; TypeScript/static rule prevents GlobeScene from importing snap geometry.
- **Completion condition:** grep shows no globe-side sheet rectangle construction; one read-only DrawerShell geometry projection feeds camera insets for persistent, side, and bottom surfaces; the integration seam passes.
- **Completed 2026-07-30:** delivered by responsive task M03-a. DrawerShell is the only rendered/target geometry publisher; GlobeScene consumes its read-only projection for every drawer presentation, and the static boundary rejects globe-side snap geometry. See `docs/review/responsive-layout-m03-a-handoff.md`.

#### A3 — Return verification to the invariant owner `[retrofit-expensive]`

- **Priority:** P1
- **Expected benefit:** architecture checks survive harmless refactors while still rejecting real ownership violations.
- **Risk:** low-medium; deleting brittle rules can expose unprotected invariants, so each removal must identify its correct replacement.
- **Dependencies:** A0.
- **Scope:** remove only the current diff's runtime tests that parse CSS to assert declarations and exact-source checks that require local variable names, JSX sibling order, whole CSS blocks, or the separate month/day-row layout. Retain import/dependency rules, forbidden raw APIs, token ownership, and narrow syntax bans. Move user-visible layout claims to semantic DOM/computed-style/geometry/interaction checks or the manual checklist required by `AGENTS.md`. Do not turn this into a rewrite of the entire style-boundary checker.
- **Completion condition:** `PanelRouteLayout.test.tsx` no longer treats CSS text as runtime behavior; `check-style-boundaries.mjs` no longer encodes the separate month/day-row layout or exact local implementation names; every removed assertion is mapped to an owning verifier; all five gates remain green.

## High-leverage refactors

#### H1a — Make public-media pagination total `[retrofit-expensive]`

- **Priority:** P0
- **Expected benefit:** no duplicate, skipped, or unstable gallery cards when multiple media share the same capture timestamp.
- **Risk:** medium because the cursor wire contract changes.
- **Dependencies:** A0; characterize current ascending and descending behavior first.
- **Scope:** order public media by `(capturedAt, id)` in the requested direction and encode both values in an opaque cursor. Repository filtering, cursor comparison, and response cursor creation use the same tuple.
- **Owning verification:** repository integration tests with equal timestamps in both sort directions.
- **Completion condition:** no public-media page uses an id cursor against timestamp-only ordering; equal-timestamp fixtures traverse every item exactly once in both directions.

#### H1b — Make the published-session feed pagination total `[retrofit-expensive]`

- **Priority:** P1
- **Expected benefit:** the Feed cannot skip or duplicate sessions that share `createdAt`.
- **Risk:** low-medium; the same cursor-contract correction as H1a, but outside the current gallery diff.
- **Dependencies:** H1a establishes the repository convention; execute as a separate focused follow-up rather than expanding M03-c.
- **Scope:** change `SurfSessionRepository.listPublished` from `createdAt` ordering plus id-only cursoring to a total `(createdAt, id)` order and opaque composite cursor.
- **Completion condition:** equal-timestamp integration fixtures traverse every published session exactly once; no session-feed query uses an id cursor against timestamp-only ordering.

#### H2 — Decide calendar-day semantics and build the compact index `[retrofit-expensive]`

- **Priority:** P0
- **Expected benefit:** the date control displays the same days the gallery groups, at cost proportional to distinct days rather than every matching media row.
- **Risk:** medium-high because date semantics cross browser, API, and SQL boundaries.
- **Dependencies:** H1a.
- **Scope:** keep `capturedAt` as the authoritative instant. **Product gate:** explicitly choose viewer-local or surf-spot-local calendar days; current browser-local arithmetic is evidence of existing behavior, not implicit approval. Define one typed calendar-day key and timezone context from that decision. Make feed grouping, filters, calendar index, and display use it. Replace `findPublishedDates`' all-row timestamp response with one grouped/distinct entry per day under the shared `PublicMediaQuery`. A timezone-aware grouped query may require bounded SQL behind MediaRepository; do not fetch all rows merely to avoid it.
- **Owning verification:** adapter/contract tests for representative raw timestamps around day boundaries plus repository integration tests for grouping. TypeScript owns downstream key propagation.
- **Completion condition:** the user has approved viewer-local or surf-spot-local semantics; the API returns one entry per approved calendar day, never every media timestamp; browser/server host timezone cannot silently change the result; feed and index accept the same filter/calendar context.

#### H3 — Resolve a day directly; remove fetch-through navigation `[retrofit-expensive]`

- **Priority:** P0
- **Expected benefit:** tapping an old month/day loads that location directly instead of downloading every newer gallery page.
- **Risk:** medium because the infinite-query page set must be replaced or rebased safely.
- **Dependencies:** H1a, H2.
- **Scope:** retain the already approved global-chronology jump behavior rather than silently changing a tap into a one-day filter. The client sends the selected day key under the same query; the repository resolves its current total-order boundary at request time, so deleting or moving the formerly first media row cannot stale a client locator. The rebased result exposes newer and older continuation cursors. PublicGallery scrolls to the first row for that day.
- **Owning verification:** repository integration test proves a distant day is fetched in one target-page request; PublicGallery behavior test proves the day is focused without a `fetchNextPage` loop.
- **Completion condition:** `PublicGallery.tsx` contains no repeated fetch-until-day loop; request count for a distant day is constant; a deleted/moved first item is handled by request-time resolution; the user can paginate both newer and older after rebasing; ordering remains total.

#### H4 — Finish M03 against the approved mobile date contract `[retrofit-expensive]`

- **Priority:** P0
- **Expected benefit:** the date control on the phone behaves as approved instead of presenting a different interaction that tests and static checks accidentally canonize.
- **Risk:** medium because it changes the current uncommitted UI.
- **Dependencies:** A2, A3, H2, H3, then A1 against the final query keys.
- **Scope:** implement one horizontal native-scroll sequence with year labels only at year boundaries, month controls only at month boundaries, and deduplicated day controls. A month tap jumps to its first day; a day tap jumps to that day; the active day is highlighted and brought into view. Finish lightbox coordination, large-text behavior, both-shell nonvisual verification, and the required user appearance checklist.
- **Owning verification:** semantic interaction/accessibility/scroll tests for the date control and both mobile shells; manual checklist only for appearance.
- **Completion condition:** no separate month/day row contract remains; month and day taps perform their approved jumps; search/filter and active-date rows remain mutually exclusive; large text, focus, lightbox, shell crossing, and all five gates pass; user accepts the appearance-only checklist.

## Structural refactors

#### S4 — Make the route dependency policy explicit `[retrofit-expensive]`

- **Priority:** P2; outside the M03 critical path.
- **Expected benefit:** cross-domain workflows have one discoverable owner without manufacturing pass-through services for simple CRUD.
- **Risk:** low-medium.
- **Dependencies:** current responsive worktree landed in coherent commits; CI remains green.
- **Scope:** formalize two allowed paths: simple same-domain read/write may be `route → repository`; workflow/cross-domain composition is `route → owning service → repositories`. Fix the current spots-to-Media repository reach through MediaService. Ban routes from `server/db` and from another domain's repository.
- **Completion condition:** enforced rules reject route-to-db and cross-domain route-to-repository imports while permitting declared same-domain repository calls; the known spots/Media reach is removed; route behavior remains unchanged.

#### S5 — Extract a deep UploadWorkspace persistence boundary `[seam-deferred]`

- **Priority:** deferred; outside the M03 critical path.
- **Expected benefit:** the route → service → repository contract becomes total in the most complex server workflow, so future upload changes do not expand a second architecture.
- **Risk:** medium-high because `UploadWorkspaceService` is large and stateful.
- **Dependencies:** independent of S4; characterization through the existing integration suite before movement.
- **Trigger:** before the next substantial change to the upload state machine, or when integration coverage can no longer express a required invariant.
- **Scope:** extract one deep aggregate repository/unit-of-work without rewriting the state machine or manufacturing forwarding CRUD methods. Keep transactions owned by the workflow and pass transaction clients where atomic composition requires it.
- **Completion condition:** `UploadWorkspaceService` no longer imports `server/db`; an enforced rule rejects all service-to-db imports; existing upload workspace integration tests pass unchanged or with behavior-only additions.

## Completed architecture history

These initiatives were completed in the previous audit cycle and remain historical. They are not silently re-run. A new change that violates one of their invariants creates a new repair item (as A1/A2 do); it does not erase the fact that the original slice landed.

| Initiative | Completed outcome | Status |
|---|---|---|
| T0.1 | Previous large refactor landed with green tests | ✅ |
| Q1 | Five mandatory gates made green | ✅ |
| Q2 | CI workflow runs the quality suite | ✅ |
| Q3 | Upload reconciler scheduled with destructive-boundary coverage | ✅ |
| Q4 | Requirements payments/Drive truth reconciled | ✅ |
| S1a/S1b | Ledger invariant and one balance write path | ✅ |
| S2/S3 | Canonical media contract lineage and public storage-id exclusion | ✅ |
| S6 | Google Drive import explicitly kept | ✅ |
| S7 | Session-lifecycle invalidation centralized | ✅ historically; extended by A1 for new public projections |
| F00–F12n, M00–M02 | Responsive foundation and approved phone shells landed through the recorded commit history | ✅ historically; current-diff regressions are tracked by A0/A2/H4 |

## Long-term evolution

| Initiative | Reversibility | Seam that must exist now | Trigger |
|---|---|---|---|
| A4 Development migration-history reconciliation | `[seam-deferred]` | fresh migrations and integration DB are already green | The local dev DB is available **and** before the next schema migration, or preserving its current data becomes necessary. Any destructive reset still requires explicit approval. |
| L1a Runtime error tracking | `[seam-deferred]` | structured logger call sites | Before the first external beta |
| L1b Fulfillment alert + manual replay | `[seam-deferred]` | idempotent `fulfillOrder` | Before enabling real payments |
| L1c Backup/restore rehearsal | `[seam-deferred]` | Prisma migration history | Before storing persistent production data |
| L1d Deploy/release rehearsal | `[seam-deferred]` | existing build/start commands | Before the first release candidate |
| L1e Upload limits/content scanning | `[seam-deferred]` | upload-service validation seam | Before public uploads are enabled |
| L2 Materialized media calendar index/cache | `[seam-deferred]` | `PublicMediaCalendarIndex` repository contract from H2 | Grouped date-index p95 exceeds 200 ms at a recorded representative data size |
| L3 Spatial index/geo tiling | `[seam-deferred]` | SpotRepository spatial query methods | Spot count exceeds ~5k or bounds-query p95 exceeds 200 ms |
| L4 Distributed rate limiting | `[seam-deferred]` | existing `createRateLimiter` interface | Second server instance |
| L5 Server-side cart | `[seam-deferred]` | isolated Commerce cart interface | A real multi-device user requirement |
| L6 Automated payouts | `[seam-deferred]` | PayoutRequest/manual flow | Manual payout volume becomes operationally painful |
| L7 Storage-port vocabulary/provider abstraction | `[seam-deferred]` | existing upload storage port | A second storage provider is evaluated or a second port consumer appears |

## Status tracker

| # | Initiative | Effort | Verdict | Status |
|---|---|---:|---|---|
| A0 | Reconcile current worktree with living roadmap | S | partial; finish decisions + hunk ownership | 🚧 |
| A2 | DrawerShell sole geometry producer | S-M | do now | ✅ |
| A3 | Narrow verification ownership correction | S | do now | ⬜ |
| H1a | Total public-media pagination | M | do now | ⬜ |
| H2 | Calendar-day decision + compact index | M | partial; decision gate first | ⛔ |
| H3 | Direct request-time day location | M | do after H2 | ⬜ |
| A1 | Public-media lifecycle invalidation | S | do against final query contract | ⬜ |
| H4 | Complete approved M03 behavior | M | date control + focused verification | 🚧 |
| H1b | Total published-session pagination | S-M | focused follow-up | ⬜ |
| S4 | Explicit same-domain/cross-domain route policy | S-M | useful, outside M03 critical path | ⬜ |
| A4 | Development migration-history reconciliation | M | defer to named trigger | ⏸ |
| S5 | Deep UploadWorkspace repository/unit-of-work | M | defer to named trigger | ⏸ |
| L1a–L7 | Triggered long-term mechanisms | — | defer behind seams | ⏸ |
