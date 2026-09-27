# PaperQuest — Top-Down Review

*Reviewed as a senior engineer, system designer, and principal PM. Honest read, not a cheerleading one.*

## Verdict up front

The **core idea is strong and differentiated**: take a paper you can't fully read, and turn it into a *reverse syllabus* — the prerequisite concepts you're missing, anchored in high-school math/physics, with "here's exactly where the paper uses this." That's genuinely useful and I haven't seen it done well. Keep it as the crown jewel.

The **expanded vision (agentic DB maintainer, chat, history, export) is coherent**, but it is a multi-phase build, not a set of toggles — and one part ("an agent that edits the database") needs real guardrails or it will quietly corrupt your data. Details below.

The **engineering is above average for a prototype** (clean provider-agnostic LLM layer, local-first file store, defensive graph sanitization) but has the classic single-user-prototype gaps: no atomic writes, no schema versioning, no tests, and the whole product's quality rides on one LLM call.

---

## 1. What it is today

A local-first, single-user web app:

- **Server** (Express, ~400 LOC): PDF→Markdown via pdf.js (local, no AI), then one LLM call builds a prerequisite concept graph; lessons/quizzes generated on demand and cached.
- **Client** (React + Vite): pan/zoom SVG skill tree, node side-panel, lesson/quiz modal, settings.
- **Storage**: plain files under `data/` — `projects/<id>/project.json` (papers + concept nodes), `papers/*.md`, `lessons/*.json`, plus global `mastery.json` / `profile.json`.
- **LLM**: pluggable OpenAI / Anthropic / Gemini adapter.

Data model in one line: **Project → {Papers (.md), Concept DAG (nodes), Lessons cache}**, with **global cross-project mastery**.

## 2. Does the core make sense? Yes — with caveats

Sound: the "decompose to prerequisites" loop is the right mental model and the "how *this* paper uses it" note is the killer feature. Gamification is secondary; don't let it bury the map.

Caveats to respect:
- **Everything hinges on one model call.** When it underperforms you get a flat, useless tree (exactly what happened). Now mitigated with a hardened prompt + retry + a server-side repair backstop, but this remains the #1 quality risk.
- **Concept-ID canonicalization is fragile.** Cross-project reuse depends on the model naming `gradient_descent` the same way every time. Works often, not always.
- **No ground truth.** You can't easily tell a good tree from a plausible-looking wrong one without evals.

## 3. Your expanded vision — feasibility & fit

### (a) PDF → Markdown — already done, keep it
Local pdf.js extraction is the right call (AI never touches the raw PDF). Gap: no OCR for scanned PDFs, and extraction noise. Optional: an OCR fallback.

### (b) An AI agent that reads a `claude.md` + the paper to maintain the papers "database"
This is the biggest shift and the most valuable — but also the most dangerous.

- Today, "analysis" is a **single stateless prompt**. What you're describing is an **agentic maintainer** with persistent instructions/memory (your `claude.md`) that incrementally edits a structured store as papers come and go.
- The right shape: a **per-project memory file** (call it `project.md` / `agent.md`) holding goals, the canonical concept vocabulary already in the tree, and style rules — fed into every analyze/merge/lesson call. The "database" becomes an artifact the agent proposes **diff-based edits** to (add / rename / merge / relink concepts), not a blob it overwrites.
- **Guardrails are non-negotiable.** Agents that freely write to a DB drift and corrupt it (you already saw NUL-byte corruption from a bad write). Pattern: **propose → validate (schema + DAG + cycle checks, which you already have) → apply, with an append-only audit log and undo.** Never let the model's raw output become the source of truth without validation.
- Scope: a real 2–4 iteration project, not a switch.

### (c) History from chat + previewed papers + learned items
- Add a **per-project append-only event log** (`events.jsonl`): `paper_added`, `paper_previewed`, `concept_viewed`, `lesson_completed`, `quiz_passed`, `chat_message`. Cheap to add, and it powers both a timeline UI and export.
- **"Chat" is a new subsystem, and a philosophical reversal** — the original design deliberately had *no* chat. A grounded Q&A surface (ask questions about the paper, answered using the tree + your mastery) is valuable, but it's context-assembly + streaming + history, i.e. its own build. Worth doing; just don't underestimate it.

### (d) Export to txt / PDF — easy, high value, do early
Markdown is already downloadable. Add exports for: the concept map as an outline (.txt/.md), individual lessons, and a **"study pack" PDF** (paper + its prerequisite map + generated lessons + your history). Server-side md→PDF, low risk, high perceived value. Good first win.

## 4. Risk register (senior-engineer pass)

- **No atomic writes / no locking.** Two tabs or a crash mid-write clobbers `project.json` (root cause of the NUL corruption we cleaned). Fix: write-temp-then-rename + validate-on-read. Cheap, high impact.
- **No schema versioning or migrations.** Add a `schemaVersion` field now so future model changes don't strand old data.
- **LLM reliability = product reliability.** Log raw model output per analyze (for debugging + future evals). You now have retry + repair; evals are the next maturity step.
- **No tests.** A small unit suite around `graphUtil` (sanitize / repair / states) and a golden-file check on prompt output shape would catch regressions like the flat-tree bug automatically.
- **Monolithic `index.js`.** Fine now; split into `routes/` as the agent + chat + export endpoints land.
- **Secrets in plaintext** (`data/settings.json`). Acceptable for a localhost tool — just document it; don't ship this hosted without change.
- **Single 600 KB client bundle.** Fine locally; revisit only if you host it.

## 5. Recommended target architecture (phased)

- **Phase 0 — Stabilize (done):** fixed crash-on-click and its root cause, hardened analysis (mandatory fields + example + retry), graph-repair backstop, cleaned corrupted data, review-first UX, always-available re-analyze.
- **Phase 1 — Foundations + quick wins:** atomic writes + `schemaVersion`; per-project event log; export (map/lesson/study-pack as txt & PDF); optional OCR fallback.
- **Phase 2 — Agentic maintainer:** per-project memory file; diff-based, validated DB edits with audit log + undo; incremental re-analysis.
- **Phase 3 — Chat + history surface:** grounded chat over paper+tree; unified activity timeline; history-driven export.
- **Phase 4 — Hardening/scale:** modularize server, prompt evals, and (only if you want it) multi-user/hosted with real auth + a real datastore.

## 6. Bottom line

Keep the core. Treat the "agent edits the DB" idea as **propose-validate-apply with audit/undo**, never raw writes. Add the event log and PDF export early — they're cheap and make the tool feel like a product. Chat is worth it but is a genuine new subsystem; decide if you want to reverse the original "no chat" stance before investing.
