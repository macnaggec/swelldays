# New-session prompt: responsive layout foundation

Work in `/Users/macnaggec/Code/wave-atlas` and follow its `AGENTS.md` exactly.

## Objective

Design and implement the ideal, fully grown responsive-layout architecture for Wave Atlas, a map-first site whose primary application surface is a persistent/overlay drawer. Ignore current implementation effort when defining the ideal end state. This is pre-launch, so optimize for correct ownership, low future refactoring, and machine-enforced layout contracts rather than preserving existing viewport math.

The work originally proceeded desktop-first. On 2026-07-22 the sequencing was pivoted to **mobile-first**; the completed foundation (F00–F12) carries over unchanged because it is band-agnostic. The work now proceeds in this order:

1. Preserve and validate the corrected desktop experience. *(Done — F00 and desktop parity through F12.)*
2. Establish the responsive architecture and migrate desktop onto it without intentional visual change. *(Done — F01–F12.)*
3. Complete the band-agnostic shared foundation and the mobile-first pivot refactors (remainder of Phase F).
4. Design and implement a coherent compact/mobile experience first (Phase M).
5. Only after mobile is approved and stable, design and implement a coherent constrained/tablet experience (Phase T).
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
3. **Rendered geometry** — the actual drawer bounds and map occlusion after layout and animation. Prefer measured rendered geometry over mirrored `vw` constants.
4. **Panel-local layout** — spacing, chrome, scroll ownership, footer clearance, and card layout inside a drawer. Use container queries when layout depends on drawer width rather than viewport width.
5. **Virtualized layout** — one measured-width adapter and one pure column/row policy must feed both row chunking and rendered columns.
6. **Design tokens** — spacing roles, size bands, typography, radii, motion, safe areas, and control dimensions. Name tokens by semantic role, not by a component or raw pixel value.

Keep these authorities distinct. User preference is not rendered state. A breakpoint is not drawer geometry. A URL or route is not layout state. A CSS projection is not the authority for domain/product intent.

## Expected module shape

Propose the smallest deep interface that can hide the responsive system. The exact names are yours to justify, but the design should contain the equivalent of:

- a pure layout-policy module that derives semantic app-shell and drawer presentation from route intent, user preference, and viewport capabilities;
- one viewport-capability adapter, rather than `window.innerWidth` and `matchMedia` calls scattered through features;
- a drawer-shell module that owns animation, focus/overlay semantics, scroll containment, safe areas, and measurement of rendered bounds;
- a panel-layout module that owns panel inset, chrome slots, scroll owner, footer slot, and container-query context;
- a grid module for ordinary panel collections and a measured adapter for virtualized collections;
- a geometry projection consumed by the globe so selected spots stay centered in the actually visible map region.

Do not create ports or adapters that have only one hypothetical implementation. Internal seams are allowed for testing, but do not expose them through the external interface.

## Source-of-truth rules

- CSS owns presentation and container-responsive styling.
- TypeScript owns product policy and behavior that changes what is mounted, interactive, persisted, or announced to assistive technology.
- The DOM owns rendered geometry. Measure it when another subsystem, such as the globe camera, needs the actual occluded pixels.
- If the same breakpoint must be consumed by CSS and TypeScript, create one authoritative contract with a generated or mechanically verified projection. Do not manually duplicate numbers.
- Feature and route modules may consume semantic layout interfaces; they may not own raw breakpoints, drawer-width formulas, or panel gutters.
- Every new dependency direction or token-ownership rule must be enforced in the same change by ESLint, `check:style-boundaries`, types, or an owning behavioral test.

## Responsive design requirements

Define a behavior matrix before implementation. Use semantic capability bands internally, even if the product discussion calls them desktop, tablet, and mobile.

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
- User-visible layouts and interactions: browser/component visual checks at a deliberate viewport-and-drawer-state matrix.
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

The desktop-parity portion of the original Gate 2 was delivered by F00–F12. After the remaining Phase F tasks, implement the compact/mobile experience first through the approved interfaces. Remove superseded viewport math and duplicated authorities as each slice migrates; do not layer a new system on top of the old one indefinitely. Run the complete project gate set after every implementation slice.

