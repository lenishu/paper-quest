# server/index.js — API routes

One file, all routes, mounted helpers at top. Async handlers are wrapped with
`wrap()` (promise → `next(err)`); throw `httpError(status, msg)` (from `llm.js`)
for clean 4xx/5xx. Static: serves `client/dist` (Vite build output) with SPA fallback; `GET /dc` redirects to `/` (legacy dashboard retired, HTML kept in `archive/`).

## Route groups (all under /api)

Netlify wraps these routes with private-workspace sessions and background jobs.
`/session`, `/session/recovery`, `/session/restore`, and `/jobs/:id` are handled
by `server/cloud.js`, not Express. See [hosting.md](../hosting.md). Express is
exported for the adapter and listens on a port only when run directly.

**Health & settings** — `GET /health`; `GET|PUT /settings` (settings =
`{connections[], activeId, s2Key}`; response also carries the `providers`
registry for the UI — see [storage.md](storage.md)); `POST /settings/test`
(one-token LLM ping; optional `{connectionId}` tests a specific connection
before activating it, else the active one).

**Projects** — `GET|POST /projects`; `POST /projects/demo` (seeds from
`demo.js`, no API key needed); `GET|PATCH|DELETE /projects/:id`.
`GET /projects/:id` returns project + computed `states` (via
`computeStates`) + mastery + bookmarks + `notes` (per-node user notes map) —
the SPA's main project fetch.

**Papers** — `POST /projects/:id/papers` (multer upload, ext+size validated →
see [ingest.md](ingest.md)); `POST …/papers/:paperId/analyze` (the graph
pipeline → see [ai-pipeline.md](ai-pipeline.md));
`GET …/markdown`; `GET …/pdf` (raw file for PaperReader);
`PUT …/notes`; `DELETE` paper; `GET …/references` (Semantic Scholar, cached in
`paper.refsCache`, `?refresh` bypasses).

**Learning** — `POST /projects/:id/lesson` (cache-first, `regenerate` flag;
response carries the concept's Q&A `chat` and `cached: true|false`). A lesson is
written by the model ONCE and served from `lessons/<conceptId>.json` forever
after — only `regenerate: true` spends tokens. `GET /projects/:id` reports which
concepts already have one as `lessons: { conceptId: savedAtMs }`
(`store.listLessons`, stat-only), which is what lets the UI open a saved lesson
without going near the model;
`POST /complete` (marks mastery globally, awards XP via `xpForNode`).

**Lesson Q&A** — `POST /projects/:id/lesson/ask` `{conceptId, question, mode}`
where mode is `ask` | `source`; replays the stored thread to the model
(`lessonAskMessages`) and always returns the WHOLE thread plus the new `entry`.
Requires a cached lesson. `GET|DELETE /projects/:id/lesson/chat?conceptId=`
read/clear it. Logs a `lesson_question` event.

**Node notes** — `PUT /projects/:id/nodes/:nodeId/notes` (`{text}`) saves the
user's own note on a concept to `notes.json` (empty text deletes it); returned
in the `GET /projects/:id` payload as `notes`. Surfaced in NodePanel (editor)
and Overview ("Your notes") — see [../client/learning.md](../client/learning.md).

**Memory / history / undo** — `GET|PUT /projects/:id/memory` (project.md
free-text the analyze prompt consumes, seeded by `memorySeed()`);
`GET …/history`; `POST …/events` (whitelist `CLIENT_EVENTS`: concept_viewed,
paper_previewed, chat_message); `POST …/undo` (restores `nodes.prev.json`
snapshot); `GET …/export.txt`.

**Global reads** — `GET /profile`, `GET /bookmarks` (+ per-project
`POST …/bookmarks/toggle`), `GET /overview`, `GET /brain` (cross-project
concept graph, legacy galaxy), `GET /dashboard` (the SPA's big aggregate:
galaxy, knowledge counts, heat, recent, branches, quests, streak, badges),
`GET /graph?scope=all|concepts|careers` (the UNIFIED knowledge graph powering
the Constellation Navigator — every concept + every career skill merged by
canonical id; nodes {kind,branch,tier,core,state,projects[],careers[],degree},
edges prerequisite_of. See [../client/visualizations.md](../client/visualizations.md)).

**Quests** — `GET /quests`, `POST /quest/claim`; state built by
`computeQuestState()` with `QUEST_XP` / `QUEST_GOALS`, day-keyed by `localDayKey`.

**Careers** — global career-path feature: `GET|POST /careers`, `GET|PATCH|DELETE /careers/:id`, `POST /careers/:id/generate`, `POST /careers/resume`, `POST /careers/:id/jd`. See [../career.md](../career.md).

## Local helpers worth knowing
`masteredIdSet()` (global mastery as a Set), `projectSummary()` (list-view
shape), `graphDiff(prev,next)` (added/removed for history), `memorySeed(p)`.

## When adding a route
Follow the `wrap(async …)` pattern, read/write ONLY via `store.*`, log
meaningful actions with `store.logEvent`/`logAudit`, and add the route to the
group list above.
