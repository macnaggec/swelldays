## 0. Build Goal (North Star)

**Pre-launch, no users.** Build the most architecturally correct system *proportionate to this app's scale* — bug-resistant and cheap to scale later. With no users, optimize for **low future refactoring**, not low present disruption.

**Decision filter (reversibility):**
- Cheap now / expensive to retrofit → **do it correctly now**: boundaries, ownership, source-of-truth, dependency direction, typed domain values, cross-domain contracts.
- Cheap to add later behind a seam → **build the seam now, defer the mechanism**: geo/viewport tiling, distributed rate-limiting, spatial indexes, caching.
- Proportionate, not maximal: don't build scale *mechanisms* early; don't get *boundaries* wrong. Still no gold-plating or speculative flexibility (see §2).

## 0.1 Approval Gates

Some workflows (review tasks, plans, brainstorming) contain explicit approval gates where you must stop, present your analysis, and wait for an explicit user signal ("proceed", "approved", "go ahead") before writing any code or changing any file.

**BLOCKING REQUIREMENT: When a skill or protocol contains an approval gate, you MUST stop at that gate. Do not rationalise past it. Do not treat your own explanation or clarifying question as implicit approval. Only an explicit user signal counts.**

## 0.2 Architecture Review and Recommendation Standard

**Do not confuse the cleanest architecture with the smallest change. State which one you are recommending.**

When reviewing code or proposing a refactor, evaluate these outcomes separately and in this order:

1. **Ideal architecture:** Ignore implementation effort, migration cost, disruption, sunk work, and the current diff. Describe the most coherent system proportionate to the actual product: one authoritative owner for each fact, explicit domain lifecycles, correct dependency direction, and no duplicated state that exists only to bridge a flawed boundary.
2. **Proportionate recommendation:** Choose what should be built for this app's real scale and pre-launch state. Adjust the ideal only to avoid speculative scale mechanisms or flexibility the product does not need. Do not adjust it merely to preserve existing code or reduce present work.
3. **Transitional fix:** If useful, describe the smallest safe intermediate step. Label it as transitional. Never call it the cleanest or most elegant option.

If the user asks for the "cleanest", "most elegant", "architecturally correct", or "honest" option, or says to ignore effort, answer with the **Ideal architecture**. Do not silently substitute the proportional or transitional option.

For every architectural recommendation:

- Trace the current behavior to the real-world record and lifecycle it represents before evaluating local code patterns.
- Identify the current and proposed sources of truth. Distinguish an authority from a cache, projection, URL locator, or persisted client copy.
- Ask whether the local problem is only a symptom of a missing domain record, wrong ownership boundary, or incomplete lifecycle. Prefer removing the reason synchronization exists over relocating synchronization code.
- Treat effect count, file count, abstraction count, and diff size as diagnostics, not goals. Do not move a side effect into a loader, store, singleton, callback bus, or framework hook and claim the side effect was eliminated.
- Use official framework guidance to judge whether a local mechanism is valid, but do not let a framework pattern decide domain ownership.
- State explicitly when the ideal architecture requires schema, contract, route, or ownership changes, even when a local patch is available.
- Explain why the ideal and proportional recommendations differ. If they do not differ, say so.

Default recommendation format for architecture reviews:

```text
Ideal architecture: <best end state with effort ignored>
Recommended for this app: <proportionate choice>
Transitional fix: <optional smallest safe step>
Why they differ: <only scale/product reasons, never effort alone>
```

This section governs analysis and recommendations; it does not authorize broader implementation. Actual changes must still follow approval gates, task scope, and the surgical-change rules below.

## 0.3 Testing Responsibility Standard

**Choose the verifier that owns the invariant. Do not create unit tests merely because code changed or a workflow says "test first."**

Before proposing or writing any test, classify what could regress:

| Invariant | Owning verification |
|---|---|
| User-visible behavior or domain policy | Focused unit, integration, or end-to-end test at the behavior-owning boundary |
| Runtime parsing of untrusted JSON, SDK responses, environment values, or request payloads | Schema/decoder test or one adapter contract test using representative raw input |
| Internal TypeScript field names, DTO shape, unions, generics, or assignability | `tsc` or a compile-time type test when ordinary compilation cannot express the assertion |
| Naming conventions, formatting, forbidden syntax, or import/dependency direction | ESLint, formatter, or an architectural/static rule |
| Database constraints, transactions, query filtering, or persisted mappings | Repository integration test against the persistence boundary |
| Build wiring, exports, module resolution, or dead imports | Build, typecheck, lint, or import scan |

### Unit-Test Prohibitions

- **MUST NOT** add runtime unit tests whose primary assertion is camelCase versus snake_case, an internal property name, an interface shape, a type alias, or another compile-time contract.
- **MUST NOT** mock one internal layer only to assert that it forwards a typed field to the next internal layer. TypeScript owns that contract unless independent runtime behavior occurs at the boundary.
- **MUST NOT** test that TypeScript, Zod, the ORM, or another library performs its documented basic behavior. Test only project-specific policy or composition around it.
- **MUST NOT** duplicate the same boundary assertion in adapter, service, and repository unit tests. Test translation once where raw external data becomes a domain value; let types enforce downstream propagation.
- **MUST NOT** use snapshot or object-shape assertions as substitutes for a behavioral invariant.

### Boundary Exception

External field names may be tested only at the runtime trust boundary where they are observable input or output. The test must prove semantic translation or rejection—for example, that a provider's raw video response becomes the app's video resource—not that the team prefers one naming style. Once translated, internal propagation is verified by types and static rules.

### TDD Interpretation