Demonstrate a coherent compact experience across the important drawer intents and provide code evidence for each behavior. Then stop and request explicit approval before implementing constrained presentation.

### Gate 3 — tablet, then desktop closeout

Implement tablet as a coherent product experience through the approved interfaces, verify it, and obtain approval before the Phase D desktop completion and final enforcement sweep. Do not treat any band as another band with different numbers.

## Completion gates

All of these must pass before any implementation slice is complete:

1. `npx tsc --noEmit`
2. `npx tsc -p tsconfig.server.json --noEmit`
3. `npm run lint`
4. `npm run check:style-boundaries`
5. `npx vitest run --project client --project server`

Also run the approved visual/responsive verification matrix. Report pre-existing failures immediately and do not build on a red base without explicit direction.

## Explicit non-goals for the foundation slice

- No arbitrary 12/6/4 grid imposed across every surface.
- No speculative theme editor or user-configurable spacing system.
- No new framework or styling-library migration.
- No broad visual redesign unrelated to responsiveness.
- No constrained (tablet) presentation before the compact/mobile foundation is approved, and no Phase D desktop closeout before tablet is approved.
- No preserving duplicated layout state merely because migration is disruptive.

The goal is a durable seam: future tablet/mobile work should mostly add policy and presentation adapters behind a stable interface, not force edits across routes, features, galleries, and globe logic.

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

- [ ] **F12g — Make date navigation container-aware**
  - Depends on: F12f.
  - Scope: Show the date sidebar only when measured gallery width supports it. Provide sticky date headings and a date-jump control below that capability — this below-capability path is the compact default, not an edge case, under mobile-first sequencing.
  - Invariant and verifier: Date navigation remains reachable and never steals unusable gallery width; gallery integration and browser checks own verification. All five completion gates must pass.

- [ ] **F12h — Refactor: automate the reference matrix as a Playwright visual-regression gate**
  - Depends on: F12b. May land anywhere before M07; landing before M00 gives Phase M slices free visual-regression coverage.
  - Scope: Implement the approved spec in `.scratch/responsive-layout-foundation/issues/02-playwright-visual-regression-gate.md`: migrate the 14 state recipes to Playwright Test (`npm run test:visual`, separate from vitest and the five gates), assert with `toHaveScreenshot` (masked map canvas, reduced motion), pin capture data with a dedicated seeded database, commit baselines, and delete the superseded CDP harness in the same slice. Final baseline set requires in-session visual verification, so run this in a main session rather than dispatching to the headless coder.
  - Invariant and verifier: A change to any captured layout state cannot land unnoticed and costs no review effort when nothing changed; the Playwright snapshot suite owns verification, and a deliberate layout change must fail it while map-camera movement alone must not. All five completion gates must pass. Once landed, M07, T05, D00, and D03 consume `npm run test:visual` as the matrix execution vehicle.

- [ ] **F12i — Fix: modal layering owned by semantic layer roles**
  - Depends on: F11. Must land before M00, whose sheet/overlay work consumes the same layer roles.
  - Scope: Concurrently open modals currently stack by portal mount order, not by product meaning: the auth modal and the carousel lightbox both take Mantine's default modal z-index, and Mantine 8 appends each modal's portal root at component mount, so the app-root-mounted auth modal paints **under** the later-mounted lightbox (bug: liking media from the lightbox while logged out shows the sign-in dialog behind it). The `--wa-z-modal` token has zero consumers. Replace the orphaned token with role-named modal tiers — a content/workspace-modal tier (lightbox) and an interrupt tier above it (auth) — and make both modals consume their role via `zIndex`. Add static enforcement proportionate to the contract: modal-tier z-index must come from the role tokens (ESLint for the TSX `zIndex` prop and/or `check-style-boundaries`); micro-stacking inside a component's own stacking context (e.g. the lightbox chrome's local `z-index: 1..3`) stays legal and is D02's broader sweep. Decision recorded 2026-07-23: Mantine `Modal.Stack` was evaluated and rejected as the mechanism — it requires co-located ownership of both modals under one stack context (a global modal registry that would also own their open state) and assigns ordinal open-order z-indices, while the product rule is semantic (an interrupt always outranks content). `Modal.Stack` remains acceptable locally if a single feature ever owns a true multi-modal flow.
  - Invariant and verifier: An auth interrupt always renders above the surface that triggered it, focus is trapped in the interrupt, and Escape/overlay dismissal returns to the intact surface beneath; static rules own token consumption, and the scripted reference matrix (F12b/F12h) gains a lightbox-with-auth-interrupt state for visual verification. All five completion gates must pass.

