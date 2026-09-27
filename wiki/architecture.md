# System map

Local single-user web app. Node/Express server (`server/`, no build step) +
React SPA (`client/src`, Vite). Storage is flat files under `data/`
(gitignored) — no database. (`/dc` legacy dashboard retired → redirects to `/`.)

```
Browser SPA (dist ← Vite build)
        │  fetch /api/*
        ▼
server/index.js  ── all routes, one file ──────────────────────
   │        │            │             │              │
 store.js  llm.js     prompts.js   pdfToMd.js    references.js
 (data/)   (OpenAI/   (all LLM     (docling →    (Semantic
           Anthropic/  prompts +    pdf.js        Scholar)
           Gemini)     persona)     fallback)
   │
 graphUtil.js (sanitize / repair / tiers / states / XP — pure functions, has tests)
```

## The two flows that matter

**Ingest+analyze** (client `jobs.jsx` drives it as one background job):
upload file → `POST /projects/:id/papers` (multer → `pdfToMd` if PDF → save .md)
→ `POST …/papers/:paperId/analyze` → prompts (`conceptExtractionMessages` for a
first paper, `conceptMergeMessages` when the project already has nodes) →
`callLLM` → `parseModelJSON` → `sanitizeGraph` → retry once if `isDegenerate` →
`repairGraph` backstop → `computeDepths` → save project + `saveNodesSnapshot`
(enables `POST /undo`).

**Learn**: click node → `NodePanel` → jobs `startLesson` → `POST /projects/:id/lesson`
(cached in `data/projects/<id>/lessons/`, `regenerate` bypasses) → `LearnModal`
renders lesson + quiz → `POST /api/complete` → global `mastery.json` + XP in
`profile.json` → dashboard/quests recompute.

## Global vs per-project
Mastery, XP, profile, bookmarks, settings are **global** (`data/*.json`).
Papers, nodes, lessons, events, memory are **per-project**
(`data/projects/<id>/`). Concepts are per-project nodes; only mastery links
them across projects (by node id).

## Ground rules (from CLAUDE.md — repeated because they bite)
- All `data/` writes go through `store.writeJSON` (atomic temp+fsync+rename). Never bypass.
- Never hardcode colors/fonts/radii — use `--` tokens from `styles.css`.
- All client-triggered LLM work goes through `jobs.jsx`, never a bare fetch.
