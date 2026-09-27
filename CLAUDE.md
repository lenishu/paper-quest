# CLAUDE.md — orientation for AI sessions

Read this first. It's the map so you don't have to scan the whole repo.
**For any code change, open `wiki/index.md` next** — it routes each task type to one page naming the exact files to touch (and lists legacy files not to edit). Keep wiki pages updated in the same change. Deeper docs:
**ARCHITECTURE.md** (how it works, per-screen, AI vs local vs external), **DESIGN_SYSTEM.md** (tokens/type/logo/components), **README.md** (end-user), **UX_AND_USER_FLOW.md**, **ARCHITECTURE_REVIEW.md**.

## What this is
PaperQuest — a local web app. Drop in a research paper (PDF/MD); it converts to Markdown, an LLM maps the prerequisite concepts (high-school baseline → the paper's core), and you learn bottom-up (lessons + quizzes) while seeing everything as an interactive knowledge galaxy. Single-user, local-first, no accounts.

## Run
- `start.bat` (Windows): installs deps first run, installs docling if Python present, builds, starts server, opens `http://localhost:3001/` (the SPA).
- Dev: `npm run dev` (Vite @5173 + API @3001). Build: `npm run build`. Serve: `npm start` (Express @3001).
- Front door: `/` = React SPA (full app). `/dc` (the retired standalone dashboard) now redirects to `/`; its HTML is kept in `archive/`.

## Layout
```
server/            Node + Express API (no build step)
  index.js         all routes (~single file); mounts static client/dist (Vite build output)
  store.js         file-based storage under data/ — ATOMIC writes (temp+fsync+rename)
  graphUtil.js     sanitize LLM graph, tiers (novice/intermediate/advanced), repairGraph backstop, states
  prompts.js       all LLM prompts (concept extraction/merge, lessons) + BASELINE persona
  llm.js           provider adapter: OpenAI(-compatible) / OpenRouter / Anthropic / Gemini (global fetch)
  pdfToMd.js       PDF→Markdown: docling (default, Python) → pdf.js fallback
  references.js    Semantic Scholar reference/citation lookup (needs internet)
  demo.js          hard-coded demo project (works with no API key)
client/src/
  main.jsx → App.jsx   shell: TopBar + Sidebar + views (Dashboard/ProjectsView/ExploreView/PathsView/ProjectView)
  components/          one concern each (BrainMap/Galaxy3D = galaxy, SkillTreeCanvas = map, LearnModal = lesson+quiz, CareerView = career path, PaperReader, NodePanel, etc.)
  graphLayout.js      tierOf/TIER_LABELS/branchColor + 2D layout
  jobs.jsx            background job queue (upload+analyze, lesson) with progress dock + failure step-up
  styles.css          design system tokens (see DESIGN_SYSTEM.md) + all styles
archive/              retired PaperQuest.dc.html (old /dc dashboard; route redirects to /)
data/                 (gitignored) settings.json, mastery.json, profile.json, bookmarks.json, careers/ (career.json per career + resume.md/.json), projects/<id>/{project.json, papers/*.md|pdf, lessons/*.json (+ *.chat.json Q&A threads), events.jsonl, audit.jsonl, project.md, nodes.prev.json}
```

## Data model
Project → { papers[] (.md + optional raw pdf), nodes[] (concept DAG) }. Node: `{id, name, level(0=baseline), core, tier, branch, blurb, prereqs[], usage{paperId:text}, sources[], depth}`. Mastery + XP are **global** (cross-project) in `data/mastery.json` / `profile.json`.

## API surface (all under /api)
health, settings(+/test), profile, projects (CRUD, /demo), projects/:id (states+mastery+bookmarks), papers (upload, analyze, markdown, pdf, notes, delete), lesson (POST /lesson), complete, bookmarks(+toggle), memory (GET/PUT), history, events (POST), undo, export.txt, brain, dashboard, overview, quests/quest-claim, careers (CRUD + /generate + /resume + /jd — see wiki/career.md).

## Conventions & gotchas (important)
- **Editing files here:** the file tools (Edit/Write) truncate large writes to this Windows mount. For anything sizeable, write via `bash` heredoc (`cat > file <<'EOF'`) and verify with `node --check` (server) or esbuild (client). Small edits: prefer `node -e` fs string-replace, then verify.
- **Never reintroduce non-atomic writes.** `store.writeJSON` is temp+fsync+rename; earlier non-atomic writes corrupted `project.json` repeatedly. `readJSON` tolerates trailing garbage.
- **Sandbox build:** `npm run build` needs the Linux rollup binary (`@rollup/rollup-linux-x64-gnu`); the user's Windows machine builds normally. `node_modules` is Windows-installed (pure-JS deps run in the Linux sandbox; the native rollup binary doesn't).
- **AI reliability:** analysis = prompt (mandatory tier/branch/prereqs/usage + few-shot) → one retry if degenerate → `repairGraph` backstop guarantees a connected layered DAG. Tiers calibrated to a math-olympiad high-schooler (matrix multiplication = novice).
- **Design:** use `Logo.jsx`; reference `--` CSS tokens (DESIGN_SYSTEM.md); never hardcode colors/fonts/radii.
- **Background AI:** all LLM actions run via `jobs.jsx` (progress dock; on failure the trigger button steps up to Retry / Open settings).

## Documentation upkeep (MANDATORY, every session)
When a conversation changes behavior, update the records IN THE SAME change — do not defer:
- **log.md**: append an entry (`## [YYYY-MM-DD] type | Title`) for every decision, feature, fix, or tooling change. This is the project chronicle; future sessions read it.
- **README.md**: update whenever something user-visible changes (features, data layout, commands, troubleshooting).
- **wiki/**: update the page that describes what you touched (see wiki/index.md rules).
- **Graphs**: after code changes run `graphify update .` (no LLM, seconds); after data-model changes run `npm run graph:knowledge` to refresh `graphify-out/knowledge/graph.html`.
Stale docs are treated as bugs here — the user relies on these staying current.

## Security posture (local tool)
No auth (single-user localhost). Secrets = provider API keys in `data/settings.json` (gitignored, never sent anywhere but the chosen provider). No database → no SQL injection; uploads validated by extension + size; user markdown is rendered via react-markdown (sanitized). External calls: LLM providers (analysis/lessons), Semantic Scholar (references), Google Fonts + a CDN for the 3D lib. Do not add auth-less network exposure or log secrets.

## Recommended hardening (not yet done)
Unit tests for `graphUtil` (sanitize/repair/states); ESLint + Prettier; a smoke test for the API; split `server/index.js` into `routes/`; TypeScript for shared node/graph types. Ask before large refactors — parallel edits happen in this repo.

## Hosted deployment
Netlify support is documented in `wiki/hosting.md`. Hosted builds have private recovery-key workspaces, encrypted Netlify Blobs persistence, and background jobs. The local app keeps its file-based behavior. Node 22.13+ is required. Never deploy local `data/`; never serve the local unauthenticated Express process publicly.
