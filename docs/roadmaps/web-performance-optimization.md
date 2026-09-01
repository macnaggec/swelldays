# Web Performance Optimization Roadmap

Status: in progress
Updated: 2026-08-29
Primary objective: reduce cold-start transfer, startup execution, and intent-to-content latency without weakening the map-first product, first-visit experience, route ownership, or existing responsive contracts.

## Executive summary

The current direction is sound: TanStack Router component splitting is enabled, large optional systems such as Sentry and HLS are lazy, Mapbox is isolated from the entry module, and likely panel routes now have intent-based code preloading in the working tree. The remaining work is not one large rewrite.

The highest-value sequence is:

1. Preserve and land the current route-preload change as an isolated baseline.
2. Add deterministic compressed-size reporting and budgets.
3. Enable real production response compression and prove it against the runtime image.
4. Put startup visual assets on hashed immutable URLs and let the first-visit feature request its artwork only when it will render.
5. Split the contracts package into Zod-free core and explicit validation entry points.
6. Move rare Add Spot and authentication UI out of the startup graph.
7. Remove the proven Feed-to-Public-Gallery edge and only then correct any remaining measured barrel/style leakage.
8. Separate primary Feed/Gallery content readiness from auxiliary date metadata and expose retryable query errors.
9. Prefetch exact destination data with the already-preloaded route code, including authenticated Upload workspace state where safe.
10. Add only evidence-backed connection and media scheduling changes.
11. Deploy, verify live headers and request order, then ratchet budgets to the measured result.

The Vite 500 kB warning is not itself the optimization target. The target is transferred bytes, startup parse/execute work, critical request order, and time until useful content. `manualChunks` or a larger warning limit must never be used merely to make the warning disappear.

## Confirmed baseline

Measured from the current local production build on 2026-08-28:

| Artifact | Minified | Gzip | Runtime role |
| --- | ---: | ---: | --- |
| Main entry JavaScript | 928.58 kB | 289.62 kB | Startup critical |
| Main CSS | 275.08 kB | 41.89 kB | Startup critical |
| Mapbox GL | 1,866.30 kB | 521.86 kB | Lazy module, but requested immediately on map-first routes |
| Feed/Search shared chunk | 138.39 kB | 45.62 kB | Browse route path |
| Upload route | 67.25 kB | 23.77 kB | Lazy route |
| Public Gallery | 57.63 kB | 19.13 kB | Lazy/shared route path |
| HLS video player | 592.64 kB | 185.23 kB | Lazy and media-conditional |
| Sentry React | 494.00 kB | 163.14 kB | Lazy and delayed until after startup |

Confirmed live-delivery evidence from `https://swelldays.surf` on 2026-08-28:

- The deployed HTML was an older 2026-08-26 build, so it did not yet contain the latest local startup work.
- A real compressed-capable GET downloaded 1,408,649 bytes for the deployed main JavaScript and 362,291 bytes for its CSS.
- Neither response contained `Content-Encoding`; production compression is therefore the first priority.
- Hashed `/assets/` responses were immutable, but the first-visit artwork at a stable public URL had no explicit cache policy.
- The request path used HTTP/2 through Caddy to Nginx. The repository owns the Nginx server block but not the external Caddy configuration.

Current entry-graph evidence:

- The startup source map contains rare Add Spot flow/UI code and Zod. Zod accounts for roughly 68.6 kB of mapped minified entry bytes before compression. The immediate architectural cause is the `@swelldays/contracts` root entry: Zod-free runtime constants/types and validation schemas share one public barrel.
- The eager authentication provider pulls login and registration UI into startup.
- `SessionFeed` imports `GalleryEmptyState` through `features/PublicGallery`, which makes the default Feed graph reach the Public Gallery module (57.63 kB raw / 19.13 kB gzip plus its CSS). Other shared gallery/lightbox and layout modules may be legitimate home-route dependencies and must be measured before changing import topology.
- First-visit artwork is unconditionally preloaded: 144 kB on portrait/mobile and 240 kB on landscape/desktop, including for visitors who are acknowledged locally and will not see it.
- Gallery and Feed query hooks start their server reads when components mount. Current `router.preloadRoute()` calls primarily move route-module work before the click; they do not preload those query results.
- `useSpotMediaFeed` currently folds `mediaFeed.isLoading` and `mediaDateIndex.isLoading` into one loading state. Slow or failed auxiliary date metadata can therefore delay or hide usable cards. Feed/Gallery query errors can also appear as empty results rather than a retryable failure.

## Goals

- Serve compressible production assets with negotiated compression.
- Keep the bootstrap logo visible before React without a broken-image state.
- Preserve the persistent map loading behind the first-visit overlay.
- Preserve authenticated and returning-visitor first-visit bypass behavior.
- Reduce entry JavaScript by moving genuinely rare UI behind explicit lazy seams.
- Keep Zod and validation-only contract code out of the browser startup graph without creating unsupported package deep imports.
- Keep route and query preloading exact to destination, selected spot, filters, authentication state, and upload workspace search state.
- Render primary Feed/Gallery content as soon as its own request succeeds; auxiliary metadata must not block or erase it.
- Make performance regression visible in CI through deterministic budgets, not flaky wall-clock assertions.
- Keep every commit deployable, reversible, and independently verifiable.
- Use real iPhone/Mobile Safari and deployed response behavior as final acceptance evidence.

## Non-goals

- No framework, router, query library, design-system, or bundler migration.
- No Mapbox replacement in this roadmap.
- No SSR, React Server Components, microfrontend split, or service worker.
- No global eager route preload or all-route cache warmup.
- No `chunkSizeWarningLimit` increase as a substitute for a bundle budget.
- No `manualChunks` change unless a measured module-ownership problem remains after lazy-boundary work and the proposed split reduces the critical route graph rather than merely renaming files.
- No visual redesign, animation-duration change, first-visit copy change, or map-style change without separate browser-visible approval.
- No API/database optimization unless production traces show server latency rather than transfer, module evaluation, or rendering as the bottleneck.
- No deployment, push, release, or live infrastructure mutation without separate approval.

## Architecture decisions

### A1. Optimize the critical graph, not individual filenames

The build budget must track at least the entry JavaScript, entry CSS, the immediately requested Browse path, and the map path. Moving bytes from `index` into a chunk that the home route requests immediately is not a win. Every lazy-boundary task compares both entry size and cold-home critical totals before it is retained.

### A2. Nginx is the versioned compression owner for this roadmap

The external Caddyfile is not in the repository. Add portable gzip support to the committed Nginx runtime and verify it through the built container. If the Caddy configuration later becomes version-controlled, Caddy `encode zstd gzip` may replace Nginx compression in a separate infrastructure change. Do not depend on an undocumented server-side setting.

### A3. Route code and route data have different owners

TanStack Router owns route-module preloading. TanStack Query owns server-state prefetch and deduplication. Query option factories must be shared by hooks and prefetch callers so a route cannot warm a key that the mounted component does not consume.

### A4. Root providers stay lightweight

A provider may remain mounted at the root when it owns cross-route state or continuation semantics. Heavy modal/form/panel UI below that provider must load only when the feature is requested. The auth continuation and Add Spot store remain authoritative; lazy UI does not create a second state owner.

### A5. Public visual assets use the build asset graph

Logo and first-visit artwork should resolve to content-hashed build URLs so immutable caching is safe. Stable public-root URLs are retained only for files that external clients require at stable paths, such as the web manifest and conventional icons.

### A6. Performance gates are deterministic

CI gates compressed byte sizes, response headers, cache headers, module/request presence, and behavior. Throttled duration numbers are diagnostic evidence, not a hard pass/fail gate. Real-device timing remains an acceptance check, not a unit test.

### A7. Package boundaries distinguish runtime core from validation

`@swelldays/contracts` remains the package boundary, but it gains explicit supported public entries. A `core` entry exports only Zod-free constants, runtime helpers, and types; domain validation entries export their schemas. Application code may import those documented entries but never package internals. The root barrel remains temporarily compatible only while callers migrate, then browser runtime imports from it are prohibited by lint/build contracts.

### A8. Primary content readiness is independent of auxiliary enrichment

Feed sessions and Gallery media cards own the content-ready state. Calendar/date-index data enriches Gallery navigation after cards are available and has an independent loading/error state. This separation must precede speculative prefetching so faster requests do not merely hide incorrect failure semantics.

## Agent operating protocol

### Lead agent responsibilities

The lead agent owns architecture, scope, dependency order, decisions, the implementation contract, final verification, staging, and commit requests. A lower-cost implementation agent may own the bounded source/test edits for one task only after every decision listed below is fixed in writing. Before every task the lead must:

1. Read this roadmap and the current task section completely.
2. Inspect `git status` and preserve unrelated or user-owned work.
3. Resolve generated-file activity before editing route files.
4. Record the exact baseline relevant to the task.
5. Add or identify a failing behavior/contract test before implementation where practical.
6. Assign one edit owner per file and name every allowed edit path, including planned new files.
7. Record the task-specific focused commands and the complete handoff gates.
8. Record what evidence the implementation agent must return.
9. Stop when a required gate is red; do not weaken the gate.

### Lower-cost implementation-agent eligibility

A task is implementation-agent ready only when all of these are true:

- Its dependencies are checked complete and no overlapping task is editing the same owner.
- The lead has already chosen the interface, ownership boundary, fallback behavior, and rollback point. The implementation agent is not asked to choose among designs.
- `.scratch/CONTRACT.md` lists an exact allowlist of edit paths. Directories, globs, “likely files,” and “related tests” are not an edit allowlist.
- The first failing behavioral or build contract and its exact command are named. If a red-first test is genuinely impractical, the contract contains a reproducible measured baseline and the lead's reason.
- Acceptance is observable through named tests, build output, bundle arithmetic, or response evidence. “Improve,” “clean up,” and “measurably” are not sufficient without a threshold or a lead-owned retain/revert decision.
- All approval-gated work is excluded. The task cannot require a browser, deployment, public probing, staging, committing, pushing, dependency installation, or product/visual judgment.
- Stop conditions are explicit, including unexpected owners, a red base, an interface decision, a budget increase, or a result below the task's retain threshold.

If any item is missing, delegate discovery only. The lead resolves the gap and rewrites the contract before implementation starts.

### Lower-cost implementation-agent rules

The implementation agent must:

1. Read `CLAUDE.md`, this operating protocol, the selected task, and `.scratch/CONTRACT.md` completely.
2. Confirm that `git status --short` matches the contract. It must not absorb, revert, format, stage, or commit user-owned changes.
3. Edit only the allowlisted paths. A newly discovered edit path is a stop-and-return condition, not implied permission.
4. Make the named contract fail for the intended reason, then make the smallest implementation pass it.
5. Preserve existing public interfaces and visible behavior unless the contract names an exact change.
6. Run the focused commands, then the complete handoff commands from the contract. It must not weaken, skip, or reinterpret a red check.
7. Leave the roadmap, `.scratch/CONTRACT.md`, generated route output, lockfiles, workflows, budgets, staging area, and commits untouched unless the allowlist names the exact file and purpose.
8. Return the handback report below and stop. It must not start the next task.

Implementation agents must not open a browser or start a development/preview server. Runtime checks that require a browser or a live origin remain a user/lead acceptance step under `CLAUDE.md` and the approval boundaries in this roadmap.

### Required implementation-agent handback

```text
Task: Txx — <single outcome>
Changed paths: <exact list>
Red evidence: <command and the intended failure>
Focused green evidence: <commands and pass counts/results>
Full handoff evidence: <each required command and result>
Before/after evidence: <bytes, graph membership, request contract, or n/a>
Contract deviations: <none, or the exact unresolved mismatch>
Uninspected/unverified: <explicit list>
Risks and lead decisions needed: <none, or stop reason>
```

The lead independently inspects the diff and reruns the required evidence. A clean handback is evidence to review, not permission to update the roadmap or commit.

### Delegation classes for this roadmap

- **Closed, do not redispatch:** T00-T05. Their handoffs are the accepted record. Any regression becomes a new bounded task instead of silently reopening a completed task.
- **Bounded implementation after contract:** T06-T09, T11, T12, and the separately dispatched T13a/T13b/T13c slices.
- **Must be split before implementation:** T10. T10a removes the already-proven Feed-to-Public-Gallery edge; every later measured edge becomes its own lead-approved T10b contract.
- **Decision gate, discovery first:** T14. Scouts may collect evidence, but an implementation agent receives only one selected candidate with a fixed threshold and file allowlist.
- **Lead/approval owned:** T15. Local build, container verification, and report production may be delegated under the exact contract. Deployment, live checks, budget ratchets, roadmap closeout, staging, and commits remain with the lead and require the stated approvals.

