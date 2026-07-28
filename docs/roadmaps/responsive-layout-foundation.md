# New-session prompt: responsive layout foundation

Work in `/Users/macnaggec/Code/wave-atlas` and follow its `AGENTS.md` exactly.

## Objective

Design and implement the ideal, fully grown responsive-layout architecture for Wave Atlas, a map-first site whose primary application surface is a persistent/overlay drawer. Ignore current implementation effort when defining the ideal end state. This is pre-launch, so optimize for correct ownership, low future refactoring, and machine-enforced layout contracts rather than preserving existing viewport math.

The work originally proceeded desktop-first. On 2026-07-22 the sequencing was pivoted to **mobile-first**; the completed foundation (F00–F12) carries over unchanged because it is band-agnostic. The work now proceeds in this order:

1. Preserve and validate the corrected desktop experience. *(Done — F00 and desktop parity through F12.)*
2. Establish the responsive architecture and migrate desktop onto it without intentional visual change. *(Done — F01–F12.)*
3. Complete the band-agnostic shared foundation and the mobile-first pivot refactors (remainder of Phase F).
4. Design and implement a coherent mobile experience first: compact at any height plus constrained-short environments such as landscape phones (Phase M).
5. Only after mobile is approved and stable, design and implement the constrained-regular/tablet experience (Phase T).
6. Only after tablet is approved and stable, complete and re-verify the wide/desktop experience and close out enforcement (Phase D).

Do not begin with a generic 12/6/4 grid or a pile of media queries. Column grids are one implementation detail. First model the app shell, drawer lifecycle, layout capabilities, sources of truth, and ownership seams.

## Product layout that must be traced from the code

Read the actual implementation before making claims. At minimum trace:

- the map/globe canvas and left navigation strip;
- the right-side panel in compact, expanded, route-required workspace, gallery-workspace, and map-input modes;
- user expansion preferences versus the currently rendered panel state;
- panel back/expand controls, sticky search/filter chrome, nested scroll owners, fixed footers, galleries, loading states, and empty states;
- map camera occlusion while the drawer changes size;
- virtualized gallery column calculation and date sidebar behavior;
- full-page routes, overlays, dialogs, keyboard focus, reduced motion, safe areas, and touch input.

Start with these current owners, then follow every dependency and caller. (This list reflects the post-F12 architecture; the original Gate 1 owners — `panelLayoutPolicy`, `panelRouteMode`, `appChromePolicy`, `globeSidebarOcclusion` under their old paths — were deleted as their replacements landed.)

- `src/shared/model/appRouteIntent.ts`
- `src/shared/model/appShellLayoutPolicy.ts`
- `src/shared/model/viewportCapabilities.ts`
- `src/shared/model/panelLayoutPolicy.ts`
- `src/shared/model/panelExpansionStore.ts`
- `src/shared/ui/DrawerShell/DrawerShell.tsx`
- `src/shared/ui/PanelLayout/PanelLayout.tsx`
- `src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.tsx`
- `src/widgets/SidePanel/SidePanel.tsx`
- `src/features/PublicGallery/model/usePanelGalleryColumns.ts`
- `src/views/GlobeScene/model/drawerViewportOcclusion.ts`
- `src/shared/ui/design-system/tokens.css`
- `scripts/check-style-boundaries.mjs`

Inspect `git status` and the working diff first. Preserve all existing user changes and do not rewrite unrelated files.

## Required architectural standard

Use the project’s architecture recommendation format:

```text
Ideal architecture: <best end state with effort ignored>
Recommended for this app: <proportionate choice>
Transitional fix: <optional smallest safe intermediate step>
Why they differ: <only scale/product reasons, never implementation effort>
```

The ideal and recommended architectures should differ only if the product’s real scale makes part of the ideal speculative. Do not downgrade the recommendation merely to reduce the current diff.

Design deep modules with small interfaces. Callers should express semantic intent such as browse, gallery workspace, editing workspace, or map input. They must not know drawer widths, viewport percentages, breakpoint numbers, safe-area formulas, camera offsets, or grid arithmetic.

The target architecture must establish explicit ownership for these facts:

1. **Product intent and user preference** — which panel experience the route needs and what expansion state the user prefers.
2. **Responsive policy** — how viewport capabilities and product intent map to a presentation such as persistent panel, overlay drawer, full-screen workspace, or bottom sheet.
3. **Viewport metrics** — continuous layout-viewport and visual-viewport measurements used by geometry consumers. These are measurements, not capabilities, and must not share a subscription with semantic size/input bands.
4. **Rendered geometry** — the actual drawer bounds and map occlusion after layout and animation. Prefer measured rendered geometry over mirrored `vw` constants.
5. **Panel-local layout** — spacing, chrome, scroll ownership, footer clearance, and card layout inside a drawer. Use container queries when layout depends on drawer width rather than viewport width.
6. **Virtualized layout** — one measured-width adapter and one pure column/row policy must feed both row chunking and rendered columns.
7. **Design tokens** — spacing roles, size bands, typography, radii, motion, safe areas, and control dimensions. Name tokens by semantic role, not by a component or raw pixel value.

Keep these authorities distinct. User preference is not rendered state. A capability band is not a viewport measurement. A breakpoint is not drawer geometry. A URL or route is not layout state. A CSS projection is not the authority for domain/product intent.

## Expected module shape

Propose the smallest deep interface that can hide the responsive system. The exact names are yours to justify, but the design should contain the equivalent of:

- a pure layout-policy module that derives semantic app-shell and drawer presentation from route intent, user preference, and viewport capabilities;
- one app-level policy projection at the composition root that gathers route intent, user preference, and viewport capabilities once, then exposes the current read-only semantic policy through a small consumer interface;
- one discrete viewport-capability owner for size band, height band, pointer, hover, and reduced motion, rather than `window.innerWidth` and `matchMedia` calls scattered through features;
- one separate continuous viewport-metrics owner for layout-viewport and visual-viewport geometry;
- a drawer-shell module that owns animation, focus/overlay semantics, scroll containment, safe areas, and measurement of rendered bounds;
- a panel-layout module that owns panel inset, chrome slots, scroll owner, footer slot, and container-query context;
- a grid module for ordinary panel collections and a measured adapter for virtualized collections;
- a geometry projection consumed by the globe so selected spots stay centered in the actually visible map region.

The policy consumer must not gather or accept route intent, preferences, raw capabilities, breakpoints, or viewport pixels: those are implementation details behind the seam. Do not create ports or adapters that have only one hypothetical implementation. The browser capability and metrics owners are concrete modules, not pluggable ports. Internal seams are allowed for testing, but do not expose them through the external interface.

## Source-of-truth rules

- CSS owns presentation and container-responsive styling.
- TypeScript owns product policy and behavior that changes what is mounted, interactive, persisted, or announced to assistive technology.
- CSS media features own purely visual pointer, hover, and reduced-motion adaptations. The TypeScript capability projection exists only for JavaScript behavior and animation systems that cannot consume CSS.
- Discrete capabilities and continuous viewport metrics are separate projections. Capability consumers must not re-render for every pixel of a resize.
- The DOM owns rendered geometry. Measure it when another subsystem, such as the globe camera, needs the actual occluded pixels.
- If the same breakpoint must be consumed by CSS and TypeScript, create one authoritative contract with a generated or mechanically verified projection. Do not manually duplicate numbers.
- Feature and route modules may consume semantic layout interfaces; they may not own raw breakpoints, drawer-width formulas, or panel gutters.
- Every new dependency direction or token-ownership rule must be enforced in the same change by ESLint, `check:style-boundaries`, types, or an owning behavioral test.

## Responsive design requirements

Define a behavior matrix before implementation. Use semantic capability bands internally, even if the product discussion calls them desktop, tablet, and mobile.

Phase ownership follows capability cells rather than width names: Phase M owns `compact × {short, regular}` and `constrained × short`; Phase T owns `constrained × regular`; Phase D owns the wide cells. A landscape phone must not be deferred to the tablet phase merely because its CSS-pixel width falls in the constrained band.

For every band and every drawer intent, specify:

- drawer presentation and maximum/minimum size;
- whether the map remains visible and interactive;
- left-strip/navigation presentation;
- expand/collapse/back behavior and preservation of user preference;
- search, upload, filters, and gallery-toolbar placement;
- number and density policy for session cards and media cards;
- date-sidebar behavior;
- scroll owner and sticky/fixed controls;
- overlay, focus trap, escape/back handling, and background interaction;
- safe-area and dynamic viewport behavior;
- keyboard, coarse-pointer, hover, and reduced-motion behavior.

Avoid device-name conditionals in feature code. Avoid assuming that viewport width equals drawer width. Avoid `100vh` on mobile; use dynamic viewport and safe-area primitives where appropriate.

## Verification ownership

Before proposing tests, classify each invariant according to `AGENTS.md`.

- Pure layout-policy decisions: focused unit tests at the policy interface.
- Runtime measurement and drawer/globe coordination: integration tests at that seam.
- CSS token ownership and forbidden raw breakpoints/gutters: static style-boundary rules.
- Type contracts and dependency direction: TypeScript and ESLint/architecture rules.
- User-visible layouts and interactions: semantic DOM, computed-style, geometry, accessibility, and interaction checks at a deliberate viewport-and-drawer-state matrix. If an invariant can only be judged visually, provide the user a short manual checklist instead of using screenshot or pixel comparison.
- Scroll, focus, back, overlay, and map-occlusion behavior: focused integration or end-to-end tests.

