# Focused sheet inputs don't position themselves above the keyboard — relies entirely on Safari's own scroll, which is inconsistent

Status: needs-triage

## Symptom

Reported by the user on 2026-08-09, with two screenshots from a real iPhone,
in the same session:

1. **Browse sheet, search field, peek snap.** Tapping the search field while
   the sheet is at its shortest (peek) snap opens the keyboard and leaves a
   large blank gap between the search row and the `Map | Feed | Gallery`
   switcher, which ends up stranded just above the keyboard instead of
   sitting at the true bottom of the screen.
2. **Upload sheet, price field, half snap.** Tapping the "Set your price"
   field at half snap shifts the sheet's content up and clips it under the
   top edge (partly behind the status bar), the opposite failure mode from
   (1).

Both are the same underlying defect surfacing two different ways depending
on snap height and scroll state at the moment the keyboard opens — not two
separate bugs, and not specific to peek (an earlier, narrower theory —
"promote the sheet to a taller snap on focus" — was raised and retracted
once (2) showed the same class of failure from half).

## Root cause

There is no active, app-driven positioning of a focused input relative to
the keyboard anywhere in the codebase. The only keyboard-aware mechanism
that exists is `deriveKeyboardInsetPx`
(`src/shared/ui/DrawerShell/keyboardInset.ts`), which `DrawerShell.tsx`
publishes as the `--wa-keyboard-inset-bottom` CSS custom property, consumed
purely as bottom padding:
`src/shared/ui/DrawerShell/DrawerShell.module.css:10` —
`padding-block: var(--wa-safe-area-top) calc(var(--wa-safe-area-bottom) +
var(--wa-keyboard-inset-bottom, 0px));`. That only reserves room so content
*can* scroll clear of the keyboard — it never scrolls or positions anything.

The actual "bring the focused input into view" behavior is 100% delegated to
Safari's own native scroll-into-view heuristic. That heuristic is
well-documented to behave inconsistently against this app's layout shape —
`position: fixed` sheets sized with `100dvh`
(`src/shared/ui/DrawerShell/DrawerShell.module.css:6`), rather than the
document's own natural scroll — which is consistent with the two opposite
failure directions seen here (undershoot vs. overshoot).

## Decision (user + architect, 2026-08-09)

Stop relying on Safari's native scroll entirely. On focusing any text input
inside a sheet, actively position that input a small, fixed decorative gap
above the keyboard — using the same `visualViewport`-derived keyboard height
the app already computes for the padding trick above, rather than leaving it
to the browser's own guess.

This belongs in the shared sheet mechanism (`DrawerShell` and/or its
scroll-owner hooks, `useRegisterSheetScrollOwner` /
`useSheetContentScrollable`), not per-feature, so every sheet gets it from
one change: the browse search field, Upload's price/name/location fields,
Add Spot's form, and the Collections spot picker all sit on the same
mechanism today.

## Evidence

Two user screenshots, both 2026-08-09, real iPhone, both described above.

## Ownership

No existing roadmap task owns this. Picked up directly in this session
immediately after filing — see `## Comments` for the resolution once landed.

## Comments

**2026-08-09 — implemented, not yet device-verified.** New module
`src/shared/ui/DrawerShell/keyboardAvoidingScroll.ts`: a pure function,
`deriveKeyboardAvoidingScrollDeltaPx`, computes how far to move a sheet's own
scroll owner so a focused input clears the visible region (the keyboard-aware
viewport, already tracked by `useViewportMetrics`) by a fixed 16px gap on
either edge; `applyKeyboardAvoidingScroll` applies that to a real scroll
owner for whichever element currently has focus, if it's a text-entry
element the owner contains. Wired into `DrawerShell.tsx`'s existing
`registerScrollOwner` callback (the same one that already tracks scroll
direction for the chrome-hide behavior): a `focusin` listener applies the
correction the instant an input is focused, and a `useEffect` keyed on the
same keyboard-geometry values re-applies it for whatever is currently
focused as the keyboard continues opening or closing, so the correction
tracks the settled height rather than only the height at the instant of
focus. This replaces reliance on Safari's own scroll-into-view entirely — it
doesn't try to prevent that native behavior, it corrects on top of whatever
it did, every time the geometry changes.

