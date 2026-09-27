# Design system (code-facing summary)

Authority: **DESIGN_SYSTEM.md** (tokens/type/logo/components). Expanded pack for
design work — audit, component catalog, patterns, rendered `preview.html` — in
**`design-handout/`** (self-contained, movable). This page is just the routing.

- All styles live in `client/src/styles.css` — design tokens as `--` CSS
  variables at the top. **Never hardcode colors/fonts/radii**; reference
  tokens. New component ⇒ new class block in styles.css, no inline styles.
- Theme is **light and warm** (`--bg #F7F6F3`, `--primary #E4572E` orange,
  `--secondary #2E86AB` blue). `--hero-*` is a dark contrast band, not a dark
  theme. There is no theme switch.
- Logo: use `Logo.jsx` — never rebuild the mark ad hoc.
- Shared primitives in `bits.jsx`: `ToastCtx`/`ToastHost` + `useToast`,
  `Spinner`, `Confetti`, `Modal`, `XpBar`, `ProgressRing`.
- Math rendering: `MathText.jsx` (+ `normalizeMath`) — use it anywhere LLM
  text may contain LaTeX (lessons, blurbs, node panel).
- Node/branch colors come from `graphLayout.js` `branchColor` (see
  visualizations.md), not from styles.css.
- **Canvas colours:** canvas can't read CSS variables. Read them off the DOM
  once — `readTokens()` in `ReferenceGraph.jsx` is the pattern. The hardcoded
  `COLORS` table in `SkillTreeCanvas.jsx` is legacy; don't copy it.

## Tokens added 2026-07-27
`--sp-1…--sp-10` (spacing), `--fs-label…--fs-display` (type), `--dur-fast` /
`--dur` / `--ease` (motion), `--r-pill`, `--ring-w` / `--ring-offset` (focus).
**New code uses these — no new literals.** Also added: a global `:focus-visible`
rule and a `prefers-reduced-motion` block, both of which must stay **last in
`styles.css`** (several field styles set `outline: none`; at equal specificity
the later declaration wins), plus a canonical `.input` class.

## Canvas colours
`SkillTreeCanvas.jsx` and `ReferenceGraph.jsx` both call a local `readTokens()`
on mount. Tints with no token of their own (open/done node fills, lit edges) are
**derived** from `--primary`/`--green` via a `tint()` helper — never hardcoded.
Rotating avatar accents live in `graphLayout.js` as `ACCENT_HUES` (one
definition, was copy-pasted into three components).

## Known gaps (see design-handout/AUDIT.md for the full list)
The ~25 spacing and ~26 type **literals** are not yet migrated onto the new
tokens — that is a sweeping edit, ask first. Four screens still roll their own
field style instead of `.input`. `Dashboard.jsx`, `BrainMap`, `Galaxy3D` and the
Knowledge Graph pair still hold colour literals. Graph state is conveyed by
colour alone (the 2D skill map also uses icons — follow that). ARIA coverage is
thin outside `Modal`.