Do not add runtime tests that merely assert CSS property names, class names, or TypeScript shapes. Do not mock one internal layout layer only to verify that it forwards a typed field.

## Required process and approval gates

### Gate 1 — architecture approval

Perform a read-only audit first. Then present:

1. the current behavior and current source of truth for every layout fact;
2. the ideal architecture;
3. the proportionate recommendation;
4. any transitional step, clearly labelled;
5. the proposed deep module interfaces and dependency direction;
6. the desktop/tablet/mobile behavior matrix;
7. a migration sequence in small, independently verifiable changes;
8. the test/static-enforcement plan;
9. risks, deleted concepts, and unresolved product choices.

Stop and wait for explicit approval. Do not edit files before approval.

### Gate 2 — mobile-foundation approval (pivoted 2026-07-22)

The desktop-parity portion of the original Gate 2 was delivered by F00–F12. After the remaining Phase F tasks, implement the mobile capability cells first — compact at any height plus constrained-short landscape-phone environments — through the approved interfaces. Remove superseded viewport math and duplicated authorities as each slice migrates; do not layer a new system on top of the old one indefinitely. Run the complete project gate set after every implementation slice.

Demonstrate one coherent mobile experience across every Phase M capability cell and important drawer intent, and provide code evidence for each behavior. Then stop and request explicit approval before implementing constrained-regular/tablet presentation.

### Gate 3 — tablet, then desktop closeout

Implement tablet as a coherent product experience through the approved interfaces, verify it, and obtain approval before the Phase D desktop completion and final enforcement sweep. Do not treat any band as another band with different numbers.

## Completion gates

All of these must pass before any implementation slice is complete:

1. `npx tsc --noEmit`
2. `npx tsc -p tsconfig.server.json --noEmit`
3. `npm run lint`
4. `npm run check:style-boundaries`
5. `npx vitest run --project client --project server`

Also run the approved responsive verification matrix using semantic DOM, computed-style, geometry, accessibility, interaction, console, and network assertions. Do not use screenshot or pixel comparison. When appearance cannot be verified through those signals, stop and provide the user a short manual checklist. Report pre-existing failures immediately and do not build on a red base without explicit direction.

## Explicit non-goals for the foundation slice

- No arbitrary 12/6/4 grid imposed across every surface.
- No speculative theme editor or user-configurable spacing system.
- No new framework or styling-library migration.
- No broad visual redesign unrelated to responsiveness.
- No constrained-regular/tablet presentation before the Phase M mobile foundation is approved, and no Phase D desktop closeout before tablet is approved.
- No preserving duplicated layout state merely because migration is disruptive.

The goal is a durable seam: future tablet/mobile work should mostly add policy branches and presentations behind a stable interface, not force edits across routes, features, galleries, and globe logic.

## Separate-session implementation roadmap

Gate 1 was approved on 2026-07-20. On 2026-07-22 the phase sequencing pivoted to mobile-first: Gate 1's architectural approval (ownership model, module seams, source-of-truth rules) carries over because the foundation is band-agnostic, but the phase ordering below supersedes the original desktop-first sequence. Completed tasks F00–F12 are preserved verbatim as historical record. Every task below, unchanged or new, remains subject to the five completion gates. Use the roadmap below to execute the work in separate sessions. A session must take only one unchecked task whose dependencies are complete. Do not start the next task in the same session.

### Session protocol

At the start of every session:

1. Read `AGENTS.md` and this document in full.
2. Inspect `git status` and the complete working diff. Preserve unrelated and user-owned changes.
3. Identify the next unchecked task whose dependencies are complete.
4. Write a Direction Brief naming:
   - the user-visible or architectural invariant;
   - the source of truth that owns it;
   - the files and concepts in scope;
   - the owning verification, following `AGENTS.md` §0.3.
5. If the baseline is not already known green in the current session, run the complete gate set before implementation. Stop and report any pre-existing failure.
6. If the task changes anything visible in the browser, describe the visual or interaction change in 1–3 plain sentences and stop for explicit user approval before implementation. Internal tasks with no visual effect must state that explicitly and may continue.

For every implementation task:

- keep the change to one independently reviewable architectural intent;
- use a behavioral test first when behavior changes;
- use TypeScript, lint, or static enforcement as the RED check for type, dependency, naming, token, or build-wiring changes;
- do not add runtime tests that assert CSS declarations, class names, internal property names, or typed forwarding;
- remove the superseded authority as its consumer migrates;
- run all five completion gates before marking the task complete;
- mark only that task complete and leave a short handoff note with changed files, verification evidence, and the next ready task;
- commit the completed slice, its handoff note, and this document's updated checkbox before ending the session — completed work must never exist only in the working tree, and the working diff at session start should contain nothing but genuinely unfinished or user-owned changes.

### Phase F — desktop architecture foundation

- [x] **F00 — Capture the desktop reference matrix**
  - Depends on: Gate 1 approval.
  - Scope: Capture browse compact/expanded, gallery compact/expanded, session detail, cart, account, collections, earnings, upload/map-input, loading, empty, error, and dialog states at 1280×800, 1440×900, and 1920×1080.
  - Invariant and verifier: The current corrected desktop experience is an explicit visual reference; browser inspection owns verification. Record the existing 1440px expanded-toolbar overflow as a defect, not approved parity.

- [x] **F01 — Establish one semantic route-intent contract**
  - Depends on: F00.
  - Scope: Replace the duplicated panel-mode union with one typed contract for browse, gallery workspace, route workspace, map input, full page, and immersive map input. Move pure policy files out of TanStack Router's scanned route directory.
  - Invariant and verifier: Routes express product intent without geometry; TypeScript and focused route-intent tests own verification.

- [x] **F02 — Add the viewport-capability adapter and boundary rule**
  - Depends on: F01.
  - Scope: Create the sole adapter for semantic size band, height band, primary pointer, hover, and reduced-motion capabilities. Do not activate tablet or mobile presentation yet.
  - Invariant and verifier: Raw viewport capability reads have one owner; adapter tests plus ESLint/static enforcement replace feature-level `window.innerWidth` and layout `matchMedia` calls.

- [x] **F03 — Introduce the pure app-shell layout policy**
  - Depends on: F01, F02.
  - Scope: Derive semantic navigation, drawer presentation, map interaction, toggle/back behavior, density, and modality from route intent, session preference, and viewport capabilities. Implement the approved wide-band decisions only; keep constrained and compact decisions as tested policy definitions without mounting their presentation.
  - Invariant and verifier: Product policy has one pure authority; focused policy unit tests own every decision branch.

- [x] **F04 — Separate preference, target presentation, and rendered state**
  - Depends on: F03.
  - Scope: Keep independent session-scoped browse and gallery preferences. Remove the route-workspace effect that overwrites them. Replace feature access to the global rendered-expanded snapshot with semantic shell state.
  - Invariant and verifier: Entering a forced workspace cannot change the user's browse or gallery preference; a focused behavioral test owns the lifecycle.

- [x] **F05 — Introduce DrawerShell with desktop parity**
  - Depends on: F03, F04.
  - Scope: Add the shell that owns semantic surface markup, animation, overscroll containment, focus restoration hooks, safe-area projection, and the drawer container. Preserve the approved wide desktop presentation.
  - Invariant and verifier: One shell realizes the policy without route or feature geometry knowledge; component integration tests and F00 browser references own verification.

- [x] **F06 — Measure rendered drawer geometry**
  - Depends on: F05.
  - Scope: Measure actual animated drawer bounds with `ResizeObserver`, frame-coalesce updates, and expose a read-only geometry projection. Delete the global rendered-expanded snapshot once no consumer needs it.
  - Invariant and verifier: The DOM is the sole authority for rendered geometry; an integration test that changes element bounds owns verification.

- [x] **F07 — Project measured occlusion into the globe**
  - Depends on: F06.
  - Scope: Replace viewport-fraction occlusion with the measured geometry projection. Keep GlobeMap route-agnostic and avoid restarting a full camera flight on every animation frame.
  - Invariant and verifier: A selected spot remains centered in the actually visible map region during resize and drawer animation; the drawer/globe integration seam and browser checks own verification.

- [x] **F08 — Anchor shell-external controls to rendered geometry**
  - Depends on: F06.
  - Scope: Replace the compact floating-control `25vw` formula with shell-owned placement derived from actual drawer bounds. Do not let route modules calculate offsets.
  - Invariant and verifier: Floating controls remain contained and adjacent to the rendered drawer at every desktop reference width; browser geometry checks and a static prohibition on local drawer formulas own verification.

- [x] **F09 — Establish PanelLayout and one scroll-owner contract**
  - Depends on: F05.
  - Scope: Create explicit header, metadata, sticky chrome, scroller, content, and footer slots. Migrate browse/session content first while preserving scroll-direction chrome behavior.
  - Invariant and verifier: Each panel route has one declared scroll owner and sticky chrome lives inside it; focused scroll integration tests own verification.

- [x] **F10 — Migrate gallery and upload footer ownership**
  - Depends on: F09.
  - Scope: Move gallery checkout actions and upload publish/cancel actions into the PanelLayout footer contract. Remove hardcoded footer-clearance padding and parallel sticky/absolute conventions.
  - Invariant and verifier: Footer actions remain reachable without covering the last content item; layout integration and browser scroll checks own verification.

