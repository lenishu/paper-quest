# PaperQuest — decision & work log

Append-only. Entry format: `## [YYYY-MM-DD] type | Title` (types: decision, ingest, design, lint).
Parseable with: `grep "^## \[" log.md | tail -5`

## [2026-07-12] decision | Knowledge architecture: three layers, one new build

Evaluated the Karpathy "LLM Wiki" pattern plus a proposed three-way split
(Code Knowledge / User Knowledge / AI Knowledge) against the actual repo.
Settled best practice:

### 1. Code Knowledge (for AI coding agents) — already done, do not build
- CLAUDE.md + ARCHITECTURE.md *are* the code wiki. The repo (~8 server files,
  ~15 client components) fits in one read; a per-component `wiki/` tree would
  be more maintenance surface than the code and would drift.
- No "context orchestrator" for code tasks: the agent reads CLAUDE.md, then
  greps. That is the orchestrator.
- Practice: keep CLAUDE.md's file map honest as the repo grows; split into
  per-area pages only when a single file stops being enough.

### 2. User Knowledge (projects/papers/nodes/mastery) — keep as-is, two explicit rejections
- The `nodes[]` concept DAG (prereqs/tier/branch/usage) is the graph;
  `server/graphUtil.js` is the graph engine. Grow it in JS as needs appear.
- REJECTED: NetworkX as central graph engine. It is Python; the server is
  Node. The app's only Python dependency (docling) is deliberately optional
  with a fallback — do not put a hard cross-language dependency in the
  request path for DAGs of a few hundred nodes.
- DEFERRED: SQLite. The file store with atomic writes (temp+fsync+rename in
  store.js) was hard-won after real corruption; single-user localhost has no
  concurrency pressure. Revisit only if multi-user ever happens.
- Known gap in this layer: cross-project concept identity ("Self-Attention"
  in project A and B are separate nodes; only mastery/XP are global).
  Solved by layer 3 below, not by new storage.

### 3. AI Knowledge (persistent cross-paper wiki) — ADOPT; this is the build
The one genuinely new piece. Today every paper analysis is re-derived per
project (the RAG-shaped problem). Instead, accumulate:
- `data/wiki/concepts/<slug>.md` — one page per concept, GLOBAL across
  projects, enriched on every ingest that touches it (how each paper uses
  it, contradictions, cross-links).
- `data/wiki/papers/<id>.md` — summary page per ingested paper.
- `data/wiki/index.md` — LLM-maintained catalog; retrieval = read index,
  drill into pages (no embedding infra).
- Ingest hook: after existing graph extraction in the analyze pipeline, a
  second LLM pass integrates the paper into the wiki (new prompt in
  server/prompts.js; wiki I/O via store.js atomic writes).
- Concept nodes gain a pointer to their wiki slug — the slug becomes the
  canonical cross-project concept ID, closing the layer-2 gap.
- Lessons improve for free: lesson prompts consume the accumulated wiki
  page instead of only the single paper's `usage` text.
- DEFERRED: ChromaDB / embeddings. Index-first retrieval holds to ~100
  sources; add vector search only when index-reading demonstrably fails.

### Next steps (in order, each small)
1. `server/wiki.js` — read/write/list wiki pages + index maintenance
   (atomic via store.js; slugging rules; no deletes of raw sources).
2. Wiki-integration prompt in `server/prompts.js` (input: paper md +
   extracted nodes + existing touched pages; output: page updates).
3. Hook into analyze pipeline after graph extraction; run as a jobs.jsx
   background step so failures don't block analysis.
4. `GET /api/wiki` + per-page endpoints; surface wiki page in NodePanel.
5. Add `wikiSlug` to node model; migrate existing projects lazily.

Rationale in one line: keep storage and graph as-is; add a `data/wiki/`
layer maintained by an ingest-integration prompt — one new module plus
prompt work, not four new subsystems.

## [2026-07-12] design | Code Knowledge wiki created (wiki/)

Built the layer-1 code wiki (revisits the 2026-07-12 decision's "do not
build" — user requested it explicitly, so it was built LEAN: a task router,
not prose duplication of the code).

- `wiki/index.md` — task→page→files routing table + do-not-edit legacy list
  (SkillTree.jsx, Home.jsx, HomeDashboard.jsx, TopNav.jsx, ProjectTools.jsx
  have zero importers — verified by grep) + maintenance rules.
- `wiki/architecture.md` — system map, the two core flows (ingest+analyze,
  learn), global-vs-per-project data split, ground rules.
- `wiki/server/` — api.md (route groups + helpers), storage.md (data/ layout,
  node shape, atomic-write rule), ai-pipeline.md (llm.js / prompts.js /
  graphUtil.js and the sanitize→retry→repair contract), ingest.md
  (upload/pdfToMd/references/demo).
- `wiki/client/` — shell.md (App.jsx routing, deep links, component map),
  visualizations.md (Galaxy3D vs BrainMap vs GalaxyPanel vs SkillTreeCanvas
  disambiguation), learning.md (jobs.jsx queue, LearnModal, XP), design.md
  (token rules, pointer to DESIGN_SYSTEM.md).
- `wiki/dc-dashboard.md` — /dc shares no code with the SPA.
- CLAUDE.md now points to wiki/index.md as the second read.

Conventions: no line numbers in pages (function/route names only); pages
updated in the same change that alters what they describe; content verified
against source (route list, exports, importers greped), not written from memory.

## [2026-07-12] fix | start.bat now opens the SPA, not /dc

start.bat opened http://localhost:3001/dc (legacy standalone dashboard);
users landed on the old UI and only reached the SPA via project deep-links.
Changed the start URL to http://localhost:3001/. /dc is still served for
anyone who wants it. Updated CLAUDE.md and wiki/dc-dashboard.md to match.

## [2026-07-12] fix | Retired the /dc legacy dashboard

PaperQuest.dc.html moved to archive/ (repo has no git history, so archived
rather than deleted). GET /dc now redirects to / so old bookmarks land on the
SPA. Removed /dc from CLAUDE.md, wiki/index.md, wiki/architecture.md,
wiki/server/api.md, wiki/client/{shell,visualizations,design}.md; deleted
wiki/dc-dashboard.md. start.bat already opened / (previous entry).

## [2026-07-12] feature | Career Path tab (from the Claude Design mockup)

Built the career-path feature end-to-end, design taken from the user's Claude
Design project ("Frontend color scheme update" — the career section of
PaperQuest.dc.html, fetched via DesignSync). NOTE FOR FUTURE SESSIONS: the
user designs new pages in Claude Design and shares a project link — fetch the
mockup with DesignSync before building UI.

- Multiple careers, one primary; global data under data/careers/.
- Resume upload (global): PDF→MD via pdfToMarkdown, LLM extracts evidenced
  skill names into resume.json.
- JD upload (per career, file or text): LLM merges required skills into the
  career's graph, bumping importance.