- [ ] **F12j — Fix: preserve gated-action intent across the auth interrupt**
  - Depends on: F12i (the interrupt-modal contract it completes).
  - Scope: Auth-gated actions drop the user's intent on the floor: `toggleFavorite` (`src/entities/Media/model/useMediaFavorites.ts`) and `handleCheckout` (`src/entities/Commerce/model/useCartCheckout.ts`) open the auth modal and early-return, so after signing in the user is back in context but must find and re-trigger the action. Extend the auth-modal contract with an optional continuation (e.g. `open({ onAuthenticated })`) invoked once on successful sign-in; dismissal discards it. Migrate both existing gates. No generalized pending-intent store — two call sites do not justify one.
  - Invariant and verifier: Signing in from a gated action completes that action without a second interaction, and dismissing the interrupt leaves all state untouched; behavioral tests at both gate call sites own verification. All five completion gates must pass.

- [ ] **F12k — Refactor: make panel collection columns measured, and the reflow animatable**
  - Depends on: F12f (consumes the same column policy). Should land before M00 and M02, whose sheet presentations re-column the same grid on every snap.
  - Scope: `PanelCollectionGrid` selects columns purely from `@container panel` breakpoints (600px, 900px), plus a `[data-drawer-state]` override that jumps the tracks to the drawer's destination the instant it starts moving. Two coupled defects must be fixed together. **Ownership:** those container-query breakpoints duplicate the column decision F12f centralises in one measured-width policy, while `usePanelGalleryColumns` mirrors panel width from the viewport as a third source; collapse all three onto the F12f policy fed by a measured container width, and drive the `data-preview` reveal from the same count so it can never disagree with the tracks. **Animatability:** CSS cannot interpolate grid track *count*, so a reflow can only be animated by a FLIP — and a FLIP animates only a layout change occurring inside the React commit it brackets. A container-query re-column driven by an animating width is therefore unanimatable by construction: the browser reflows and paints before React is notified (ResizeObserver), so the FLIP measures a zero delta and the tiles teleport. The column count must be React state that sets the tracks, making each step a commit the animation can bracket. Retire the `data-drawer-state` override in the same slice: jumping the tracks at the *start* of the drawer's width animation measures the reflow against a box that no longer exists a frame later, which is what makes collapsing snap hardest. Note the constraint on the drawer side too — the persistent panel must keep animating its real width (framer `animate`), not a transform-based `layout`, because `publishDrawerGeometry` observes the real border-box and feeds the globe's camera occlusion.
  - Invariant and verifier: One policy decides row chunking, rendered tracks, and preview reveal, and a drawer or sheet resize re-columns without tiles teleporting; column-policy unit tests plus a step-through-the-breakpoints test own the count, `check-style-boundaries` owns the ownership rule — updated in this slice to enforce that the component owns the breakpoints and the stylesheet does not re-column, replacing the current rule mandating the container queries — and the F12h visual gate owns the static end states. All five completion gates must pass.

- [ ] **F12l — Refactor: add height band to the policy axis and pin the presentation decision table**
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

### Phase M — compact/mobile experience (promoted by the 2026-07-22 pivot)

- [ ] **M00 — Add compact bottom-sheet mechanics**
  - Depends on: F12d, F12e.
  - Scope: Extend DrawerShell with collapsed and full compact presentations using transform-based motion, snap points, drag gestures with scroll-versus-drag arbitration, dynamic viewport units, safe areas, overscroll containment, and focus restoration. The gesture and snap-point semantics are new to the shell contract — renegotiating DrawerShell's internal interface here is expected and acceptable; the external policy-facing interface must not leak sheet geometry to routes or features.
  - Invariant and verifier: Sheet state, geometry, modality, and accessibility remain synchronized; shell integration tests own verification. All five completion gates must pass.

