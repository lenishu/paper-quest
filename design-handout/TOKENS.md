# Tokens

**This page is authoritative.** It is transcribed from the `:root` block of
`client/src/styles.css`, with real usage counts. Anything in the repo's older
`DESIGN_SYSTEM.md` that contradicts it was wrong — see
[AUDIT.md](AUDIT.md) finding 1.

Two sections: **Shipping** (exists, use freely) and **Proposed** (does not exist
yet, needs a decision before use).

---

## Shipping — colour

Nineteen colour tokens. Light, warm, low-saturation base; two saturated accents.

### Surfaces
| Token | Value | Uses | Role |
|---|---|---|---|
| `--bg` | `#F7F6F3` | — | App canvas. Warm off-white, not grey |
| `--surface` | `#FFFFFF` | — | Cards, panels, modals — sits *above* `--bg` |
| `--surface-2` | `#F2F1ED` | 27 | Nested/inset: hovers, inputs, chips |
| `--surface-3` | `#EBE9E4` | 4 | Third level: progress-bar tracks |
| `--line` | `#E6E4DE` | — | Default border and divider |
| `--line-2` | `#D6D3CD` | 14 | Emphasised border, hover state on cards |

The surface ladder runs **bg → surface → surface-2 → surface-3**, but note that
`--surface` (white) is *lighter* than `--bg`. Cards lift off the page by being
whiter, not by shadow. Keep it that way; heavy shadows read as foreign here.

### Text
| Token | Value | Uses | Role |
|---|---|---|---|
| `--text` | `#1B1917` | — | Primary. Near-black, warm-tinted |
| `--text-2` | `#57534E` | 44 | Secondary body, inactive tabs |
| `--muted` | `#98938B` | 65 | Labels, captions, metadata, disabled |

`--muted` is the most-used colour token in the system. Metadata lines
(`author · year · 41 cites`) are its signature use.

### Accents
| Token | Value | Uses | Role |
|---|---|---|---|
| `--primary` | `#E4572E` | — | Burnt orange. Primary actions, selection, active state |
| `--primary-h` | `#C94A26` | 4 | Primary hover only |
| `--secondary` | `#2E86AB` | — | Teal blue. Links, focus borders, "core" nodes |
| `--grad` | `linear-gradient(90deg, #E4572E, #2E86AB)` | 5 | XP bars, progress fills |
| `--grad-135` | `linear-gradient(135deg, …)` | 2 | Logo, hero accents |

Primary and secondary are near-complementary and both saturated. They fight if
adjacent at equal weight — the system uses primary for *action* and secondary
for *navigation/reference*, and that separation is worth preserving.

### Semantic
| Token | Value | Uses | Role |
|---|---|---|---|
| `--green` | `#1F9D57` | 19 | Mastered / done / success |
| `--amber` | `#F59E0B` | 3 | Attention, bookmarks — **borders and fills only** |
| `--amber-t` | `#B45309` | 9 | Amber *text*; the darker pair that passes contrast |
| `--danger` | `#DC2626` | 13 | Destructive actions, errors |

The `--amber` / `--amber-t` split is the one place the system already does
contrast pairing properly. Copy that pattern if you add a semantic hue.

### Dark band
| Token | Value | Uses | Role |
|---|---|---|---|
| `--hero-bg` | `#131110` | 3 | The one dark surface — hero band, dark stat cards |
| `--hero-line` | `#262220` | 8 | Borders inside dark |
| `--hero-text` | `#F4F1EC` | 9 | Text on dark |

This is **not** a dark theme — it is a deliberate contrast band, used for the
galaxy hero and a couple of feature cards. Do not extend it into a full theme
without a decision.

---

## Shipping — typography

| Token | Stack | Role |
|---|---|---|
| `--fd` | `'Space Grotesk', system-ui, sans-serif` | Display: headings, big numbers |
| `--fu` | `'Inter', system-ui, sans-serif` | UI and body — the default |
| `--fm` | `'JetBrains Mono', ui-monospace, monospace` | Uppercase labels, eyebrows, stats |

Loaded from Google Fonts in `client/index.html` (weights 400–700 for the first
two, 400–600 for mono).