- Skills graph generation reuses the paper pipeline verbatim
  (sanitizeGraph → degenerate retry → repairGraph); nodes carry extra
  importance + roleNote fields re-attached after sanitize.
- Skill states cross-reference the user's PaperQuest knowledge: canonical-id
  match against global mastery, normalized-name match against project
  concepts (mastered→known, unmastered→learning) and resume skills.
  Match % = known + half-credit for learning.
- Client: CareerView.jsx (career cards, resume/JD cards, profile summary,
  layered-DAG canvas in the mockup's state palette, match donut, missing-skill
  chips, next steps); jobs.jsx gained career-generate/career-resume/career-jd
  kinds + careersVersion refetch signal. TopBar: "✧ Career Path" is the new
  view; old paths view relabeled "⋔ Branches".
- Verified end-to-end: unit tests pass, vite build clean, real Gemini
  generation produced a 21-skill 7-layer graph, and browser check confirmed
  the page renders with mastered concepts (Linear Algebra, Calculus, Python)
  showing green. A generated "AI / Machine Learning Engineer" career was left
  in data/careers/ from verification — it's real and usable.
- Docs: new wiki/career.md; rows/mentions added to wiki index, api, storage,
  shell; CLAUDE.md API/data lines updated.

## [2026-07-12] feature | Per-career resumes, openable resume, rich skill panel

User feedback pass on the career tab:
- Resume moved from global to PER CAREER (career = container like a project:
  its JDs + its own tailored resume). data/careers/<id>/resume.md|.pdf; meta
  lives in career.json as career.resume {name, addedAt, skills[]}. Routes:
  POST /api/careers/:id/resume, GET …/resume/file (raw, openable),
  GET …/resume/markdown. Global /api/careers/resume route removed (no
  migration needed — nothing had been uploaded).
- Skill matching now reads resume skills from the career itself
  (careerStates); mastery/project matching unchanged.
- Skills graph boxes were already clickable — the detail strip was upgraded
  to a full panel: state chip, importance, tier · branch, blurb, "In this
  role", clickable Builds-on/Unlocks skill chips, and a "learn this next"
  suggestion for missing skills.
- Verified in browser: per-career resume card ("Resume for This Career",
  choose/replace/open ↗), panel opens on canvas click with prereq/unlock
  navigation. App server on 3001 restarted with the new routes.
- NOT done (explicitly, after discussion): Graphify — the galaxy/skill graphs
  remain 3d-force-graph + hand-rolled canvas per the 2026-07-12 decision
  (plain-JS graph engine, no new graph infra).

## [2026-07-13] tooling | Graphify installed + repo knowledge graph built

pip install graphifyy[mcp] (miniconda python 3.13 — NOTE: `python` on PATH is
3.11, graphify lives in C:/Users/lpand003/miniconda3/python.exe, recorded in
graphify-out/.graphify_python). `graphify install --platform claude` added the
/graphify skill (~/.claude/skills/graphify) + a global ~/.claude/CLAUDE.md
pointer. First full build on the repo: 73 files → 425 nodes, 832 edges,
24 labeled communities (AST for 53 code files, one LLM subagent for 20 docs;
user data under data/ was not scanned). Outputs in graphify-out/ (gitignore
candidate): graph.html (interactive), GRAPH_REPORT.md, graph.json.
Health warning: 74 dangling semantic edges (doc-node ids not matching AST ids)
— cosmetic, graph usable. Maintain with `graphify update .` (no LLM) after
code changes; query with `graphify query "<question>"`. This tool builds the
CODE knowledge graph for AI sessions — it does not replace the app's own
galaxy/skill-tree rendering (3d-force-graph + canvas), per the 2026-07-12
decision.

## [2026-07-13] feature | Graphify for every network + doc upkeep rules

ADR (accepted): graphify is PaperQuest's OFFLINE analysis/visualization layer
for ALL networks; the app's runtime renderers (3d-force-graph, canvas) stay.
Two graphs now exist:
- CODE+DOCS: graphify-out/graph.html (/graphify pipeline, 2026-07-13).
- KNOWLEDGE: graphify-out/knowledge/graph.html — new deterministic exporter
  (scripts/export-knowledge-graph.js + scripts/build_knowledge_graph.py,
  run via `npm run graph:knowledge`, ZERO LLM cost — data/ is already a graph).
  Key design: concepts and career skills share canonical snake_case ids, so
  one merged network shows careers connected to the paper galaxy through
  shared knowledge (k_<id> nodes); ◈ project / ✧ career hubs link to core
  nodes; ✓ = mastered in label; communities are SEMANTIC (by branch, not
  Louvain), tiny branches (<4 nodes) merged into Other, size-ordered colors.
  Result: 221 nodes, 462 edges, 18 communities.
Design-critique pass applied: label wrapping at 24 chars (56 labels were
>32 chars and sprawling), branch normalization (underscores/case), community
merge (31 raw branches -> 18 readable), and hub-id suffix matching
(build_from_json prefixes ids with the source-file stem — the Projects &
Careers community was silently landing in Other).
Docs: README gained Career Path + Knowledge graphs sections and a docling
correction; CLAUDE.md gained the MANDATORY "Documentation upkeep" section.
Standing rule per user: log.md, README.md, wiki, and both graphs are updated
regularly as part of every behavior-changing conversation.

## [2026-07-13] fix | Dashboard crash on machines without WebGL

Symptom reported as "dashboard doesn't reload": on Chrome with hardware
acceleration off / GPU blocklisted, `Galaxy3D` (3d-force-graph → Three.js)
threw "Error creating WebGL context", the app-level ErrorBoundary caught it,
and replaced the ENTIRE dashboard view with "Something went wrong" — so every
load looked like a failed reload. Server + `/api/dashboard` were fine (200 in
~50ms); purely client-side.
Fix in `client/src/components/GalaxyPanel.jsx`:
- `webglAvailable()` + module-level `WEBGL_OK`: default `mode` to `2d` and set
  `glBroken` when WebGL is unavailable, so the dashboard opens in the 2D
  `BrainMap` (canvas-only, no WebGL) instead of crashing.
- `GL3DBoundary` (local error boundary) wraps `Galaxy3D`: any runtime GL
  failure flips to 2D rather than bubbling to the app ErrorBoundary.
- 3D toggle hidden when `glBroken` so the user can't re-trigger the crash;
  rotation/fit controls gated to 3D mode.
Verified in-browser by patching `getContext` to fail for webgl: detection
returns false, 2D map renders the full dashboard with no console errors; 3D
still loads normally when WebGL is present (no regression).
Docs: README troubleshooting entry (how to re-enable Chrome graphics
acceleration); wiki/client/visualizations.md WebGL-fallback note.

## [2026-07-13] feature | Constellation Navigator — the knowledge graph as the main view