- [ ] **M01 — Implement compact navigation**
  - Depends on: M00.
  - Scope: Add the compact top navigation while reusing the existing account and cart authorities.
  - Invariant and verifier: Every primary destination remains reachable without duplicated navigation state; accessibility and browser navigation checks own verification. All five completion gates must pass.

- [ ] **M02 — Implement compact browse sheet**
  - Depends on: M00, M01, F12, F12e.
  - Scope: Add map-visible collapsed browse, full browse snap, in-sheet search/actions/filters, one-column sessions, swipe/expand behavior, and preference preservation.
  - Invariant and verifier: The map and drawer remain intentionally interactive for each snap; sheet, back, swipe, and map browser checks own verification. All five completion gates must pass.

- [ ] **M03 — Implement compact full-screen gallery**
  - Depends on: M00, M01, F12f, F12g.
  - Scope: Add full-screen gallery presentation, measured two/one-column density, sticky date headings, date-jump control, and lightbox coordination.
  - Invariant and verifier: Gallery, virtual scrolling, date navigation, and lightbox remain usable at compact widths and large text; integration and browser checks own verification. All five completion gates must pass.

- [ ] **M04 — Implement compact full-screen route workspaces**
  - Depends on: M00, M01, F09, F10.
  - Scope: Migrate session detail, cart, account, collections, and earnings to the compact full-screen shell lifecycle.
  - Invariant and verifier: Back, focus, scrolling, footer clearance, loading, empty, and error behavior remain consistent; focused integration and browser checks own verification. All five completion gates must pass.

- [ ] **M05 — Implement compact map-input and virtual-keyboard behavior**
  - Depends on: M00, M01, F10.
  - Scope: Present upload and Add Spot as map-aware bottom sheets. Use the visual viewport so focused inputs and primary footer actions remain visible while the software keyboard is open.
  - Invariant and verifier: Keyboard appearance cannot hide the active field or action and cannot corrupt measured map occlusion; visual-viewport integration and browser checks own verification. All five completion gates must pass.

- [ ] **M06 — Complete input, safe-area, and reduced-motion behavior**
  - Depends on: M02, M03, M04, M05.
  - Scope: Apply coarse-pointer dimensions, remove hover-only dependencies, verify fine-pointer behavior, consolidate safe-area use, and make drawer, chrome, gallery, validation, lightbox, and globe motion honor the central capability.
  - Invariant and verifier: Input modality changes affordances but not product policy; capability integration and browser emulation own verification. All five completion gates must pass.

- [ ] **M07 — Verify compact experience and request Gate 2 approval**
  - Depends on: M06, F12b.
  - Scope: Verify portrait, landscape, short height, keyboard open, coarse/fine pointer, reduced motion, safe areas, long content, loading, empty, error, overlay, dialog, lightbox, and map-occlusion states at compact widths. Verify live compact↔wide band crossings under the F12d continuity contract. Extend the F12b scripted matrix with the compact-band states.
  - Invariant and verifier: Compact presentation is a coherent product experience rather than shrunken desktop, and wide-band desktop parity has not regressed (F12b baseline); the scripted matrix and complete gate set own verification.
  - Stop: Present evidence and wait for explicit Gate 2 approval. Do not implement constrained presentation.

### Phase T — constrained/tablet experience

- [ ] **T00 — Enable constrained policy and navigation**
  - Depends on: Gate 2 approval (compact/mobile).
  - Scope: Activate constrained-band policy and replace the desktop left strip with the approved compact navigation presentation.
  - Invariant and verifier: Navigation changes through shell policy without feature conditionals; policy tests plus keyboard, active-state, coarse-pointer, and fine-pointer browser checks own verification.

- [ ] **T01 — Implement constrained browse presentation**
  - Depends on: T00.
  - Scope: Add the nonmodal side overlay, usable width limits, interactive map, in-drawer search/upload/filters, and one/two-column session density.
  - Invariant and verifier: Browse remains usable without hiding the map or leaking controls outside the viewport; focused browser interaction and containment checks own verification.

- [ ] **T02 — Implement constrained gallery workspace**
  - Depends on: T00, F12f, F12g.
  - Scope: Add the approved gallery overlay, measured 2–4-column policy, preserved gallery preference, and conditional date navigation.
  - Invariant and verifier: Gallery layout responds only to its measured container and preserves virtual scroll anchoring; gallery integration and browser checks own verification.