For behavior changes and bug fixes, a failing behavioral test remains the preferred first proof. For type-only, naming, dependency, or build-wiring tasks, the RED check is the relevant failing compiler, lint, architecture, or build command. **Do not invent a runtime unit test to satisfy TDD ceremony.**

In every task Direction Brief, name the invariant and its owning verification. If a proposed unit test is rejected because a static check owns the invariant, record the static command that replaces it.

## 0.4 Gate Discipline (Stop-the-Line)

**The architecture is machine-enforced. These five gates MUST be green before any implementation task is declared done:**

1. `npx tsc --noEmit`
2. `npx tsc -p tsconfig.server.json --noEmit`
3. `npm run lint`
4. `npm run check:style-boundaries`
5. `npx vitest run --project client --project server`

**BLOCKING RULES — no rationalising past these:**

- **Red gate = stop-the-line.** If any gate is red after your change, fixing it takes priority over everything else, including the task you were asked to do. Never declare a task complete, commit, or move to the next task while a gate is red. If a gate was already red before you started, surface it to the user immediately and do not build new work on the red base without their explicit direction.
- **Run the gates after every implementation task.** All five commands, not just tests near the touched code. Until CI exists (roadmap Q2), the agent IS the CI.
- **New architectural rule ⇒ same-commit enforcement.** Any new convention — a dependency direction, layer boundary, state-ownership rule, contract shape, forbidden import, or domain-value type — MUST land in the same commit as its machine enforcement: an `eslint-plugin-boundaries` / `no-restricted-imports` rule, a `check-style-boundaries` rule, a type-level constraint, or a test that fails on violation. If it genuinely cannot be machine-enforced, record it in `docs/review/04-target-architecture.md` with the reason. A convention that exists only in prose, chat, or memory does not exist.
- **Never weaken a gate to make it pass.** No `eslint-disable`, no `@ts-expect-error` or `as`-cast to silence a type error, no `test.skip`, no loosening a lint rule, no deleting an assertion — without explicit user approval. Every approved exception carries a comment naming the debt and the roadmap item that pays it.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Explaining Code

**Connect code to what the user sees or does. Never explain in abstract terms alone.**

For every technical entity mentioned, immediately say what it corresponds to on screen, what user action triggers it, or what real-world record it represents. E.g. not "useUploadQueue merges two data sources" but "useUploadQueue builds the list of cards the photographer sees in the gallery."

**Attach code evidence to behavioral claims.**
- When explaining what the app does, why a task matters, or what problem a change fixes, include clickable references to the real project files/lines that prove the claim.
- Link the exact code that establishes a user action, state transition, data visibility, permission check, persistence write, query result, or cross-domain contract. Do not rely on prose alone for those claims.
- **MUST NOT use inline code snippets to show existing code.** Use a clickable file link with a line number instead. The only exceptions are: (1) the user explicitly asks to see the code inline, or (2) the snippet is 1–2 lines that would be impossible to understand from a link alone (e.g. a type alias). Paste-in examples you are about to write (new code) are not existing code and may be shown inline.
- If a claim spans multiple steps, link each important step in the path: entry point, policy/validation point, persistence/query point, and user-visible read path when relevant.
- If the exact code path has not been read in this session, read it before making the claim or explicitly say the claim is unverified.

**Every statement must have clear logical bounds:**
- Don't mention an entity before establishing what it is and what it holds.
- Every "X happens" must be followed by "because Y" or "so that Z" — the reason it matters *at this exact moment* in the flow, not in general.
- Don't jump to a consequence (e.g. "the query is invalidated") without first establishing the state it was in before and why the change is significant now.

**Read the code before explaining it. Never infer or fill in from assumptions.**
- Trace the actual data flow by reading the relevant files. Do not describe what "should" happen or what "typically" happens — only what the code does.
- If a detail (e.g. what a function does internally, what fields are set, what a hook returns) is not already in context from a prior read in this session, read it before stating it.
- If you catch yourself writing a detail you haven't verified in the code, stop and read first.

**While tracing, flag design smells immediately.**
- If the code under examination has a bug, memory leak, type inconsistency, or architectural smell, name it inline in the explanation at the point where it appears — don't defer it or omit it.
- State what the smell is, why it's a problem, and whether it already has a roadmap entry or needs one.

**Self-check before outputting any explanation prose:**
- For each sentence: can the reader picture *what is on screen* or *what record exists* when this happens?
- For each entity introduced: has it been grounded in a real-world thing (a card, a DB row, a button) before being referenced?
- For each cause-effect pair: is the "why it matters here" explicit, not implied?
- For each implementation detail claimed: have I read the actual code that confirms it this session?

If any sentence fails these checks, rewrite it before outputting.

**When delivering a multi-part explanation, output one piece at a time and wait for explicit confirmation before continuing.** Do not output the next piece on the same turn as asking "ready for the next piece?"

## 6. UI Verification & Change Control

**No visual browser verification.** Never verify UI by screenshots or pixel-driven browser navigation — it burns tokens and is unreliable. Allowed checks: console/server logs, DOM reads, network requests, computed styles via JS. When something can only be confirmed visually, stop and give the user a short numbered checklist: which page to open, what action to perform, what they should see.

**Announce UI changes before implementing.** Before changing anything the user can see in the browser, state in 1–3 plain sentences what will visually change (which element, how it will look or behave differently) and wait for an explicit OK. Internal changes with zero visual effect need no gate — but say "no visual change" explicitly.

**Explanation register.** The user does not read the code and does not recognize variable, hook, or component names. Explanations start from the browser UI ("the photo grid", "the date sidebar") and describe the data flow in plain human terms, highly abstracted and brief. Code identifiers appear only when the user asks to go deeper; clickable file links (§5) remain welcome as evidence. This sharpens §5: on-screen grounding is not an addition to identifier-first phrasing — it replaces it.