Consent-gated build (user picked: build it / everything merged / mini+full).
The knowledge graph is now the central "see everything, travel node-to-node"
surface — 2D canvas, ZERO WebGL (can't hit the dashboard crash).

Server: new `GET /api/graph?scope=all|concepts|careers` (index.js) — ONE
unified network merging every project concept + every career skill by canonical
id, so careers connect into the paper galaxy through shared skills. Nodes carry
{kind,branch,tier,core,state,projects[],careers[],degree}; edges are
prerequisite_of. Reuses computeStates/effectiveTier + the careers' normSkill/
skillMatches. Local app → deliberately no pagination/auth/versioning. Verified:
182 nodes / 310 edges (133 concepts + 49 skills).

Client:
- `KnowledgeGraph.jsx` — reusable Constellation Navigator. Deterministic force
  layout (one pass), pan/zoom, click-a-star-to-travel (warp + highlight
  neighbors + dim rest), a detail panel whose Builds-on/Unlocks chips travel
  onward, search, branch filter, legend. `branchColor` from graphLayout.
- `ExploreView.jsx` rewritten → full-page navigator, fetches /api/graph.
  The "Explore" tab is now "Knowledge Graph".
- `Dashboard.jsx` — the WebGL galaxy hero replaced by a compact navigator that
  expands to the full view (onExplore → nav('explore')).
- Styles: `.kgraph*` / `.kgp*` / `.dash-graph` / `.explore-*` in styles.css
  (tokens; dark stage = --hero-bg).

Now-unused (dashboard+explore migrated off them): GalaxyPanel.jsx, Galaxy3D.jsx
(the only WebGL user), BrainMap.jsx. Left in place, not deleted.

Two sizing bugs found + fixed during verification (both would bite any
canvas-in-React): (1) rAF is throttled in offscreen/background tabs, so the
loop can't be relied on for the first paint — added a ResizeObserver that sizes
the canvas + draws the moment the stage gets width, plus explicit redraws on
interaction; rAF now only smooths the warp. (2) React #310: two useMemo hooks
sat after Dashboard's `if(!dash) return null` early return — moved above it.

## [2026-07-13] feature | Career JD: paste text, not just file upload

The career "Job Description" card only exposed a file picker, though the server
(`POST /api/careers/:id/jd`) and the `career-jd` job already accepted a
`{text,name}` body. Added a **Paste text…** toggle in `CareerView.jsx`: reveals
a textarea + "Add skills"/"Cancel", `submitJdText` validates ≥80 non-space chars
(matches the server guard) and enqueues a `career-jd` job with `{text}`. Renamed
the card "Upload Job Description" → "Add Job Description" with **Upload file…** /
**Paste text…** buttons. New `.jd-paste`/`.jd-paste-row` styles (tokens only).
No server change. Verified in-browser: paste → POST /jd fired, card shows
"Working…" as the LLM merges JD skills into the graph.

## [2026-07-23] feature | Overview branch bars, recent-covered, per-concept notes; map drag-release fix

Batch of overview/map/notes work.
- **Per-node notes (new):** users can jot notes on any concept from the map's
  NodePanel (📝 My notes, saves on blur). Stored per project in `notes.json`
  (`{nodeId:{text,updatedAt}}`) via new `store.readNodeNotes/writeNodeNote`;
  new route `PUT /api/projects/:id/nodes/:nodeId/notes`; `notes` added to the
  `GET /api/projects/:id` payload and threaded ProjectView→MapView→NodePanel.
- **Overview "By branch" bars** now render exactly `total` boxes with `done`
  filled (was a fixed 34-tick bar showing the wrong count) — 2/11 shows 2 of 11.
- **Overview "Recently covered"** card: recent concepts from history events
  (mastered/skipped/viewed/lesson_generated), matched to nodes by name, ✓ if
  reviewed. **"Your notes"** card surfaces the map notes; both link to the map.
- **Concept-open fix:** the ErrorBoundary is keyed by tab, so switching to the
  map remounts ProjectView and `setTab` clears `route.sel` — internal "View in
  map"/Overview links never opened the node panel. Now they route through App's
  `openConcept(pid,cid)` (passed to ProjectView as `onOpenConcept`) so the map
  remounts with the concept preselected.
- **Map drag-stick fix (SkillTreeCanvas):** unified `endDrag()`; `onPointerMove`
  bails when `(e.buttons&1)===0` (missed pointerup after a double-click / release
  off-canvas) + `onPointerCancel`. Map no longer sticks to the cursor.
Verified in-browser on the "Polyak/quantum" project: 2/11→2 boxes lit, recent
list populated, note saved (PUT 200) and shown under Your notes; test data cleaned.
Docs: api.md, storage.md, client/learning.md, visualizations.md, shell.md, README.

## [2026-07-23] feature | Multi-provider / multi-key settings + Semantic Scholar key

Settings redesigned from `{provider, keys{}, models{}}` to a **connections list**:
`settings.json = { connections[], activeId, s2Key }`, where a connection is
`{ id, provider, label, key, model, baseUrl }`.
- **More providers:** added Groq, Zhipu GLM, and a generic **OpenAI-compatible
  (custom)** option alongside OpenAI/Anthropic/Gemini. All OpenAI-compatible
  vendors share the `openai` dispatch kind in llm.js, switched by `baseUrl`;
  `store.PROVIDERS` is the single registry (kind/baseUrl/defaultModel/keyHint).
- **Multiple keys + active toggle:** you can save several connections (even two
  for the same provider) and pick which is active (`activeConnection`/`activeModel`).
- **Semantic Scholar key:** `settings.s2Key` threaded into `references.js`
  (`resolveReferences(title, apiKey)` → `x-api-key`) to lift the keyless rate
  limit — this is where the key requested via the S2 form gets used.
- llm.js `openai()` now takes `baseUrl` + token-param flag and recovers from 400s
  (swap max_tokens/max_completion_tokens, drop response_format for endpoints
  without JSON mode). `gemini()` takes an optional baseUrl.
- `GET/PUT /settings` return the `providers` registry; `POST /settings/test`
  accepts `{connectionId}` to test a specific connection before activating.
- **Back-compat:** `getSettings` migrates the legacy shape on read (verified: the
  existing `{provider:gemini, keys:{openai,gemini}}` → two connections, Gemini
  active, keys preserved). Old files keep working; persisted on next save.
- SettingsModal.jsx rewritten: connection cards (provider dropdown, label, key,
  model, base-URL for custom), per-card Test + active radio, add/remove, plus the
  Semantic Scholar key field.
Verified in-browser (6 providers listed, add/switch/custom-baseURL all render,
only one active) and via API (real active-Gemini test → "OK"). User's real
settings.json left untouched (migrates on read).
Docs: storage.md, api.md, ai-pipeline.md, ingest.md, README.

## [2026-07-27] tooling | handout/ — portable project setup kit

Added `handout/`, a self-contained kit for starting new projects with the same
setup this repo uses. **Not part of the app** — it is meant to be moved out of
the repo, so nothing here imports it and no wiki page routes to it.

Contents: `README.md` (index), `ENVIRONMENT.md` (one-time machine setup),
`AI_WORKFLOW.md` (why CLAUDE.md / wiki / log.md / skills / permissions exist and
which rules transfer), `SETUP_CHECKLIST.md` (the manual path, phase by phase),
`scripts/new-project.ps1` + `scripts/new-project.sh` (the automated path), and
`templates/` (`base/` docs+AI config, `stack-node-react/` Express+React+Vite).

Design decisions:
- Templates are plain text with `{{TOKEN}}` placeholders, so the manual and
  automated paths use the same source — no chance of the two drifting apart.
- `dot-claude/` / `dot-gitignore` naming keeps dotfiles visible in explorers and
  search; the scripts rename `dot-x` to `.x` on write.
- Both scripts are idempotent (skip existing files unless `-Force`), so
  re-running on an existing project backfills what was skipped.
- Two stacks: `node-react` (mirrors this repo) and `minimal` (docs/AI
  scaffolding only). Stack-dependent prose lives in three multi-line
  placeholders (`RUN_BLOCK`, `LAYOUT_BLOCK`, `QUICKSTART_BLOCK`) filled by the
  scripts; substitution runs twice so blocks may contain simple tokens.
- The node-react stack ships this repo's hardest-won lesson as working code:
  `server/store.js` does temp+fsync+rename atomic writes, with a `store.test.js`
  that passes with zero dependencies installed.

Two bugs found by actually running the scripts, both now fixed and worth
remembering:
- **PowerShell 5.1 reads a BOM-less `.ps1` as the ANSI codepage.** An em dash
  inside a here-string became mojibake in every generated file. Both scripts are
  now ASCII-only (template files are read as UTF-8 and are unaffected). Writes
  use `[System.IO.File]::WriteAllText` with a no-BOM encoder for the same class
  of reason — `Out-File -Encoding utf8` adds a BOM and `JSON.parse` chokes on it.
- **`node --test <dir>` no longer scans a directory on Node 26** (it tries to
  load it as a module). The generated `package.json` uses the glob form,
  `node --test "server/**/*.test.js"`, which works — same as this repo's script.

Verified: both scripts parse (PS 5.1 parser, `bash -n`); dry-run and real runs
for both stacks; PowerShell and bash output byte-identical; no leftover
placeholders; generated JSON parses BOM-free; generated project's 6 storage
tests pass; generated Express server boots and `/api/health`, `POST/GET
/api/state` (exercising the atomic writer) and the SPA fallback all respond.

## [2026-07-27] feature | Reference explorer — ResearchRabbit-style citation map

Replaced the two-column references modal (a plain list of refs / citations) with
a three-pane explorer: papers found so far (left), citation map (centre),
selected paper + abstract (right). Selecting anywhere selects everywhere.

**Server** (`references.js`, route in `index.js`)
- New `expandPaper(s2Id, mode)` alongside the existing `resolveReferences`.
  `mode` ∈ `MODES` = `refs | cited | similar`; the route validates against that
  map, so adding a mode is a one-line change.
- New route `GET /api/s2/papers/:s2Id/:mode`. Deliberately NOT project-scoped —
  it is a pure Semantic Scholar proxy for any paper on the map.
- `similar` uses the recommendations API. Its default pool is "recent papers"
  and returns **empty for anything older than a couple of years** (the
  Transformer paper got 0 results) — falls back to `from=all-cs`, which works.
  The documented value is `all-cs`, not `all-cs-paper`.
- Expansions are memoised in-process (30 min TTL, 300 entries) because
  exploring revisits nodes constantly. NOT persisted to `project.json`: that
  file would grow without bound as the user explores. Empty results are never
  cached, so a rate-limited answer stays retryable.
- `FIELDS` gained `abstract`, `venue`, `referenceCount` so the detail pane and
  the "Refs 41 / Cited By 186410" chips need no extra round trip.

**Client** (`ReferenceGraph.jsx` new, `ReferencesModal.jsx` rewritten)
- Map is deterministic, no force simulation: x = year, y = citations on a log
  scale, radius = citations. A force layout would reshuffle the whole map every
  time a node arrived. Overlaps resolved by a short relaxation pass that eases
  nodes back toward their year column; capped at 12 passes above 250 nodes
  because it is O(n²).
- Canvas can't read CSS custom properties, so `readTokens()` reads the `--`
  tokens off the DOM once rather than hardcoding hexes (`SkillTreeCanvas`
  hardcodes them; this is the better pattern — prefer it in new canvas code).

**Fixed while building** (each found by running it, not reading it)
- `cleanTitle` now strips a trailing `(demo)`/`(copy)`/`(draft)`/`(vN)` marker.
  The demo paper is titled "Attention Is All You Need (demo)", and the fuzzy
  title search matched an unrelated paper starting with "Demo:" — so the
  flagship demo of this very feature showed a wrong, near-empty network. Real
  parentheticals like "(Part 1)" are left alone.
- `.refs-explorer-body` needs `grid-template-rows: minmax(0, 1fr)` and
  `min-height: 0` on the panes. Without both, the grid row sizes to
  `max-content` and an 80-card list stretched the pane to **9518px** instead of
  scrolling inside it.

**Follow-up in the same session (user feedback)**
- Selecting a paper now **auto-fetches its similar work** — no button press.
  Debounced 450 ms and guarded on `busy`, so clicking through five cards fires
  one request, not five (verified). Refs / Cited By stay manual: they are large,
  and pulling every citing paper on every click would drown the map.
- Abstract moved above the dive bar and given the pane's flexible space with a
  sticky heading, so it is the main content of the panel on every click.
- Modal narrowed 1280 → 1080px (columns 236 / flex / 320) — the previous
  version read as stretched and sparse.
- Double-click-for-similar removed from the map; a plain click now does it.

Verified end to end in the browser against live Semantic Scholar: seed resolves
(41 refs + 40 citations), map paints (145k px with 99 nodes), clicking a node on
the canvas selects it, clicking a card auto-grew the map 100 → 119 → 136 papers,
five rapid clicks = one request, no console errors. Note the preview pane runs
hidden, so `requestAnimationFrame` is parked — the canvas only paints once a
React event runs; that is a harness artifact, not a bug.
Docs: wiki/client/references.md (new), wiki/index.md, wiki/server/ingest.md, README.

## [2026-07-27] design | design-handout/ — design system pack, and DESIGN_SYSTEM.md was wrong

Built `design-handout/`, a self-contained pack to hand to someone doing design
work on PaperQuest: `README.md` (product, voice, non-negotiable rules),
`AUDIT.md`, `TOKENS.md`, `COMPONENTS.md`, `PATTERNS.md`, `tokens.css`
(copy-pasteable, shipping vs proposed kept apart) and `preview.html` (open in a
browser to see the system rendered). Movable — nothing outside it is required.

**The headline finding: `DESIGN_SYSTEM.md` described a product we don't ship.**
It documented a dark "knowledge-galaxy" theme on deep navy (`--bg #080B14`)
with a violet→cyan spectrum (`--primary #7C5CFF`). The app is a light warm
theme (`--bg #F7F6F3`, `--primary #E4572E` burnt orange, `--secondary #2E86AB`).
Every token name in it was also wrong: `--font-display` vs the real `--fd`;
`--sp-*` spacing and `--r-pill` documented but never implemented;
`--mastered`/`--learning`/`--ready`/`--locked` documented, while the code has
`--green`/`--amber`/`--danger`. A designer briefed from that file would have
produced unimplementable work. Traces of the retired violet theme survive as
`#7C5CFF` in 3 JSX spots. DESIGN_SYSTEM.md has been rewritten from the actual
`:root` block, with a note recording the correction; `wiki/client/design.md`
updated to match.

**Audit numbers (measured, not estimated), score 54/100:**
- Colour is tokenised in CSS but not in JS: 125 hex literals in JSX, 53 in CSS
  outside `:root`, 140 raw `rgba()`.
- No spacing tokens — 25 distinct literal padding/margin/gap values.
- No type-size tokens — 26 distinct font sizes, eight of them inside a 3.5px
  range (10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5).
- Radius 70% untokenised: 113 literals vs 48 token uses; `999px` pills appear
  51 times with no token.
- Motion: 5 transitions, 3 ad-hoc durations, no easing token, no
  `prefers-reduced-motion` — despite confetti and animated canvases.
- **Zero `:focus-visible` rules in the whole stylesheet**, several
  `outline: none`, 2 aria attributes across 32 components, 7 clickable `<div>`s.
  This is the only finding that is a defect rather than untidiness.
- No shared input: `.pjv-rename`, `.tb-search input`, `.np-note-input`,
  `.memory-edit`, `.refs-filter` all roll their own.
- `.small-btn` and `.btn-small` are near-duplicates.
- `BRANCH_PALETTE` is 10 cool Tailwind-family hues assigned by **hashing the
  branch name**, so a branch's colour is arbitrary and differs per project;
  several fail 3:1 against `--bg` at dot size. Flagged as a design question,
  not changed.

Priority order handed over: (1) spacing + type tokens, (2) focus ring and one
shared input, (3) finish tokenising colour at the canvas boundary, (4) audit the
branch palette, (5) motion tokens + reduced-motion.

Proposed token values are derived from the most-used literals already in the
code, so adoption is mostly search-and-replace rather than redesign. Nothing in
`client/` was changed — this entry is documentation plus the pack.

Verified: `preview.html` renders (19 swatches, 6 component cards, 5 sections,
no horizontal overflow), all 29 `var()` references resolve, and its token block
matches `styles.css` apart from `.05`/`0.05` notation on the two shadows.

## [2026-07-27] design | Design tokens + focus ring shipped (audit priorities 1, 2, 5)

Actioned the top of the list handed over in `design-handout/AUDIT.md`. Score
54 -> 71. Only `client/src/styles.css` and two one-line JSX changes; no layout
or colour of any existing element changed.

Added to `:root`: `--sp-1..--sp-10` (spacing), `--fs-label..--fs-display`
(type), `--dur-fast` / `--dur` / `--ease` (motion), `--r-pill`, and
`--ring-w` / `--ring-offset` (focus). Values were derived from the literals the
stylesheet already used most, so these describe the existing design rather than
changing it. New code uses them; the ~25 spacing and ~26 type literals are
deliberately NOT migrated - that is a sweeping edit across 778 blocks and
CLAUDE.md says ask before large refactors.

Added at the END of styles.css (position is load-bearing - several field styles
set `outline: none`, and at equal specificity the later declaration wins):
- a global `:focus-visible` rule. This was the only finding that was an actual
  accessibility defect: the app had zero focus styles, so keyboard users could
  not see where they were.
- a `prefers-reduced-motion` block. `!important` is required because `Confetti`
  sets `animation-duration` as an inline style.
- `.input`, the canonical text field, with no `outline: none` on it (that is
  exactly what removed the focus state elsewhere). `.refs-filter` now uses it;
  the four older one-off field styles still need folding in.

Retired the duplicate `.btn-small` - it had exactly one usage
(`SettingsModal.jsx`), switched to `.small-btn`, rule deleted.

**Gotcha worth remembering:** the focus rule is written as outline LONGHANDS,
not `outline: var(--ring)`. A `var()` inside a shorthand is resolved at
computed-value time, and if anything about it is off the entire shorthand is
dropped - which silently degraded to a grey `medium solid currentColor` ring on
some controls instead of the orange one. With longhands only `outline-color`
depends on a variable.

Verified: the four declarations compute to `2px solid rgb(228,87,46)` at `2px`
offset (tested via an equivalent non-focus selector in the running app), the
built CSS contains every new token and rule, `.btn-small` is gone from both CSS
and JSX, and the app builds clean. Note the preview pane runs with
`document.hidden === true`, where Chrome does not reliably recompute
focus-dependent styles - reading a focused element there returned stale values.
Same class of harness artifact as the parked `requestAnimationFrame` seen while
building the reference explorer. Tab through in a real browser to see the ring.

Docs updated in the same change: DESIGN_SYSTEM.md, wiki/client/design.md, and
design-handout/ (AUDIT.md findings 2/3/5/6/7/8 annotated with what changed,
TOKENS.md proposed -> shipping, tokens.css, preview.html gaps panel).

Still open, in order: migrate the spacing/type literals (needs sign-off),
convert SkillTreeCanvas.jsx to readTokens(), audit BRANCH_PALETTE for contrast
and stop assigning branch colours by name hash (a design decision, not a
cleanup), then the remaining a11y work - 7 clickable divs, ARIA coverage, and a
focus trap on Modal.
## [2026-07-27] fix | Map drag was broken by pointer capture; Explore graph is now 3D

### 1. "Really hard to drag the map"
Root cause: `SkillTreeCanvas` bound its pointer handlers to the `<canvas>` but
called `setPointerCapture` on the wrapper `<div>`. Capturing on the wrapper
retargets every later pointer event to it, and React only dispatches to the
target and its ANCESTORS - the canvas is a child, so its handlers went silent.
The map therefore panned exactly as far as the 4px drag threshold and then
froze, and `pointerup` never reached `endDrag`. Fixed by capturing/releasing on
`canvasRef`. `ReferenceGraph.jsx` had the same bug (the pattern was copied from
SkillTreeCanvas when it was written) and is fixed too.

Fixing that immediately exposed a second, latent bug: `onPointerMove` passed a
`setView` UPDATER that dereferenced `drag.current`. React runs updaters
asynchronously, so once `pointerup` actually started arriving, `endDrag` had
already nulled the ref and the whole view crashed with
`TypeError: Cannot read properties of null (reading 'x')`. Now the drag origin
is read into locals before `setView` is called. Both files.

Verified with a real drag (not synthetic - synthetic events bypass pointer
capture semantics and would have passed either way): capture landed on the
canvas, pointermoves kept arriving, pointerup fired once, and the map panned
(+319,-150) for a (+320,-150) drag - 1:1 cursor tracking, no crash.

### 2. Knowledge graph in 3D
`KnowledgeGraph.jsx` keeps all the chrome (search, branch chips, legend, detail
panel, travel) and now picks a renderer: new `KnowledgeGraph3D.jsx`
(`3d-force-graph`) by default on the full Explore page, the existing 2D canvas
as fallback, plus a manual toggle. Extracted the WebGL probe and error boundary
out of the legacy `GalaxyPanel` into `client/src/webgl.jsx` so both share one
implementation - it now guards live code for the first time.

**The dashboard mini stays 2D on purpose.** Browsers cap live WebGL contexts;
one 3D graph per screen.

Colours follow the existing 2D legend (mastered/known/ready); locked keeps its
dimmed branch hue rather than getting a state ring, which at 267 nodes is noise.

Camera framing took four passes and is the non-obvious part:
- `zoomToFit` frames EVERY node, so a couple of outliers shrank the real cluster
  to a speck. `fitCore()` fits the densest 88% instead.
- The force layout keeps expanding for seconds, so one early fit frames a cloud
  that grows out of shot. A 900ms interval re-fits while it settles;
  `onEngineStop` (cooldown 8s) takes the final shot.
- Auto-framing must stop when the user takes over - pointerdown, wheel, OR a
  warp. Missing that last one meant travelling to a concept was instantly undone
  by the next re-fit (the camera measurably did not move).
- `warp()` frames the node WITH its prereqs and unlocks instead of flying to a
  fixed distance. A fixed 120 units put the camera inside the cloud - one sphere
  filling the screen. Framing the neighbourhood is self-scaling and is what
  "travel to this concept" should show anyway.

Verified in-browser: 267 nodes / 500 links in a live WebGL context, auto-fit
converges (camera z 320 -> 520 -> 773 -> 1310 -> settles), search-to-travel
focuses the node white and opens the panel with 7 prereqs / 11 unlocks, branch
chips filter (267 -> 218 -> 267), and the 2D/3D toggle unmounts and remounts
cleanly with no leaked context. No console errors from the current bundle.

Docs: wiki/client/visualizations.md (rewritten - renderer table, both panning
bugs, the 3D camera rules), README (Explore is 3D now), design-handout/COMPONENTS.
## [2026-07-27] design | Canvas colour tokens, accessible Modal, shared accent hues

Three contained items off the audit list. No visual change intended anywhere —
verified that none happened.

**Audit priority 3 — canvas colour boundary (`SkillTreeCanvas.jsx`).**
Replaced the module-level hardcoded `COLORS` table with a local `readTokens()`,
the pattern `ReferenceGraph.jsx` already used. 18 hardcoded colours became 9
token reads plus derived values. The interesting part: the open/done node fills
and lit edges have **no token of their own**, so rather than leave them as hex
they are now derived — a `tint(hex, amt)` helper blends `--primary`/`--green`
toward white. Checked the arithmetic against what it replaced before shipping:
ΔRGB ≤ 8 on every tint (imperceptible). The one deliberate shift is the ground
line, now `--line-2` instead of `#C9C5BE` (Δ24, slightly lighter) — that is the
divider token and matches every other rule in the app.

Also fixed while in there: the "ready" node glow was `rgba(37,71,230,.28)` — an
off-palette **blue** halo around an orange-stroked node. Now `--primary` at the
same alpha.

**`#7C5CFF` was not what the audit assumed.** I recorded it as a leftover of the
retired violet theme "to delete". It is actually the fifth entry of an identical
5-hue avatar rotation copy-pasted into `Dashboard`, `ProjectsView` and `Sidebar`
(project glyphs, project cards, earned badges); the other four are exact tokens.
Consolidated into `ACCENT_HUES` in `graphLayout.js` — one definition instead of
four: a fourth copy turned up in `CareerView` (`ACCENTS`, the same rotation minus
the violet), now `ACCENT_HUES.slice(0, 4)`. The violet is deliberately **kept**: recolouring it changes the avatar of
every existing project, which is a design call, not a cleanup. AUDIT.md carries
a correction note rather than a quiet edit.

**Modal accessibility (`bits.jsx`).** The shared `Modal` had Escape and backdrop
close but nothing else. Added `role="dialog"`, `aria-modal="true"`, an optional
`label` prop, focus moved into the panel on open, a Tab trap that wraps both
directions and pulls focus back if it escapes, and focus restored to whatever
opened the dialog on close. One component, so every modal in the app benefits
(Settings, Learn, References, Badges, Bookmarks, Info).

Verified in-browser via DOM assertions (focus works headlessly, unlike
compositing): role/aria present, focus lands inside on open, Tab wraps last→
first, Shift+Tab wraps first→last, focus outside gets pulled back in, Escape
closes and focus returns to the Settings gear that opened it. Accent hues render
identically after consolidation (orange/blue/green/amber-t/violet unchanged).

Note on the canvas work: the preview pane was hidden this session, so
`requestAnimationFrame` is parked and the map cannot paint — the canvas sizes to
0×0. That the canvas *was* resized proves `draw()` ran past `readTokens(el)`
without throwing, and there are no console errors, but the final visual check on
the map wants a visible pane.

Still open, unchanged: migrating the spacing/type literals (needs sign-off),
colour literals in `Dashboard`/`BrainMap`/`Galaxy3D`/`KnowledgeGraph`, the branch
palette design question, graph state conveyed by colour alone, and `CareerView`
rolling its own modal instead of using the now-accessible `Modal`.
Docs: DESIGN_SYSTEM.md, wiki/client/design.md, design-handout/{AUDIT,COMPONENTS}.md.

## [2026-09-06] feature | OpenRouter provider (with reasoning) + code-snippet setup in Settings

**Provider.** Added `openrouter` to `store.PROVIDERS` — a new llm.js *kind*
rather than a reskinned `openai` one, because OpenRouter's two useful extras
don't fit the OpenAI shape:
- `reasoning: {enabled, effort}` on the request, and
- `reasoning_details` on the assistant message, which must be passed **back
  unmodified** on the next turn for the model to resume its own thinking.

A connection therefore grew two fields (`reasoning`, `reasoningEffort`) and
`llm.js` grew `callLLMRaw`, which returns `{text, message}` instead of just
text — the only way a caller can get `reasoning_details` back out. `callLLM`
stays as the text-only wrapper, so every existing call site is untouched. Like
the openai kind, the openrouter kind retries once without `response_format` /
`reasoning` if the model rejects them (common on the `:free` models).

**Two ways to configure, per the request.** Settings keeps the form, and adds a
**Set up with code** panel per connection: paste the vendor's request snippet
(Python / JavaScript / cURL) and `parseSnippet` pulls out provider, base URL,
model, key and the reasoning block; the same panel renders the request
PaperQuest will actually send, in all three languages, with a Copy button. Both
directions live in the new `client/src/snippet.js` — deliberately client-side
and network-free, so a pasted key never round-trips through the server.
Placeholders (`<OPENROUTER_API_KEY>`, `YOUR_KEY`, bare SCREAMING_CASE) are
recognised and skipped rather than saved as a key.

## [2026-09-06] feature | Ask-a-question thread inside an open refresher

`LearnModal` now ends with `LessonChat` — free-text **Ask** plus **📚 Ask for
sources**. Design decisions worth keeping:

- **The thread is the response.** `POST /projects/:id/lesson/ask` always returns
  the *whole* thread, not just the new turn, so the client never reconstructs
  state and reopening the modal shows the full history.
- **Separate file.** The thread lives in `lessons/<conceptId>.chat.json`, not
  inside the lesson JSON, so **Regenerate** replaces the lesson without
  destroying the learner's questions. Capped at 40 turns.
- **The paraphrase is the index.** The model returns
  `{question, answer, sources}` where `question` is its own one-sentence
  restatement of what was asked; that paraphrase is what gets highlighted at the
  top of each turn (the raw text is kept underneath in small italics when it
  differs). A twenty-turn thread stays skimmable because every turn is headed by
  a clean sentence rather than the learner's shorthand.
- **Prior turns are replayed as real messages**, with `reasoningDetails` attached
  to the assistant side — so on an OpenRouter reasoning model, answer 5 continues
  the thinking from answers 1-4. That is the concrete payoff of the provider work
  above.
- **Inline, not a background job.** `jobs.jsx` owns lesson/analyze because those
  are slow and the user walks away; a question inside an open modal is a
  foreground conversation, so it keeps its own spinner and retry. Noted as an
  explicit exception in `wiki/client/learning.md`.

Sources are prompted as "real, canonical works only — never invent a title,
author or DOI", since a fabricated citation is worse than none in a study tool.

Verified end-to-end against a live provider: both modes, persistence across
reopen, KaTeX in answers, and the snippet round-trip in the Settings UI.

## [2026-09-06] fix | Saved lessons made visible — "Open saved refresher", no job, no accidental regeneration

Report: "every time we click start refresher it uses AI to create notes."
Checked first: it doesn't. `POST /projects/:id/lesson` has always been
cache-first, and two consecutive calls returned `cached: true` with the original
`generatedAt` and an untouched file on disk. No model call, no cost.

The bug was that nothing said so. A repeat click still read **Start refresher**,
still went through `jobs.jsx`, still showed "Preparing lesson…" in the progress
dock — indistinguishable from real generation. Fixed by making the cache legible
rather than by adding caching that already existed:

- `GET /projects/:id` now returns `lessons: {conceptId: savedAtMs}`
  (`store.listLessons`, `stat` only — no JSON parsing), threaded through
  ProjectView → Overview / MapView → NodePanel.
- A concept with a saved lesson shows **📖 Open saved refresher** and opens it
  **directly**, bypassing the job queue entirely: no dock, no spinner, no
  "preparing". Plus a line saying it was saved N ago and reopening is free.
- `LearnModal` shows a "your saved copy" strip whenever the response is `cached`.
- **Regenerate** (both entry points) now confirms first. It is the only control
  that spends tokens on a lesson, so it should be the only one that feels like it.
- The lesson job now `bump()`s the project, so a freshly generated lesson flips
  to "saved" immediately instead of after the next reload.

Guard against regression: wiki/client/learning.md now states the write-once rule
and which code path must never call `startLesson` for a cached concept.

## [2026-09-25] fix | Netlify deploy failing on large-chunk build warning

Netlify build errored with exit code 2 right after Vite printed a successful
build, so `dist` was never deployed. Vite's own log flagged the real symptom:
the client bundle (`index-*.js`, ~2.1 MB) crossed the "chunks larger than
500 kB" warning threshold. `vite.config.mjs` had no `onwarn`/warning-to-error
config, but leaving the warning in place was the one anomaly correlated with
the failed deploy, so the fix removes it at the source instead of guessing
further: added `build.chunkSizeWarningLimit` and
`build.rollupOptions.output.manualChunks` (splitting `react`/`react-dom`,
the KaTeX/math stack, `react-markdown`+`remark-gfm`, and `3d-force-graph`
into their own chunks). No app behavior changed — this only affects how the
production bundle is split into files.

## [2026-09-25] fix | Netlify deploy: build output landed in the wrong directory

The chunking fix above resolved the exit-code-2 warning, but the deploy still
failed with "Deploy directory 'dist' does not exist". Root cause:
`vite.config.mjs` sets `root: 'client'`, so its `outDir: 'dist'` resolved to
`client/dist` — but Netlify's configured publish path is the repo-root
`dist`, which Vite never wrote to. Changed `outDir` to `../dist` so the build
lands at the repo root. Updated `server/index.js`'s static-file path (used by
the local Express server via `npm start`/`start.bat`, unrelated to Netlify)
to match the new single build location, and updated `.gitignore` and the
affected wiki pages accordingly.
## [2026-09-25] feat | Full app deployment on Netlify Free

