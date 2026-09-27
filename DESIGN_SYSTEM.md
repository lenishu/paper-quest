# PaperQuest — Design System

Single source of truth for PaperQuest's look. Transcribed from the `:root` block
of `client/src/styles.css` — if the two ever disagree, the stylesheet wins and
this file is a bug.

> **Corrected 2026-07-27.** This document previously described a dark
> "knowledge-galaxy" theme on deep navy with a violet→cyan spectrum. That theme
> was replaced in the code and the document was never updated, so every token
> name and value in it was wrong. See `log.md` and `design-handout/AUDIT.md`.

An expanded pack — audit, component catalog, patterns, and a rendered
`preview.html` — lives in **`design-handout/`**, which is self-contained and
designed to be handed to someone doing design work.

---

## 1. Brand & logo

**Wordmark:** `PaperQuest` in Space Grotesk (`--fd`), 600 weight.

**Mark:** an 8-ray "quest compass" star filled with `--grad-135`
(`--primary` → `--secondary`), with a faint 28%-opacity inner octagon and a
white centre dot. It reads as both a compass (finding your way through a paper)
and a star in the knowledge galaxy.

Rules: minimum 24px; never restretch, recolour outside the gradient, or add
effects; clear space ≥ the mark's height.

Use `client/src/components/Logo.jsx` — `<Logo size={26} wordmark />`. Never
redraw it.

---

## 2. Colour tokens

Light, warm, low-saturation base with two saturated accents. **Never hardcode
hex in components — reference the token.**

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F7F6F3` | app canvas (warm off-white, not grey) |
| `--surface` | `#FFFFFF` | cards, panels, modals |
| `--surface-2` | `#F2F1ED` | inset: hovers, inputs, chips |
| `--surface-3` | `#EBE9E4` | progress-bar tracks |
| `--line` | `#E6E4DE` | borders, dividers |
| `--line-2` | `#D6D3CD` | emphasised border, card hover |

`--surface` is *lighter* than `--bg`: cards lift by being whiter, not by shadow.

### Text
| Token | Hex | Use |
|---|---|---|
| `--text` | `#1B1917` | primary |
| `--text-2` | `#57534E` | secondary body, inactive tabs |
| `--muted` | `#98938B` | labels, captions, metadata, disabled |

### Accents
| Token | Value | Use |
|---|---|---|
| `--primary` | `#E4572E` | burnt orange — actions, selection, active |
| `--primary-h` | `#C94A26` | primary hover only |
| `--secondary` | `#2E86AB` | teal blue — links, focus borders, core nodes |
| `--grad` | `linear-gradient(90deg,#E4572E,#2E86AB)` | XP bars, progress |
| `--grad-135` | `linear-gradient(135deg,…)` | logo, avatars |

Primary = action, secondary = navigation/reference. Keep them separated.

### Semantic
| Token | Hex | Meaning |
|---|---|---|
| `--green` | `#1F9D57` | mastered / done |
| `--amber` | `#F59E0B` | attention, bookmarks — fills and borders only |
| `--amber-t` | `#B45309` | amber *text* (the contrast-safe pair) |
| `--danger` | `#DC2626` | destructive, errors |

### Dark band
| Token | Hex | Use |
|---|---|---|
| `--hero-bg` | `#131110` | galaxy hero, dark stat cards |
| `--hero-line` | `#262220` | borders inside dark |
| `--hero-text` | `#F4F1EC` | text on dark |

Not a dark theme — a deliberate contrast band. There is no theme switch.

### Branch spectrum
Ten hues in `client/src/graphLayout.js` (`BRANCH_PALETTE`), assigned by hashing
the branch name: `#34d399` `#38bdf8` `#a78bfa` `#e879f9` `#fbbf24` `#f87171`
`#22d3ee` `#a3e635` `#fb923c` `#f472b6`. These predate the current theme and are
flagged for review (contrast + arbitrary assignment).

---

## 3. Typography

| Token | Family | Role |
|---|---|---|
| `--fd` | **Space Grotesk** | display: headings, big numbers |
| `--fu` | **Inter** | body and UI — the default |
| `--fm` | **JetBrains Mono** | uppercase labels, eyebrows, stats |

Loaded from Google Fonts in `client/index.html`.

Size tokens: `--fs-label` 11 · `--fs-xs` 12.5 · `--fs-sm` 13 (the workhorse) ·
`--fs-base` 14 · `--fs-md` 15 · `--fs-lg` 17 · `--fs-xl` 19 · `--fs-display` 28.
**New code uses these.** The ~26 pre-existing literal sizes are not yet migrated
onto them.

Rule: uppercase eyebrows/labels use `--fm`; big numbers use `--fd` or `--fm`,
never the body font.