- [x] **F11 — Complete semantic responsive tokens and enforcement**
  - Depends on: F05, F09, F10.
  - Scope: Add semantic roles for shell clearance, panel inset, collection gap, chrome height, control dimensions, motion, safe areas, and layering. Consolidate raw local equivalents as their owners migrate.
  - Invariant and verifier: Layout roles have one token owner and consumers cannot reintroduce raw values; `check-style-boundaries` owns verification.

- [x] **F12 — Move ordinary panel collections to container queries**
  - Depends on: F09, F11.
  - Scope: Migrate session feeds, BaseGallery consumers, cart, collections, skeletons, and session detail away from viewport media queries and binary expanded column props.
  - Invariant and verifier: Ordinary collection density depends on the panel container, not the viewport; browser container-width checks and static rules own verification.

- [x] **F12a — Fix: commit the foundation and restore the task record**
  - Depends on: F12.
  - Scope: Commit the implemented F01–F12 work (currently living only in the working tree) in coherent, reviewable slices together with this document and the existing handoff notes. Verify F12's full migration scope — session feeds, BaseGallery consumers, cart, collections, skeletons, session detail — and write the missing F12 handoff note with its actual verification evidence; if any part of F12's scope is found incomplete, reopen the checkbox instead of papering over it.
  - Invariant and verifier: Every completed task exists in version control with a handoff record; git history and the handoff notes own verification. F12's scope was verified complete (no gap found); F01–F12 landed as four coarse phase-boundary commits plus this document; see `docs/review/responsive-layout-f12a-handoff.md`.

- [x] **F12b — Fix: script the reference matrix, compact-first**
  - Depends on: F00, F12a.
  - Scope: Convert the F00 manual reference matrix into a repeatable scripted browser harness (viewport × drawer intent × drawer state) with stored capture artifacts. Define the viewport axis mobile-first: compact (390×844, 430×932, portrait and landscape), constrained (768×1024, 1024×768), and wide (1280×800, 1440×900, 1920×1080). Capture the wide-band states now as the desktop-parity baseline; compact and constrained slots are filled as their phases land. Cover browse, gallery, session detail, cart, account, collections, earnings, upload/map-input, loading, empty, error, and dialog states.
  - Invariant and verifier: Browser-owned layout invariants are re-runnable by any session against stored references instead of re-derived by hand; the scripted matrix and its artifacts own verification. All later verification tasks (M07, T05, D00, D03) must consume this harness rather than one-off inspection.

- [x] **F12c — Fix: retire the stray viewport breakpoints**
  - Depends on: F11, F12.
  - Scope: Migrate the remaining raw width queries — `src/features/AddSpot/ui/AddSpotPanel.module.css` (`max-width: 480px`) and `src/shared/ui/CarouselLightbox/CarouselLightbox.module.css` (`max-width: 760px`) — to container-owned or shell-owned styling. Extend `check-style-boundaries` so no feature or shared CSS outside the sanctioned shell projections can declare a viewport width query.
  - Invariant and verifier: No unpoliced viewport breakpoint exists in feature or shared CSS; `check-style-boundaries` owns verification.

- [x] **F12d — Refactor: establish band-transition continuity at the shell seam**
  - Depends on: F03, F05, F06.
  - Scope: Define the contract for live capability-band crossings (window resize, device rotation, split view): route, in-progress drafts, focus context, scroll intent, and session preferences must survive a presentation swap. Implement the preservation mechanism in the shell and policy layers now, exercised with simulated capability changes, since only the wide-band presentation is mounted.
  - Invariant and verifier: Crossing a capability band cannot discard user state; a shell-seam integration test that swaps capability bands owns verification. The band verification tasks (M07, T05, D03) must re-verify with real rotation and resize. Under mobile-first sequencing this contract is the primary axis, since compact↔wide crossings become the first live presentation swap.

- [x] **F12e — Refactor: make compact the base band**
  - Depends on: F03, F12d.
  - Scope: Make the compact presentation the policy fallback when viewport capabilities are indeterminate (first paint, restored sessions, unknown embedding contexts), and audit every capability gate for progressive enhancement: hover, fine pointer, and wider bands must be additive enhancements over a working compact base, never prerequisites. Codify the `min-width` container-query convention as a static rule so no consumer can author a wide-first override cascade.
  - Invariant and verifier: No code path requires a wide viewport or hover capability to produce a usable presentation; policy unit tests own the fallback branch and `check-style-boundaries` owns the min-width convention. All five completion gates must pass.

- [x] **F12f — Build the measured virtual-gallery adapter**
  - Depends on: F06, F09, F11.
  - Scope: Replace viewport and mirrored panel-width arithmetic with one measured-width adapter and one pure column policy. Feed the same column result to row construction and rendering. The column policy must express the full band range (one column at compact widths through six at wide) so Phase M consumes it without modification.
  - Invariant and verifier: Row chunking and rendered columns cannot disagree; pure policy tests plus a resize/rechunk integration test own verification. All five completion gates must pass.

- [x] **F12g — Make date navigation container-aware**
  - Depends on: F12f.
  - Scope: Show the date sidebar only when measured gallery width supports it. Provide sticky date headings and a date-jump control below that capability — this below-capability path is the compact default, not an edge case, under mobile-first sequencing. Rail behavior pinned by user requirements (2026-07-24): the rail is panel chrome, not scrolled content — it stays pinned while the media grid scrolls beneath it; the active date highlight follows scrolling as that date's media enters the viewport; when dates exceed available height the rail scrolls independently with its native scrollbar fully hidden. Prerequisite fix folded into this slice: since F09/F10 the panel owns scrolling, but VirtualGallery still attaches its virtualizer, scroll listener, and scrollToIndex to its own non-scrolling box — freezing the highlight and making date-jump a no-op; resolve the real scroll owner instead.
  - Invariant and verifier: Date navigation remains reachable and never steals unusable gallery width; gallery integration and browser checks own verification. All five completion gates must pass.

- [x] **F12h — Refactor: automate the reference matrix as a Playwright visual-regression gate**
  - Depends on: F12b. May land anywhere before M07; landing before M00 gives Phase M slices free visual-regression coverage.
  - Scope: Implement the approved spec in `.scratch/responsive-layout-foundation/issues/02-playwright-visual-regression-gate.md`: migrate the 14 state recipes to Playwright Test (`npm run test:visual`, separate from vitest and the five gates), assert with `toHaveScreenshot` (masked map canvas, reduced motion), pin capture data with a dedicated seeded database, commit baselines, and delete the superseded CDP harness in the same slice. Final baseline set requires in-session visual verification, so run this in a main session rather than dispatching to the headless coder.
  - Invariant and verifier: A change to any captured layout state cannot land unnoticed and costs no review effort when nothing changed; the Playwright snapshot suite owns verification, and a deliberate layout change must fail it while map-camera movement alone must not. All five completion gates must pass. Once landed, M07, T05, D00, and D03 consume `npm run test:visual` as the matrix execution vehicle.
  - Completed 2026-07-26: 42 wide-band baselines (14 states × 3 viewports) are committed, the suite runs green against them, and the CDP harness is deleted. Verified that a deliberate 3px grid-gap change fails all attempts (~9,700-pixel diff) while the hidden map cannot contribute a diff. Two structural findings are recorded in `docs/review/responsive-layout-f12h-handoff.md` and matter to later work: Playwright's `mask` is unusable here because the map fills the viewport beneath the panel (the map is hidden with injected CSS instead), and the browse feed needed extra seeded sessions or a single card would have made the baseline blind to F12k's column change. Known residual flakiness: `gallery-compact` intermittently needs a retry (virtualiser still settling); `retries: 2` absorbs it and fixing it at source is still open. Gate coverage was extended so `tests/` and `playwright.config.ts` are typechecked and linted. **Correction 2026-07-27:** the virtualiser was not the cause — the capture was firing while the panel was still animating (see the F12k residual note below and the correction section in `docs/review/responsive-layout-f12h-handoff.md`). Fixed at source, along with a sign-in boot race, a too-tight `loading` timeout, and an unmasked map popup in `session-detail`.

- [x] **F12i — Fix: modal layering owned by semantic layer roles**
  - Depends on: F11. Must land before M00, whose sheet/overlay work consumes the same layer roles.
  - Scope: Concurrently open modals currently stack by portal mount order, not by product meaning: the auth modal and the carousel lightbox both take Mantine's default modal z-index, and Mantine 8 appends each modal's portal root at component mount, so the app-root-mounted auth modal paints **under** the later-mounted lightbox (bug: liking media from the lightbox while logged out shows the sign-in dialog behind it). The `--wa-z-modal` token has zero consumers. Replace the orphaned token with role-named modal tiers — a content/workspace-modal tier (lightbox) and an interrupt tier above it (auth) — and make both modals consume their role via `zIndex`. Add static enforcement proportionate to the contract: modal-tier z-index must come from the role tokens (ESLint for the TSX `zIndex` prop and/or `check-style-boundaries`); micro-stacking inside a component's own stacking context (e.g. the lightbox chrome's local `z-index: 1..3`) stays legal and is D02's broader sweep. Decision recorded 2026-07-23: Mantine `Modal.Stack` was evaluated and rejected as the mechanism — it requires co-located ownership of both modals under one stack context (a global modal registry that would also own their open state) and assigns ordinal open-order z-indices, while the product rule is semantic (an interrupt always outranks content). `Modal.Stack` remains acceptable locally if a single feature ever owns a true multi-modal flow.
  - Invariant and verifier: An auth interrupt always renders above the surface that triggered it, focus is trapped in the interrupt, and Escape/overlay dismissal returns to the intact surface beneath; static rules own token consumption, and the scripted reference matrix (F12b/F12h) gains a lightbox-with-auth-interrupt state for visual verification. All five completion gates must pass.

