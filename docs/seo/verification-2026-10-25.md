# Commercial SEO verification — October 25, 2026

**Current correction, October 25:** the owner rejected supplemental SEO blocks/link lists in the approved drawer. See [the correction and superseded acceptance claims](drawer-correction-2026-10-25.md). Existing discovery/entity initial bodies and bounded inventory discovery are deferred; earlier local artifacts/results below describe the prior candidate. No release is approved.

Candidate starts at clean `main`, `85dfec585ffcfba68c51951ae5742fff7ef49d5c`, tracking `origin/main`; local `v1.3.0` points to HEAD. No applicable AGENTS.md in the checkout or inspected parents (one exists only in an unrelated nested worktree). Instructions: CLAUDE.md. Change range: uncommitted task changes against this HEAD; no commit/push/tag/deployment authorized.

## Five workstreams

| Workstream | Owner | Status / next action |
| --- | --- | --- |
| Repository application/tests/docs | implementation engineer | Local implementation and verification in progress; see final results below |
| VPS/Caddy | infrastructure owner | Blocked: SSH publickey denial; obtain running configuration, imports, invocation, mounts, version, networks and upstreams |
| Google/Bing accounts | site owner | No authorized connected evidence; registration/submission pending deployment |
| Editorial/authority | product/editorial owner | Backlog prepared; no external publication/outreach |
| Deployment/live verification | release owner | Not authorized or performed; application and Caddy actions must be reviewed separately |

## Evidence ledger

Confirmed by ordinary HTTP GET, no JavaScript, October 25. Full timestamped headers, bodies, parsed metadata and sitemap crawl: `.scratch/seo-2026-10-25/http/report.json` and adjacent files (local, ignored).

- Public release.txt: 200, text/plain, v1.3.0. API `/api/health`: 200, JSON `{"ok":true}`. Active Docker image identities remain inaccessible.
- Main sitemap: 200 text/html bootstrap shell. API sitemap: 200 application/xml, 18 unique HTTPS main-domain URLs. Crawled all 18 on both origins: 36 responses, all 200. Main-domain 200 is a generic shell, not correct content delivery.
- Home/about/gallery/spot/spot-gallery/session: both origins lack H1 and anchors in initial HTML. API metadata varies; main metadata is generic. Main unknown spot and malformed session return 200; API equivalents 404.
- Wrong spot `/balangan/session/a29917fe-360e-46a9-806b-75075d6c060c`: API returns 200 for Uluwatu with Balangan canonical. Confirmed root cause: session looked up by ID while canonical used the unchecked URL slug.
- Main cart and checkout: 200 shell without server-visible noindex. Main robots disallows private paths, omits checkout; API robots disallows all.
- API buyer/seller URLs currently 404; main returns generic 200.
- Sitemap timestamps derive from createdAt and first-by-startsAt ordering. Neither reliably tracks significant media/publication/deletion changes. Decision: omit lastmod, not fabricate freshness or add migrations.
- Current source has client title/description/OG but no Twitter/image parity. Existing shell injection appends canonical/JSON-LD without clearing prior tags.
- Current source has clickable session divs and unbounded discovery through JS-only pagination. Spot creation does not reserve static slugs.
- About claims majority earnings and a payout turnaround without current provider/operational evidence. Provider-dependent fees can exhaust a cheap sale; remove guarantees and explain variable deductions.

Hypotheses: routing falls through to web/Nginx; exact Caddy defect unverified. Historical compression problem is resolved in the supplied preliminary observation; it must not be called a current defect. Fresh asset GET evidence is recorded separately below.

Inaccessible/pending: actual Caddy/config/image provenance, account ownership/index status, real payment-provider operations, preview-watermark visual behavior, rendered/browser/mobile/real iPhone Safari, Lighthouse/CrUX/field CWV, public schema validators. CLAUDE.md §6 forbids agent browser operations; source/jsdom tests are not device verification.

## Baseline

All five mandatory commands passed. `npx tsc --noEmit`; `npx tsc -p tsconfig.server.json --noEmit`; `npm run lint`; `npm run check:style-boundaries`; `npx vitest run --project client --project server`: **174 files, 1589 tests**, 32.88s. Local logs: `.scratch/seo-2026-10-25/baseline*`.

