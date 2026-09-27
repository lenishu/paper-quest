# Component catalog

Every entry is transcribed from `client/src/styles.css` and the components in
`client/src/components/`. Values shown are what ships today, including the
untokenised literals — those are flagged so you can see where the drift is
rather than inheriting it.

## Where things live in the stylesheet

`styles.css` is one file, sectioned by comments. In order:

`app shell` · `top bar` · `sidebar` · `galaxy hero` · `dashboard grid & cards` ·
`projects card` · `heatmap` · `donuts` · `branch bars` · `recommended` ·
`quests` · `recent activity` · `generic views` · **`buttons`** ·
`project shell / overview` · `per-node notes editor` · `project map` · `papers` ·
`history` · `read drawer` · `reader overlay` · **`modals`** · `settings` ·
`multi-connection settings` · `badges modal` · `bookmarks modal` ·
`learn modal` · **`spinners, toasts, confetti, jobs`** · `crash` ·
`career path view` · `knowledge graph — Constellation Navigator` ·
`dashboard mini` · `explore full page` · `references explorer`

Search the section before adding — most patterns already exist under a name you
would not guess.

---

## Button

The workhorse. One base, five variants, all `<button>` elements.

**Base** (`.btn`, `.btn-primary`, `.btn-ghost` share it): radius `10px`
*(literal — should be `--r-md`)*, padding `9px 16px`, weight 600, size `13px`,
`1px solid var(--line)`, `var(--surface)` background, `var(--text-2)` text,
inline-flex with `6px` gap.

| Variant | Use when | Visual |
|---|---|---|
| `.btn` | Default action | Surface fill, hover → primary border + primary text |
| `.btn-primary` | The one main action per view | Solid `--primary`, white text, hover `--primary-h` |
| `.btn-ghost` | Secondary, sits on a card | `--bg` fill, otherwise as `.btn` |
| `.btn-tint` | Subtle emphasis | Primary at 14% on hover |
| `.btn-square` | Icon-only, 38px | Square-ish, `--bg`, hover → primary |
| `.iconbtn` | 28px icon control | Muted, hover → `--text` + `--line-2` border |

Modifiers: `.small-btn` (6px 12px, 12.5px) · `.danger` (danger text + border on
hover) · `:disabled` (`opacity .55`, `cursor: default`).

| State | Behaviour |
|---|---|
| Hover | Border and text shift to `--primary` (or `--line-2` for `.iconbtn`) |
| Disabled | 0.55 opacity, non-interactive, primary keeps its fill |
| Loading | No shared pattern — components hand-roll `…` or swap the label |
| Focus | 2px `--primary` outline via the global `:focus-visible` rule |

| ✅ Do | ❌ Don't |
|---|---|
| One `.btn-primary` per view | Two primaries competing |
| Use `.iconbtn` for map/panel controls | Invent a new small-button size |
| Put the icon in the label text (`↻ Refresh`) | Add an icon library |
| Use `.small-btn` | Reintroduce `.btn-small` — the duplicate was retired |

**Gap:** no `loading` variant and no `size` scale beyond small/default.

---

## Card

`.card` — `--surface`, `1px solid --line`, `--r-lg`, `20px` padding, `--sh-1`,
flex column with `12px` gap.

`.card-head` pairs a title with a `.card-link` (11.5px, `--secondary`) or
`.card-note` (11.5px, `--muted`). `.card.flash` runs a 1.6s highlight animation
when content updates.

Dark variant `.ov-card-dark` swaps in `--hero-bg` / `--hero-line` / `--hero-text`.

| ✅ Do | ❌ Don't |
|---|---|
| Lead with an `.eyebrow` label | Use heavier shadows to separate cards |
| Let white-on-warm-grey do the lifting | Nest a card inside a card |

---

## Eyebrow (the signature element)

`.eyebrow` — `--fm`, 11px, 600, `0.08em` tracking, uppercase, `--muted`.

Labels a section, card, or panel. More than any other single rule this is what
makes the app read as an instrument rather than a website. Use it liberally;
do not restyle it per screen. A near-twin, `.refs-col-head`, uses `0.06em` —
they should converge.

---

## Chip / tag