| Tasks | Delegation state | Dispatch unit |
| --- | --- | --- |
| T00-T05 | Closed | Do not redispatch; create a new regression task if evidence stops holding |
| T06 | Prepared | One lazy-boundary implementation after fresh bundle baseline |
| T07 | Prepared after T06 | One intent-wiring implementation |
| T08 | Prepared after baseline and visual approval | One controller/surface split |
| T09 | Prepared after T08 | One serial intent-wiring implementation |
| T10 | Split required | T10a known ownership edge; one T10b contract per later measured cause |
| T11 | Prepared | T11a sessions factory, then T11b media factories |
| T12 | Prepared after visual approval | T12a readiness, then T12b retryable errors |
| T13 | Split required | T13a Browse, T13b Upload, then one measured T13c account item at a time |
| T14 | Not yet implementation-ready | One evidence-selected candidate only |
| T15 | Lead/approval owned | Local verifier may report; lead performs live closeout and ratchet |

### Work delegated to subagents

Use discovery/review agents for bounded, read-only, parallel work and one lower-cost implementation agent for the contract's single edit allowlist:

- `search-scout`: locate imports, exports, asset references, matching tests, route IDs, query keys, and prior-art patterns with `rg`/file reads.
- `bundle-scout`: run production builds, read manifests/source maps, compare raw/gzip totals, and report module/request movement. It must not edit configuration.
- `test-scout`: identify the narrowest existing tests and stable behavioral locators. It must reject source-text snapshots when runtime behavior has an owner.
- `delivery-scout`: inspect Nginx/Docker/CI/release paths and perform read-only header checks when live access is approved.
- `diff-reviewer`: review the finished task diff for scope leakage, duplicated state ownership, accidental eager imports, and missing tests.
- `implementation-agent`: execute one completed `.scratch/CONTRACT.md`, own only its allowlisted files, run red/green and handoff commands, return the required report, and stop before staging or the next task.

Searches, inventories, log classification, before/after arithmetic, and contract-bounded source/test edits may be delegated. Architectural choice, contract changes, cross-contract mutation, final verification, staging, committing, deployment, and approval decisions remain with the lead.

### Subagent output contract

Every subagent returns:

1. Facts with module/symbol references.
2. What it inspected and what it did not inspect.
3. Risks or ambiguous ownership.
4. Suggested tests or verification commands.
5. No edits unless the lead explicitly assigned disjoint files.

### Per-task dispatch pattern

For each task, the lead creates a small implementation contract before source edits:

```text
Task: Txx — <single outcome>
Allowed files: <explicit edit-owner list>
Read-only search scope: <directories/symbols>
Out of scope: <nearby behavior that must not change>
Red contract: <focused failing test or measurable baseline>
Required gates: <focused, then repository gates>
Before/after evidence: <bytes, manifest edge, requests, or visible state>
Rollback point: <last independently green commit>
```

Then dispatch bounded discovery in parallel when slots are available:

```text
search-scout: Read Txx only. Use rg and file reads to return an exact symbol/import/
consumer inventory with paths and line references. Do not edit, build, or decide architecture.

test-scout: Read Txx only. Map the required behavior to the narrowest existing tests and
stable runtime assertions. Report missing coverage. Do not edit tests.

bundle-or-delivery-scout: Run the one authorized read-only measurement for Txx and return
the command, artifact/header facts, and before/after arithmetic. Do not edit configuration.

diff-reviewer: After implementation, inspect only the Txx diff against this roadmap and
report scope leakage, ownership duplication, eager edges, and missing gates. Do not fix it.
```

The lead continues local baseline inspection while scouts run, synthesizes their reports, fixes every decision in `.scratch/CONTRACT.md`, and then dispatches one implementation agent. A subagent may receive a code/test edit only when its exact file list is disjoint from all other work, the interface is already decided, and one agent remains the sole owner of each file. Architecture, scope expansion, contract edits, roadmap edits, and cross-contract mutation are never delegated.

### Parallelism restrictions

- Never let two agents edit `PanelFrame`, app startup HTML, Vite configuration, the auth provider, or the same test file concurrently.
- Do not run Vite/TanStack route generation while another agent is reviewing or staging generated route output.
- Do not run multiple production builds concurrently; build artifacts and generated manifests share one output directory.
- Query-prefetch work and the existing route-preload patch both touch the panel composition route and must be serial.
- Asset hashing and first-visit artwork request ownership both touch startup HTML/asset references and must be serial.
- Contracts export changes and application import migrations must use one package-boundary edit owner; subagents may inventory imports but must not bulk-rewrite them.
- Subagents may search these areas concurrently. Source edits begin only after the lead synthesizes their findings and assigns the exact file allowlist to one implementation owner.

## Dependency and execution order

```text
T00 Preserve route-preload baseline
  └─ T01 Add bundle reports and budgets
      ├─ T02 Enable and prove runtime compression
      ├─ T03 Hash startup visual assets
      │   └─ T04 Make hero loading presentation-owned
      ├─ T05 Split contracts core and validation entries
      │   └─ T06 Lazy-load Add Spot UI
      │       └─ T07 Preload Add Spot UI on exact intent
      └─ T08 Lazy-load authentication surface
          └─ T09 Preload auth UI on exact intent

T05 + T06 + T08 measured
  └─ T10 Remove proven and remaining measured graph leakage

T00 complete
  └─ T11 Centralize Feed/Gallery query options
      └─ T12 Separate content readiness and query errors
          └─ T13 Prefetch exact destination data on intent

T02 + T04 + T10 + T13
  └─ T14 Add evidence-backed connection/media scheduling
      └─ T15 Production verification and budget ratchet
```

Tasks that share source files remain serial even when their dependency lines would otherwise allow parallel work.

## Task plan

### T00 — Preserve and land the current route-preload baseline

**Depends on:** none.
**Outcome:** the current intent-preload work is reviewed, fully green, and isolated from all later performance changes.
**Implementation delegation:** closed; do not redispatch. Treat commit `6142645` and the handoff below as the accepted evidence. If route-intent behavior regresses, create a new task with the current route topology instead of replaying this historical contract.

Lead work:

- Review the existing working-tree changes around menu, Upload, Feed/Gallery controls, shared intent props, and tests.
- Confirm signed-out menu intent preloads only public destinations and signed-in intent does not preload unauthorized data.
- Confirm route search/params retain the active workspace and selected spot.
- Confirm preload rejection remains best-effort and never blocks navigation.
- Stage only the named route-preload files if the user separately authorizes a commit.

Delegate:

- Search-scout inventories every changed file and reports unrelated hunks.
- Test-scout maps each new intent event to a focused test and checks touch/pointer/focus coverage.
- Diff-reviewer checks duplicate preload calls, route-key accuracy, and accidental eager imports.

Verification:

- Focused navigation/preload tests.
- Full client tests, web typecheck, lint, style boundaries, build, and `git diff --check`.
- Production-build diagnostic proves the target route chunk request starts before selection; do not gate on a fixed millisecond threshold.

Atomic commit if approved: `perf(web): preload likely panel routes on intent`.

**Handoff (2026-08-28):** T00 is approved and fully green. Intent events preload the exact Upload, Feed, Gallery, About, and authenticated account route code while preserving spot/workspace parameters and best-effort navigation after rejection. Focused verification passed 102 tests across 5 files; the production client build, both TypeScript checks, lint, style boundaries, `git diff --check`, and the full 1,131-test client/server suite passed. T01 is ready.

### T01 — Add compressed bundle reports and ratcheting budgets

**Depends on:** T00.
**Outcome:** CI can detect entry-weight regression even when Vite only emits an advisory.
**Implementation delegation:** closed; do not redispatch. Treat commits `fa8eebd` and `f7e7eb8` and the handoff below as the accepted evidence. Changes to checker semantics, CI placement, or budgets require a new task with a new red fixture and explicit budget authority.

Lead work:

- Add a repository script that reads the production build output and reports raw and gzip bytes for entry JS, entry CSS, known large optional chunks, and total assets.
- Make the build emit or expose a manifest that maps source entries to output files.
- Store budgets in a small explicit configuration rather than embedding unexplained numbers in tests.
- Start with the confirmed baseline plus at most 2% rounding headroom. Lower budgets after each retained optimization.
- Gate entry JS and CSS. Report Mapbox, HLS, Sentry, and route chunks separately so an optional chunk cannot hide inside the entry.
- Add a manifest-graph budget for the default Browse Feed critical path, following transitive static imports and CSS rather than summing filenames by pattern. Record the current observed baseline (approximately 422.6 kB gzip) and replace it with the script's reproducible value before enforcing the first threshold.
- Add module-presence assertions that can later prove Zod is absent from startup and Public Gallery is absent from the default Feed graph.
- Add the budget check after a real production build in CI.

Delegate:

- Bundle-scout identifies the entry and eager dependency graph from the manifest and produces the baseline table.
- Test-scout finds script-test prior art and proposes small fixtures for correct entry selection and threshold failure.
- Search-scout inventories every build invocation so the new check runs once, in the correct job.

Tests first:

- A fixture with an entry below budget passes.
- A fixture above budget fails with the artifact name, actual gzip bytes, budget, and delta.
- Optional chunks are reported but do not count as entry unless the manifest marks them eager.

Acceptance:

- Local build plus budget check is green.
- CI uses production values/placeholders and does not require developer-only environment files.
- The report is stable across content-hash changes.

Atomic commits:

1. `test(web): specify compressed bundle budget reporting`
2. `build(web): enforce production bundle budgets`

**Handoff (2026-08-28):** T01 is complete and fully green. Production builds now emit a content-hash-stable manifest and normalized module inventory; the checker follows only transitive static imports plus attached CSS, reports Mapbox, HLS, Sentry, route chunks, and total output separately, and enforces gzip caps of 295,000 bytes for entry JavaScript, 42,500 bytes for entry CSS, and 432,000 bytes for the default Browse Feed graph. The measured CI-placeholder build is 289,436 / 41,889 / 423,556 gzip bytes. Focused verification passed 13 script tests; both TypeScript checks, lint, style boundaries, `git diff --check`, both production builds, and the full 1,144-test client/server/scripts suite passed. The existing CI web-image build now runs the checker and removes internal manifests before the runtime image is assembled. T02 is ready.

### T02 — Enable and prove runtime compression

**Depends on:** T01.
**Outcome:** compressible files from the production container negotiate gzip and retain correct cache semantics.
**Implementation delegation:** closed; do not redispatch. Treat commits `67bbe3a` and `c63ce4a` and the handoff below as the accepted local/CI evidence. Public verification remains an approval-gated T15 concern.

Lead work:

- Enable gzip in the committed Nginx server configuration.
- Include HTML, JavaScript, CSS, JSON, SVG, and WASM MIME types; use a practical minimum length and compression level.
- Emit `Vary: Accept-Encoding`.
- Keep HTML non-cacheable and hashed assets immutable.
- Normalize the hashed-asset response to one intentional cache policy instead of duplicate `Cache-Control` headers.
- Keep stable PWA/manifest/icon paths on a short, revalidating cache policy rather than treating them as immutable.
- Add a reusable delivery-verifier script that discovers hashed assets from built HTML and performs real GETs with and without `Accept-Encoding: gzip`; a HEAD request is insufficient.
- Verify decompressed response content matches the uncompressed asset.
- In CI, start the built web runtime image, wait for health, run the verifier, and always stop the container even when the verification fails.
- In the release workflow, run a public post-deploy verifier after the web/API restart and before image pruning. Deployment and public probing remain separately approval-gated.

Delegate:

- Delivery-scout inventories Nginx image capabilities, Docker build/run commands, current CI artifact flow, and Caddy ownership evidence.
- Test-scout proposes a container smoke contract covering encoding, variation, cache headers, and SPA fallback.
- Diff-reviewer checks that compression is not incorrectly applied to already-compressed images.

Acceptance:

- Main JS and CSS responses contain `Content-Encoding: gzip` when accepted.
- The transferred main-entry body is within a small tolerance of Vite's reported gzip size.
- `/index.html` remains `no-store`.
- Hashed `/assets/` responses remain one-year immutable.
- Stable PWA assets remain revalidatable and are not given a false immutable promise.
- SPA fallback, health response, expected release identity, and absence of unresolved build placeholders are verified.
- Image/video content remains byte-identical and is not pointlessly recompressed.

Atomic commits:

1. `test(web): specify compressed runtime responses`
2. `perf(web): enable gzip for production assets`

Post-deploy gate: verify an actual live GET, not only the container. Deployment remains separately approval-gated.

**Handoff (2026-08-28):** T02's repository work is complete and fully green. The unprivileged Nginx image now negotiates gzip for HTML, JavaScript, and CSS; emits one intentional immutable policy for hashed assets; keeps entry/release HTML state non-cacheable; and gives manifest/icons a short revalidating policy without compressing images. A dependency-free real-GET verifier now proves release identity, resolved HTML, gzip/decompression equality, `Vary`, cache headers, stable assets, and SPA fallback locally and in CI; tagged releases run the same public check before image pruning. The local runtime image passed at 288,354 transferred gzip bytes for 928,010 identity JavaScript and 41,860 for 275,084 identity CSS; the plain favicon was unencoded with one five-minute revalidating policy. Focused verification passed 10 verifier tests and 23 total script tests; 983 client tests, 148 server tests, both TypeScript checks, lint, style boundaries, both production builds, YAML parsing, and `git diff --check` passed. No deployment or live public request was performed; that post-deploy proof remains separately approval-gated. T03 is ready.

### T03 — Move startup visual assets onto hashed immutable URLs

**Depends on:** T01.
**Outcome:** the bootstrap logo and responsive first-visit artwork are processed by Vite and can be cached immutably without stale stable-path risk.
**Implementation delegation:** closed; do not redispatch. Treat commit `2a5a5d2` and the handoff below as the accepted asset identity and build-graph evidence. Any artwork replacement is a new browser-visible task and requires visual approval.

Lead work:

- Move only the logo and first-visit artwork into the source asset graph.
- Update startup HTML, first-visit CSS, and React image references to resolve one generated URL per asset.
- Preserve intrinsic dimensions and the exact approved artwork.
- Confirm the HTML transform resolves the bootstrap logo before JavaScript execution.
- Keep manifest/icons and other externally stable public files out of this migration.

Delegate:

- Search-scout finds all string, CSS URL, preload, test, manifest, and documentation references to the three assets.
- Bundle-scout verifies emitted hashes, deduplication, file size, and immutable-path placement.
- Test-scout identifies the current broken-logo/startup shell regression contracts.

Tests first:

- Production HTML references an existing emitted logo asset.
- CSS and React resolve the same emitted hero artifacts rather than duplicate copies.
- No old stable hero/logo path remains in runtime source.

Acceptance:

- Bootstrap logo renders with JavaScript disabled or before the app entry completes.
- First-visit portrait and landscape visual checks remain unchanged.
- Returning navigation does not produce a broken image.

Atomic commit: `perf(web): fingerprint startup visual assets`.

**Handoff (2026-08-29):** T03 is complete and fully green. The unchanged 600×272 logo, 1200×2133 portrait artwork, and 2560×1340 landscape artwork now live in Vite's source asset graph and emit as exactly three content-hashed `/assets/` files with their original byte sizes and SHA-256 identities. Production HTML and React share the one hashed logo URL; production HTML and entry CSS share one URL per hero; no stable public-root copy or old runtime URL remains. The production bundle checker now enforces manifest ownership, hashed placement, physical deduplication, byte identity, consumer references, the actual bootstrap-shell image URL, and removal of stable fallbacks. Verification passed 28 focused bundle-checker tests, 23 focused startup/first-visit tests, all 38 script tests, 30 layout tests, 1,151 client/server tests, both TypeScript checks, lint, style boundaries, both production builds, bundle budgets, and `git diff --check`. No deployment or live public request was performed. T04 is ready.

### T04 — Make first-visit artwork loading presentation-owned

**Depends on:** T03.
**Outcome:** first-visit artwork is requested only after the application has decided to render the intro, avoiding wasted downloads for authenticated, returning, and otherwise ineligible visitors.
**Implementation delegation:** closed; do not redispatch. Treat commit `9d65b5a` and the handoff below as the accepted behavior. The measured escape hatch remains a separate, approval-gated task.

Lead work:

- Remove the unconditional hero preload from startup HTML.
- Keep the dark first-visit fallback and persistent map mounted while session/eligibility is resolving.
- Attach the responsive portrait/landscape artwork only when `FirstVisitGate` reaches the application-owned `intro` presentation. Do not render or request it during `checking-session`.
- Preserve existing acknowledgement, storage-denied, authenticated bypass, review-mode, and session-resolution policy; this task changes request ownership, not eligibility rules.
- Avoid a duplicate preload/image request mechanism: the feature render owns the request by default.
- Keep the logo high priority because the bootstrap shell uses it immediately.

Delegate:

- Search-scout inventories every hero URL/preload/reference and the presentation-state owner.
- Test-scout proposes request-presence tests for new, authenticated, returning, storage-denied, review, portrait, and landscape cases.
- Bundle/browser-scout records cold request sets and bytes for every eligibility state and confirms no duplicate artwork request.

Acceptance:

- New portrait visitor requests only portrait artwork once the intro presentation is selected.
- New landscape visitor requests only landscape artwork once the intro presentation is selected.
- Authenticated, acknowledged returning, and direct ineligible visitors request neither hero.
- Review mode still loads the artwork and remains deterministic.
- The map continues loading behind the overlay.
- No hero request occurs while session eligibility is unresolved.

Atomic commits:

1. `test(web): specify presentation-owned intro artwork`
2. `perf(web): load intro artwork only when presented`

Measured escape hatch: if real-device new-visitor LCP regresses materially, evaluate one responsive early preload for locally unacknowledged users in a separate commit. Record that static HTML cannot know a fresh device is already authenticated, so this deliberately trades some authenticated waste for new-user LCP. Do not adopt that trade without before/after evidence.

Optional follow-up, only with visual approval: downscale or losslessly recompress the 600 px logo for its 180 CSS px maximum while retaining a two-device-pixel source.

**Handoff (2026-08-29):** T04 is complete and fully green. Startup HTML no longer preloads or references either first-visit hero; the existing portrait/landscape artwork tree now mounts exactly once only when `FirstVisitGate` resolves the application-owned `intro` presentation, including deterministic review mode. Session resolution retains the dark covering veil and the persistent map while mounting no artwork; authenticated, acknowledged returning, and direct-ineligible states likewise mount none, and storage-denied behavior remains intro-safe. The production bundle report proves one unchanged hashed artifact per hero with references `HTML 0 / entry JS 0 / entry CSS 1`, while the high-priority logo remains `HTML 2 / entry JS 1 / entry CSS 0`. Verification passed 25 focused tests, the production client build and bundle budgets, 30 layout contracts, both TypeScript checks, lint, style boundaries, `git diff --check`, and the full 1,153-test client/server suite. No deployment, live public request, or real-iPhone request capture was performed; those remain later roadmap acceptance. T05 is the next ready task in document order.

### T05 — Split contracts core and validation public entries

**Depends on:** T01.
**Outcome:** browser startup code can consume shared constants, types, and Zod-free helpers without pulling the validation library or unsupported package internals into the entry graph.
**Implementation delegation:** closed; do not redispatch. Treat commit `3b1a06b` and the handoff below as the accepted package-boundary evidence. New contract entries require their own package-export, resolution, boundary-rule, and browser-graph contract.

Lead work:

- Add an explicit `@swelldays/contracts/core` public entry containing only types, constants, and runtime helpers whose dependency graph contains no Zod schema.
- Add explicit domain validation entries such as `@swelldays/contracts/validation/spot`, `.../media`, `.../upload`, and `.../checkout` based on actual ownership. Prefer narrow domain entries over one validation mega-barrel when it preserves useful lazy boundaries.
- Update `packages/contracts/package.json` exports and both application TypeScript path mappings so source, tests, published packages, and production builds resolve the same supported entries.
- Replace or extend the API build's current root-only esbuild alias (`@swelldays/contracts=.../src/index.ts`) so public subpaths resolve identically in development, typecheck, and the bundled server artifact. Do not add one ad hoc alias per caller.
- Change the style-boundary/lint rule from “ban every contracts subpath” to “allow only documented public entries; reject `src/`, internal files, and unknown subpaths.”
- Migrate browser runtime imports first. Keep type-only imports explicit and migrate API validation imports in separate mechanical commits so failures are easy to localize.
- Keep the root entry temporarily compatible while migration is in progress. Once callers are migrated, prohibit browser runtime imports from the root; retain only compatibility that is intentionally required by external consumers.
- Add a manifest/source-map contract proving Zod is absent from the browser startup entry. Do not rely only on a smaller filename, because Zod could move to another immediately requested chunk.

Delegate:

- Search-scout classifies every contracts import as type-only, core runtime, or validation by domain and returns a file-by-file migration table. This is read-only; no automated replacement.
- Bundle-scout identifies the exact root-barrel-to-Zod edge and compares entry plus cold-home critical totals after each migration phase.
- Test-scout inventories package export, TypeScript path, and style-boundary test coverage and supplies negative fixtures for internal/unknown subpaths.
- Diff-reviewer checks that no application imports `packages/contracts/src/*` and no domain validation entry re-exports unrelated schemas.

Tests first:

- Supported `core` and validation entries resolve in web, API, tests, and package builds.
- An internal or unknown contracts subpath fails the boundary check.
- Importing `core` into a browser fixture does not include Zod in its production manifest graph.

Acceptance:

- Zod is absent from the startup entry and from every immediately requested cold-home chunk unless a startup feature genuinely validates with it.
- Shared contract ownership remains centralized; no application-local copy of constants, types, or schemas is introduced.
- Web/API typechecks, contract tests, lint, style-boundaries, and builds remain green.
- The before/after report attributes the reduction to the public-entry seam rather than to chunk naming.

Atomic commits:

1. `test(contracts): specify supported public entries`
2. `refactor(contracts): separate core and validation entries`
3. `refactor(web): consume contracts public entries`
4. `refactor(api): consume contracts public entries`
5. `build(web): keep validation libraries out of startup`

**Handoff (2026-08-29):** T05 is complete and fully green. `@swelldays/contracts/core` now owns the Zod-free constants, helpers, SEO metadata, and domain types; checkout, media, spot, and upload validation each have an explicit supported public entry. Package exports, exact web/API TypeScript mappings, Vitest/Vite resolution, the API's generic esbuild directory alias, and ESLint's allowlist now enforce the same boundary, and every application import has migrated off the compatibility root. A production browser fixture proves that importing only `core` reaches neither Zod nor validation modules, while the real startup inventory now excludes checkout, media, and upload validation. The still-eager Add Spot UI legitimately retains `validation/spot` and Zod until T06; T05 did not absorb that lazy-boundary work. The fresh production comparison moved entry JavaScript from 289,641 to 291,840 gzip bytes and the default Browse Feed graph from 423,790 to 426,263 gzip bytes (entry CSS remained 41,913); all existing budgets remain green and unchanged, so no byte reduction is claimed before T06 realizes the seam. Focused verification passed 47 tests; contracts/web/API typechecks, lint, style boundaries, both production builds, bundle budgets, import/output scans, `git diff --check`, and the full 1,205-test client/server suite passed. T06 is ready.

### T06 — Introduce a lazy Add Spot UI boundary

**Depends on:** T05.
**Outcome:** Add Spot state remains globally available, while its panel, validation schemas, and form UI leave the startup graph.

**Implementation-agent packet:** ready after the lead records a fresh `npm run build:client && npm run check:bundle-budgets` baseline in `.scratch/CONTRACT.md`.