`.eyebrow` — mono, 11px, 600, `0.08em`, uppercase, `--muted` — is the system's
signature element. Use it; don't restyle it per screen.

---

## 4. Radius, elevation, spacing, motion

| Token | Value | Use |
|---|---|---|
| `--r-sm` | `9px` | inputs, chips, small controls |
| `--r-md` | `11px` | buttons, list cards |
| `--r-lg` | `16px` | cards, panels, modals |
| `--sh-1` | `0 1px 2px rgba(28,25,23,.05)` | resting card |
| `--sh-2` | `0 16px 48px rgba(28,25,23,.18)` | modals, floating panels |

The 9/11 radii are deliberately odd — keep them. Shadows are warm-tinted, never
pure black. Pills use `--r-pill` (999px).

**Spacing:** `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 ·
`--sp-6` 24 · `--sp-8` 32 · `--sp-10` 40. New code uses these; the ~25
pre-existing literals are not yet migrated.

**Motion:** `--dur-fast` 120ms · `--dur` 180ms · `--ease`
`cubic-bezier(.2,.7,.3,1)`, plus a `prefers-reduced-motion` block at the end of
`styles.css` that neutralises animations and transitions. It needs `!important`
because `Confetti` sets `animation-duration` inline.

**Focus:** `--ring-w` 2px and `--ring-offset` 2px, applied by a global
`:focus-visible` rule that must stay **last in the file** — several field styles
set `outline: none`, and at equal specificity the later declaration wins. It is
written as longhands, not `outline: var(--ring)`: a `var()` inside a shorthand
resolves at computed-value time and takes the whole declaration down with it if
anything is off, which degraded to a grey ring on some controls.

---

## 5. Core components

Full catalog with variants, states and do/don't:
**`design-handout/COMPONENTS.md`**. In brief:

| Component | Variants | Notes |
|---|---|---|
| **Button** | `.btn` · `.btn-primary` · `.btn-ghost` · `.btn-tint` · `.btn-square` · `.iconbtn` | radius 10px, 9×16 padding, 13px/600. Modifiers `.small-btn`, `.danger`, `:disabled` |
| **Card** | `.card`, `.ov-card-dark` | `--surface`, `--r-lg`, 20px pad, `--sh-1`, 12px gap |
| **Eyebrow** | `.eyebrow` | see §3 |
| **Chip** | `.chip`, `.tierchip` + `.tier-*` | pill; tiers use hue @10% bg / 35% border / full text |
| **Modal** | `Modal` in `bits.jsx`, `.modal-wide` | 560/900px, 18px radius, `--sh-2`, esc + backdrop close. `role="dialog"`, focus trap, focus restored to the opener; `label` prop sets the accessible name |
| **Toast** | `ToastHost` + `useToast` | inverted `--text` fill, bottom-right |
| **Spinner** | `Spinner` | 34px ring, `--primary` head |
| **Progress** | `XpBar`, `ProgressRing`, `.proj-bar` | `--grad` fill on `--surface-3` track |
| **Input** | `.input` | canonical field; no `outline: none` on it. Four older one-off styles (`.tb-search input`, `.pjv-rename`, `.np-note-input`, `.memory-edit`) still need folding in |
| **Graph canvases** | `SkillTreeCanvas` · `BrainMap`/`Galaxy3D` · `KnowledgeGraph` · `ReferenceGraph` | shared pan/zoom/select grammar |

---

## 6. Patterns

Detail in **`design-handout/PATTERNS.md`**.

- **App shell**: fixed `TopBar` (logo, pill tabs, search, activity, settings) +
  250px `Sidebar` on `--surface` (profile, XP, stats, badges, quick actions) +
  a single scrolling `.content` area. The sidebar is context, not navigation.
- **Map + panel**: the recurring screen shape — a visualisation holds the space,
  a right-hand panel explains the selection.
- **Graph colour has two independent channels**: state (locked/ready/done/core)
  via fill and stroke, category (branch) via stripe or hue. Never mix them.
- **Async states are the norm**, not edge cases: loading with a label saying
  what is being fetched, background work in the job dock, errors that name the
  cause and offer a retry.

---

## 7. Working rules

1. Tokens, never literals — colour, font, radius.
2. All styles in `client/src/styles.css` as class blocks. No inline `style=`
   for anything visual, no CSS-in-JS, no utility framework.
3. Canvas can't read CSS variables — read them off the DOM once with
   `getComputedStyle`. Reference implementation: `readTokens()` in
   `ReferenceGraph.jsx` and `SkillTreeCanvas.jsx`. Tints with no token of their
   own (open/done node fills, lit edges) are derived from the token colours via
   a `tint()` helper — never hardcoded.
4. `Logo.jsx` is the only mark.
5. Light theme only. There is no dark mode.
6. When you change something visual, update this file, the matching
   `design-handout/` page, and `log.md` in the same change.