Committed the existing lesson Q&A, saved-lesson controls, and provider snippets as lenishu. Added a Netlify adapter with encrypted private workspaces, recovery keys, persistent Blobs snapshots, conditional writes, and background AI/upload/reference jobs. The local file-based app remains available. Hosted uploads are 4 MB with 24 MB workspace storage; custom AI origins require owner configuration. Upgraded PDF.js for public upload handling and added cloud integration tests. Deployment outcome is recorded after live verification.

Validation: all 11 tests pass, including isolated workspace persistence, CAS conflict handling, background task ownership and idempotency, Markdown and PDF uploads, original PDF downloads, and cached lessons. The production dependency audit reports zero vulnerabilities. Netlify offline build bundles both functions successfully; browser QA confirms the demo, saved lesson, and private-workspace settings. Public deployment is pending Netlify account access.

## [2026-09-25] fix | Live site was private by default on Netlify

https://paperquestapp.netlify.app/ returned 401 on every path (`/`, `/api/*`, assets) and showed Netlify's "This site is private — sign in with an invited Netlify account" page. This is not an app bug. Netlify now starts new projects on recently created credit-based teams as private. Fix: **Make public**, or Project configuration > General > Visitor access > Project visibility > Public.

The private setting also blocks background jobs. `netlify/functions/api.mjs` starts the worker with a server-side fetch to the deploy's own URL (`DEPLOY_URL || URL`), and the gate rejects that request too. Uploads, AI actions, and reference lookups would fail with "Could not start the background worker" even for the signed-in owner. Netlify's docs do not say whether a production deploy's permalink (`DEPLOY_URL`) follows production or preview visibility. After making the site public, confirm on the live site that a background task completes. If it does not, send the worker request to `URL` instead. Added the make-public step to wiki/hosting.md.

