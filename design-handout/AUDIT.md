# Design System Audit

Measured against the shipping code on 2026-07-27: `client/src/styles.css`
(778 class blocks) and 32 components in `client/src/components/`.

> **Update — same day, priorities 1, 2 and 5 actioned.** Spacing, type, motion
> and focus tokens now ship; a global `:focus-visible` rule and a
> `prefers-reduced-motion` block were added; a shared `.input` class was
> introduced; the duplicate `.btn-small` was retired. **Score 54 → 71.**
> Findings below are kept as originally measured, each annotated with what
> changed. Still open: migrating the existing spacing/type literals, the canvas
> colour boundary, and the branch palette.

### Summary
**Components reviewed:** 32 · **Stylesheet rules:** 778 · **Issues found:** 9
· **Score: 54/100** → **71/100** after the fixes noted below

The visual language itself is coherent and distinctive — a warm light theme with
a confident type pairing, and it reads as designed rather than defaulted. What
is missing is the *system*: colour is tokenised, but spacing, type, motion and
focus are not, so every new component re-invents them. The score reflects the
gap between the look (good) and the infrastructure behind it (thin).

---

## Finding 1 — The documented system is not the shipping system 🔴

`DESIGN_SYSTEM.md` at the repo root is named by `CLAUDE.md` as the design
authority. It describes **a different product**: a dark "knowledge-galaxy" theme
on deep navy, with a violet→cyan spectrum.

| | `DESIGN_SYSTEM.md` says | Code actually ships |
|---|---|---|
| Base background | `--bg: #080B14` (near-black navy) | `--bg: #F7F6F3` (warm off-white) |
| Primary | `--primary: #7C5CFF` (violet) | `--primary: #E4572E` (burnt orange) |
| Secondary | `--secondary: #22D3EE` (cyan) | `--secondary: #2E86AB` (teal blue) |
| Text | `--text: #E8ECF8` (near-white) | `--text: #1B1917` (near-black) |
| Font tokens | `--font-display` / `--font-ui` / `--font-mono` | `--fd` / `--fu` / `--fm` |
| Spacing | `--sp-*` scale, 8 steps | **do not exist** |
| Radius | `--r-sm` 8 / `--r-md` 12 / `--r-lg` 16 / `--r-pill` | 9 / 11 / 16, **no `--r-pill`** |
| State colours | `--mastered` `--learning` `--ready` `--locked` | **do not exist** (`--green` `--amber` `--danger` do) |

Every token name in that document is either wrong or absent. A designer briefed
from it would produce work that cannot be implemented.

Traces of the old violet theme survive in the code — `#7C5CFF` still appears in
3 places in JSX — which suggests a theme change happened and the documentation
was never updated.

> **Correction (2026-07-27):** those three are not dead leftovers. They were the
> fifth entry of an identical 5-hue avatar rotation copy-pasted into
> `Dashboard`, `ProjectsView` and `Sidebar` (project glyphs, project cards,
> earned badges); the other four entries are exact tokens. The array is now
> defined once as `ACCENT_HUES` in `graphLayout.js`. The violet is kept as-is —
> recolouring it changes the avatar of every existing project, which is a design
> call rather than a cleanup.

**Action:** treat [TOKENS.md](TOKENS.md) as authoritative. `DESIGN_SYSTEM.md`
has been corrected in the same change that produced this pack.

---

## Token Coverage

| Category | Tokens defined | Hardcoded values found |
|---|---|---|
| Colour | 19 | **125** hex literals in JSX, **53** in CSS outside `:root`, **140** raw `rgba()` |
| Typography | 3 families, **0 sizes** | **26 distinct** font sizes, all literal |
| Spacing | **0** | **25 distinct** padding/margin/gap values |
| Radius | 3 (+2 needed) | 113 literal vs 48 tokenised — **70% untokenised** |
| Elevation | 2 | mostly used; ad-hoc glows inline |
| Motion | **0** | 5 transitions total, 3 durations, no easing token |

### Finding 2 — No spacing scale 🔴 → 🟠 tokens added, migration pending
25 distinct literal values across padding, margin and gap: 3, 4, 5, 6, 7, 8, 9,
10, 12, 14, 16, 20… Adjacent values differing by 1px are doing the same job in
different components. This is the single biggest source of "slightly off" and
the cheapest to fix.

**Now:** `--sp-1` … `--sp-10` ship. New code must use them. The existing
literals are untouched — migrating 778 blocks is a large refactor, and this
repo's `CLAUDE.md` says to ask before those.

### Finding 3 — No type scale 🔴 → 🟠 tokens added, migration pending
26 distinct font sizes, including 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5 — eight
steps inside a 3.5px range. The most-used sizes are 13px (41×), 12.5px (32×),
11px (29×) and 11.5px (26×), which suggests the real scale is roughly
11 / 12.5 / 13 / 15 / 17 / 19–20 and the rest is drift.

### Finding 4 — Colour discipline breaks at the canvas boundary 🟠
CSS is largely well-tokenised; **JSX is not**. The 125 hex literals concentrate
in canvas components, which genuinely cannot use CSS variables — but there are
two competing solutions in the codebase:

| Approach | Where | Verdict |
|---|---|---|
| ~~Hardcoded `COLORS` table~~ | ~~`SkillTreeCanvas.jsx`~~ | **Converted 2026-07-27** — now `readTokens()` |
| `readTokens()` via `getComputedStyle` | `ReferenceGraph.jsx` | **Adopt this** |

The 16 `#fff` in CSS are mostly legitimate (text on primary fills) but should
still resolve to a token.

---

## Component Completeness

