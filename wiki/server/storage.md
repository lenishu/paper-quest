# server/store.js — storage layer

File-based storage under `data/` (gitignored). **Every** JSON write must go
through `writeJSON` — it is atomic (temp file + fsync + rename). On Windows the
rename retries for up to ~1.5 s on EPERM/EBUSY/EACCES (`renameWithRetry`):
antivirus and the indexer briefly lock just-written files, which used to fail
saves and tests intermittently. Non-atomic
writes corrupted `project.json` in the past; never reintroduce them.
`readJSON` tolerates trailing garbage from historic corruption.

In hosted mode (`PAPERQUEST_HOSTED`), `workspace.dataDir()` selects a request-local temporary directory.
`cloud.js` hydrates/persists encrypted snapshots in the host store (Postgres via
`server/pgStore.js` on Vercel, Netlify Blobs on Netlify); the local
`data/` directory is never used or deployed. See [hosting.md](../hosting.md).

## data/ layout
```
data/
  settings.json     { connections[], activeId, s2Key } — see "Settings model" below
  mastery.json      GLOBAL mastered concept ids (cross-project)
  profile.json      GLOBAL XP / level / streak
  bookmarks.json    GLOBAL bookmarks
  onboarding.json   guided-tour progress { step, dismissed, completed, projectId, careerId }
  projects/<id>/
    project.json    { kind, papers[], nodes[] } — the core document (kind: paper |
                    class | course | club | hackathon | notes; old projects read as paper)
    papers/*.md     converted markdown (+ optional raw .pdf kept for reader)
    papers/<id>.summary.json   saved AI summary { markdown, generatedAt }
    cheatsheet.json saved AI cheatsheet { markdown, generatedAt, concepts }
    lessons/<conceptId>.json        cached lessons
    lessons/<conceptId>.chat.json   follow-up Q&A thread for that lesson (separate
                                    file so regenerating the lesson keeps it)
    events.jsonl    append-only user/system events (readLines)
    audit.jsonl     append-only audit (LLM calls etc.)
    project.md      free-text "memory" fed to analyze prompts
    notes.json      { nodeId: { text, updatedAt } } — user's own notes per concept
    nodes.prev.json snapshot before last analyze — powers POST /undo
  careers/<id>/       career-path feature: career.json + per-career resume.md/.pdf + jds/ (see wiki/career.md)
  careers/suggestions.json   last AI career suggestions
```

## Exports (grouped)
- lifecycle: `init`, `id()`, `SCHEMA_VERSION`
- settings/profile: `getSettings/saveSettings/activeModel/activeConnection`,
  `PROVIDERS/providerMeta/DEFAULT_MODELS`,
  `getProfile/saveProfile`, `getMastery/saveMastery`, `getBookmarks/saveBookmarks`
- projects: `listProjects/getProject/saveProject/createProject/deleteProject`.
  `listProjects` and `listCareers` skip folders whose names are not valid ids
  (such as an editor's hidden `.obsidian`), so one stray folder can't fail the
  whole list with "Invalid identifier".
- kinds: `PROJECT_KINDS`, `projectKind(kind)` (unknown → paper); `createProject(name, kind)`
- study docs: `readPaperSummary/savePaperSummary`, `readCheatsheet/saveCheatsheet`
- tour & careers: `getOnboarding/saveOnboarding`, `readCareerSuggestions/saveCareerSuggestions`
- papers/lessons: `savePaperFiles/readPaperMarkdown/deletePaperFiles/paperRawPath`,
  `readLesson/saveLesson`, `listLessons(pid)` → `{conceptId: mtimeMs}` (stat-only,
  powers the "saved" UI), `readLessonChat/saveLessonChat/clearLessonChat`
  (thread capped at MAX_CHAT_TURNS = 40, oldest dropped)
- logs/undo/memory: `logEvent/readEvents`, `logAudit/readAudit`,
  `saveNodesSnapshot/readNodesSnapshot`, `readMemory/writeMemory`
- node notes: `readNodeNotes(pid)` / `writeNodeNote(pid, nodeId, text)` (empty text deletes; caps 4000 chars)

## Settings model (multi-provider, multi-key)
`settings.json` = `{ connections[], activeId, s2Key }`. A **connection** is one
saved credential: `{ id, provider, label, key, model, baseUrl, reasoning,
reasoningEffort }`. `reasoning` asks the provider to think before answering
(only the `openrouter` kind sends it today); `reasoningEffort` is `''|low|medium|high`.
Multiple
connections are allowed — even several for the same provider — and `activeId`
picks the one used for LLM calls (`activeConnection`/`activeModel`). `s2Key` is
the Semantic Scholar API key (used by `references.js`). `PROVIDERS` is the
registry (gemini, anthropic, openai, groq, glm, openrouter, openai_compatible)
with `{name, kind, baseUrl, defaultModel, keyHint, getKey}` plus `reasoning: true`
on providers that accept a reasoning block; `kind` drives llm.js dispatch. **Back-compat:** `getSettings` transparently migrates the legacy
`{provider, keys{}, models{}}` shape to connections on read (persisted on next
save), so old `settings.json` files keep working. `sanitizeConnection` preserves
client-provided ids so the Settings UI can save-then-test a specific connection.

**Shared key:** when `PAPERQUEST_SHARED_GEMINI_KEYS` is set (`sharedGeminiKeys()`),
`getSettings` puts a keyless virtual connection `{ id: 'shared-gemini', shared:
true, provider: 'gemini' }` first. It is active for a new workspace and stays
active until the user activates one of their own connections **that has a key**.
`saveSettings` never stores it (it strips `shared`/`shared-gemini` entries) but
keeps `activeId: 'shared-gemini'`. The keys themselves live only in the server
environment; llm.js cycles through them.

## Node shape (the data model's core)
`{ id, name, level (0=baseline), core, tier (novice|intermediate|advanced),
branch, blurb, prereqs[], usage{paperId: text}, sources[], depth }` —
produced/repaired by `graphUtil.js`, stored in `project.json.nodes`.

## When changing storage
New persistent thing? Add a `store.js` accessor pair (read/save) using
`readJSON/writeJSON`; never `fs` calls from `index.js`. Update the layout tree
above and CLAUDE.md's data/ line.