- Fixed design: keep `AddSpotProvider`, `useAddSpot`, and `useAddSpotStore` eager through `features/AddSpot/index.ts`. Add `features/AddSpot/AddSpotUiBoundary.tsx`, which owns one cached dynamic import of `./ui/AddSpotPanel`, exports `LazyAddSpotPanel`, and exposes the same module promise for T07's `preloadAddSpotUi`. `GlobeScene` renders the lazy component only for `immersiveMapInput` with a non-covering `null` fallback. Do not add a provider, store, or route.
- Exact edit allowlist: `apps/web/src/features/AddSpot/index.ts`; new `apps/web/src/features/AddSpot/AddSpotUiBoundary.tsx`; new `apps/web/src/features/AddSpot/AddSpotUiBoundary.test.tsx`; `apps/web/src/views/GlobeScene/GlobeScene.tsx`; `apps/web/src/views/GlobeScene/GlobeScene.test.tsx`; `apps/web/bundle-budgets.json`; `apps/web/scripts/bundleBudget.test.ts`. `apps/web/scripts/bundleBudget.ts` is read-only because the existing module-absence mechanism is sufficient.
- Red contract: the boundary test proves the UI loader is not called while Add Spot is inactive, is called once after the existing store enters, preserves the seeded name/pin, and unmounts on exit without remounting the map. The bundle fixture/config must fail while Add Spot UI, `validation/spot`, or `node_modules/zod/` remains in the entry graph.
- Focused commands: `npx vitest run --project client apps/web/src/features/AddSpot/AddSpotUiBoundary.test.tsx apps/web/src/views/GlobeScene/GlobeScene.test.tsx`; `npx vitest run --project scripts apps/web/scripts/bundleBudget.test.ts`; `npm run build:client`; `npm run check:bundle-budgets`.
- Retain threshold: after a fresh identical-env build, entry or default Browse Feed must fall by at least 5,120 gzip bytes, and the entry graph must exclude Add Spot UI, spot validation, and Zod. If it does not, stop and return the measurements without changing budgets.
- Stop conditions: the split requires edits to `AddSpotProvider.tsx`, `addSpotStore.ts`, `useAddSpotFlow.ts`, generated routes, Vite configuration, or any UI/CSS behavior; a new eager edge keeps the panel in startup; the fallback would cover/remount the map; any budget must rise.

Lead work:

- Keep the Add Spot store and lightweight provider eager.
- Create an explicit feature-owned lazy UI entry rather than importing an internal file across the feature boundary.
- Render the lazy panel only when Add Spot is active.
- Provide a stable lightweight fallback that does not cover or remount the map.
- Preserve pending spot name, temporary pin, step transitions, reverse geocoding, proximity handling, cancellation, and navigation.

Delegate:

- Search-scout traces every Add Spot import and classifies state/controller/UI dependencies.
- Bundle-scout proves which remaining Add Spot UI modules leave the entry after T05 and records both entry and home-critical totals.
- Test-scout maps existing Add Spot flow tests and identifies a lazy-mount boundary test.

Tests first:

- Inactive app shell does not instantiate the Add Spot UI module.
- Activating the existing store mounts the panel once without losing seed state.
- Cancellation unmounts UI but leaves the persistent map mounted.

Acceptance:

- Entry/cold-home gzip decreases measurably after the contracts split. Keep the lazy boundary when it removes meaningful rare UI (target at least 5 kB gzip or an otherwise clear critical-graph benefit); revert speculative structure if it only renames immediately requested bytes.
- Add Spot behavior and map continuity tests pass.
- No second provider/store is introduced.

Atomic commits:

1. `refactor(web): separate lightweight Add Spot runtime`
2. `perf(web): lazy-load Add Spot workspace UI`

**Handoff (2026-08-30):** T06 is complete and fully green. The eager Add Spot feature entry now retains only the lightweight provider, hook, and store while a feature-owned `AddSpotUiBoundary` owns one cached, rejection-resetting dynamic import for the workspace panel. `GlobeScene` mounts that lazy panel only for the existing `immersiveMapInput` state under a non-covering `null` Suspense fallback. A real lifecycle test proves inactive startup does not evaluate the UI module, activation preserves the seeded name and temporary pin, cancellation unmounts the panel, and the same map DOM node remains mounted. Production graph rules now exclude Add Spot UI, controller/coordinate modules, spot validation, and Zod from entry; Browse applies the same Add Spot exclusions while retaining its independent search/media Zod edge. Entry JavaScript moved from 934,949 raw / 291,864 gzip bytes to 850,717 raw / 269,159 gzip (−22,705 gzip), entry CSS moved from 275,116 raw / 41,913 gzip to 271,169 raw / 41,218 gzip, and default Browse Feed moved from 1,483,637 raw / 426,327 gzip to 1,473,392 raw / 425,136 gzip. No byte cap increased. Focused verification passed 30 client tests and 29 bundle-script tests; both typechecks, lint, style boundaries, both production builds, fresh bundle budgets, `git diff --check`, and the full 1,210-test client/server suite passed. T07 is ready.

### T07 — Preload Add Spot UI on exact intent

**Depends on:** T06.
**Outcome:** moving Add Spot out of startup does not create a noticeable wait after the user chooses “Add as a new spot.”

**Implementation-agent packet:** ready only after T06 is independently green and committed.

- Fixed design: export `preloadAddSpotUi` from `features/AddSpot/index.ts` using T06's cached module promise. Attach it directly to the rendered “Add as a new spot” button's pointer-enter, pointer-down, and focus events. For the signed-out action, call `preloadAuthSurface` from T09 instead; if T09 is not complete, leave signed-out behavior unchanged and do not partially implement that branch.
- Exact edit allowlist: `apps/web/src/features/AddSpot/AddSpotUiBoundary.tsx`; `apps/web/src/features/AddSpot/AddSpotUiBoundary.test.tsx`; `apps/web/src/features/AddSpot/index.ts`; `apps/web/src/widgets/FeedDrawer/FeedSearch.tsx`; `apps/web/src/app/routes/-_panel.test.tsx`. `AppButton` already forwards native intent handlers and is read-only.
- Red contract: authenticated pointer-enter, pointer-down, and focus call one deduplicated loader before `startAddSpot`; repeated intent is idempotent; rejected preload is consumed and a later click still activates the normal lazy render; signed-out intent does not call the Add Spot loader.
- Focused command: `npx vitest run --project client apps/web/src/features/AddSpot/AddSpotUiBoundary.test.tsx apps/web/src/app/routes/-_panel.test.tsx`.
- Stop conditions: another Add Spot entry action is discovered outside the search empty action; satisfying signed-out behavior would require implementing T09 early; the loader needs a second promise/cache owner; any click, search-term seed, or auth-continuation behavior would change.

Lead work:

- Export one idempotent `preloadAddSpotUi` operation from the feature-owned lazy entry.
- Trigger it from pointer enter, pointer down/touch intent, and focus on the actual Add Spot action, not from global startup.
- For signed-out users, preload auth UI instead of Add Spot UI.
- Allow repeated intent events; the module promise must be deduplicated.

Delegate:

- Search-scout locates every Add Spot entry action and confirms which are reachable signed out.
- Test-scout verifies exact action intent rather than asserting implementation-specific dynamic-import text.

Acceptance:

- Add Spot chunk request begins before activation on supported intent events.
- Signed-out intent does not download the Add Spot form unnecessarily.
- Failed preloads do not prevent a later click from retrying through the normal lazy import.

Atomic commit: `perf(web): preload Add Spot UI on user intent`.

**Handoff (2026-08-31):** T07 is complete and fully green. The authenticated “Add as a new spot” action now starts the existing feature-owned Add Spot UI loader on pointer enter, pointer down, and focus, while repeated events share its one cached module promise. Speculative rejection remains best-effort: the loader clears its cache, the event handler consumes the failure, and the later authoritative activation retries and preserves the seeded search term, panel lifecycle, and persistent map. Signed-out behavior remains unchanged and performs no Add Spot preload; T09 still owns future auth-surface intent warming. The implementation agent returned one test-order stop; the lead consolidated deduplication, rejection, and activation retry into one real lifecycle test to avoid a test-only reset API or second cache owner. Focused verification passed 77 tests across the lazy boundary and panel route files; both TypeScript checks, lint, style boundaries, both production builds, `git diff --check`, and the full 1,212-test client/server suite passed. No browser, deployment, live request, or visual check was performed because this task has no visible behavior change. T08 is next but requires the roadmap's explicit visual approval before implementation.

### T08 — Split the authentication controller from the modal surface

**Depends on:** T01.
**Outcome:** auth continuation/context remains root-owned, while modal, login, registration, and related control UI load only when needed.

**Implementation-agent packet:** ready after the lead records a fresh bundle baseline, confirms T06/T07 are not editing shared intent callers, and obtains visual approval for the rare load-error retry/close fallback.

- Fixed design: `AuthModalProvider.tsx` keeps only context, opened/mode/continuation state, `open`/`close`, authenticated continuation, and Escape capture. Move the Mantine `Modal`, viewport presentation/style, `AuthPage`, and surface CSS import into new `AuthModalSurface.tsx`. Add `AuthSurfaceBoundary.tsx` with one cached dynamic-import function whose cache clears on rejection. It owns a fresh `lazy(...)` type per retry generation and a local error boundary, so retry does not reuse React's rejected lazy payload. Mount it only while opening/open. Its small native fallback exposes Retry and Close through provider callbacks and never owns continuation state.
- Exact edit allowlist: `apps/web/src/features/Auth/AuthModalProvider.tsx`; `apps/web/src/features/Auth/AuthModalProvider.test.tsx`; new `apps/web/src/features/Auth/AuthModalSurface.tsx`; new `apps/web/src/features/Auth/AuthSurfaceBoundary.tsx`; new `apps/web/src/features/Auth/AuthSurfaceBoundary.module.css`; new `apps/web/src/features/Auth/AuthSurfaceBoundary.test.tsx`; `apps/web/src/features/Auth/index.ts`; `apps/web/bundle-budgets.json`; `apps/web/scripts/bundleBudget.test.ts`. Existing `AuthModalProvider.module.css` and the mobile layout harness are read-only inputs; any required edit to them is a stop condition because normal auth presentation must not change.
- Red contract: a closed provider exposes working `open`/`close` context without loading the surface; opening loads once and preserves the supplied continuation; Escape closes only auth; a rejected first load shows retry/close behavior and a retry can load successfully. The bundle contract fails while auth forms, `AuthPage`, or the modal surface remains in the entry graph.
- Focused commands: `npx vitest run --project client apps/web/src/features/Auth/AuthModalProvider.test.tsx apps/web/src/features/Auth/AuthSurfaceBoundary.test.tsx`; `npx vitest run --project scripts apps/web/scripts/bundleBudget.test.ts`; `npm run build:client`; `npm run check:bundle-budgets`; after the user's manual visual approval, `DEV_HTTPS=true npm run test:layout` at final closeout only.
- Retain threshold: the entry or default Browse Feed graph must fall by at least 5,120 gzip bytes with auth forms absent from signed-in/closed startup. Stop and return measurements without raising budgets if it does not.
- Stop conditions: root session ownership must move; direct `/auth` route behavior must change; the fallback cannot close/retry; mobile/dialog geometry or copy changes; another task is editing `AuthModalProvider.tsx` or `mobileLayoutContract.tsx`.

Lead work:

- Keep the context, `open`/`close`, continuation reference, mode state, and Escape arbitration in the eager controller unless evidence supports a smaller safe owner.
- Move the modal surface and forms behind a feature-owned lazy entry.
- Mount the lazy surface only while opening/open.
- Preserve full-screen versus dialog policy, keyboard geometry, mode switching, errors, successful continuation, and close semantics.
- Do not change the direct auth route's route-splitting behavior.

Delegate:

- Search-scout traces auth context consumers and every way the modal opens.
- Bundle-scout records which Mantine/auth form modules leave entry and checks that Better Auth session state needed by the root remains eager.
- Test-scout maps continuation, Escape, mobile viewport, login/register, and route tests.

Tests first:

- Closed provider exposes a functioning context without rendering auth surface.
- Opening mounts the surface and preserves the supplied continuation.
- Escape closes only the interrupt, not a route surface beneath it.
- Loading failure produces a retryable fallback rather than trapping the user.

Acceptance:

- Entry gzip decreases; keep the split only if the critical graph improves measurably.
- Signed-in startup does not download auth forms.
- All existing mobile auth and signed-out Upload contracts remain green.

Atomic commits:

1. `refactor(web): isolate auth modal controller`
2. `perf(web): lazy-load authentication surface`

