# Scripted responsive-layout reference matrix (F12b)

This directory holds the capture artifacts produced by the scripted browser
harness in `scripts/reference-matrix/`. It supersedes hand-derived inspection:
any session can re-run the matrix against the local dev server and compare the
result to the stored references. Roadmap tasks M07, T05, D00, and D03 must
consume this harness rather than one-off inspection.

The manual F00 captures in `../responsive-layout-reference/` remain the
historical desktop reference; the artifacts here are the scripted, going-forward
baseline.

## Running the harness

```bash
npm run capture:reference-matrix              # wide band (default)
node scripts/reference-matrix/capture.mjs --band compact,constrained,wide
node scripts/reference-matrix/capture.mjs --state browse-compact --band wide
```

Requirements:

- `npm run dev` serving http://localhost:3000 against the seeded dev database;
- `REFERENCE_EMAIL` / `REFERENCE_PASSWORD` in `.env` (dev-only credentials for
  the seeded capture account `surf@surf.com`; never committed);
- Google Chrome (override the binary with `CHROME_BIN` if needed).

## Matrix axes

The viewport axis is mobile-first (roadmap F12b). Wide-band artifacts are the
desktop-parity baseline captured when the harness landed; compact and
constrained slots are filled as their phases (M, T) land.

| Band | Viewports | Status |
|---|---|---|
| compact | 390×844, 844×390, 430×932, 932×430 | pending Phase M |
| constrained | 768×1024, 1024×768 | pending Phase T |
| wide | 1280×800, 1440×900, 1920×1080 | captured (desktop-parity baseline) |

The state axis is defined in `scripts/reference-matrix/matrix.mjs`; each
state's `run` function is its executable reproduction recipe (the scripted
equivalent of the F00 README "Reproduction" column). The 14 states cover
browse compact/expanded, gallery compact/expanded, session detail, cart,
account, collections, earnings, upload/map-input, loading, empty, error, and
dialog.

Artifacts are stored as `<band>/<width>x<height>/<state>.jpg`, captured at
deviceScaleFactor 1 to match the F00 baseline density.

## Determinism notes

- Each run uses a fresh headless-Chrome profile, so the cart is empty and the
  in-memory expansion preferences start at their defaults; every state begins
  with a hard navigation.
- The `loading` state throttles the network and captures the first frame after
  the app shell mounts; it is intentionally a best-effort capture of the
  loading lifecycle, not a pixel-stable frame.
- The map camera animates (globe → fitted region) after the feed loads, so the
  visible map region may differ between runs depending on flight timing. The
  matrix owns drawer/panel layout invariants, not map-camera framing.
- Seeded records the reproductions depend on (Canggu session, non-draft upload
  workspace) are listed in `matrix.mjs` under `SEEDED`.

## Known wide-band defects excluded from parity

The F00 defect record carries over: the expanded browse/gallery toolbars
overflow at 1280×800 and clip at 1440×900. D00 owns the fix; these captures
document the defect, they do not approve it.
