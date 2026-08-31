# Web Performance Optimization Roadmap

Status: proposed
Updated: 2026-08-28
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

The lead agent owns all architecture, scope, code edits, dependency order, decisions, final verification, staging, and commit requests. Before every task it must:

1. Read this roadmap and the current task section completely.
2. Inspect `git status` and preserve unrelated or user-owned work.
3. Resolve generated-file activity before editing route files.
4. Record the exact baseline relevant to the task.
5. Add or identify a failing behavior/contract test before implementation where practical.
6. Assign one edit owner per file.
7. Stop when a required gate is red; do not weaken the gate.

### Work delegated to subagents

Use subagents proactively for bounded, read-only, parallel work:

- `search-scout`: locate imports, exports, asset references, matching tests, route IDs, query keys, and prior-art patterns with `rg`/file reads.
- `bundle-scout`: run production builds, read manifests/source maps, compare raw/gzip totals, and report module/request movement. It must not edit configuration.
- `test-scout`: identify the narrowest existing tests and stable behavioral locators. It must reject source-text snapshots when runtime behavior has an owner.
- `delivery-scout`: inspect Nginx/Docker/CI/release paths and perform read-only header checks when live access is approved.
- `diff-reviewer`: review the finished task diff for scope leakage, duplicated state ownership, accidental eager imports, and missing tests.

Searches, inventories, log classification, and before/after arithmetic should be delegated. Architectural choice, code mutation, staging, committing, deployment, and approval decisions remain with the lead.

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

The lead continues local baseline inspection while scouts run, synthesizes their reports, and writes the implementation. A subagent may receive a code/test edit only when its file list is disjoint, the interface is already decided, and one agent remains the sole owner of each file. Search, inventories, log/error classification, command discovery, and byte arithmetic are the default delegated work; architecture and cross-file mutation are not.

### Parallelism restrictions

- Never let two agents edit `PanelFrame`, app startup HTML, Vite configuration, the auth provider, or the same test file concurrently.
- Do not run Vite/TanStack route generation while another agent is reviewing or staging generated route output.
- Do not run multiple production builds concurrently; build artifacts and generated manifests share one output directory.
- Query-prefetch work and the existing route-preload patch both touch the panel composition route and must be serial.
- Asset hashing and first-visit artwork request ownership both touch startup HTML/asset references and must be serial.
- Contracts export changes and application import migrations must use one package-boundary edit owner; subagents may inventory imports but must not bulk-rewrite them.
- Subagents may search these areas concurrently, but the lead performs the edit after synthesizing their findings.

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

### T09 — Preload authentication UI on exact intent

**Depends on:** T08.
**Outcome:** the lazy auth surface is warm before common sign-in interruptions.

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

### T10 — Remove proven and remaining measured graph leakage

**Depends on:** T05, T06, and T08.
**Outcome:** the known Feed-to-Public-Gallery dependency is removed, then only modules proven unnecessary on the cold home path leave the critical graph; feature boundaries remain explicit.

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

### T11 — Centralize Feed and Gallery query option ownership

**Depends on:** T00.
**Outcome:** mounted hooks and intent prefetch use exactly the same query keys, inputs, pagination, and stale behavior.

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

### T12 — Separate primary content readiness from auxiliary metadata and errors

**Depends on:** T11.
**Outcome:** Feed sessions and Gallery cards render as soon as their primary request succeeds; auxiliary date-index latency/failure and primary query failures have honest, independently recoverable UI states.

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

Run the narrowest focused tests first, then before handoff:

```text
npm run test:client
npm run test:server
npm run typecheck --workspace @swelldays/web
npm run typecheck --workspace @swelldays/api
npm run lint
npm run check:style-boundaries
npm run build:client
npm run build:server
git diff --check
```

These are the complete handoff gates; during implementation, use only the smallest task-relevant subset until focused behavior is green. Run integration tests when query/API behavior or shared runtime contracts change. Run layout tests when startup assets, responsive first-visit presentation, auth workspace, sheet behavior, or media priority can affect visible geometry. Run the production-container smoke whenever delivery configuration changes.

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
- [ ] T08 auth surface absent from unrelated startup.
- [ ] T09 gated actions warm auth on exact intent.
- [ ] T10 Public Gallery absent from default Feed and only measured additional leakage corrected.
- [ ] T11 Feed/Gallery query contracts centralized.
- [ ] T12 primary content, auxiliary metadata, errors, and empty states are independent.
- [ ] T13 exact safe destination data prefetched on intent without private fan-out.
- [ ] T14 only evidence-backed scheduling candidates retained.
- [ ] T15 production results recorded and budgets ratcheted.
- [ ] Full gates green.
- [ ] Real iPhone/Mobile Safari acceptance completed.
- [ ] No unrelated work included in any commit.
