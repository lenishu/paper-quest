# PaperQuest — Design System Handout

A briefing pack for design work on PaperQuest. It documents the system **as it
actually ships**, not as anyone wishes it were, and separates the two clearly:
what exists, what is inconsistent, and what needs a design decision.

Self-contained — move this folder anywhere.

| Read | For |
|---|---|
| This page | Product, voice, and the rules you cannot break |
| [AUDIT.md](AUDIT.md) | Current-state audit: drift, hardcoded values, gaps, priority actions |
| [TOKENS.md](TOKENS.md) | Every token that exists, plus the ones that should |
| [COMPONENTS.md](COMPONENTS.md) | Component catalog — variants, states, do/don't |
| [PATTERNS.md](PATTERNS.md) | App shell, screen layouts, and the canvas visualisations |
| [tokens.css](tokens.css) | Copy-pasteable token block (shipping + proposed, kept apart) |
| [preview.html](preview.html) | Open in a browser to *see* the system rendered |

## What PaperQuest is

A local, single-user web app for learning research papers bottom-up. You drop in
a paper, an LLM maps its prerequisite concepts from a high-school baseline up to
the paper's core ideas, and you work through them as lessons and quizzes while
the whole thing renders as an interactive knowledge graph.

Design consequences that follow from that, and that should survive any redesign:

- **Long sessions of reading and thinking.** Comfortable to sit in for an hour,
  not a dashboard you glance at. Contrast and type size matter more than density.
- **Graphs are the product, not decoration.** Several screens are canvas
  visualisations. Colour has to encode *state* (mastered / ready / locked) and
  *category* (branch of maths) simultaneously, legibly, at 8px dot size.
- **Single user, local, no accounts.** No onboarding flows, no empty-state
  marketing, no permissions or roles, no social features. Ever.
- **It is a game as much as a tool.** XP, levels, streaks, badges and quests are
  real parts of the product, not bolt-ons — but the tone stays studious, closer
  to a well-made notebook than to a mobile game.

## The voice

Warm paper, not cold chrome. The palette is a light, slightly warm off-white
(`#F7F6F3`) with near-black text, a **burnt-orange primary** (`#E4572E`) and a
**teal-blue secondary** (`#2E86AB`). Dark is used deliberately and sparingly —
the hero band only — as contrast, not as a theme.

Three typefaces, each with a job: **Space Grotesk** for display and numbers,
**Inter** for everything you read, **JetBrains Mono** for uppercase labels and
eyebrows. That mono-uppercase label is the most distinctive move in the system;
it does a lot of the work of making the app feel like an instrument.

## Rules you cannot break

1. **Tokens, never literals.** Colour, font, and radius come from the `--`
   custom properties in `client/src/styles.css`. This rule is in the project's
   own `CLAUDE.md`; the audit shows where the code currently violates it.
2. **One stylesheet.** All styles live in `client/src/styles.css` as class
   blocks. No inline `style=` for anything visual, no CSS-in-JS, no utility
   framework. New component ⇒ new class block.
3. **`Logo.jsx` is the only mark.** Never redraw or recolour it.
4. **Canvas reads tokens too.** Canvas cannot use CSS variables directly, so
   read them off the DOM once with `getComputedStyle` — see `readTokens()` in
   `ReferenceGraph.jsx`. Do not copy the older pattern in `SkillTreeCanvas.jsx`,
   which hardcodes a colour table.
5. **Light theme only, for now.** There is no dark mode and no theme switch.
   Proposing one is welcome; assuming one exists is not.
6. **No network dependencies in the UI layer.** Fonts come from Google Fonts and
   one CDN serves the 3D library; nothing else. Do not add trackers, icon CDNs,
   or remote CSS.

## Working on this

The truth is `client/src/styles.css` (778 class blocks, ~83KB, organised by the
section comments listed in [COMPONENTS.md](COMPONENTS.md)). Read the relevant
section before adding to it — most things you need already exist under a name
you would not have guessed.

**When you change something visual, in the same change:**
- update the matching page in this pack,
- update the repo's `DESIGN_SYSTEM.md` if a token or rule changed,
- append an entry to the repo's `log.md`.

Stale documentation is treated as a bug in this project — and the largest single
finding in [AUDIT.md](AUDIT.md) is what happens when that slips.