## Implementation evidence

Final local checks are recorded below. No production repair is claimed by local results.

## Owner browser and mobile acceptance — pending

CLAUDE.md §6 explicitly forbids agent browser use and requires owner visual acceptance before the visual suite. No browser, dev server, screenshot or device operation was performed by the agent. Ordinary HTTP and jsdom tests do not satisfy this acceptance. The task itself authorizes the listed pages/headings/links; no additional visual redesign is assumed.

In the owner's normal local environment (start it yourself if needed), use http://localhost:3000. Repeat at 360×780, 430×932, 768×1024 and 1440×900; include a real iPhone in Safari when available.

1. Open `/buy-surf-photos` directly. Expect readable buyer steps, one meaningful H1, gallery CTA and seller link. Activate “Find my surf photos”; expect the actual gallery with working spot/date controls. Failure: blank page, overflow, missing CTA or ignored input. No filter values are collected by this CTA, so none should be invented in its URL.
2. Open `/sell-surf-photos` signed out. Activate “Start uploading”, then Sign in; cancel and retry. Expect Upload to remain the destination after authentication, with no automatic upload or publication. Failure: lost destination, blocked sign-in or a surprise action. Do not upload real files.
3. Open `/about`. Expect the familiar cards and corrected earnings copy, with no majority/timing guarantee. Follow buyer/seller/gallery links.
4. Fresh visitor: open `/` in a fresh storage context, use “Enter the map”. Returning visitor: reload after acknowledgement. Expect introductory behavior and usable map/feed, one meaningful heading in the accessible page, no persistent duplicate initial body, no visible blank/flash during startup. Disable JavaScript on an actual shim-served local/staging document: expect readable content/anchors. Direct Vite/Nginx without the shim will still serve its bootstrap shell.
5. Open a real spot, its gallery and a session. Expect location/date/photographer/count consistent with previews. Use keyboard focus/Enter, modifier-click and open-in-new-tab on session cards. Expect the correct session destination and retained ordinary app interactions. With no media, expect the documented empty state.
6. Visit a session under another spot's slug. Expect replacement to its actual spot URL. Missing/malformed entities must show an error, not another session. Test Back/Forward and public → cart → public navigation; inspect title/canonical/robots/social/schema if needed and paste results for review.
7. Across phone/tablet/desktop check long titles, text wrapping, drawer scrolling/footer clearance, safe areas, focus, touch controls, map drag/zoom, first-visit exit and auth/checkout entry. No real purchases or payout requests.
8. Owner records pass/fail with viewport/device and exact URL. Only after visual approval run `npm run test:visual` as final check; it has not run in this task.

CWV acceptance: obtain lab traces only when browser work is authorized; field CrUX/RUM is currently unavailable. The existing map, first-visit imagery, optional HLS/Sentry and route-loading behavior remain material risks. Explicit thumbnail dimensions reserve space. Route-ready startup keeps raw document content while necessary loaders finish; the real visual transition still needs acceptance.

## Exact repository candidate files

Most documentation is intentionally ignored by this repository (`.gitignore: docs`); `docs/deployment.md` is already tracked. The new SEO docs and roadmap are saved locally and linked; they will require explicit inclusion in any later approved commit. No ignore policy or Git index was changed.

