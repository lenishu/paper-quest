# PaperQuest Code Wiki — index

Task router for AI sessions. Read this page, pick the row that matches the task,
read that ONE page, then open only the files it names. Do not scan the repo.

| Task ("I need to change…") | Read | Files you will touch |
|---|---|---|
| Vercel or Netlify deployment, Google accounts, developer recovery, hosted background jobs, local project import | [hosting-vercel.md](hosting-vercel.md) (Vercel + Neon, current), [hosting.md](hosting.md) (shared parts, Netlify) | `vercel.json`, `api/index.mjs`, `server/pgStore.js`, `netlify.toml`, `netlify/functions/`, `server/cloud.js`, `server/auth.js`, `server/backup.js`, `server/workspace.js`, `scripts/export-workspace.js`, `scripts/stage-developer-backup.js`, `client/src/api.js`, `WorkspaceSettings.jsx`, `AccountSettings.jsx` |
| An API endpoint (add/modify/fix a route) | [server/api.md](server/api.md) | `server/index.js` |
| Concept-graph extraction, merge, repair, tiers, XP math | [server/ai-pipeline.md](server/ai-pipeline.md) | `server/prompts.js`, `server/graphUtil.js`, analyze route in `server/index.js` |
| LLM providers, timeouts, JSON parsing of model output | [server/ai-pipeline.md](server/ai-pipeline.md) | `server/llm.js` |
| Prompts, persona, lesson content quality | [server/ai-pipeline.md](server/ai-pipeline.md) | `server/prompts.js` |
| PDF→Markdown conversion, upload handling, reference lookup | [server/ingest.md](server/ingest.md) | `server/pdfToMd.js`, `server/references.js`, upload route in `server/index.js` |
| Reference explorer — citation map, similar papers, expansion | [client/references.md](client/references.md) | `ReferencesModal.jsx`, `ReferenceGraph.jsx`, `server/references.js`, `/api/s2/*` routes |
| Storage, data files, settings, mastery, events, undo | [server/storage.md](server/storage.md) | `server/store.js` |
| SPA navigation, views, deep links, modals, toasts | [client/shell.md](client/shell.md) | `client/src/App.jsx`, `TopBar.jsx`, `Sidebar.jsx` |
| Settings UI — connections, reasoning toggle, code-snippet import/export | [client/shell.md](client/shell.md) | `SettingsModal.jsx`, `client/src/snippet.js` |
| Knowledge graph navigator, skill-tree map, node colors/layout | [client/visualizations.md](client/visualizations.md) | `KnowledgeGraph.jsx`, `SkillTreeCanvas.jsx`, `graphLayout.js` (+ legacy `Galaxy3D/BrainMap/GalaxyPanel.jsx`), `/api/graph` |
| Lessons, quizzes, lesson Q&A, completing concepts, XP, background jobs | [client/learning.md](client/learning.md) | `LearnModal.jsx`, `LessonChat.jsx`, `NodePanel.jsx`, `jobs.jsx`, `/api/complete`, `/api/projects/:id/lesson/ask` |
| Visual style, tokens, shared UI bits | [client/design.md](client/design.md) | `client/src/styles.css`, `bits.jsx` + DESIGN_SYSTEM.md |
| Whole-system understanding / cross-cutting change | [architecture.md](architecture.md) | starts there, then per-page |

| Career Path (careers, resume, JD, skill match) | [career.md](career.md) | `CareerView.jsx`, career routes in `server/index.js`, `server/prompts.js` |

## Do-not-edit list (legacy, zero importers)
`client/src/components/SkillTree.jsx`, `Home.jsx`, `HomeDashboard.jsx`,
`TopNav.jsx`, `ProjectTools.jsx` — not imported anywhere. Editing them changes
nothing. If a task seems to point here, the live equivalent is:
SkillTree→`SkillTreeCanvas.jsx`, Home/HomeDashboard→`Dashboard.jsx`,
TopNav→`TopBar.jsx`, ProjectTools→`ProjectView.jsx`.

## Maintenance rules
- When a change alters what a page describes (new route, new file, moved
  responsibility), update that page **in the same change**. Small pages, no prose.
- No line numbers in wiki pages — reference function/route names (they survive edits).
- New source file ⇒ add it to the matching page's file list and, if it creates a
  new concern, add a row to the table above.