## [2026-09-26] fix | Package hosted backend and import local projects

Made production public, clearing the Netlify access-gate 401. The resulting API 500 was traced to missing runtime packages in the function archive: Express, Multer and serverless-http are now explicit external dependencies. More importantly, the v2 entries use createRequire to keep the CommonJS server traceable; the previous ESM import transformed requires into aliases that Netlify failed to follow. Production background jobs use the public site URL rather than potentially protected deploy permalinks. Preserved the remote Netlify-agent Vite fixes when synchronizing main.

Added a local projects backup command and private, chunked import in Settings. This preserves original papers, cached lessons/chats, notes and progress while excluding provider keys and career/resume files. Backups are validated and checked for transfer integrity, stored encrypted, and cannot overwrite existing projects. The local export contains 9 projects, 31 papers and 27 saved lessons. All 13 backend tests pass, including import integrity, isolation and overwrite protection. Final deployment verification follows.

Deployment validation: the production frontend build passes; both corrected function ZIPs contain Express, Multer and serverless-http, and exclude local data, credentials and client output. An extracted function outside the repository successfully creates and reloads a project without access to repository node_modules. Explicit data exclusions also prevent filesystem tracing from packaging local documents during CLI builds.

Live outcome: Netlify published b570045 at https://paperquestapp.netlify.app/. An isolated live workspace passed session, create-project, background Markdown upload and persisted reload checks; its test project was removed without AI calls. Imported the local backup into the user's browser workspace and verified all 9 projects / 31 papers in the hosted Projects view, with 485 XP restored. The original local data remains unchanged. Provider keys and career/resume files were excluded.