- [x] **F12j — Fix: preserve gated-action intent across the auth interrupt**
  - Depends on: F12i (the interrupt-modal contract it completes).
  - Scope: Auth-gated actions drop the user's intent on the floor: `toggleFavorite` (`src/entities/Media/model/useMediaFavorites.ts`) and `handleCheckout` (`src/entities/Commerce/model/useCartCheckout.ts`) open the auth modal and early-return, so after signing in the user is back in context but must find and re-trigger the action. Extend the auth-modal contract with an optional continuation (e.g. `open({ onAuthenticated })`) invoked once on successful sign-in; dismissal discards it. Migrate both existing gates. No generalized pending-intent store — two call sites do not justify one.

    Correction (2026-07-25, found while implementing): **five** gates share this defect, not two. Besides the two named above: the spot-popup favorite (`toggleFavorite` in `src/entities/Spot/model/useFavoriteSpot.ts`), the favorite-spots filter (`handleFavoritesChange`) and the upload entry (`handleUpload`, both in `src/app/routes/_panel.tsx`). All five are migrated onto the one continuation. The no-generalized-store decision stands unchanged — the continuation is carried by the modal contract itself, so it scales across five call sites without a registry. Note that the remaining bare `open()` calls are *sign-in affordances* (the account control, the "sign in to add a spot" prompt, empty-state actions, the `/auth` route), not gated actions: they have no intent to preserve, which is why a blanket static ban on argument-less `open()` would be wrong and behavioral tests at each gate own this invariant instead.
  - Invariant and verifier: Signing in from a gated action completes that action without a second interaction, and dismissing the interrupt leaves all state untouched; behavioral tests at both gate call sites own verification. All five completion gates must pass.

- [x] **F12k — Refactor: make panel collection columns measured, and the reflow animatable**
  - Depends on: F12f (consumes the same column policy). Should land before M00 and M02, whose sheet presentations re-column the same grid on every snap.
  - Scope: `PanelCollectionGrid` selects columns purely from `@container panel` breakpoints (600px, 900px), plus a `[data-drawer-state]` override that jumps the tracks to the drawer's destination the instant it starts moving. Two coupled defects must be fixed together. **Ownership:** those container-query breakpoints duplicate the column decision F12f centralises in one measured-width policy, while `usePanelGalleryColumns` mirrors panel width from the viewport as a third source; collapse all three onto the F12f policy fed by a measured container width, and drive the `data-preview` reveal from the same count so it can never disagree with the tracks. **Animatability:** CSS cannot interpolate grid track *count*, so a reflow can only be animated by a FLIP — and a FLIP animates only a layout change occurring inside the React commit it brackets. A container-query re-column driven by an animating width is therefore unanimatable by construction: the browser reflows and paints before React is notified (ResizeObserver), so the FLIP measures a zero delta and the tiles teleport. The column count must be React state that sets the tracks, making each step a commit the animation can bracket. Retire the `data-drawer-state` override in the same slice: jumping the tracks at the *start* of the drawer's width animation measures the reflow against a box that no longer exists a frame later, which is what makes collapsing snap hardest. Note the constraint on the drawer side too — the persistent panel must keep animating its real width (framer `animate`), not a transform-based `layout`, because `publishDrawerGeometry` observes the real border-box and feeds the globe's camera occlusion.

    Column decision pinned by user requirements (2026-07-26), resolving an ambiguity found while scoping this task: **session-card density keeps today's 3-column cap.** The F12f policy is `round(measuredWidth / targetTile)`, which fixes the 1→2 and 2→3 steps at a 1:1.67 ratio and so cannot reproduce today's 600/900 container breakpoints (1:1.5) with any single target tile; running it uncapped would also give wide expanded panels a 4th column at ~1600px+ viewports. Add a panel-card target tile to the policy's density vocabulary and cap it at 3, so the collapse onto one measured policy is behaviour-preserving at every currently captured viewport. Note also that the task text above names `usePanelGalleryColumns` as a live third source — F12f already deleted it, so only two sources remain to collapse (the container queries and the `data-drawer-state` override).
  - Invariant and verifier: One policy decides row chunking, rendered tracks, and preview reveal, and a drawer or sheet resize re-columns without tiles teleporting; column-policy unit tests plus a step-through-the-breakpoints test own the count, `check-style-boundaries` owns the ownership rule — updated in this slice to enforce that the component owns the breakpoints and the stylesheet does not re-column, replacing the current rule mandating the container queries — and the F12h visual gate owns the static end states. All five completion gates must pass.
  - Completed 2026-07-26, with three corrections to the task text above.

    **There were three live authorities, not two.** Besides the container queries and the `data-drawer-state` override, `BaseGallery` exposed a `columns?: number` prop that wrote an inline `grid-template-columns` — beating every rule in the cascade — and `StepModeModal` passed a hardcoded `3` to it. All three are gone; the prop is deleted rather than kept as an escape hatch, and the upload modal now measures like everything else (its ~936px grid yields the same 3 columns, so no visual change).

    **The instruction to retire destination-anticipation was inverted, and the implementation depends on the opposite.** The text argued that jumping the tracks at the start of the animation "measures the reflow against a box that no longer exists a frame later". In practice the reverse is true: a measurement of the *live* box arrives a frame late, so content sized from it spends one frame arranged for the width it just left — long enough to show a single card stretched across the panel when opening, or three squeezed into a narrow one when closing. What was actually wrong with `data-drawer-state` was that it was a second, CSS-side authority carrying a column *count* rather than a width. `DrawerShell` now publishes the destination as a width (its resting measurement × the exact ratio between the two states, which is clean because the states are pure viewport fractions with nothing added), and consumers subtract their own inset from it. Scaling a consumer's own width instead overshoots by twice that inset — 48px — which near a step boundary picks the wrong count, animates to it, and visibly corrects.

    **`panelCard` is 340px, capped at 3** (`GALLERY_DENSITY`). The 2-column tier is unreachable at every captured viewport, so only the 1- and 3-column cases bind; 340 sits at the midpoint of the valid window with 54px and 86px of headroom. `preview` now means `columns × 3` — three rows' worth — which also fixes session detail rendering one skeleton per media item at wide widths.

    Motion, agreed with the user by direct inspection over several rounds: content lays out once at the destination and the moving surface edge sweeps across it. While *closing* the two widths must be split — the box stays the wider of the two so cards still crossing the space being given up are not clipped, while the chrome (header, search row, card area, footer) takes the destination width so it travels with the panel instead of snapping on arrival. Cards are placed relative to the panel, never anchored to the far edge. Chrome whose position derives from panel width glides via `PanelChromeSlot`; controls mounted *beside* the drawer (the compact filter pills) have no honest mid-flight position and wait for `useDrawerMoving()` to settle. Note for M00/M02: a layout animation only runs if the animated element re-renders when the layout changes, so the column count is published down to the cards — a component whose own output is unchanged is skipped by React and teleports.

    Residual: `browse-expanded` and `gallery-compact` remain intermittently non-deterministic in the F12h suite (243–632 differing pixels, text rendering only, reproduced with this slice fully reverted). Pre-existing and unrelated; still unowned, and worth an issue since a gate that fails on healthy code stops being read.

    Residual closed 2026-07-27. The cause was not text rendering: those two states are exactly the two whose recipe *toggles* the panel, and the capture was firing while the panel was still animating open or shut. The recipe treated the toggle button's label flip as "done", but that is the animation's start — the filter-pill row was measured mid-glide, off-screen, at a different position every run, which is why the diff was always confined to the last element still moving and never the same size twice. `animations: 'disabled'` cannot reach it, because `DrawerShell` and `PanelChromeSlot` animate through framer-motion rather than CSS. `tests/visual/matrix.spec.ts` now waits until nothing on the page has moved for three consecutive frames before capturing. Three further false failures were found and fixed in the same pass: the sign-in setup raced the API server's boot (the web-server wait now targets `/api/health`, which Vite proxies, instead of the client port); `loading` timed out at its 5s implicit default because it is the only state that starts its clock before any module has loaded (now 30s); and `session-detail` had an unmasked camera-dependent element — the selected-spot popup, captured present at two viewports and absent at the third by chance — now hidden alongside the map markers. Nine baselines re-recorded from the resting state. The suite is green at `--retries=0`, which it never was before. `maxDiffPixelRatio` stays at 0.002: with everything at rest, a repeatable 29–845 pixels of glyph-edge rasterisation still differs between runs, but the mid-animation difference stacked on top of it was worth ~0.01, five times that tolerance.