- `apps/api/src/lib/htmlHead.test.ts`
- `apps/api/src/lib/htmlHead.ts`
- `apps/api/src/lib/publicDocumentHtml.test.ts`
- `apps/api/src/lib/publicDocumentHtml.ts`
- `apps/api/src/lib/seoJsonLd.ts`
- `apps/api/src/repositories/SpotRepository.test.ts`
- `apps/api/src/repositories/SpotRepository.ts`
- `apps/api/src/repositories/SurfSessionRepository.integration.test.ts`
- `apps/api/src/repositories/SurfSessionRepository.test.ts`
- `apps/api/src/repositories/SurfSessionRepository.ts`
- `apps/api/src/routes/publicPages.test.ts`
- `apps/api/src/routes/publicPages.ts`
- `apps/web/index.html`
- `apps/web/nginx.conf`
- `apps/web/public/robots.txt`
- `apps/web/scripts/publicDocumentRouting.test.ts`
- `apps/web/src/app/lib/publicDocuments.test.ts`
- `apps/web/src/app/lib/publicDocuments.ts`
- `apps/web/src/app/main.tsx`
- `apps/web/src/app/routeTree.gen.ts`
- `apps/web/src/app/routes/-commercialContent.test.tsx`
- `apps/web/src/app/routes/_panel.$spotId.gallery.tsx`
- `apps/web/src/app/routes/_panel.$spotId.index.tsx`
- `apps/web/src/app/routes/_panel.$spotId.session.$sessionId.tsx`
- `apps/web/src/app/routes/_panel.$spotId.tsx`
- `apps/web/src/app/routes/_panel.about.tsx`
- `apps/web/src/app/routes/_panel.buy-surf-photos.tsx`
- `apps/web/src/app/routes/_panel.gallery.tsx`
- `apps/web/src/app/routes/_panel.index.tsx`
- `apps/web/src/app/routes/_panel.sell-surf-photos.tsx`
- `apps/web/src/app/routes/_panel.tsx`
- `apps/web/src/features/About/ui/AboutPanel.tsx`
- `apps/web/src/shared/lib/seoMeta.test.ts`
- `apps/web/src/shared/lib/seoMeta.ts`
- `apps/web/src/shared/ui/PublicDocument.module.css`
- `apps/web/src/shared/ui/PublicDocument.test.tsx`
- `apps/web/src/shared/ui/PublicDocument.tsx`
- `apps/web/src/widgets/SidePanel/SessionFeed.module.css`
- `apps/web/src/widgets/SidePanel/SessionFeed.test.tsx`
- `apps/web/src/widgets/SidePanel/SessionFeed.tsx`
- `docs/deployment.md`
- `packages/contracts/src/core.ts`
- `packages/contracts/src/seo/pageMeta.ts`
- `packages/contracts/src/seo/publicDocument.ts`
- `packages/contracts/src/seo/publicRoutes.ts`

Local documentation files: `docs/roadmaps/seo-optimization.md`, `docs/deployment.md`, `docs/seo/architecture-and-content.md`, `docs/seo/research-2026-10-25.md`, `docs/seo/operations-and-measurement.md`, `docs/seo/verification-2026-10-25.md`, `docs/seo/historical-roadmap-2026-08-29.md`.

## Final local verification

Completed October 25, 2026, 18:00 Asia/Tbilisi. Five mandatory commands all passed on the final source, sequentially with no concurrent Docker builds:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npx tsc -p tsconfig.server.json --noEmit` | pass |
| `npm run lint` | pass |
| `npm run check:style-boundaries` | pass |
| `npx vitest run --project client --project server` | **179 files, 1645 tests**, 23.47s |
| `npx vitest run --project scripts` | **4 files, 56 tests**, pass |
| Isolated `SurfSessionRepository.integration.test.ts` | **1 file, 7 tests**, pass; includes tied-date pagination, unavailable/empty/deleted-media visibility and favorites/date filtering |
| `npm run build` | web and API pass |
| `npm run check:bundle-budgets` | pass; no budget changes |
| Production web/API runner + migrator Docker builds | pass, safe test web arguments; migrator not executed |
| `npm run check:web-delivery -- --origin http://127.0.0.1:53343 --expected-release seo-local-20261025` | pass against local Nginx runtime image |
| Local Nginx GET/HEAD | **22 responses**, private noindex scoped correctly; index/robots/health/release unaffected |
| Built-shell Hono + real isolated DB audit | **8 public documents**, one H1/canonical each, parsed JSON-LD; **8 unique sitemap entries**, zero broken public destinations in fixture graph |
| `git diff --check` | pass |

Bundle report: entry JS **268,420 gzip bytes** (<295,000), CSS **40,756** (<42,500), Browse critical graph **408,580** (<432,000). The Docker test build uses explicit fake public configuration; its runtime gzip transfer was 267,097 JS / 40,730 CSS bytes. Different build configuration and compression level explain why these measurements are reported separately. No field CWV claim.