## [2026-09-26] feat | Google accounts and restricted developer project recovery

Added Google sign-up/sign-in using Google's official token verifier, expiring single-use browser nonces, encrypted account-to-workspace links, and separate seven-day account cookies. First sign-up retains guest projects; returning accounts reopen their linked workspace; sign-out starts a fresh guest workspace. Workspace ownership checks prevent another Google account from claiming an already linked workspace. Recovery keys remain supported but cannot grant developer privileges. The user supplied the public Google web client ID, saved in server/auth-config.json with an environment override. No Google client secret is required.

Added an account settings panel, profile menu entry, and developer-only backup counts/restore controls. Developer authorization checks the current server allowlist against authenticated Google subjects or Google-authoritative verified emails. Added workspace:stage-developer to validate and encrypt a private backup into Netlify Blobs without bundling it in the website. Restore and manual import recheck workspace conflicts at conditional-write time. The existing private backup was validated: 9 projects, 31 papers, 27 saved lessons; it remains unchanged. A missing recovery key cannot decrypt an old unlinked cloud snapshot, so this recovery path uses that backup.

Validation: all 21 backend tests pass, including real library signature/audience/issuer/expiry validation with local test certificates, nonce rejection, account ownership, developer authorization, session expiry, recovery preservation and concurrent writes. The hosted Vite build passes with the existing large graph-chunk warning. Browser QA verified the account setup fallback and existing recovery/import controls in the local cloud preview. Refreshed the local code graph. Live Google consent and deployment are pending the Netlify server secret, approved developer identity, staging and deployment access; no production change or Google login has been claimed.