- [x] **F12l — Refactor: add height band to the policy axis and pin the presentation decision table**
  - Depends on: F03 (the capability adapter already produces `heightBand`), F12e. Must land before M00 and T00, which mount the compact and constrained presentations this decision governs.
  - Scope: The presentation policy keys only on `sizeBand` — `AppShellLayoutPolicyInput` takes `sizeBand` without `heightBand` (`src/shared/model/appShellLayoutPolicy.ts`), even though the F03 adapter already computes `heightBand: 'short' | 'regular'` at 700px and nothing consumes it. Width alone cannot separate a landscape phone from a tablet: an iPhone 12 landscape is 844×390 CSS px (physical 2532×1170 ÷ devicePixelRatio 3 — the policy sees CSS px), so it lands in `constrained` beside a 768–1199px tablet, but its ~340px usable height makes a bottom sheet unusable. Thread `heightBand` into the policy input and encode the decision table below. Keep this as tested policy definitions without mounting non-wide presentation (the F03 discipline) — the three call sites stay on the desktop-foundation wrapper until M00/T00 mount their bands; this task only makes the policy able to express the cell, and adds the branch coverage. Do **not** add a viewport media query: 768/700 already live as `CONSTRAINED_MIN_WIDTH_PX`/`REGULAR_MIN_HEIGHT_PX` in the one capability adapter (F12c retired stray breakpoints).

    Decision table (browse intent), pending in-session design sign-off:

    | Band × orientation | sizeBand | heightBand | Browse presentation |
    |---|---|---|---|
    | Phone portrait | compact | regular | bottom sheet |
    | Phone landscape | constrained | short | side sheet (touch-tuned, not the desktop panel) |
    | Tablet portrait | constrained | regular | **OPEN — side overlay (current T01) vs bottom sheet** |
    | Tablet landscape / small laptop | constrained → wide | regular | side overlay → persistent |
    | Desktop | wide | regular | persistent panel |

    Two cells remain explicit design decisions, not defaults: the tablet-portrait presentation (T01 currently specifies side overlay; a bottom-sheet-at-3-columns alternative was raised), and whether the Feed is ever more than one column on tablet. Resolve both before T00/T01 implement, and reconcile T01/T02 scope with the outcome.

    Column counts are deliberately **absent** from this table. Presentation is a discrete lookup on semantic bands and belongs here; column count is a continuous function of the *measured* surface width and belongs to the F12f pure column policy (`columns(measuredWidth)`, one through six). Tabulating columns per resolution would re-introduce the viewport-mirrored `usePanelGalleryColumns` arithmetic F12f exists to delete — the presentation decides the width, the column policy reads it. F12k makes that column count React-owned so the reflow between steps is animatable.
  - Invariant and verifier: The policy distinguishes landscape phone from tablet by capability rather than width alone, and rotating a phone is a presentation swap the F12d continuity contract already owns; policy unit tests own every `sizeBand × heightBand` branch, and the F12b/F12h reference matrix — whose compact band already captures the 844×390 and 932×430 landscape viewports — owns visual verification once the presentations mount. All five completion gates must pass.