Fresh production asset GETs: JS 263,531 transferred bytes, CSS 40,730, both gzip with immutable one-year hashed-asset caching; missing asset 404. Manifest/icon 200. No production artifact/image provenance was inferred from these responses.

Intermediate failures were retained in local logs. An unchanged AddSpotUiBoundary test twice hit its 1-second async UI lookup while broader work was running; its isolated test and the final complete sequential run passed without changing that test. Cause is consistent with scheduling/load, not conclusively proven. Script tests/tsx budget checks initially hit sandbox EPERM for loopback/IPC; they passed with scoped local execution permission. A test Docker invocation initially supplied an invalid commerce mode; it was corrected to the repository CI's supported `test` mode. Integration fixture errors were corrected to actual schema relationships/enums; no schema or gates were weakened.

Tests were added before the relevant behavior changes; failing/passing route, metadata, query, slug and link runs are retained under `.scratch/seo-2026-10-25/`. A first repeated-cursor regression fixture let the broken implementation loop until the worker exited; it was bounded with a sentinel before implementing the guard. No lingering test workers or task containers remain. Final content-parity review also caught inventory links being removed by static commercial views; buyer/seller/About now consume resolved shared document data. New regression tests prove the buyer/seller links survive the React transition.

Local artifact IDs (not production):

- `sha256:4a20104f4791af5b5646e5fd228a407fc7ca97588f11d60b7eee5bcf69e595d9 ["swelldays-seo-web:20261025"]`
- `sha256:a25faa836b24b71ff98a230d0457381dc26862945974e356634fda98a783975d ["swelldays-seo-api:20261025"]`
- `sha256:fee8ee3120d17bb0f1a2512f6fb69b59fda36b75e88d0358e512fc557675bb54 ["swelldays-seo-migrator:20261025"]`

Evidence: `baseline.json`, `phase-a.json`, `documents-recheck.json`, `discovery-recheck.json`, `final-check.json`; `http/report.json`, `http/sitemap-validation.json`, `http/assets.json`; `candidate-html/verification.json`; `local-delivery/report.json`; `web-delivery-final.log`; `scripts-final.log`, `integration-final.log`, `build-final.log`, `budgets-final.log`, Docker logs. These local ignored logs contain no credentials or paid download tokens. Test fixtures use fake public media URLs and a disposable database. Two task-created containers were removed; local images remain for review.

## Phase-sized changes, risk and rollback

Paths below are repository-relative; the exact complete file manifest appears above. B–E were one connected shared-document implementation task, verified together; A and F were verified independently before proceeding.