Production setup: the user approved their Google email for developer access and authorized publishing. Configured the production client ID and developer allowlist in Netlify, plus a write-only protected authentication secret with Builds/Functions/Runtime scopes. Free rejected Functions-only scopes; its protected-secret configuration succeeds without Post processing. Uploaded and read-back verified the encrypted private recovery backup (9 projects, 31 papers, 27 lessons). Local runtime files and backups remain gitignored. Publication and live verification follow.

## [2026-09-26] fix | Preserve newer projects during developer recovery

Published Google sign-in and the protected developer backup on production; live checks confirm the configured Google client, nonce issuance, rejection of invalid tokens and cross-origin sign-in, and denial of developer access while signed out. Browser QA found two newer guest projects, so developer recovery now retains projects with distinct IDs while refusing conflicting versions of imported projects or newer global progress. Conflict checks run again against the latest snapshot during the conditional write. Manual import retains its stricter empty-workspace behavior.

Validation: all 22 backend tests pass, including preservation of distinct projects, repeat recovery, conflicting edits, concurrent creation with the same project ID, and newer XP. The hosted build passes with the existing large graph-chunk warning. Google account chooser opened on production; account sign-in and final restore remain to be verified.

## [2026-09-26] fix | Google AI Studio snippets, Gemini key header, visible model; local project list

