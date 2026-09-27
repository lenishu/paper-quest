# Patterns

How the pieces are assembled. Layouts, the interaction grammar shared by the
canvas maps, and the states every screen has to handle.

## App shell

```
┌──────────────────────────────────────────────────────────┐
│ TopBar   logo · tabs · search · activity · settings       │  fixed
├──────────┬───────────────────────────────────────────────┤
│ Sidebar  │ Content                                        │
│ 250px    │ scrolls; 20px 24px 32px padding                │
│ fixed    │                                                │
│          │  Dashboard | Projects | Explore | Career       │
│ profile  │  Project ▸ Overview · Map · Papers · History    │
│ XP bar   │                                                │
│ stats    │                                                │
│ badges   │                                                │
│ actions  │                                                │
└──────────┴───────────────────────────────────────────────┘
```

`.app` is a full-height flex column, `.body` a flex row, `.content` the only
scroll container. The sidebar is `--surface` with a `--line` right border — it
reads as a *panel*, not a dark rail. `.content-map` is a variant with tighter
padding for full-bleed canvas screens.

Top-level nav is pill tabs in the top bar; the sidebar is persistent context
(who you are, XP, streak, badges, quick actions), not navigation. Keep that
split — moving nav into the sidebar would break the mental model.

## Screen recipes

| Screen | Composition |
|---|---|
| **Dashboard** | Dark galaxy hero band, then a responsive card grid: projects, knowledge donut, XP, activity heatmap, recommended next, recent activity, career bars |
| **Project ▸ Overview** | Hero summary, branch progress bars, recently covered, your notes |
| **Project ▸ Map** | Full-bleed `SkillTreeCanvas` + right-hand `NodePanel` on select |
| **Project ▸ Papers** | Paper chips with row actions (Read / References / Markdown / Re-analyze / Remove) |
| **Explore** | Full-page Constellation Navigator with a floating detail panel |
| **Reference explorer** | Three panes in a wide modal: list · map · detail |
| **Learn modal** | Lesson body (markdown + KaTeX), then a 4-question quiz, then a result |

The recurring shape is **map + panel**: a visualisation holds the space, a
panel on the right explains the selection. Reuse it rather than inventing a new
arrangement.

## Canvas interaction grammar

All four maps share this. New visualisations should match it exactly — it is
the closest thing the app has to a component contract.

| Gesture | Behaviour |
|---|---|
| Drag empty space | Pan. Cursor `grab` → `grabbing` |
| Wheel | Zoom to cursor, clamped (roughly 0.3–3×) |
| Click node | Select. Click empty space clears (except the reference map, which keeps the selection so the detail panel stays useful) |
| Hover node | Cursor `pointer`, label revealed |
| Controls | `.iconbtn` stack top-right: ＋ / － / ⊡ (reset) |
| Legend | Bottom-left, 11px, `--muted`, `pointer-events: none` |

Selection rendering is consistent: selected node filled `--primary`, one-hop
neighbours keep full opacity with a primary stroke, everything else drops to
~0.35 alpha, and connected edges brighten. That dimming is the main
wayfinding device in a dense graph — preserve it.

Implementation notes that matter for design: a drag of more than ~4px is a pan
and must **not** fire a select; labels appear when zoomed past ~0.75× or when a
node is selected/hovered/seed, otherwise dense maps become unreadable.

## Colour semantics in graphs

Two independent channels, and they must stay independent:

| Channel | Encodes | How |
|---|---|---|
| **State** | Progress: locked / ready / done / core | Fill and stroke — `--green` done, `--primary` ready/selected, `--secondary` core, `--muted` locked |
| **Category** | Which branch of maths | A stripe or hue from `BRANCH_PALETTE` |

Never encode state with a branch hue or vice versa. Node *size* is free and
currently means citation count in the reference map only.

## States every screen must handle

The app is mostly asynchronous — LLM calls and a rate-limited external API — so
these are not edge cases:

| State | Pattern |
|---|---|
| Loading | Centred `Spinner` + `.spinner-label` explaining *what* is being fetched |
| Background work | Job dock (`jobs.jsx`), never a blocking spinner |
| Error | `⚠️` line, a retry button, and a plain-language explanation of the cause |
| Failure step-up | The trigger button becomes Retry / Open settings |
| Empty | One `--muted` line saying what to do next — no illustrations |
| No API key | Explain and link to settings; the demo project works without one |
| Rate-limited | Say so, say results cache, offer retry |

Error copy in this app names the real cause and the fix
("Semantic Scholar is rate-limiting the free API… wait a minute, then try
again — results are cached once fetched"). Match that register: specific,
unapologetic, actionable.

## Responsive

Seven ad-hoc breakpoints exist (760, 800, 860, 900, 1000, 1060, 1360). There is
no system — this is a desktop-first local app and phone support is not a goal,
but the breakpoints should be consolidated to two or three named steps.

Panes collapse to a single column below ~1000px; the sidebar has no mobile
treatment.

## Copy conventions

- Sentence case everywhere except `.eyebrow` labels (uppercase, mono).
- Numbers are `--fd` or `--fm`, never body font.
- Metadata reads `author · year · 41 cites` — middle dots, not pipes or commas.
- Emoji are used sparingly as inline icons (🔗 References, 📖 Read, ↻ Refresh)
  instead of an icon library. That is a deliberate dependency choice; if you
  want a real icon set, raise it as a decision rather than adding one.