`.chip` — pill (`--r-pill`), `3px 10px`, 11px, 600.

`.tierchip` adds `--fm`, 10px, uppercase, `1px` border, and pairs with
`.tier-base` / `.tier-novice` / `.tier-intermediate` / `.tier-advanced` /
`.tier-core`. Each tier follows the same recipe: hue at ~10% background, ~35%
border, full-strength text — a good pattern to copy for any new status colour.

**Gap:** no size or interactive (removable/selectable) variants.

---

## Modal

`Modal` in `bits.jsx` — `<Modal onClose wide className>`. Backdrop click and
`Escape` both close; `.modal` is `--surface`, `18px` radius *(literal — the only
18px in the system; `--r-lg` is 16)*, `--sh-2`, `560px` wide, `22px 24px`
padding, `pop 0.16s` entry.

Variants: default `560px` · `.modal-wide` `900px` · per-feature overrides such
as `.refs-explorer` at `min(1080px, 94vw)`.

`.modal-head` holds title left, actions right; `.modal-actions` right-aligns
footer buttons.

**Accessible since 2026-07-27:** `role="dialog"` + `aria-modal`, focus moves
into the panel on open, Tab is trapped inside it (wrapping both directions), and
focus returns to whatever opened it on close. Pass `label` for the accessible
name when the panel has no visible heading.

---

## Feedback

| Component | Where | Notes |
|---|---|---|
| `ToastHost` + `useToast` | `bits.jsx` | Bottom-right stack, max 360px. `--text` fill with `#FBFAF8` text; `.toast-err` swaps to `--danger` |
| `Spinner` | `bits.jsx` | 34px ring, `--line` track, `--primary` head, 0.9s. Optional `.spinner-label` in `--muted` |
| `Confetti` | `bits.jsx` | Fires on mastery. Neutralised by the global `prefers-reduced-motion` block (which needs `!important` — Confetti sets its duration inline) |
| Job dock | `jobs.jsx` | Background LLM progress; on failure the trigger button steps up to Retry / Open settings |

Toast is the only feedback surface using an inverted (dark) fill — that is
deliberate and worth keeping.

---

## Progress

| Component | Signature | Notes |
|---|---|---|
| `XpBar` | `<XpBar profile />` | Level + XP, `--grad` fill on a pill track |
| `ProgressRing` | `<ProgressRing value size=46 stroke=5 label />` | SVG donut for mastery % |
| `.proj-bar` | CSS only | 5px pill, `--surface-3` track |

---

## Inputs

`.input` is the canonical field: `--surface` fill, `1px solid --line`,
`--r-sm`, `7px 10px`, `--fs-sm`, border → `--secondary` on focus. It carries **no
`outline: none`** — that declaration is exactly what removed the focus state
everywhere else.

Four older one-off field styles predate it and still need folding in:
`.tb-search input`, `.pjv-rename`, `.np-note-input`, `.memory-edit`. They pick up
the focus ring from the global rule regardless, so this is now tidiness rather
than an accessibility defect.

---

## Canvas visualisations

Four canvas/SVG maps, each with its own layout rule. See
[PATTERNS.md](PATTERNS.md) for the shared interaction grammar.

| Component | What it draws | Layout |
|---|---|---|
| `SkillTreeCanvas.jsx` | Prerequisite skill tree | Layered by depth; rounded-rect nodes with branch stripe |
| `BrainMap.jsx` / `Galaxy3D.jsx` | Knowledge galaxy | Force-directed; 3D falls back to 2D without WebGL |
| `KnowledgeGraph.jsx` + `KnowledgeGraph3D.jsx` | Constellation Navigator | **3D** force-directed star field (WebGL) with a 2D canvas fallback and manual ▦ toggle; the dashboard mini stays 2D so only one GL context is live per screen |
| `ReferenceGraph.jsx` | Citation map | Deterministic: x = year, y = citations (log), r = citations |

`ReferenceGraph.jsx` is the reference implementation for colour
(`readTokens()`). **`SkillTreeCanvas.jsx` now follows it too** — its open/done
fills and lit edges have no token of their own, so they are derived from
`--primary`/`--green` with a `tint()` helper rather than hardcoded.