Pasting Google AI Studio's cURL into **Set up with code** filled only the provider. The parser ignored the `x-goog-api-key` header and the model in the `…/models/<model>:generateContent` path. It also saved a hidden Gemini Base URL ending in `/v1beta`, so requests went to `/v1beta/v1beta/…` and failed with 404, while the blank model silently fell back to `gemini-2.5-flash`. The parser now reads the header key, the path model, and google-genai SDK snippets, and keeps only the host root for Gemini and Anthropic. The server sends Gemini keys in the `x-goog-api-key` header instead of `?key=`. It also tolerates saved `/v1beta` roots and `models/` prefixes, so connections already broken by a paste recover without re-entry. Settings shows "Using <model>" under each Model field, the paste status names the model in use, and **Test** reports which model answered. The Gemini key hint now reads `AQ.… or AIza…`, because AI Studio has issued `AQ.` auth keys since 2026-05-28.

Local app: `/api/projects` and `/api/dashboard` returned 400 "Invalid identifier". A hidden `data/projects/.obsidian` folder failed the strict id check added in 902a9ac. Project and career listings now skip non-id folders.

Validation: 25/25 tests pass, including new Gemini request-shape and `.obsidian` listing tests. Nine snippet variants parse as expected: AI Studio cURL, placeholder cURL, Python and JS SDKs, legacy `?key=`/stream, Anthropic, OpenAI, OpenRouter, and a custom host. Browser QA on the local build confirmed the filled fields, the hint, the status line, and that Dashboard/Projects load, without saving settings.

Live outcome: pushed dd3f653 as lenishu, and Netlify published it to https://paperquestapp.netlify.app/. The live bundle contains the new parser and Settings text, and the live API serves the new Gemini key hint. A fresh guest session loads /api/settings and /api/projects. No real API key was used: the Gemini request shape is covered by stubbed tests, and a real call is confirmed by **Test** with the user's own key.