| Component | States | Variants | Docs | Score |
|---|---|---|---|---|
| Button (`.btn`) | ✅ hover/disabled/danger | ✅ primary/ghost/tint/square/icon | ⚠️ | 7/10 |
| Card (`.card`) | ⚠️ hover only | ⚠️ plain + flash | ⚠️ | 6/10 |
| Modal (`Modal`) | ✅ esc/backdrop | ✅ default/wide | ✅ | 8/10 |
| Chip / tag | ❌ none | ⚠️ colour-by-context | ❌ | 4/10 |
| Input | ❌ **no focus ring** | ❌ one-off per screen | ❌ | 3/10 |
| Toast (`ToastHost`) | ✅ | ⚠️ single style | ⚠️ | 6/10 |
| ProgressRing / XpBar | ✅ | ✅ | ⚠️ | 7/10 |
| Graph canvases | ✅ hover/select/dim | ✅ 4 distinct maps | ⚠️ | 6/10 |

### Finding 5 — Inputs have no shared style or focus state 🔴 → 🟠 focus fixed
There is no `.input` class. Every text field is styled ad hoc under a
screen-specific name (`.pjv-rename`, `.tb-search input`, `.np-note-input`,
`.memory-edit`, `.refs-filter`). Several set `outline: none` and replace it only
with a border-colour change — and there are **zero `:focus-visible` rules in the
entire stylesheet**. Keyboard users cannot see where they are.

**Now:** a global `:focus-visible` rule ships at the end of `styles.css`, so
every focusable element has a visible ring regardless of its own `outline: none`.
A canonical `.input` class exists and `.refs-filter` uses it; the other four
field styles still need folding in.

### Finding 6 — Two names for the same button size 🟠 → ✅ fixed
`.small-btn` (line 589) and `.btn-small` (line 894) both exist and do nearly the
same thing. Pick one; `.small-btn` has more usage.

**Now:** `.btn-small` had exactly one usage (`SettingsModal.jsx`). It was
switched to `.small-btn` and the rule deleted.

---

## Accessibility

| Check | Result |
|---|---|
| `:focus-visible` rules | **0** |
| `aria-*` attributes across 32 components | **2** |
| `role=` attributes | 2 |
| Interactive `<div onClick>` (not focusable) | 7 |
| `prefers-reduced-motion` blocks | **0** |
| Information carried by colour alone | Graph state, branch identity |

### Finding 7 — Keyboard and screen-reader support is essentially absent 🔴 → 🟠
Native `<button>` is used widely, which is good — but with no visible focus ring
that advantage is lost. The 7 clickable `<div>`s are unreachable by keyboard.

**Now:** the focus ring ships, so the keyboard half is addressed. Still open:
the 7 clickable `<div>`s, and ARIA coverage (2 attributes across 32 components).

### Finding 8 — Motion is unmanaged 🟠 → ✅ fixed
Five transitions, three ad-hoc durations, no easing token, and no
`prefers-reduced-motion` escape hatch — despite confetti, a pulsing "flash"
card animation, and animated canvases.

**Now:** `--dur-fast` / `--dur` / `--ease` ship, and a `prefers-reduced-motion`
block neutralises animation and transition durations. It uses `!important`
because `Confetti` sets `animation-duration` inline.

### Finding 9 — Branch colours are unaudited for contrast 🟠
`BRANCH_PALETTE` in `graphLayout.js` is 10 hues hashed from the branch name, so
which colour a branch gets is effectively arbitrary and unstable across
projects. Several (`#fbbf24` amber, `#a3e635` lime) fall below 3:1 against the
`#F7F6F3` background when used as small dots or thin stripes.

---

## Priority Actions

1. ~~**Add spacing and type-scale tokens**~~ ✅ **done** — tokens ship.
   **Still open:** migrating the ~25 spacing and ~26 type literals onto them.
   That is a sweeping edit across 778 blocks, and this repo's `CLAUDE.md` says
   to ask before large refactors, so it is deliberately left for sign-off.
2. ~~**Ship a focus ring**~~ ✅ **done** — global `:focus-visible`, and `.input`
   exists as the canonical field. **Still open:** folding the other four one-off
   field styles into `.input`.
3. ~~**Finish tokenising colour at the canvas boundary**~~ ✅ **done for
   `SkillTreeCanvas.jsx`** — 18 hardcoded colours became 9 token reads plus
   derived tints (a `tint()` helper blends `--primary`/`--green` toward white
   for the open/done fills, which have no token of their own). An off-palette
   blue glow on "ready" nodes became `--primary`. The triplicated avatar hue
   array is now `ACCENT_HUES` in `graphLayout.js`. **Still open:**
   `Dashboard.jsx` (16 literals), `BrainMap`, `Galaxy3D`, `KnowledgeGraph`/`3D`.
4. **Audit `BRANCH_PALETTE` for contrast** and consider assigning branch colours
   deterministically by a curated order rather than a name hash. *This is a
   design decision, not a cleanup — left open on purpose.*
5. ~~**Add motion tokens plus `prefers-reduced-motion`**~~ ✅ **done**.

### Remaining accessibility work
The focus ring closed the biggest gap, and `Modal` now has `role="dialog"`,
`aria-modal`, a Tab trap and focus restore (2026-07-27) — that covers every
modal in the app at once.

Still outstanding:
- **Graph state is conveyed by colour alone** in every visualisation. The 2D
  skill map also encodes it as an icon (◆ ✓ ▶), which is the pattern to follow.
- ARIA coverage is thin outside `Modal` (2 attributes across 32 components).
- The remaining interactive `<div>`s are all click-outside-to-dismiss overlays
  (`CareerView` backdrop, `ProjectView` drawer). Making a backdrop tabbable
  would be wrong — they need `Escape` support instead. `CareerView` rolls its
  own modal rather than using `Modal`; switching it over would fix that for
  free. The rest live in files on the do-not-edit list.