**Handoff (2026-08-31):** T08 is complete and fully green. `AuthModalProvider.tsx` now keeps only context, opened/mode/continuation state, `open`/`close`, authenticated continuation, and capture-phase Escape, mounting a new `AuthSurfaceBoundary` only while `opened` is true. The Mantine modal, viewport presentation/metrics, unchanged auth stylesheet, and `AuthPage` moved unchanged into new `AuthModalSurface.tsx`, which `AuthSurfaceBoundary` loads through one cached dynamic import; a local error boundary renders a native "Sign in unavailable" fallback with working Close and Retry actions. `scripts/check-style-boundaries.mjs`'s modal z-index rule now targets `AuthModalSurface.tsx`, the file that actually renders the modal. Two deviations from `.scratch/CONTRACT.md`, both found only after the user's own in-browser manual check the contract required before closeout — proof that gate is load-bearing, not a formality: (1) the native Retry/Close buttons tripped the pre-existing `AppButton.boundary.test.ts` allowlist rule; the contract itself required avoiding an `AppButton`/Mantine dependency in this fallback, so the lead added `AuthSurfaceBoundary.tsx` to that allowlist as the matching machine-enforcement update rather than weakening the rule. (2) The user's manual check found Retry did not actually recover: a browser that fails to fetch a dynamically imported module keeps rejecting every later `import()` of that exact URL even after connectivity returns, so the contract's fresh-lazy-type-per-generation in-place retry could never succeed in a real browser, only in the mocked test. With the user's explicit approval, Retry now reloads the page — the only reliable recovery — and a new `authReloadIntent.ts` (sessionStorage, following the existing `firstVisitStorage.ts` pattern) carries the sign-in mode across that reload so `AuthModalProvider` reopens the form immediately from its first paint via lazy initial state, not a post-mount effect. Production evidence: entry JavaScript moved from 850,774 raw / 269,172 gzip bytes to 831,735 raw / 263,905 gzip (−5,267 gzip, past the 5,120 gzip retain threshold), entry CSS moved from 271,169 raw / 41,218 gzip to 268,315 raw / 40,757 gzip, and the default Browse Feed graph moved from 1,473,534 raw / 425,198 gzip to 1,460,673 raw / 422,455 gzip. The bundle-budget module-absence assertion proves `AuthModalProvider.module.css`, `AuthModalSurface.tsx`, and every `features/Auth/ui/` module are absent from the entry graph while a dynamic-only auth module correctly stays unreported. No numeric budget cap changed. Focused verification passed 17 tests across three Auth test files plus the AppButton boundary test, and 30 bundle-script tests; both TypeScript checks, lint (including `react-hooks/set-state-in-effect`, which caught and fixed a same-session regression), style boundaries, both production builds, fresh bundle budgets, `git diff --check`, and the full 1,220-test client/server suite passed. No deployment or live request was performed. T09 is ready.

### T09 — Preload authentication UI on exact intent

**Depends on:** T08.
**Outcome:** the lazy auth surface is warm before common sign-in interruptions.

**Implementation-agent packet:** dispatch as one serial intent-wiring task after T08. Do not combine it with T07.

- Fixed design: `preloadAuthSurface` reuses T08's single cached module promise and resolves to `void`. Wire it only on the signed-out Sign in menu item, signed-out Upload action, and signed-out “Add as a new spot” action. Use pointer-enter, pointer-down, and focus on the actual action element. Authenticated paths never call it. Rejection is consumed and click/open remains authoritative.
- Exact edit allowlist: `apps/web/src/features/Auth/AuthSurfaceBoundary.tsx`; `apps/web/src/features/Auth/AuthSurfaceBoundary.test.tsx`; `apps/web/src/features/Auth/index.ts`; `apps/web/src/widgets/AppNavigation/MenuControl.tsx`; `apps/web/src/widgets/AppNavigation/MenuControl.test.tsx`; `apps/web/src/app/routes/_panel.tsx`; `apps/web/src/app/routes/-_panel.test.tsx`; `apps/web/src/widgets/FeedDrawer/FeedSearch.tsx`.
- Red contract: each of the three signed-out actions exercises all supported intent events; repeated events share one load; authenticated variants do not load auth; a rejected preload does not block `openAuthModal` or its continuation.
- Focused command: `npx vitest run --project client apps/web/src/features/Auth/AuthSurfaceBoundary.test.tsx apps/web/src/widgets/AppNavigation/MenuControl.test.tsx apps/web/src/app/routes/-_panel.test.tsx`.
- Stop conditions: wiring requires a global startup listener, a second loader/cache, a change to shared control visuals, or changes to auth eligibility/continuation.

Lead work:

- Export one deduplicated `preloadAuthSurface` operation.
- Attach it to the signed-out menu item, signed-out Upload action, and signed-out Add Spot action through shared intent-capable controls.
- Do not preload auth for authenticated users.
- Keep preload failure best-effort.

Delegate:

- Search-scout inventories every `openAuthModal` caller and classifies frequency/visibility.
- Test-scout checks pointer, touch/pointer-down, and keyboard focus paths with stable role-based locators.

Acceptance:

- Auth chunk is absent from signed-in startup.
- On signed-out intent, its request starts before `open` renders the surface.
- Continuation behavior remains unchanged for Upload and Add Spot.

Atomic commit: `perf(web): preload auth UI on gated action intent`.

**Handoff (2026-08-31):** T09 is complete and fully green. `features/Auth` now exports one deduplicated `preloadAuthSurface`, reusing T08's single cached `loadAuthSurface` module promise and resolving to `undefined` on both success and rejection. It is wired to pointer-enter, pointer-down, and focus on exactly three signed-out entry points: the "Sign in" menu item in `MenuControl`, the panel "Upload" action in `_panel.tsx` (alongside its existing unconditional route-code preload, unchanged), and the "Sign in to add as a new spot" action in `FeedSearch` — the branch T07 explicitly deferred to this task. Authenticated variants of all three never call it, and a rejected preload still leaves `openAuthModal`/its continuation working normally. `Menu.Item`'s test mock was extended to forward the same pointer/focus props it drops today, matching how the real Mantine component already forwards them. Focused verification passed 93 tests across the boundary, menu, and panel route files, including 2 new tests proving `preloadAuthSurface` dedupes concurrent calls to one module load and still resolves after a rejection (clearing the cache for a fresh attempt). Both TypeScript checks, lint, style boundaries, `git diff --check`, and the full 1,225-test client/server suite passed. No bundle-budget change was needed or made; this task adds no new lazy boundary. No deployment, live request, or browser check was performed because this task has no visible behavior change. T10 is next but must be split into T10a before dispatch, per the roadmap's delegation rules.

### T10 — Remove proven and remaining measured graph leakage

**Depends on:** T05, T06, and T08.
**Outcome:** the known Feed-to-Public-Gallery dependency is removed, then only modules proven unnecessary on the cold home path leave the critical graph; feature boundaries remain explicit.

**Implementation-agent packet:** never dispatch T10 as one open-ended cleanup. Dispatch T10a below; convert each additional measured cause into one separately numbered T10b contract after the lead approves its evidence.

- T10a fixed design: move `GalleryEmptyState` and its CSS unchanged to new neutral owner `shared/ui/PanelCollectionEmptyState/`, rename the symbol `PanelCollectionEmptyState`, make `SessionFeed` and `PublicGallery` import that owner, and remove the feature export. Do not reuse the existing `PanelEmptyState` in `shared/ui/PanelRouteLayout.tsx`; it has a required action and a different route-level presentation. This is an ownership move with no copy, geometry, or behavior change.
- T10a exact edit allowlist: `apps/web/src/features/PublicGallery/ui/GalleryEmptyState.tsx`; `apps/web/src/features/PublicGallery/ui/GalleryEmptyState.module.css`; `apps/web/src/features/PublicGallery/index.ts`; `apps/web/src/features/PublicGallery/PublicGallery.tsx`; `apps/web/src/features/PublicGallery/PublicGallery.test.tsx`; `apps/web/src/widgets/SidePanel/SessionFeed.tsx`; `apps/web/src/widgets/SidePanel/SessionFeed.test.tsx`; new `apps/web/src/shared/ui/PanelCollectionEmptyState/PanelCollectionEmptyState.tsx`; new `apps/web/src/shared/ui/PanelCollectionEmptyState/PanelCollectionEmptyState.module.css`; new `apps/web/src/shared/ui/PanelCollectionEmptyState/index.ts`; `apps/web/bundle-budgets.json`; `apps/web/scripts/bundleBudget.test.ts`. `apps/web/src/shared/ui/PanelRouteLayout.tsx` is read-only.
- T10a red contract: the default Browse Feed graph fails a module-absence assertion while any `features/PublicGallery/` module or feature-only CSS is reachable; successful empty Feed and Gallery states render the unchanged titles, descriptions, and action behavior through the neutral owner.
- T10a focused commands: `npx vitest run --project client apps/web/src/widgets/SidePanel/SessionFeed.test.tsx apps/web/src/features/PublicGallery/PublicGallery.test.tsx`; `npx vitest run --project scripts apps/web/scripts/bundleBudget.test.ts`; `npm run build:client`; `npm run check:bundle-budgets`.
- T10a stop conditions: Public Gallery remains reachable for a legitimate non-empty Feed dependency; moving the CSS changes geometry; another shared owner already provides the exact presentation; removing the edge does not remove the feature from the default Feed graph.
- T10b contract requirement: name one measured import or CSS side-effect edge, its exact current and proposed owners, an exact file allowlist, before/after entry and Browse Feed gzip totals, visual-risk tests, and a lead-owned retain/revert threshold. No “remaining barrels/styles” batch is allowed.

Lead work:

- Move the generic empty-state presentation currently exported as `GalleryEmptyState` to a neutral shared UI owner, or replace it with a truly feature-neutral panel state component.
- Make `SessionFeed` import that neutral owner directly. `SessionFeed` must not import the `features/PublicGallery` public entry.
- Rebuild with a temporary source map and compare generated-byte ownership after T05/T06/T08 and after removing the known Public Gallery edge.
- Trace remaining route-only UI in the entry to an actual import/public-API/CSS side-effect path.
- Prefer explicit feature subpath entry points over arbitrary deep imports.
- Move Mantine date/carousel styles from global startup only when their owning lazy component can load the style with no flash or ordering regression.
- Make one boundary change at a time and rebuild after each.
- Delete a change if it only moves bytes among immediately requested chunks or worsens cache/request overhead.

Delegate:

- Bundle-scout owns source-map and manifest comparison.
- Search-scout inventories public barrels on the root and Browse critical paths, noting CSS side effects.
- Search-scout also finds generic error/empty/loading presentations wrongly owned by feature barrels and reports consumers before any move.
- Test-scout identifies visual/style contracts for each proposed stylesheet move.
- Diff-reviewer rejects broad “replace every barrel” churn.

Acceptance:

- Every retained change has a before/after critical-byte result.
- The default Browse Feed manifest graph no longer contains the Public Gallery feature chunk or its feature-only CSS. Baseline to beat: 57.63 kB raw / 19.13 kB gzip plus roughly 1.9 kB CSS attributed to that edge.
- No FOUC, missing Mantine styles, or feature-boundary violation.
- Combined objective after T05/T06/T08/T10: main entry at or below 260 kB gzip, treated as an objective to validate rather than a reason to game chunking.

Atomic commits, one measured cause each:

- `refactor(web): separate <feature> runtime entry`
- `perf(web): load <library> styles with <feature>`

**Handoff (2026-08-31):** T10a is complete and fully green. The generic empty-state presentation formerly exported as `features/PublicGallery`'s `GalleryEmptyState` now lives, byte-identical in its CSS and unchanged in its JSX/markup, at neutral owner `shared/ui/PanelCollectionEmptyState`, exporting the renamed `PanelCollectionEmptyState`. `SessionFeed` and `PublicGallery` both import it from there; the old file pair is deleted and the `features/PublicGallery` barrel no longer re-exports it. `apps/web/scripts/bundleBudget.test.ts` gained a permanent regression test (mirroring the existing Auth/AddSpot ones) proving the analyzer correctly flags a `features/PublicGallery/` module reachable from the `browse-feed` graph.