| Phase | Exact owners changed / behavior | Evidence | Risk and rollback | Production verification |
| --- | --- | --- | --- | --- |
| A | `apps/api/src/routes/publicPages.ts`, `publicPages.test.ts`; `packages/contracts/src/seo/publicRoutes.ts`, `packages/contracts/src/core.ts`; later `apps/web/nginx.conf`, `apps/web/scripts/publicDocumentRouting.test.ts` and `docs/deployment.md`: wrong-slug 308, reserved exclusions, bounded shell failure, private document headers | Phase A five gates, 1604 tests; final GET/HEAD checks | Incorrect public matcher or shell failure can affect delivery; revert reviewed A hunks independently. Caddy backup/reload/rollback still unverified | pending: real Caddy + approved rollout |
| B | `packages/contracts/src/seo/pageMeta.ts`, `publicDocument.ts`, `publicRoutes.ts`, `core.ts`; `apps/api/src/repositories/SpotRepository.ts`, `SpotRepository.test.ts`; `apps/web/src/app/lib/publicDocuments.ts`, `publicDocuments.test.ts`, `apps/web/src/app/routeTree.gen.ts`; architecture/research docs: shared intent and reserved slug protection | B–E five gates, then reserved-name regressions and final gates | Static slug collision; public 22-spot audit found none. Revert only task-owned generation/route hunks; retain established URLs | pending |
| C | `apps/web/src/app/routes/_panel.buy-surf-photos.tsx`, `apps/web/src/app/routes/-commercialContent.test.tsx`, shared `PublicDocument.tsx`, `PublicDocument.module.css`, `PublicDocument.test.tsx`, shared content and API handlers: real buyer workflow/CTA | shared content/initial H1/link tests; final gates | Mobile overflow/CTA handoff requires acceptance; remove buyer route and its task navigation/sitemap references together on rollback | pending |
| D | `apps/web/src/app/routes/_panel.sell-surf-photos.tsx`, `apps/web/src/features/About/ui/AboutPanel.tsx`, shared content/API handlers: upload CTA and conservative earnings copy | copy tests and source trace of auth-aware /upload; final gates | Operating terms/provider unconfirmed; do not publish unsupported terms. Revert focused route/copy/nav references; preserve payment economics | pending; owner commercial confirmation required |
| E | `apps/api/src/lib/htmlHead.ts`, `htmlHead.test.ts`, `publicDocumentHtml.ts`, `publicDocumentHtml.test.ts`; removed unused `seoJsonLd.ts` after moving builders to shared contracts; `apps/web/src/shared/lib/seoMeta.ts`, `seoMeta.test.ts`; `apps/web/index.html`, `src/app/main.tsx`; routes `_panel.index.tsx`, `_panel.about.tsx`, `_panel.gallery.tsx`, `_panel.$spotId.tsx`, `_panel.$spotId.index.tsx`, `_panel.$spotId.gallery.tsx`, `_panel.$spotId.session.$sessionId.tsx`, `_panel.tsx`: shared metadata/body, UTC summaries, replace-in-root startup | 8 built-shell documents, head lifecycle and escaping/verification-preservation tests; final gates | Startup geometry/flash and API-dependent startup need owner check. Revert E shared/consumer hunks together; keep valid error/robots safety where independent | pending; not hydration or browser proof |
| F | `apps/api/src/repositories/SurfSessionRepository.ts`, `.test.ts`, `.integration.test.ts`; `apps/api/src/routes/publicPages.ts`, `.test.ts`; `apps/web/src/widgets/SidePanel/SessionFeed.tsx`, `.module.css`, `.test.tsx`; `apps/web/public/robots.txt`, routing tests: stable public inventory, no fabricated lastmod, bounded discovery and anchors | 7 isolated DB tests, sitemap/links tests, 22 runtime header checks | Query cost and new visibility criteria; monitor representative inventory/latency after rollout. Revert focused query/link/sitemap changes as a compatible set; retain valid minimal static sitemap if needed. No migrations | pending: main-domain XML/full current inventory crawl |
| G | `docs/seo/operations-and-measurement.md`, verification report, roadmap; `publicDocumentHtml.test.ts`: Google/Bing preparation and token preservation | preservation tests; no account evidence | Wrong property/lost ownership; remove only task verification artifacts when approved. No artifacts/tokens added here | pending: authorized properties/submission/inspection |
| H | `docs/seo/architecture-and-content.md`, `research-2026-10-25.md`, `operations-and-measurement.md`, report and roadmap: claims/backlog/metric definitions/owners | original source audit and refreshed primary references | False attribution/stale terms; no new instrumentation to remove, preserve existing Cloudflare beacon | pending: account baseline and 2/4/8/12-week observation |

## Remaining acceptance blockers and next actions

1. **Product owner:** perform the exact UI/mobile checklist above and report results; real iPhone and external validators remain pending. Visual suite awaits owner visual approval under CLAUDE.md §6.
2. **Infrastructure owner:** provide actual read-only Caddy configuration/invocation/network evidence and usable authorized access. Only then can an exact minimal candidate diff and validated backup/reload/rollback sequence be prepared.
3. **Commercial owner:** confirm active provider, fee explanation, payout arrangements and rights/refund terms. Conservative copy has no earnings/turnaround guarantee.
4. **Release owner:** approve exact candidate inclusion (including intentionally ignored local docs), verify actual production image provenance, fresh database backup and isolated restore; approve application deployment and Caddy application separately. Nothing has been committed, pushed, tagged or deployed.
5. **Account/SEO owners:** after successful live checks, authorize Google/Bing property inspection, verification and sitemap submission; supply baseline exports. No registration/indexing evidence is currently available.

The repository implementation is ready for owner acceptance, with the listed acceptance blockers. Production routing is still broken in the live evidence. Deployment and external-account work are not complete.