Deliberately out of scope: the floating `Map | Feed | Gallery` bar
(`BrowseSectionBar`) stayed untouched. It's a `position: fixed` element
outside any sheet's scroll owner, so this fix can't reach it directly — the
theory is that keeping the focused input's own position stable removes the
reason Safari would ever pan the page in the first place, which is what was
dragging that bar out of place as a side effect. If device testing still
shows it moving, that's a second, smaller follow-up (giving it its own
keyboard-aware position) rather than evidence this fix is wrong.

New tests: `keyboardAvoidingScroll.test.ts` (pure function + DOM-application
unit tests) and two new cases in `DrawerShell.test.tsx`'s
`DrawerShell keyboard-avoiding scroll` describe block, mounting a real
`DrawerShell` with a registered scroll owner and a real input, focusing it,
and simulating the keyboard opening via a stubbed `visualViewport` resize.
All five project gates green (124 files / 915 tests). Not yet confirmed on a
real device — needs the user's own retest of both reported cases (browse
search from peek, Upload's price field from half) before this can close.

**2026-08-09 — reverted.** Device retesting after the above surfaced two more
real findings, captured via Safari Web Inspector connected to the phone
(`window.innerHeight`/`visualViewport.height`/`window.scrollY` read live):

1. **A real, confirmed bug in the fix itself:** `getBoundingClientRect()`
   already reports an element's position on the *currently visible* screen —
   it does not need `visualViewport`'s own offset added on top. The original
   fix did add it, which double-counted an already-applied shift and could
   misjudge an on-screen input as hidden. Fixed and covered by a regression
   test (`visibleTopPx: 0` instead of the visual-viewport offset).
2. **The actual "big gap" was never a positioning bug.** Console evidence: the
   sheet's own scroll owner had `clientHeight: 110` against `scrollHeight:
   6357` — the visible content area had shrunk to a 110px sliver once the
   keyboard opened, because the search bar, filter pills, and the drawer
   handle above it don't give up any room. What read as "something
   misplaced" was really "almost no room left for anything." User's own
   call: while a sheet's text field has focus, show only the search box and
   nothing else, hiding filters/content/the `Map | Feed | Gallery` bar, and
   promote a half-snap sheet to full first so the transition doesn't jump.

A second implementation (`DrawerShell` reporting focus in/out, `SidePanel`
hiding its content and `bottomBar` while typing, `_panel.tsx` hiding the
filter pills/Upload button and promoting half→full) was built and covered
with tests at all three layers, all five gates green. Device retest reported
**zero visible change at all** — not "still wrong," but identical to before
the fix, which points at the dev environment serving stale code (HMR not
picking up the changes, or the client/server processes needing a restart)
rather than the logic itself, but this was not confirmed before the user
asked to stop and revert.

Reverted in full: `DrawerShell.tsx`, `SidePanel.tsx`,
`SidePanel.sheet.test.tsx`, `SidePanel.module.css`, `_panel.tsx`,
`-_panel.test.tsx` back to their pre-session state; the new
`keyboardAvoidingScroll.ts` (+ its test file) deleted; the two new
describe blocks in `DrawerShell.test.tsx` removed, keeping the unrelated
reduced-motion tests from the same session intact. All five gates
reconfirmed green after the revert.

**For whoever picks this up next:** before writing any more code, confirm
the dev server is actually serving fresh code (HMR log, or a hard
reload/process restart) — that was never ruled out as the reason the second
fix appeared to do nothing. The two confirmed findings above (the
`getBoundingClientRect` double-counting, and the 110px content-height
finding) are real and still true; they just never got a clean on-device
confirmation before the session ended.