The lead added a `browse-feed` module-absence assertion to `bundle-budgets.json` before implementation, per the red-first contract, and confirmed it failed against the real build with `GalleryEmptyState.tsx` among the forbidden matches. After the move, `check:bundle-budgets` was still red — but `GalleryEmptyState.tsx` was no longer in the forbidden list, confirming the one measured edge this task targeted is closed. The remaining failures (`PublicGallery.tsx`, `MediaLightbox.tsx`, `PublicCard.tsx`, and others under `features/PublicGallery/`) come from a second, previously unmeasured edge: `SessionDetail.tsx` (in the `widgets/SidePanel` barrel, which `_panel.index.tsx` imports for `SessionFeed`) imports `MediaLightbox`/`PublicCard` from `features/PublicGallery` and also imports its own CSS module, so Rollup cannot tree-shake it out of the barrel even though `_panel.index.tsx` never uses `SessionDetail`. This is exactly the "removing the edge does not remove the feature from the default Feed graph" stop condition T10a's own contract named in advance, not a defect in this task's work. Per the roadmap's "no batch, one measured edge at a time" rule for T10b, the lead reverted the `browse-feed`/`features/PublicGallery/` assertion out of `bundle-budgets.json` rather than leave a known-red required gate in the repo; the analyzer regression test is unaffected since it runs against a self-contained fixture, not the real config. T10 remains open: T10b's first candidate is now scoped and measured — sever the `SessionDetail` → `features/PublicGallery` edge (likely by moving `SessionDetail` out of the `widgets/SidePanel` barrel's static re-export surface, or by giving it its own neutral `MediaLightbox`/`PublicCard` consumption path) — before the `browse-feed` module-absence assertion can be re-added and pass.

Focused verification passed 24 tests across `SessionFeed.test.tsx` and `PublicGallery.test.tsx` (both unmodified — the import swap alone kept every existing assertion green) and 31 `bundleBudget.test.ts` tests. Both TypeScript checks, lint, style boundaries, and the full 1,225-test client/server suite passed. `npm run build:client` and `npm run check:bundle-budgets` both passed after the assertion revert. No deployment, live request, or browser check was performed because this task has no visible behavior change.

**Handoff (2026-08-31), T10b:** T10 is complete and fully green. The lead named and measured the second edge T10a's handoff scoped: `_panel.tsx`/`_panel.index.tsx` (both `browse-feed` roots) statically import the `widgets/SidePanel` barrel for unrelated eager widgets (`SidePanel`, `FilterPills`, `ScopeSwitcher`, `CollectionsScopeSwitcher`, `SessionFeed`); that same barrel also re-exported `SessionDetail`, whose own CSS-module import is a side effect Rollup cannot safely tree-shake, so `SessionDetail.tsx` — and everything it imports from `features/PublicGallery` (`MediaLightbox`, `PublicCard`) — rode along into the eagerly-loaded Browse Feed output even though neither root route ever renders `SessionDetail`. `SessionDetail`'s one real consumer, the already-route-split `_panel.$spotId.session.$sessionId.tsx`, never needed the barrel's other exports. `SessionDetail.tsx`, its CSS module, and its test moved unchanged into a new dedicated widget folder, `widgets/SessionDetail/`, with its own `index.ts`; `widgets/SidePanel/index.ts` no longer re-exports it; the one consumer now imports it from the new widget folder, satisfying the `boundaries/dependencies` ESLint rule (any widget's own `index.ts` qualifies for an app-layer import, not specifically `SidePanel`'s) with no exception needed. No `React.lazy`/Suspense boundary was introduced — this is a pure ownership move with the same TanStack Router route-level code-splitting the route already had; nothing about when or how `SessionDetail`'s code loads changed, only that it stopped loading a second time, eagerly, through an unrelated barrel.

The `browse-feed` module-absence assertion for `src/features/PublicGallery/` that T10a added and then reverted (because it was still red) is now re-added and green: a fresh production build no longer reaches any `features/PublicGallery/` module from `index.html`, `_panel.tsx`, or `_panel.index.tsx`. Measured before/after: Default Browse Feed critical graph fell from 422,509 to 403,215 gzip bytes (−19,294 gzip, past the 15,000-byte retain threshold; entry JavaScript and entry CSS were effectively unchanged at 264,048 and 40,756 gzip respectively, since this edge lived only in the browse-feed graph, not the plain entry). No budget cap rose. Focused verification passed 2 tests in the relocated `SessionDetail.test.tsx` (unmodified — only its file location changed); both TypeScript checks, lint (confirming the boundary rule accepts the new widget folder with zero config changes), style boundaries, and the full 1,225-test client/server suite passed. No deployment, live request, or browser check was performed because this task has no visible behavior change. T11 is the next ready task in document order.

### T11 — Centralize Feed and Gallery query option ownership

**Depends on:** T00.
**Outcome:** mounted hooks and intent prefetch use exactly the same query keys, inputs, pagination, and stale behavior.

**Implementation-agent packet:** dispatch as two bounded contracts, T11a then T11b. They may be reviewed together, but neither agent may edit the panel route or add prefetch behavior.

- T11a fixed design: in `useSessionFeed.ts`, export `sessionFeedInfiniteQueryOptions(trpc, params)` and make `useSessionFeed` call it. The factory accepts the existing tRPC options proxy plus `spotId`, `filters`, and `limit`; it owns input normalization and `getNextPageParam`. The React hook keeps `useTRPC` and `useInfiniteQuery` ownership.
- T11a exact edit allowlist: `apps/web/src/entities/SurfSession/model/useSessionFeed.ts`; `apps/web/src/entities/SurfSession/model/useSessionFeed.test.tsx`; `apps/web/src/entities/SurfSession/index.ts`.
- T11b fixed design: in `useSpotMediaFeed.ts`, export `spotMediaFeedInfiniteQueryOptions(trpc, params)` and `mediaDateIndexQueryOptions(trpc, params)`; make the hook call both. Factories own the existing input normalization, page size, sort, anchor, and cursor functions. React memoization and the returned view data remain in the hook.
- T11b exact edit allowlist: `apps/web/src/entities/Spot/model/useSpotMediaFeed.ts`; `apps/web/src/entities/Spot/model/useSpotMediaFeed.test.tsx`; `apps/web/src/entities/Spot/index.ts`.
- Red contracts: the exported factory and mounted hook produce identical query keys/options for the same input; global versus database-ID-scoped, filtered versus unfiltered, ascending versus descending, and anchored versus unanchored inputs remain distinct; session next cursor and media previous/next cursors are unchanged. Route `$spotId` values are slugs and must never be passed as query `spotId`; the route loader's resolved database ID is the query input.
- Focused command: `npx vitest run --project client apps/web/src/entities/SurfSession/model/useSessionFeed.test.tsx apps/web/src/entities/Spot/model/useSpotMediaFeed.test.tsx`.
- Stop conditions: a factory needs React context or a second tRPC client; an existing query key changes; a cache/invalidation caller needs migration; the work changes loading/error UI, filter ownership, retry, stale time, or pagination behavior.

Lead work:

- Extract a session-feed infinite-query option factory from the current hook.
- Extract media-feed infinite-query and media-date-index option factories from the current gallery hook.
- Keep flattening/memoized view projections in React hooks; factories own only server query contracts.
- Preserve limit, sort order, date range, favorite-only state, spot scope, anchor, and both media cursor directions.
- Do not move filter state into the URL as part of this performance task.

Delegate:

- Search-scout finds every consumer/query-key invalidator for these query families.
- Test-scout identifies query-option prior art and ensures factories are tested by observable keys/inputs, not implementation text.
- Diff-reviewer checks that Media remains the lifecycle owner even if the current tRPC procedure is namespaced under Spot.

Tests first:

- Hook and prefetch construction produce the same query keys for identical inputs.
- Spot/global, filtered/unfiltered, and anchored/unanchored inputs remain distinct.
- Media previous/next cursors and session next cursor remain unchanged.

Acceptance:

- Existing hooks render identical data and loading behavior.
- Existing invalidation helpers still target the produced keys.

Atomic commits:

1. `refactor(web): centralize session feed query options`
2. `refactor(web): centralize public media query options`

**Handoff (2026-09-01), T11a:** T11a is complete and fully green. `sessionFeedInfiniteQueryOptions(trpc, params)` now owns every piece of session-feed input normalization — spot scoping, date-range derivation through the existing `toBrowseDateRange`, favorites-only, and the default 20-item limit — plus `getNextPageParam`; `useSessionFeed` calls it and keeps only `useTRPC()`/`useInfiniteQuery()` ownership, with identical behavior to before. `entities/SurfSession`'s barrel now exports the factory alongside the hook so T13's future route-intent prefetch caller can warm the exact same query key. A new test proves the hook and the factory are provably in sync — calling each directly with identical input (spot ID, custom date, favorites-only) produces the identical `infiniteQueryOptions` call, including matching cursor behavior in both directions — rather than only asserting each is independently correct. One test-construction detail: building a correctly-typed mocked `trpc` proxy for the direct factory call required rendering the already-mocked `useTRPC()` itself (`renderHook(() => useTRPC())`) rather than a hand-typed partial literal, because `TRPCOptionsProxy` is a mapped type over the full `AppRouter` that a `sessions`-only literal cannot satisfy without a cast (forbidden by the contract) or exporting the type (out of this task's scope); no production code or behavior is affected. Focused verification passed 3 tests in `useSessionFeed.test.tsx` (the 2 pre-existing tests unmodified, plus 1 new); both TypeScript checks, lint, style boundaries, and the full 1,226-test client/server suite passed. No deployment, live request, or browser check was performed because this task has no visible behavior change. T11b is next: extract `spotMediaFeedInfiniteQueryOptions` and `mediaDateIndexQueryOptions` from `useSpotMediaFeed.ts`.

### T12 — Separate primary content readiness from auxiliary metadata and errors

**Depends on:** T11.
**Outcome:** Feed sessions and Gallery cards render as soon as their primary request succeeds; auxiliary date-index latency/failure and primary query failures have honest, independently recoverable UI states.

**Implementation-agent packet:** split into T12a readiness and T12b errors. Both change visible states, so the lead must first describe the visible behavior and obtain the explicit approval required by `CLAUDE.md`. Do not dispatch both to agents concurrently because both edit `PublicGallery.tsx` and its test.

- T12a fixed design: keep the primary media infinite-query fields at the hook's top level. Replace top-level `availableDates` with a `dateIndex` object containing `availableDates`, `isLoading`, `isError`, `error`, and `refetch`. `PublicGallery` uses only primary `isLoading` to choose card skeletons; date controls remain absent/disabled while `dateIndex.isLoading`; date-index failure preserves cards and exposes recovery only in the date-control area. Pending jump-anchor completion waits for the primary media request, not date metadata.
- T12a exact edit allowlist: `apps/web/src/entities/Spot/model/useSpotMediaFeed.ts`; `apps/web/src/entities/Spot/model/useSpotMediaFeed.test.tsx`; `apps/web/src/features/PublicGallery/PublicGallery.tsx`; `apps/web/src/features/PublicGallery/PublicGallery.test.tsx`; `apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.tsx`; `apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.test.tsx`; `apps/web/src/features/PublicGallery/ui/GalleryDateSidebar.tsx`; `apps/web/src/features/PublicGallery/ui/GalleryDateSidebar.test.tsx`.
- T12a red contract: cards render while the date index is pending; date-index error leaves cards and filters intact; date retry calls only `dateIndex.refetch`; a primary media error still does not render an empty state; jump-anchor and both cursor directions remain unchanged.
- T12b fixed design: add neutral `shared/ui/PanelQueryError/` with title, description, and retry action, following the approved existing panel control language. `SessionFeed` uses its primary query `isError/error/refetch`; `PublicGallery` uses its primary media query fields. A successful zero-item response continues to use T10a's `PanelCollectionEmptyState`. Retry must not remount the map or clear filters/cached content.
- T12b exact edit allowlist: new `apps/web/src/shared/ui/PanelQueryError/PanelQueryError.tsx`; new `apps/web/src/shared/ui/PanelQueryError/PanelQueryError.module.css`; new `apps/web/src/shared/ui/PanelQueryError/PanelQueryError.test.tsx`; new `apps/web/src/shared/ui/PanelQueryError/index.ts`; `apps/web/src/widgets/SidePanel/SessionFeed.tsx`; `apps/web/src/widgets/SidePanel/SessionFeed.test.tsx`; `apps/web/src/features/PublicGallery/PublicGallery.tsx`; `apps/web/src/features/PublicGallery/PublicGallery.test.tsx`.
- Focused commands: T12a runs `npx vitest run --project client apps/web/src/entities/Spot/model/useSpotMediaFeed.test.tsx apps/web/src/features/PublicGallery/PublicGallery.test.tsx apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.test.tsx apps/web/src/features/PublicGallery/ui/GalleryDateSidebar.test.tsx`; T12b runs `npx vitest run --project client apps/web/src/shared/ui/PanelQueryError/PanelQueryError.test.tsx apps/web/src/widgets/SidePanel/SessionFeed.test.tsx apps/web/src/features/PublicGallery/PublicGallery.test.tsx`. After manual visual approval, run `DEV_HTTPS=true npm run test:layout` at final closeout.
- Stop conditions: retry needs a global query reset; cached cards would be cleared; an error is mapped to empty; filters, virtualization, scroll restoration, query keys, or sheet geometry must change; the approved error presentation cannot be reproduced within the allowlist.

Lead work:

- Refactor `useSpotMediaFeed` so media-feed readiness/error and media-date-index readiness/error are returned separately. Do not compute the card-level loading state with `mediaFeed.isLoading || mediaDateIndex.isLoading`.
- Let `PublicGallery` render media cards when the media feed is ready. Disable, skeletonize, or progressively hydrate only date-jump/calendar controls while the date index is pending.
- Preserve already-rendered cards if the date-index request fails and give the auxiliary control an appropriately scoped retry or unavailable state.
- Give primary Feed and Gallery failures a shared, retryable panel error presentation. Do not convert a rejected query into the same UI as a successful empty result.
- Keep empty-state ownership neutral after T10: empty means a successful query with zero matching items; error means the query failed.
- Preserve pagination, jump-anchor behavior, virtualized row geometry, scroll restoration, and existing sheet chrome.

Delegate:

- Search-scout maps every consumer of `isLoading`, `isFetching`, `error`, date highlights, and empty-state props for both hooks/components.
- Test-scout builds a state matrix: primary pending/success-empty/success-data/error crossed with date-index pending/success/error. It identifies the smallest focused tests for each meaningful state.
- Diff-reviewer checks that retries target the correct query and that auxiliary failure never clears primary cached data.

Tests first:

- Media cards appear while date index remains pending.
- Date-index failure preserves cards and offers only an auxiliary recovery path.
- Feed/Gallery primary failure shows a retry action and is not announced as “no results.”
- Successful zero-item responses still show the normal empty state.
- A retry transitions error to data without remounting the persistent map or losing filters.

Acceptance:

- Time-to-first-card is governed by the primary feed request, not date-index latency.
- Query errors and empty results are visually and semantically distinct.
- Existing layout/scroll contracts remain green on mobile Peek/Half/Full states.

Atomic commits:

1. `test(web): specify independent gallery readiness states`
2. `refactor(web): decouple gallery cards from date metadata`
3. `test(web): specify retryable Browse query errors`
4. `fix(web): distinguish Browse errors from empty results`

### T13 — Prefetch exact destination data on intent

**Depends on:** T11 and T12.
**Outcome:** Browse, Upload, and account intent warm only the exact safe data their destination will consume, without global eager fetches or signed-out private requests.

**Implementation-agent packet:** never dispatch T13 as one task. Dispatch T13a, T13b, and each retained T13c destination serially because they share `_panel.tsx`, `MenuControl.tsx`, and query-cache behavior.

- T13a fixed design and allowlist: `apps/web/src/app/routes/_panel.tsx` and `apps/web/src/app/routes/-_panel.test.tsx` only. `handleBrowseSectionIntent` runs route preload and `queryClient.prefetchInfiniteQuery`/`prefetchQuery` concurrently through T11's factories. Use the current filters. Use `spotMatch.loaderData.id` for server queries while preserving the route's slug in route params. Gallery warms media and date index concurrently. Feed warms sessions. Skip the active section, use `retry: false` only for the speculative call without changing mounted-query defaults, consume rejection, and rely on the identical key for deduplication.
- T13a red contract and command: assert exact global/scoped/filter inputs, resolved database ID versus route slug, active-section skip, route/data concurrency, no duplicate mounted first-page request inside stale time, and navigation after rejection. Run `npx vitest run --project client apps/web/src/app/routes/-_panel.test.tsx apps/web/src/entities/SurfSession/model/useSessionFeed.test.tsx apps/web/src/entities/Spot/model/useSpotMediaFeed.test.tsx`.
- T13b fixed design and allowlist: `apps/web/src/app/routes/_panel.tsx`, `apps/web/src/app/routes/-_panel.test.tsx`, `apps/web/src/app/routes/_panel.upload.tsx`, and `apps/web/src/app/routes/-_panel.upload.test.tsx` only. Signed-out Upload intent warms route/auth code and performs no tRPC query. Authenticated intent uses `ensureQueryData(trpc.uploads.getActiveWorkspace.queryOptions())`; when it yields a workspace, prefetch exactly `getWorkspaceState` for that ID and preserve `{ workspaceId }` in navigation. With no workspace, use `spotMatch.loaderData.id` as `{ spotId }`; the route `$spotId` param is a slug and must never enter Upload query/search state as a database ID. The mounted route consumes the identical generated options; do not add a workspace store or query-key wrapper.
- T13b red contract and command: assert signed-out privacy, workspace-ID exactness, selected-spot fallback, identical keys, no duplicate first request within stale time, and click/navigation after prefetch failure. Run `npx vitest run --project client apps/web/src/app/routes/-_panel.test.tsx apps/web/src/app/routes/-_panel.upload.test.tsx`.
- T13c is measurement-gated. Menu opening itself remains route-code-only. If the lead records a user-visible reason, dispatch one item at a time with allowlist `apps/web/src/widgets/AppNavigation/MenuControl.tsx`, `apps/web/src/widgets/AppNavigation/MenuControl.test.tsx`, and only the destination route test needed to prove identical options. Collections may prefetch `sessions.mine`; Earnings and Account may each prefetch `ledger.summary`; favorites, purchases, settings, and admin data are excluded unless their exact item becomes a separate measured contract.
- T13c focused command: `npx vitest run --project client apps/web/src/widgets/AppNavigation/MenuControl.test.tsx <one exact destination test named by the lead>`.
- Stop conditions for every slice: route param and query input cannot be distinguished; a private request occurs signed out or on menu open; a new cache key/owner is required; prefetch changes mounted retry/stale policy; request deduplication cannot be demonstrated; another slice needs the same file concurrently.

Lead work:

#### T13a — Browse destinations

- Extend Browse section intent to run route preload and matching query prefetch concurrently.
- For Gallery, prefetch media feed and date index concurrently with exact spot/filter/sort inputs.
- For Feed, prefetch session list with exact spot/filter inputs.
- Rely on TanStack Query for in-flight deduplication and the established freshness policy. Decide explicitly whether speculative prefetch uses `retry: false` so a weak connection does not spend multiple requests before navigation; normal mounted queries retain their normal retry policy.
- Skip the active destination and keep prefetch failures best-effort and navigation independent.

#### T13b — Upload destination

- Reuse the panel-owned authenticated `uploads.getActiveWorkspace` query rather than introducing a second workspace owner.
- On authenticated Upload intent, ensure/fetch the active workspace; if it resolves to a workspace, prefetch `uploads.getWorkspaceState` for that exact ID and preserve the route search parameter.
- On signed-out Upload intent, warm only route/auth code. Never request active workspace or other protected data.
- Deduplicate the panel's existing active-workspace observer and the speculative fetch through identical query options.

#### T13c — Account destinations

- Keep trigger-level account menu behavior limited to route-code preload; do not fetch all private account data merely because the menu opens.
- Add data prefetch only on the exact authenticated item intent and only when measurement shows value: `sessions.mine` (and the matching favorites query if required by the Collections screen) for Collections; `ledger.summary` for Earnings/Account where both screens consume it.
- Preserve authorization checks and do not prefetch purchases/settings/admin data from unrelated items.
- Reassess all-menu route preloading only if measured account-route growth makes it competitive; current account route chunks are small enough to keep.

Delegate:

- Search-scout maps filters, spot ID, authentication, and route params available at the intent owner.
- Search-scout separately maps each destination's mounted query options so every prefetch can be compared symbol-for-symbol.
- Test-scout adds behavior contracts for exact inputs, active-destination skipping, signed-out privacy, and item-specific account behavior.
- Bundle-scout/browser verifier proves requests begin before selection without imposing a brittle duration threshold.

Acceptance:

- Intent and mounted component consume one query-cache entry.
- No duplicate first-page request after successful prefetch inside stale time.
- Filters and selected spot never cross-contaminate caches.
- Signed-out intent produces no authenticated workspace/account request.
- Menu open alone produces no private account-data fan-out.
- A failed prefetch still permits ordinary route loading and skeleton/error behavior.

Atomic commits:

1. `test(web): specify Browse destination data prefetch`
2. `perf(web): prefetch Feed and Gallery data on intent`
3. `test(web): specify authenticated Upload data prefetch`
4. `perf(web): prefetch active Upload workspace on intent`
5. One measured account-item prefetch commit per destination; omit if no user-visible gain is demonstrated.

### T14 — Add evidence-backed connection and media scheduling

**Depends on:** T02, T04, T10, and T13.
**Outcome:** remaining network scheduling changes address a measured waterfall rather than generic advice.

**Implementation-agent packet:** not dispatchable as written. This is a lead-owned decision gate. A lower-cost agent may perform static inventory and build arithmetic only; `CLAUDE.md` forbids it from opening a browser, driving a preview, or capturing a waterfall.

- Required lead input before any implementation: a user-supplied or separately approved production/real-device request capture; the named bottleneck; one selected candidate; current and target values; exact edit allowlist; a fixed retain/revert threshold; and confirmation that no visual behavior changes.
- Candidate A likely owners are `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/app/startupPerformance.test.ts`, and their exact environment/config owner. The implementation contract must name the proven API/Mapbox origin and must prohibit literal environment-specific production hostnames unless the existing build environment owns them.
- Candidate B likely owners are `apps/web/src/shared/ui/BaseGallery/BaseCard.tsx`, `apps/web/src/shared/ui/BaseGallery/BaseCard.test.tsx`, `apps/web/src/entities/SurfSession/ui/SurfSessionCard.tsx`, `apps/web/src/widgets/SidePanel/SessionFeed.tsx`, and Public Gallery card tests. The lead must decide which rendered indices are above the fold before delegation. Local blob videos, the lightbox, and LCP media remain excluded.
- Candidate C is not eligible for cheaper-agent implementation in this roadmap. A style change needs separate visual/product approval and its own roadmap task.
- Required red contract: the selected candidate's exact attribute/request contract fails before implementation. Required evidence is named request ordering/host timing or per-card loading policy, plus unchanged entry/Browse graph totals. Fixed millisecond UI timing is prohibited.
- Stop conditions: evidence does not isolate the candidate; more than two preconnects are proposed; LCP priority is ambiguous; the change affects artwork/map style/visible behavior; any browser/live action lacks explicit approval; the result misses the retain threshold.

This task is a decision gate, not permission to implement every option.

Candidate A — connection warmup:

- Add environment-derived preconnect for the configured API origin if production still uses a separate hostname.
- Add at most the one Mapbox origin proven to gate style/map readiness.
- Do not preconnect unused Google/Cloudinary endpoints globally.
- Defer same-origin API reverse proxying unless connection setup is still material after preconnect and compression.

Candidate B — card media scheduling:

- Add explicit `decoding="async"` where it does not break load/error ownership.
- Add a typed card loading policy so above-the-fold media can remain eager while later items are lazy.
- Use gallery/card index and visible-row ownership; do not mark every image lazy.
- Preserve local blob video previews and Safari lightbox readiness.

Candidate C — map style/request cost:

- Measure Mapbox library, style, tile, sprite, glyph, and API data separately.
- A custom/lighter map style requires a separate visual/product approval and is not executed here.

Delegate:

- Delivery-scout captures DNS/connect/TLS/request timing and host inventory.
- Search-scout inventories image/video elements and which component knows viewport priority.
- Test-scout proposes attribute/priority behavior contracts.
- Bundle-scout confirms no new preload expands the critical graph unexpectedly.

Acceptance:

- Implement only candidates with a named measured bottleneck and before/after evidence.
- No more than two global preconnects without an explicit waterfall justification.
- LCP media is never accidentally lazy.
- Map-first interaction and first-visit readiness remain unchanged.

Atomic commit: one commit per retained candidate, never one combined “misc performance” commit.

### T15 — Production verification, budget ratchet, and closeout

**Depends on:** all retained tasks.
**Outcome:** repository gates and live behavior agree, with a repeatable baseline for future work.

**Implementation-agent packet:** lead/approval owned; do not delegate as an implementation task.

- Before approval, a lower-cost verification agent may run the full local gates, `npm run build:client`, `npm run check:bundle-budgets`, `npm run build:server`, and `git diff --check`. It may create only the named local build artifacts below. If Docker is available and the exact container name is unused, it may reproduce CI's runtime proof and must remove only the container it created even on failure. It returns raw command output classification and the final size table without editing repository files.

```text
docker build --file apps/api/Dockerfile --target runner --tag swelldays-api:t15-local .
docker build --file apps/web/Dockerfile --target runner --build-arg RELEASE_TAG=t15-local --build-arg VITE_API_URL=https://api.example.test --build-arg VITE_MAPBOX_ACCESS_TOKEN=pk.test-placeholder --build-arg VITE_GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com --build-arg VITE_GOOGLE_API_KEY=test-google-api-key --build-arg VITE_CLOUDINARY_CLOUD_NAME=test-cloud --build-arg VITE_CLOUDINARY_API_KEY=test-cloudinary-key --tag swelldays-web:t15-local .
docker run --detach --name swelldays-web-t15-local --publish 127.0.0.1:18080:8080 swelldays-web:t15-local
npm run check:web-delivery -- --origin http://127.0.0.1:18080 --expected-release t15-local
docker rm --force swelldays-web-t15-local
```

The lead contract must add an always-run cleanup wrapper around the final command. If port `18080`, the container name, or Docker build output is already owned by other work, stop instead of replacing or removing it.
- Deployment, public-origin GETs, release identity checks, real-device request capture, and visual acceptance require the separate approvals and user participation defined by `CLAUDE.md`. They are never implied by completion of local checks.
- Only after all evidence is accepted may the lead choose budget headroom and write the closeout. Exact lead-owned edit allowlist: `apps/web/bundle-budgets.json`, its existing checker fixture if a red ratchet contract is needed, and this roadmap. The implementation/reporting agent must not edit workflows, Nginx, Dockerfiles, budgets, or roadmap status.
- Ratchet contract: first make the checker fail against the lead-approved achieved caps, then set narrow headroom that passes the same fresh build. A budget increase, a changed environment, or a missing live scenario is a stop condition, not a documentation footnote.
- Final handoff must separate local automated evidence, built-container evidence, approved live HTTP evidence, user-performed iPhone/Mobile Safari evidence, rejected T14 candidates, and checks not run. “Production verified” is prohibited if any required live check is absent.

Lead work:

- Run the full repository gates and production image build.
- With separate deployment approval, release through the normal tagged workflow.
- Run the same delivery-verifier used by CI against the public origin after services restart and before old images are pruned.
- Verify live HTML identifies the expected release and contains no unresolved environment placeholder.
- Verify live JS/CSS encoding, `Vary`, and cache headers with real GETs; also verify SPA fallback and health behavior.
- Capture new/returning portrait and landscape startup request sets.
- Capture signed-in and signed-out menu intent, Feed/Gallery switch, Upload, auth interrupt, and Add Spot intent.
- Record entry, startup CSS, cold-home critical, new-visitor artwork, returning-visitor artwork, and route intent-to-content results.
- Lower budgets to the achieved result plus narrow operational headroom.
- Update this roadmap with completed dates, retained/rejected candidates, evidence, and any real-device follow-up.

Delegate:

- Delivery-scout performs read-only live header/request verification after approval.
- Bundle-scout produces the final size comparison.
- Test-scout classifies full-gate failures as related or baseline.
- Diff-reviewer verifies every roadmap goal and non-goal against the final diff.

Acceptance:

- Live main JS and CSS negotiate compression.
- Live hashed assets are immutable and HTML is not cached.
- Authenticated/returning visitors do not request hero artwork unless review mode/eligibility requires it.
- Rare Add Spot/auth UI is absent from unrelated startup.
- Zod is absent from the startup graph and Public Gallery is absent from the default Feed graph.
- Route intent requests route code before selection and exact data before mount when possible.
- All required gates are green; unrelated failures are documented without weakening checks.

Atomic commit: `docs(perf): record production optimization results`.

## Tiny-commit sequence

Each line is independently buildable and revertible. Do not squash during implementation; consolidation can be decided only after review.

1. `perf(web): preload likely panel routes on intent` — current working-tree baseline, only with commit approval.
2. `test(web): specify compressed bundle budget reporting`.
3. `build(web): enforce production bundle budgets`.
4. `test(web): specify compressed runtime responses`.
5. `perf(web): enable gzip for production assets`.
6. `perf(web): fingerprint startup visual assets`.
7. `test(web): specify presentation-owned intro artwork`.
8. `perf(web): load intro artwork only when presented`.
9. `test(contracts): specify supported public entries`.
10. `refactor(contracts): separate core and validation entries`.
11. `refactor(web): consume contracts public entries`.
12. `refactor(api): consume contracts public entries`.
13. `build(web): keep validation libraries out of startup`.
14. `refactor(web): separate lightweight Add Spot runtime`.
15. `perf(web): lazy-load Add Spot workspace UI`.
16. `perf(web): preload Add Spot UI on user intent`.
17. `refactor(web): isolate auth modal controller`.
18. `perf(web): lazy-load authentication surface`.
19. `perf(web): preload auth UI on gated action intent`.
20. Move the generic panel empty state out of Public Gallery.
21. One additional measured barrel/style-boundary commit per proven cause.
22. `refactor(web): centralize session feed query options`.
23. `refactor(web): centralize public media query options`.
24. `test(web): specify independent gallery readiness states`.
25. `refactor(web): decouple gallery cards from date metadata`.
26. `test(web): specify retryable Browse query errors`.
27. `fix(web): distinguish Browse errors from empty results`.
28. `test(web): specify Browse destination data prefetch`.
29. `perf(web): prefetch Feed and Gallery data on intent`.
30. `test(web): specify authenticated Upload data prefetch`.
31. `perf(web): prefetch active Upload workspace on intent`.
32. One measured account-item prefetch commit per destination.
33. One connection/media scheduling commit per retained candidate.
34. `docs(perf): record production optimization results`.

## File ownership and collision map

Current search targets are listed to help agents rediscover the seam; they are not permission to edit every file.

| Area | Likely owners | Tasks | Parallel edit policy |
| --- | --- | --- | --- |
| Panel route composition and route intent | panel layout route and tests | T00, T13 | Strictly serial |
| Startup HTML and first-visit storage/assets | app HTML, first-visit feature, startup tests | T03, T04 | Strictly serial |
| Contracts public API | contracts exports/source entries, app path mappings, boundary rules | T05 | One edit owner; migrate apps in separate commits |
| Build/config/CI | Vite config, root scripts, CI workflow | T01, T05, T10 | One edit owner |
| Runtime delivery | Nginx, web Dockerfile, artifact CI | T02 | May run separately from source refactors, but one build at a time |
| Add Spot | feature runtime/store/provider, globe scene, Feed search | T06, T07 | Strictly serial |
| Authentication | auth provider/surface, menu, gated actions | T08, T09 | Strictly serial |
| Feed/Public Gallery boundary | SessionFeed, neutral panel states, Public Gallery barrel | T10, T12 | T10 ownership move before T12 state semantics |
| Query ownership | session/media entity hooks and panel intent | T11, T12, T13 | Factories, then readiness, then callers |
| Gallery/feed media | shared card, session cards, virtualization | T12, T14 | Readiness change before scheduling gate |

## Testing strategy

### What tests should own

- Unit/pure tests: option factories, eligibility decisions, storage fallback, budget arithmetic.
- Component tests: visible behavior, intent events, continuation, lazy mount/unmount, loading/error recovery.
- Build contracts: emitted assets exist, entry/critical-graph budgets, optional chunks stay optional, no old public URL remains, Zod absent from startup, Public Gallery absent from default Feed.
- Runtime image smoke: compression, `Vary`, cache policy, SPA fallback, health endpoint.
- Browser contracts: request ordering and presence/absence, not fixed timing.
- Real device: first-visit handoff, map readiness, keyboard/auth interruption, touch intent, no broken logo or FOUC.

### Required gates after every source task

The lead records a green base before dispatch. The implementation agent runs the task's focused commands first, then every command below before handback. The lead reruns them independently before closeout:

```text
npx tsc --noEmit
npx tsc -p tsconfig.server.json --noEmit
npm run lint
npm run check:style-boundaries
npx vitest run --project client --project server
npm run build:client
npm run build:server
git diff --check
git status --short
```

These are the complete handoff gates; during implementation, use only the smallest task-relevant subset until focused behavior is green. T06, T08, T10, and any retained T14 source task also run `npm run check:bundle-budgets` against a fresh `npm run build:client`. Run integration tests when query/API behavior or shared runtime contracts change. Run layout tests only after the user has manually approved a browser-visible change, when startup assets, responsive first-visit presentation, auth workspace, sheet behavior, or media priority can affect visible geometry. Run the production-container smoke whenever delivery configuration changes. Any pre-existing red command stops dispatch until the user directs otherwise.

### Performance acceptance matrix

| Scenario | Contract |
| --- | --- |
| Cold new mobile visitor | Logo paints; portrait hero begins when intro eligibility resolves; map continues behind overlay |
| Cold returning mobile visitor | Logo paints; no hero request; app/map path is prioritized |
| Signed-in cold visitor | No auth form or intro artwork in unrelated startup |
| Browse Feed → Gallery | Exact route and media/date queries start on intent; mount reuses cache; cards do not wait on date metadata |
| Browse Gallery → Feed | Exact session query starts on intent; mount reuses cache |
| Feed/Gallery query failure | Retryable error is distinct from a successful empty result |
| Upload intent | Exact search params preserved; authenticated path warms active workspace; signed-out path warms auth, not private data |
| Add Spot intent | UI module warms only for authenticated Add Spot action |
| About/account intent | Route module starts before selection; no global all-route warmup |
| Video open | HLS remains absent until a video player is actually required |
| Error reporting | Sentry remains delayed until after startup paint opportunity |

## Rollback rules

- Compression: revert the Nginx change if runtime image validation shows corrupt/truncated responses or incompatible proxy behavior; do not disable cache safety to make it pass.
- Presentation-owned assets: restore an early preload only for locally unacknowledged visitors if measured new-user LCP requires it; never restore a global unconditional preload.
- Contracts entries: restore a caller to the temporary root compatibility entry if a public subpath breaks resolution; never deep-import package source or duplicate schemas locally.
- Lazy UI: revert a lazy boundary if it loses authoritative state, breaks real-device behavior, or produces no meaningful critical-byte reduction.
- Query prefetch: remove only the prefetch caller on incorrect keys; retain centralized query factories if behavior remains identical and tests are green.
- Connection/media candidates: revert immediately on worse LCP, duplicated requests, FOUC, or Safari readiness regressions.
- Budgets: budgets may be raised only with recorded evidence and explicit approval, never merely because a new build fails.

## Completion checklist

- [x] T00 route-preload baseline isolated and approved.
- [x] T01 bundle reporting and budgets green in CI.
- [x] T02 runtime compression proven locally; public post-deploy verification is wired and remains approval-gated.
- [x] T03 logo/hero assets fingerprinted and cache-safe.
- [x] T04 artwork is requested only when the intro/review presentation owns it.
- [x] T05 contracts core is Zod-free and only supported public entries are used.
- [x] T06 Add Spot UI absent from unrelated startup.
- [x] T07 Add Spot intent hides the new lazy latency.
- [x] T08 auth surface absent from unrelated startup.
- [x] T09 gated actions warm auth on exact intent.
- [x] T10 Public Gallery absent from default Feed and only measured additional leakage corrected.
- [ ] T11 Feed/Gallery query contracts centralized.
- [ ] T12 primary content, auxiliary metadata, errors, and empty states are independent.
- [ ] T13 exact safe destination data prefetched on intent without private fan-out.
- [ ] T14 only evidence-backed scheduling candidates retained.
- [ ] T15 production results recorded and budgets ratcheted.
- [ ] Full gates green.
- [ ] Real iPhone/Mobile Safari acceptance completed.
- [ ] No unrelated work included in any commit.