**There are no size tokens.** 26 distinct literal sizes are in use. The
`.eyebrow` class is the system's most recognisable element: mono, ~11px, 600,
uppercase, ~0.06em tracking, in `--muted`.

---

## Shipping — radius, elevation

| Token | Value | Role |
|---|---|---|
| `--r-sm` | `9px` | Inputs, chips, small controls |
| `--r-md` | `11px` | Buttons, list cards |
| `--r-lg` | `16px` | Cards, panels, modals |
| `--sh-1` | `0 1px 2px rgba(28,25,23,.05)` | Resting card |
| `--sh-2` | `0 16px 48px rgba(28,25,23,.18)` | Modals, floating panels |

Radii are unusually specific (9/11 rather than 8/12) and that slight oddness is
part of the look — keep it. Note **`999px` pills appear 51 times with no token**
(see Proposed).

Shadows are warm-tinted (`rgba(28,25,23,…)`, not black). Preserve that.

---

## Shipping — spacing, type scale, motion, focus

**Added 2026-07-27** (audit priorities 1, 2 and 5). Values were derived from the
literals the code already used most, so these describe the existing design
rather than changing it.

### Spacing
```css
--sp-1: 4px;    --sp-2: 8px;    --sp-3: 12px;   --sp-4: 16px;
--sp-5: 20px;   --sp-6: 24px;   --sp-8: 32px;   --sp-10: 40px;
```
**New code uses these — no new literals.** The ~25 existing ad-hoc values are
*not* yet migrated; the 6/7/9/10 cluster should collapse into `--sp-2` /
`--sp-3` as blocks get touched.

### Type scale
```css
--fs-label: 11px;    /* mono uppercase eyebrows            */
--fs-xs:    12.5px;  /* metadata, captions                 */
--fs-sm:    13px;    /* dense UI, list cards — the workhorse */
--fs-base:  14px;    /* body copy                          */
--fs-md:    15px;    /* card titles                        */
--fs-lg:    17px;    /* section headings                   */
--fs-xl:    19px;    /* modal / page titles                */
--fs-display: 28px;  /* hero                               */
```
Same caveat: defined and available, existing literals not yet migrated.

### Radius, motion, focus
```css
--r-pill: 999px;      /* was 51 untokenised occurrences */
--dur-fast: 120ms;    /* matches the existing 0.12s hovers */
--dur: 180ms;
--ease: cubic-bezier(0.2, 0.7, 0.3, 1);
--ring-w: 2px;
--ring-offset: 2px;
```

### The focus rule
Live at the **end** of `styles.css` — position matters. Several field styles set
`outline: none` with only a border-colour change; at equal specificity the later
declaration wins, so being last is what restores focus across the app.

```css
:focus-visible {
  outline-width: var(--ring-w);
  outline-style: solid;
  outline-color: var(--primary);
  outline-offset: var(--ring-offset);
}
input:focus-visible, textarea:focus-visible, .input:focus-visible { outline-offset: 1px; }
```

Written as **longhands, not `outline: var(--ring)`**. A `var()` inside a
shorthand is resolved at computed-value time, and if anything about it is off
the entire shorthand is dropped — which silently degraded to a grey ring on some
controls. With longhands only `outline-color` depends on a variable.

### Reduced motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
`!important` is required — `Confetti` sets `animation-duration` as an inline
style, which would otherwise win.

### Canvas colours
Canvas cannot read CSS variables. Do not hardcode — read once from the DOM:

```js
const cs = getComputedStyle(el);
const t = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
const C = { primary: t('--primary', '#E4572E'), line: t('--line', '#E6E4DE') /* … */ };
```

Working implementation: `readTokens()` in `client/src/components/ReferenceGraph.jsx`.

### Branch palette
Ten hues in `graphLayout.js`, assigned by **hashing the branch name**, so a
branch's colour is arbitrary and differs between projects:

`#34d399` `#38bdf8` `#a78bfa` `#e879f9` `#fbbf24` `#f87171` `#22d3ee` `#a3e635` `#fb923c` `#f472b6`

These are Tailwind-family hues and sit apart from the rest of the palette, which
is warm and desaturated. They also predate the current theme. Two open
questions for design: **(a)** re-tune them to the warm palette, and **(b)**
assign deterministically from a curated order instead of a name hash. Several
fail 3:1 contrast against `--bg` at dot size.