- [ ] **T03 — Implement constrained route-workspace modality**
  - Depends on: T00, F09, F10.
  - Scope: Present session detail, cart, account, collections, and earnings as modal/inert side workspaces with route-owned back behavior, focus trap, Escape handling, and focus restoration.
  - Invariant and verifier: Background interaction and accessibility semantics match the rendered modality; focus/back integration tests own verification.

- [ ] **T04 — Implement constrained map-input workflows**
  - Depends on: T00, F09, F10.
  - Scope: Present upload and Add Spot through the approved nonmodal constrained layout while keeping the map interactive and drafts non-destructive on back.
  - Invariant and verifier: Map selection, draft lifecycle, footer reachability, and coarse-pointer controls remain correct; focused integration and browser checks own verification.

- [ ] **T05 — Verify constrained experience and request Gate 3 approval**
  - Depends on: T01, T02, T03, T04, F12d.
  - Scope: Verify portrait, landscape, short-height, coarse/fine pointer, keyboard navigation, reduced motion, long content, loading, empty, error, overlay, dialog, and map-occlusion states. Verify live band crossings with real rotation, window resize, and split view against the F12d continuity contract: route, drafts, focus, scroll intent, and preferences must survive the compact↔constrained and constrained↔wide presentation swaps in both directions. Extend the F12b scripted matrix with the constrained-band states.
  - Invariant and verifier: Constrained presentation is a coherent product experience rather than scaled desktop or stretched mobile; the scripted matrix and complete gate set own verification.
  - Stop: Present evidence and wait for explicit Gate 3 approval. Do not begin the Phase D desktop closeout.

### Phase D — wide/desktop completion and closeout

- [ ] **D00 — Correct desktop toolbar containment**
  - Depends on: Gate 3 approval, F12b.
  - Scope: Fix the existing expanded-toolbar overflow while preserving the intended search, upload, and filter relationship. Remove CSS-property runtime assertions that currently pass despite visible clipping.
  - Invariant and verifier: Toolbar controls remain inside the drawer at 1280, 1440, and 1920; the scripted reference matrix (F12b) owns behavior and static rules own token usage. All five completion gates must pass.

- [ ] **D01 — Remove all superseded layout authorities**
  - Depends on: D00, F07, F08, F10, F12c, F12f, F12g, and every Phase M and Phase T task.
  - Scope: Delete fixed panel-width exports, rendered-expanded snapshots, mirrored gallery padding/sidebar allowances, feature-facing expanded props, hardcoded footer clearance, floating-control viewport math, obsolete split policy code, and any migration adapters introduced during the mobile-first pivot.
  - Invariant and verifier: No migrated consumer can access raw drawer geometry or viewport breakpoints; import scans, TypeScript, ESLint, and style-boundary rules own verification. All five completion gates must pass.

- [ ] **D02 — Final enforcement and legacy scan**
  - Depends on: D01.
  - Scope: Expand static rules so routes and features cannot reintroduce raw breakpoints, drawer widths, map offsets, panel gutters, footer formulas, arbitrary z-index values, or forbidden dependency directions. Remove all remaining migration adapters.
  - Invariant and verifier: The architecture is machine-enforced and contains no parallel responsive authority; static rule tests, import scans, TypeScript, and ESLint own verification. All five completion gates must pass.

- [ ] **D03 — Final responsive verification and completion**
  - Depends on: D02.
  - Scope: Run the full compact/constrained/wide matrix across portrait, landscape, short height, keyboard open, coarse/fine pointer, hover, reduced motion, safe areas, loading, empty, error, dialogs, lightboxes, full-page routes, every drawer intent, selected-spot camera centering, and live band transitions in both directions (F12d contract) including rotation and split view. Re-verify the wide band against the F12b desktop-parity baseline: transitions, preference restoration, scroll ownership, sticky/fixed controls, focus restoration, dialogs, reduced motion, map interaction, and measured camera occlusion. The F12b scripted matrix, extended through M07 and T05, is the execution vehicle.
  - Invariant and verifier: Every approved behavior is present in every band, every source-of-truth rule is enforced, and all five completion gates are green.

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
