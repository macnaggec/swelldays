# Compact-panel date navigation: jump control duplicated per date group, pinned date heading occluded by the search row

Status: needs-triage

## Symptom

Reported by the user on 2026-07-25, with a screenshot. Surface: **wide band,
drawer in its compact (non-expanded) state, gallery intent** — a narrow panel
in a wide viewport, not a phone. This is the below-capability date-navigation
path F12g introduced (the date rail is correctly withheld here: the panel is
genuinely too narrow to fund it, so the fallback firing is right — only its
shape is wrong).

Two defects, one root cause:

- **The jump control is stamped once per date group.** Every date separator
  ("July 15, 2026 ⌄", "July 13, 2026 ⌄", "July 12, 2026 ⌄" …) carries its own
  identical dropdown. N date groups produce N copies of what is one global
  navigation control. Beyond the visual noise, the affordance is ambiguous: a
  chevron beside a specific date reads equally as "collapse this day" and
  "jump to another day", and the user has to guess.
- **The pinned date heading is covered by the search/filter row.** Scrolled
  into the middle of the list, the heading that should tell you which day you
  are looking at slides underneath the pinned search bar. Orientation is lost
  at exactly the moment it is needed.

## Root cause

**One:** two distinct jobs are fused into a single control that is then
replicated per group.

- *Orientation* — "which day am I looking at?" — needs **one** label, always
  visible, updating as you scroll.
- *Navigation* — "take me to a date" — needs **one** control, reachable from
  anywhere.

Fusing them forces the orientation element to live in scrolled content (so it
scrolls away, failing job one) and forces the navigation element to be
repeated per group (so it is noise rather than a landmark, failing job two).

**Two (the occlusion):** two independent elements pin themselves to the same
top edge of the same scrolling area, with nothing owning the order or the
height of the pinned stack. This is the same family as **F12m** ("the pinned
search/filter chrome has no single owner and no single scroll owner") and
**F12n** (the second, private scroll owner).

Note the sequencing consequence: **F12m alone will not fix this.** Its scope
is bounded to the search/filter row. After F12m lands, the date heading is
still sticky content inside the scroller pinning at offset 0, so it will
continue to slide under the search row. Fixing it means the pinned date label
joins the same chrome slot F12m establishes — a sibling task depending on
F12m, not scope creep inside it.

A tuned sticky offset is **not** an acceptable fix: the search row itself
hides and reveals on scroll, so the height the date heading would need to
dodge is not constant.

## Decision (user + architect, 2026-07-25)

**One sticky date label, living in the panel chrome directly beneath the
search row, that both reports and navigates.** It shows the date of whatever
currently sits at the top of the grid, and tapping it opens the date picker.
The element that tells you where you are *is* the element that moves you.

The in-grid date separators become **plain, non-interactive text** — they
still chunk the content visually, but carry no controls.

This resolves both defects structurally rather than by tuning:

- Nothing can cover the pinned date, because it is a **sibling of the search
  row within the chrome stack**, not content competing for the same edge. The
  layout places it below by construction.
- The jump control exists exactly once, so there is nothing to duplicate.

Rejected alternative: reusing the expanded-mode date rail here. It occupies
real layout width, and this panel has none to give — which is precisely the
rule F12g encodes (date navigation "never steals unusable gallery width").

## Evidence

- User screenshot, 2026-07-25: three consecutive date separators each
  carrying an identical chevron dropdown, with the search row pinned above
  the grid.
- Fallback path introduced by roadmap task **F12g** ("Provide sticky date
  headings and a date-jump control below that capability — this
  below-capability path is the compact default, not an edge case").

Not yet verified against the implementation: this issue was raised and
specified from the screenshot and the roadmap record. Whoever picks it up
should confirm the current mount points before editing — in particular
whether the per-separator chevron is a jump control or a collapse toggle,
since that changes what is being removed.

## Ownership

No existing task owns this. It needs a new Phase F task, **depending on
F12m** (which establishes the single pinned-chrome slot this label must join).
It should land before **M00**, since the compact sheet and full-screen
presentations inherit whatever chrome-ownership model exists at that point.

Related but distinct: **M03** owns the *compact full-screen gallery's* date
navigation, where the same sticky label is joined by a trailing-edge scrubber
for coarse traversal. M03's scope was amended on 2026-07-25 to record that
shape. This issue is the wide-band compact-panel case only.

## Comments

**2026-07-25 — open product questions carried into M03.** Two calls were
identified during the design discussion and deliberately left unresolved
rather than silently defaulted:

1. **Traverse vs browse** — a scrubber alone, or a labelled month chip strip.
   A strip's labels are readable at rest, so users learn the shape of the
   archive without interacting; a scrubber reveals a date only once dragging
   has begun. The architect's guess was *traverse* (users arrive with a date
   in mind), but that is a guess about real usage, not something the
   interaction design settles.
2. **Picker granularity** — days or months. Sparse capture days make a day
   list long and tedious; dense days make month-level jumping too coarse.
   The data answers this.

Both are recorded in M03's scope so they cannot be defaulted by whoever
implements it.