- [x] **F12m — Fix: mount the panel search/filter chrome once in the PanelLayout scroll owner (browse + gallery)**
  - Depends on: F09 (PanelLayout's one scroll owner and its `stickyChrome` slot), F10.
  - Root cause (fundamental, discovered 2026-07-25): the pinned search/filter chrome (`PanelScrollChrome`) has **no single owner and no single scroll owner**. It is hand-mounted inside each content surface's own scroll subtree instead of once in `PanelLayout`'s `stickyChrome` slot (which sits directly in the panel scroll owner). `SidePanel` routes browse/gallery/spot away from that slot (`stickyChrome={!hideSubheaderOnScroll && subheader ? … : undefined}` — and because `subheader` exists **only** for those routes, `!hideSubheaderOnScroll && subheader` is always false, so the slot is effectively dead and the chrome is *always* content-mounted). The hide-on-scroll copy inside content is fragile: any surface can silently trap its `position: sticky` by declaring an overflow context — `SessionFeed`'s `.feed` wrapper sets `overflow-x: hidden`, which per CSS computes `overflow-y` to `auto`, making it a scroll container that captures the sticky row and detaches it from the panel scroll owner and its scroll-direction signal, so the feed's row never reveals on scroll-up. The gallery had the identical defect, patched ad hoc in F12g by stripping `VirtualGallery`'s overflow.
  - Scope (bounded to the surfaces that already live in PanelLayout's scroll owner): `SessionFeed`, `VirtualGallery`, and the `PublicGallery` loading/empty states — whose chrome content is `SidePanel`'s `subheader`. Give `PanelLayout`'s `stickyChrome` slot the hide-on-scroll behavior (SidePanel already computes the hidden state; thread it to the slot), mount the chrome once there from `subheader`, delete the `<PanelScrollChrome />` mounts in those three, and retire the `hideSubheaderOnScroll` bypass for them. This supersedes the transitional feed/gallery overflow fixes. **Explicitly out of scope — see F12n:** `PanelGalleryLayout` and its seven consumers (cart, me, earnings, three collections tabs, session detail) run a **second, private scroll owner** (`PanelGalleryLayout`'s own `.scroller` with `overflow-y: auto`) with its own chrome mount, and the collections route supplies chrome *content* through a route-level `PanelScrollChromeProvider` rather than `subheader`. Unifying those requires collapsing the second scroll owner, not just relocating a mount, so F12m leaves them untouched and the single-owner static rule below is scoped to the three migrated files (not a global ban) until F12n lands.
  - Invariant and verifier: On browse and gallery the search/filter row reveals/hides from one mount in the panel scroll owner and cannot be trapped by content overflow. New static rule (`check:style-boundaries`, same commit): the three migrated surfaces (`SessionFeed`, `VirtualGallery`, `PublicGallery`) may read `usePanelScrollChromeState` but must not render `<PanelScrollChrome />`; `PanelGalleryLayout` remains a recorded exception pointing at F12n. Reveal behavior is owned by SidePanel integration and browser checks. All five completion gates must pass.

**F12n split into F12n-a and F12n-b on 2026-07-26.** The original single task bundled two independent intents: retiring the second scroll owner (mechanical, no open questions) and unifying chrome provisioning (which requires a publish-upward seam and a precedence decision, because the collections toolbar's provider mounts *below* the slot that F12m established and cannot reach it by context). Splitting lets the scroll-ownership invariant land immediately while the seam gets its own decision pass. `F12n` references in `scripts/check-style-boundaries.mjs` comments are updated by whichever sub-task retires the exception they name.

- [x] **F12n-a — Refactor: collapse `PanelGalleryLayout`'s private scroll owner onto the panel scroll owner**
  - Depends on: F12m.
  - Root cause: `PanelGalleryLayout` owns a **second scroll owner** — its own `.scroller` (`overflow-y: auto`) nested inside `PanelLayout`'s scroll owner — used by seven panel screens (`_panel.cart`, `_panel.me.index`, `_panel.me.earnings`, `_panel.me.collections.{index,favorites,purchases}`, and `SessionDetail`). F09 mandates a single panel scroll owner; this violates it, and it is the parallel authority that makes "one home for the row" impossible after F12m alone.
  - Scope: Retire the private `.scroller` so these screens scroll in the one `PanelLayout` scroll owner. The **meta row** — the pinned spot · location · photographer line on `SessionDetail`, the only consumer that passes `meta` — must stay pinned (user decision, 2026-07-26): it currently sits outside the private scroller, so removing that scroller would let it scroll away with the grid. It must be re-pinned by projecting it into `PanelLayout`'s pinned region through a slot, **not** by a local `position: sticky` — the existing `panel-layout-owns-footer-placement` rule already bans `position: absolute|sticky` in `PanelGalleryLayout.{tsx,module.css}`, so the projection path is the only gate-legal one and needs no new decision. Chrome mount, `subheader` path, and the collections `PanelScrollChromeProvider` are explicitly **out of scope** (F12n-b) — those seven screens supply no `subheader`, so their single row keeps working from where it is mounted today.
  - Invariant and verifier: Exactly one scroll owner exists per panel across these seven screens, and the `SessionDetail` meta row stays pinned while the grid scrolls under it. Static rule (same commit): extend `panel-layout-owns-standard-scrolling`'s include list to `PanelGalleryLayout.{tsx,module.css}` so no nested scroll owner can return. Each screen is verified for scroll, sticky chrome reveal, footer, meta, empty, and loading via focused integration and browser checks. All five completion gates must pass.

- [x] **F12n-b — Refactor: unify panel chrome provisioning onto one seam**
  - Depends on: F12n-a.
  - Root cause: chrome *content* reaches the pinned row by two incompatible paths. `SidePanel` passes `subheader` and mounts the row in `PanelLayout`'s `stickyChrome` slot (F12m); the collections layout instead supplies a `toolbar` through a route-level `PanelScrollChromeProvider` mounted **inside** the panel content, below the slot — so after F12n-a the seven screens still carry their own `<PanelScrollChrome />` mount because their content cannot reach the slot from below.
  - Open decisions to resolve before implementing: (1) the publish-upward seam — presumably the portal pattern already used by `PanelLayoutFooter`/`PanelLayoutRail`, letting a child route publish chrome content into the slot; (2) precedence and hide-on-scroll semantics when a route-supplied toolbar and a `subheader` are both present.
  - Scope: Reconcile the two content-provisioning paths into one seam, fold the seven screens' chrome into the `stickyChrome` slot, delete their local mounts, and extend the F12m static rule to a global invariant: only `PanelLayout`/`SidePanel` may render `<PanelScrollChrome />`.
  - Invariant and verifier: The search/filter row has exactly one mount across all nine panel screens and one content seam, and no surface can reintroduce a mount. Static rules own the single-mount constraint; the seven screens are re-verified for chrome reveal and content correctness via focused integration and browser checks. All five completion gates must pass.

### Phase M — mobile experience: compact plus constrained-short (promoted by the 2026-07-22 pivot)

**Verification correction for all unchecked tasks (2026-07-27):** F12b/F12h remain an accurate historical record of how wide-band references were captured, but their instructions for M07/T05/D00/D03 to consume screenshot comparison are superseded by the current `AGENTS.md` §6 prohibition on screenshot and pixel-driven verification. Unchecked tasks use semantic DOM, computed-style, geometry, accessibility, focus, scroll, interaction, console, and network assertions. When an appearance decision has no reliable non-visual signal, the implementing session stops with a short manual checklist for the user.

- [x] **M00 — Add compact bottom-sheet mechanics**
  - Depends on: F12d, F12e.
  - Scope: Extend DrawerShell with collapsed and full compact presentations using transform-based motion, snap points, drag gestures with scroll-versus-drag arbitration, dynamic viewport units, safe areas, overscroll containment, and focus restoration. The gesture and snap-point semantics are new to the shell contract — renegotiating DrawerShell's internal interface here is expected and acceptable; the external policy-facing interface must not leak sheet geometry to routes or features.
  - Invariant and verifier: Sheet state, geometry, modality, and accessibility remain synchronized; shell integration tests own verification. All five completion gates must pass.
  - Completed 2026-07-27, mechanics only — **nothing mounts the sheet and nothing changes on screen at any width**. `SidePanel`'s presentation prop is narrowed and the `_panel.tsx` guard excludes `bottomSheet`, so "not mounted yet" is a compile-time fact M02 deletes rather than a comment. See `docs/review/responsive-layout-m00-handoff.md`.

    **Three snaps, not two, pinned by user requirements (2026-07-27):** `peek` (the search row and upload control — these *are* the sheet at its smallest, not separate floating controls), `half` at 34% of the dynamic viewport, and `full` at 90%, leaving a small map strip as in Google Maps. Promotion to `full` happens by *scrolling* the list, not only by dragging; return is by handle drag, flick, or pulling down while the list is at its top. `peek` is the one snap sized by its own content, so it is a constant until M02 mounts that content and can measure it.

    Two defects found in review and fixed in this slice: the sheet branch wrapped `children` in an extra provider, which rebuilt the whole panel subtree on a band crossing and silently discarded the draft, focus, and scroll position F12d exists to preserve (the continuity test asserted only the surface element and used a plain text child, so it could not see this — it now asserts child node identity, value, and focus, and was verified to fail against the old code); and four snap-geometry values were exported from the barrel while the new static rule forbids every module outside the folder from naming them.

    **Blocks M02 (tracked as M00b below):** `deriveDrawerViewportOcclusionPx` is horizontal-only (`left`/`right`), so it describes a panel beside the map, not a sheet below it. When the sheet mounts, a selected spot will centre underneath it rather than in the visible map strip — contradicting the pinned "spot marker centers on the rest of map area" requirement. The measured bounds already carry `top`/`bottom`; only the projection needs extending.

- [x] **M00a — Refactor: establish one live policy projection and split metrics from capabilities**
  - Depends on: F02, F12e, F12l, M00. Must land before M01, which is the first task whose presentation depends on the detected band being real.
  - Root cause (two coupled defects in the detection system, found while scoping M01 on 2026-07-27):

    **Nothing consumes the detector.** `viewportCapabilities.ts` has been the sole owner of band detection since F02, CSS carries no viewport width query at all (`no-viewport-width-breakpoints`), and F12l made the policy able to express every `sizeBand × heightBand` cell. But all three shell decision points — `AppShell.tsx`, `_panel.tsx`, `GlobeScene.tsx` — call `deriveDesktopFoundationAppShellLayoutPolicy`, which hardcodes `wide`/`regular`. The app therefore never asks what it is running on, and the same "which band is live" decision exists as three independent copies in unrelated files, so each Phase M/T activation would have to edit all three.

    **The detector mixes two change rates on one channel.** `ViewportCapabilities` carries `viewportWidthPx`/`viewportHeightPx` alongside the discrete bands, so every pixel of a window drag produces a new snapshot and re-renders every consumer — including the ones that only need "compact or wide". Raw viewport size is a continuous measurement consumed for geometry (drawer-adjacent inset, sheet snap heights, map occlusion), not a capability; per the source-of-truth rules, measurement and capability are different facts and must not share a subscription.
  - Scope:
    1. Split the current browser reader into two concrete modules, not pluggable ports:
       - a discrete capability snapshot (`sizeBand`, `heightBand`, `primaryPointer`, `supportsHover`, `prefersReducedMotion`) that listens for the underlying browser changes but publishes only when one of those semantic values changes;
       - a continuous viewport-metrics snapshot (`layoutViewportWidthPx`, `layoutViewportHeightPx`) that publishes per resize and is explicitly the future owner M05 extends with visual-viewport geometry.
    2. Migrate the three pixel consumers (`DrawerShell.tsx`, `DrawerShell/geometry.ts`, `GlobeScene.tsx`) to the metrics module; leave the pure modules that merely take pixel parameters (`sheetSnapPolicy`, `drawerViewportOcclusion`) untouched.
    3. Add one app-level policy provider at the composition root, wrapping both `AppShell` and the route `Outlet`. It alone gathers route intent, panel preferences, and real viewport capabilities, calls the pure policy module, and exposes the current read-only `AppShellLayoutPolicy` through a small consumer hook. `AppShell`, `_panel.tsx`, and `GlobeScene` consume that hook; they no longer resolve or assemble policy inputs themselves.
    4. Keep an explicit temporary activation matrix inside that provider, separate from the target policy:
       - one cell per `sizeBand × heightBand × routeIntent`, activating navigation and the drawer/map/chrome lifecycle together as one coherent presentation.
       A cell not yet implemented uses the complete wide/regular lifecycle rather than mixing individual target-policy fields with fallback fields. **Navigation is not separately activatable** (decision 2026-07-27): a live mobile navigation cell over a wide-fallback drawer is itself the field-level hybrid this rule forbids — the mobile top bar would sit over the 25vw desktop panel, about 98px on a 390px phone. M01 and T00 therefore build their navigation presentations without activating anything; M02 and T01 activate navigation with the browse lifecycle. Initially only wide cells are active, so behavior is unchanged at every width. Phase M activates `compact × {short, regular}` plus `constrained × short`; Phase T activates `constrained × regular`; D01 deletes the matrix once every cell is mounted.
    5. Delete `deriveDesktopFoundationAppShellLayoutPolicy`.
  - Interface constraint: Policy consumers learn only the semantic `AppShellLayoutPolicy`. They must not accept or know route intent, preference fields, capability bands, activation-matrix state, breakpoints, or viewport pixels. This is an in-process deep module; do not introduce a provider port, adapter interface, or dependency injection for its single composition-root implementation.
  - Invariant and verifier: The app has one current semantic shell-policy projection, and an unmounted presentation cannot become live implicitly. Every cell changes as one coherent navigation/drawer/map/chrome lifecycle rather than a field-level hybrid, with no independent navigation exemption. Pixel size cannot re-enter the capability snapshot: TypeScript owns that because the capability type no longer carries pixels. Static rules (same commit): only the composition-root provider may call `deriveAppShellLayoutPolicy`; policy consumers may only use the semantic consumer hook; direct viewport reads remain confined to the capability/metrics owners; activation-matrix vocabulary is confined to the provider; and the deleted desktop-foundation wrapper joins the banned legacy vocabulary. Focused tests at the module interfaces own: navigation activation, every mounted versus unmounted `sizeBand × heightBand × routeIntent` branch, the prohibition on hybrid lifecycles, consistent policy consumption across shell/panel/globe, and the split's behavioral point that a resize within the same capability cell does not notify capability subscribers. No visual change at any width; the five project gates plus the existing wide-band DOM/geometry behavior checks own verification.

- [x] **M00b — Generalize measured drawer occlusion into map camera insets**
  - Depends on: M00a. Must land before M02 mounts the bottom sheet.
  - Root cause: `deriveDrawerViewportOcclusionPx` and `GlobeMap` expose one right-edge pixel value. That models a panel beside the map, but a compact bottom sheet occludes the map from the bottom. Mounting M02 without changing this contract would center the selected spot underneath the sheet rather than in the visible map strip.
  - Scope: Replace the right-edge-only projection with semantic camera insets (`top`, `right`, `bottom`, `left`) derived from the measured drawer bounds, continuous viewport metrics, and the policy-owned drawer presentation/edge. Keep the arithmetic behind the projection so `GlobeScene` and `GlobeMap` do not infer drawer placement. Change `GlobeMap` to consume the inset projection and compose it with its existing selected-spot preview inset without restarting a full camera flight on every geometry frame. Preserve current wide-band behavior exactly.
  - Invariant and verifier: A selected spot centers in the actually visible map rectangle for both an inline-end panel and a block-end sheet, including while the surface animates. Pure projection tests own edge arithmetic; the drawer/globe integration seam owns live inset updates and the no-restarted-flight behavior; wide-band DOM/geometry checks own parity. Static enforcement updates the legacy right-only vocabulary so it cannot return. No visual change until M02 mounts the compact presentation. All five completion gates must pass.
  - Completed 2026-07-27. `deriveMapCameraInsets` keys on the policy's drawer presentation: `persistent`/`sideOverlay` occlude the inline end, `bottomSheet` the block end, `fullScreen`/`hidden` neither. `top`/`left` stay 0 — they exist because Mapbox padding is four-sided and the selected-spot preview offset composes onto `top`. All four sides are now passed explicitly to `flyTo`/`easeTo`/`setPadding`, since Mapbox merges a partial padding object with the transform's current padding. The insets prop is destructured into number primitives inside `GlobeMap` so a fresh object per parent render cannot restart a camera flight. Note for M02: composed vertical padding is deliberately unclamped, so the sheet's `full` snap plus the 300px preview offset can exceed the canvas — that case only exists once the sheet mounts. See `docs/review/responsive-layout-m00b-handoff.md`.

- [x] **M01 — Implement mobile navigation**
  - Depends on: M00, M00a.
  - Scope: Add the mobile navigation presentations while reusing the existing account and cart authorities: the top bar for compact cells and the touch-tuned compact bar for constrained-short landscape phones. **Build only — activate no cell.** Decision 2026-07-27: navigation does not activate independently of the surface it sits over. Activating the compact navigation cell while the drawer/map/chrome cells stay on the wide fallback would put the mobile top bar over the 25vw desktop panel — about 98px on a 390px phone — which is a field-level hybrid no one designed, exactly what M00a's matrix exists to forbid. M02 activates navigation together with the compact browse lifecycle. This task therefore mounts nothing at any width; the presentations are verified in isolation.
  - Invariant and verifier: Every primary destination remains reachable without duplicated navigation state, and no navigation cell is live before the surface beneath it is; component and accessibility checks own the presentations in isolation, and the matrix's own tests own the still-inactive cells. No visual change at any width. All five completion gates must pass.
  - Completed 2026-07-27. Navigation here is two controls — the account menu and the cart — so the three arrangements differ only in corner and direction, not in content. `widgets/LeftStrip` is renamed `widgets/AppNavigation` and owns all three: the placement name blocked reuse, since cross-widget imports are banned and a second widget could not have imported the existing controls. `AppShell` mounts it once with the policy's navigation value and no longer branches; hiding is the widget's decision. Placement pinned by user requirements 2026-07-27: `topBar` (phone portrait) is the same floating pill moved to the **top-right**, not a full-width bar, so the map stays visible and the top-left stays free for a back control; `compactBar` (constrained, incl. landscape phone) stays **top-left** in a row, because the drawer occupies the inline end in that band and floating chrome paints above the drawer, so a right-pinned pill would sit on top of the side sheet. Edge offsets are now safe-area aware (a no-op at wide). Static rules added: only `AppShell` and the widget may name `AppNavigation`, and the `LeftStrip` name cannot return. See `docs/review/responsive-layout-m01-handoff.md`.

**M02 split into M02-a and M02-b on 2026-07-28.** The original task bundled two cells whose readiness differs. The compact-regular bottom sheet had every mechanism it needed (M00's snaps, gestures and scroll arbitration; M00b's four-sided camera insets; M01's navigation), so it could be activated immediately. The short-height cells cannot: `sideOverlay` still renders as the wide persistent panel's 25/75vw, which on an 844×390 landscape phone is the desktop panel shrunk — the outcome this roadmap exists to prevent — so that presentation has to be designed before it can be mounted. Later tasks that name M02 as a dependency require both halves.

- [x] **M02-a — Implement the compact-regular browse bottom sheet**
  - Depends on: M00, M00a, M00b, M01.
  - Scope: Activate the `compact × regular × browse` lifecycle cell — the bottom sheet, its navigation, in-surface search/actions/filters, and preference preservation across the band crossing. The map stays interactive at every snap, which the policy already grants.
  - Invariant and verifier: On a phone held upright, browse is a bottom sheet over a live map at three resting positions, and the user's browse-extent preference survives a band crossing in both directions. Sheet position is rendered state seeded from the preference, never a second copy of it. Route-level integration tests at the real panel route own the seed, the write-back, the crossing, and the in-sheet chrome; a user checklist owns appearance.
  - Completed 2026-07-28. Sheet position lives beside the existing rendered panel state in `_panel.tsx`, seeded from `browsingExpanded` and re-seeded at the moment the surface becomes a sheet — seeding only at mount would drop the preference when a wide window narrows, which is exactly the crossing F12d exists to protect. Landing on `full` writes the preference; `peek` and `half` both mean not expanded. In-sheet chrome follows the snap rather than the wide-band expansion state (`snap !== 'peek'`), which is what puts the filter pills with the search row at `half` and `full`. `SHEET_PEEK_HEIGHT_PX` stays the 132px constant; measuring it against real content is still open. Two defects found in architect review and fixed with failing-first coverage at the real route: the spot-search select handler was still gated on the wide-band expansion value, so choosing a spot from search did nothing on a phone; and the sheet did not re-read the preference at the crossing. See `docs/review/responsive-layout-m02-a-handoff.md`.

- [ ] **M02-b — Implement the short-height browse presentation**
  - Depends on: M02-a.
  - Scope: Design and implement the touch-tuned side-sheet presentation for `compact × short` and `constrained × short` (landscape phones), then activate those two `browse` cells. `sideOverlay` currently has no styling of its own and falls through to the wide panel's 25/75vw widths, so this task owns its width policy, modality, chrome placement, and touch tuning as a deliberate design, not as the wide panel at different numbers.
  - Invariant and verifier: A landscape phone gets a presentation designed for ~340px of usable height rather than a narrowed desktop panel, and the map stays interactive beside it. Policy and integration tests own cell activation and behavior; a user checklist owns appearance.

- [ ] **M03 — Implement mobile gallery presentations**
  - Depends on: M00, M01, F12f, F12g.
  - Scope: Implement the Phase M gallery cells: full-screen gallery for compact cells and the deliberate short-height companion presentation selected by policy for constrained-short landscape phones. Preserve measured density, sticky date headings, date navigation, and lightbox coordination in both. Activate each Phase M `galleryWorkspace` lifecycle cell only after the whole surface is complete.

    Date-navigation shape pinned by design discussion (2026-07-25), superseding the earlier bare "date-jump control". Two elements, one job each:

    - **A sticky date label in the panel chrome** — not in scrolled content — reporting the date of whatever sits at the top of the grid, and doubling as the tap target that opens the picker. Orientation and navigation become one affordance instead of one control stamped per date group; in-grid separators are plain, non-interactive text. The wide-band compact panel has the same defect today, specified separately in `.scratch/responsive-layout-foundation/issues/03-compact-date-navigation-duplicated-and-occluded.md` — it depends on F12m and should land first, since this task inherits whatever chrome-ownership model exists by then.
    - **A transient trailing-edge scrubber** for coarse traversal. It overlays rather than occupying layout, so unlike the expanded-mode rail it costs no gallery width — which is why the F12g width gate does not exclude it. It must be **inset from the screen edges**: a track starting at the true edge is ambiguous with the system back-swipe gesture (left edge on iOS, both on Android) and the OS wins, producing a control that fails at exactly the starting position people reach for.

    Scrubber for flying, picker for landing — roughly 390px of travel across a long archive puts about a month under each finger contact, so precise targeting stays the picker's job. Full-screen is what makes the scrubber viable here: no sheet to drag means one vertical gesture owner and a stable track length. **If the gallery is ever presented in a bottom sheet instead, the scrubber rotates to horizontal** — vertical there is claimed by sheet-drag and scroll, and the track would rescale as the sheet moves between snaps. At the collapsed snap of any sheet presentation, show no date navigation at all.

    Two cells remain explicit product decisions, not defaults. Resolve both before implementing:

    | Open question | Options | What decides it |
    |---|---|---|
    | Traverse vs browse | Scrubber alone, or a labelled month chip strip beside it | A strip's labels are readable at rest, so users learn what months exist without interacting; a scrubber reveals a date only while dragging. Guessed *traverse* (users arrive with a date in mind) — a guess about real usage, not something the interaction design settles. |
    | Picker granularity | Days or months | How dense a typical capture day is. Sparse days make a day list long and tedious; dense days make month-level jumping too coarse. |
  - Invariant and verifier: Gallery, virtual scrolling, date navigation, and lightbox remain usable in every Phase M capability cell and at large text; integration plus semantic DOM, geometry, focus, and interaction checks own verification. The scrubber's edge inset and the sheet-rotation rule are behavioral, so they are owned by focused integration and interaction checks, not by CSS-declaration assertions. All five completion gates must pass.

- [ ] **M04 — Implement mobile route workspaces**
  - Depends on: M00, M01, F09, F10.
  - Scope: Migrate session detail, cart, account, collections, and earnings to the Phase M workspace lifecycles: full-screen in compact cells and the policy-selected short-height workspace for constrained-short landscape phones. Activate each Phase M `routeWorkspace` cell only after back, modality, map, and chrome behavior are complete.
  - Invariant and verifier: Back, focus, scrolling, footer clearance, loading, empty, and error behavior remain consistent; focused integration and browser checks own verification. All five completion gates must pass.

- [ ] **M05 — Implement mobile map-input and virtual-keyboard behavior**
  - Depends on: M00b, M01, F10.
  - Scope: Present upload and Add Spot through the Phase M map-aware surfaces: bottom sheets where height permits and the policy-selected side-sheet presentation in short-height cells. Extend M00a's continuous viewport-metrics owner with visual-viewport width, height, and offsets; it is the sole module allowed to read `window.visualViewport`. DrawerShell consumes that semantic geometry so focused inputs and primary footer actions remain visible while the software keyboard is open. Do not add keyboard state or visual-viewport pixels to the discrete capability snapshot, route state, or feature stores. Activate each Phase M `mapInput` and `immersiveMapInput` cell only after its complete drawer/map/chrome lifecycle is ready.
  - Invariant and verifier: Keyboard appearance cannot hide the active field or action, cannot notify discrete capability consumers unless a semantic band actually changes, and cannot corrupt measured map occlusion. A focused viewport-metrics/DrawerShell integration test owns keyboard resize and offset behavior; semantic DOM, geometry, focus, and interaction checks own the user flow. Static enforcement confines `visualViewport` reads to the metrics owner. All five completion gates must pass.

- [ ] **M06 — Complete input, safe-area, and reduced-motion behavior**
  - Depends on: M02, M03, M04, M05.
  - Scope: Apply coarse-pointer dimensions, remove hover-only dependencies, verify fine-pointer behavior, consolidate safe-area use, and make drawer, chrome, gallery, validation, lightbox, and globe motion honor the user's preference. Keep the ownership split explicit: CSS media features own purely visual pointer/hover/reduced-motion styling; the TypeScript capability snapshot is consumed only by JavaScript interaction and animation systems that cannot consume CSS. Do not route CSS presentation through React props merely to claim one capability owner.
  - Invariant and verifier: Input modality changes affordances but not product policy, and every motion system honors reduced motion through the owner native to that system. CSS/static checks own visual capability styling and token use; capability integration plus semantic DOM, computed-style, focus, and interaction checks own JavaScript behavior. All five completion gates must pass.

- [ ] **M07 — Verify mobile experience and request Gate 2 approval**
  - Depends on: M06, F12b.
  - Scope: Verify every Phase M capability cell (`compact × {short, regular}` and `constrained × short`) across portrait, landscape, keyboard open, coarse/fine pointer, reduced motion, safe areas, long content, loading, empty, error, overlay, dialog, lightbox, and map-occlusion states. Verify live crossings among mobile cells and compact/constrained-short↔wide under the F12d continuity contract. Reuse F12b's state and viewport inventory, but replace screenshot comparison for all future-band verification with semantic DOM, computed-style, geometry, accessibility, focus, scroll, and interaction assertions. The completed F12h screenshots remain historical wide-band artifacts; current sessions do not use screenshot or pixel comparison as a gate. Any appearance-only judgment becomes a short user checklist.
  - Invariant and verifier: Phase M is one coherent mobile product experience rather than shrunken desktop, and wide-band behavior/geometry has not regressed. The non-visual responsive matrix, user checklist where necessary, and complete project gate set own verification.
  - Stop: Present the evidence and the two still-open constrained-regular decisions from F12l (tablet-portrait presentation and tablet feed density). Wait for explicit Gate 2 approval and those decisions before implementing constrained-regular presentation.

### Phase T — constrained-regular/tablet experience

- [ ] **T00 — Enable constrained policy and navigation**
  - Depends on: Gate 2 approval (Phase M mobile).
  - Scope: Implement the approved constrained-regular navigation. **Build only — activate no cell**, for the same reason M01 does not: a tablet menu over the wide fallback panel is a field-level hybrid. T01 activates the `constrained × regular` navigation cell together with the constrained browse lifecycle. Constrained-short remains owned by the approved Phase M experience.
  - Invariant and verifier: Navigation changes through shell policy without feature conditionals, and no navigation cell is live before the surface beneath it is; policy tests plus keyboard, active-state, coarse-pointer, and fine-pointer checks own the presentation in isolation. No visual change at any width.

- [ ] **T01 — Implement constrained browse presentation**
  - Depends on: T00.
  - Scope: Add the constrained-regular nonmodal side overlay, usable width limits, interactive map, in-drawer search/upload/filters, and one/two-column session density. Activate the `constrained × regular × browse` lifecycle cell only after its complete drawer/map/chrome behavior is ready.
  - Invariant and verifier: Browse remains usable without hiding the map or leaking controls outside the viewport; focused browser interaction and containment checks own verification.

- [ ] **T02 — Implement constrained gallery workspace**
  - Depends on: T00, F12f, F12g.
  - Scope: Add the approved constrained-regular gallery overlay, measured 2–4-column policy, preserved gallery preference, and conditional date navigation. Activate the `constrained × regular × galleryWorkspace` lifecycle cell only after the whole surface is ready.
  - Invariant and verifier: Gallery layout responds only to its measured container and preserves virtual scroll anchoring; gallery integration and browser checks own verification.

- [ ] **T03 — Implement constrained route-workspace modality**
  - Depends on: T00, F09, F10.
  - Scope: Present session detail, cart, account, collections, and earnings as constrained-regular modal/inert side workspaces with route-owned back behavior, focus trap, Escape handling, and focus restoration. Activate the `constrained × regular × routeWorkspace` cell only after its complete modality, map, and chrome lifecycle is ready.
  - Invariant and verifier: Background interaction and accessibility semantics match the rendered modality; focus/back integration tests own verification.

- [ ] **T04 — Implement constrained map-input workflows**
  - Depends on: T00, F09, F10.
  - Scope: Present upload and Add Spot through the approved nonmodal constrained-regular layout while keeping the map interactive and drafts non-destructive on back. Activate the `constrained × regular × mapInput` and `constrained × regular × immersiveMapInput` cells only after their complete drawer/map/chrome lifecycles are ready.
  - Invariant and verifier: Map selection, draft lifecycle, footer reachability, and coarse-pointer controls remain correct; focused integration and browser checks own verification.

- [ ] **T05 — Verify constrained-regular experience and request Gate 3 approval**
  - Depends on: T01, T02, T03, T04, F12d.
  - Scope: Verify constrained-regular portrait and landscape, coarse/fine pointer, keyboard navigation, reduced motion, long content, loading, empty, error, overlay, dialog, and map-occlusion states. Verify live crossings into constrained-short, compact, and wide with rotation, window resize, and split view against the F12d continuity contract: route, drafts, focus, scroll intent, and preferences must survive every presentation swap in both directions. Extend M07's non-visual responsive matrix with the constrained-regular states; use semantic DOM, computed-style, geometry, accessibility, focus, scroll, and interaction assertions, with a short user checklist for appearance-only judgments.
  - Invariant and verifier: Constrained-regular presentation is a coherent tablet/small-window product experience rather than scaled desktop or stretched mobile; the non-visual responsive matrix, user checklist where necessary, and complete project gate set own verification.
  - Stop: Present evidence and wait for explicit Gate 3 approval. Do not begin the Phase D desktop closeout.

### Phase D — wide/desktop completion and closeout

- [ ] **D00 — Correct desktop toolbar containment**
  - Depends on: Gate 3 approval, F12b.
  - Scope: Fix the existing expanded-toolbar overflow while preserving the intended search, upload, and filter relationship. Remove CSS-property runtime assertions that currently pass despite visible clipping. Target layout pinned by user requirements (2026-07-24): the pills share one row with the search bar and upload button, right-aligned; when width is insufficient the pills wrap to their own row directly below that row; toolbar content never overflows the panel horizontally and the panel never scrolls horizontally (see `.scratch/responsive-layout-foundation/issues/01-expanded-toolbar-pills-unreachable.md`).
  - Invariant and verifier: Toolbar controls remain inside the drawer at 1280, 1440, and 1920. DOM bounding-box and scroll-width assertions own containment and wrapping; a short user checklist owns appearance; static rules own token usage. All five completion gates must pass.

- [ ] **D01 — Remove all superseded layout authorities**
  - Depends on: D00, F07, F08, F10, F12c, F12f, F12g, and every Phase M and Phase T task.
  - Scope: Delete fixed panel-width exports, rendered-expanded snapshots, mirrored gallery padding/sidebar allowances, feature-facing expanded props, hardcoded footer clearance, floating-control viewport math, obsolete split policy code, M00a's now-fully-populated activation matrix, and any other migration adapters introduced during the mobile-first pivot. The composition-root provider remains and now projects the target policy directly.
  - Invariant and verifier: No migrated consumer can access raw drawer geometry or viewport breakpoints; import scans, TypeScript, ESLint, and style-boundary rules own verification. All five completion gates must pass.

- [ ] **D02 — Final enforcement and legacy scan**
  - Depends on: D01.
  - Scope: Expand static rules so routes and features cannot reintroduce raw breakpoints, drawer widths, map offsets, panel gutters, footer formulas, arbitrary z-index values, or forbidden dependency directions. Remove all remaining migration adapters.
  - Invariant and verifier: The architecture is machine-enforced and contains no parallel responsive authority; static rule tests, import scans, TypeScript, and ESLint own verification. All five completion gates must pass.

- [ ] **D03 — Final responsive verification and completion**
  - Depends on: D02.
  - Scope: Run the full compact/constrained/wide non-visual matrix across portrait, landscape, short height, keyboard open, coarse/fine pointer, hover, reduced motion, safe areas, loading, empty, error, dialogs, lightboxes, full-page routes, every drawer intent, selected-spot camera centering, and live band transitions in both directions (F12d contract) including rotation and split view. Re-verify the wide band against the behavior and geometry inventory established by F12b: transitions, preference restoration, scroll ownership, sticky/fixed controls, focus restoration, dialogs, reduced motion, map interaction, and measured camera occlusion. M07's semantic DOM, computed-style, geometry, accessibility, focus, scroll, and interaction harness, extended through T05, is the execution vehicle; appearance-only judgments use a short user checklist.
  - Invariant and verifier: Every approved behavior is present in every band, every source-of-truth rule is enforced, the user has confirmed the appearance-only checklist, and all five completion gates are green.

### Session handoff template

End each implementation session with:

```text
Task completed: <task id and title>
Invariant: <what can no longer regress>
Authority: <module that now owns the fact>
Changed files: <focused list>
Focused verification: <tests/static/browser checks and results>
Project gates: <all five results>
Removed concepts: <superseded state/constants/formulas deleted in this slice>
Unrelated working-tree changes preserved: <yes/no and details>
Next ready task: <single task id, or approval gate>
```
