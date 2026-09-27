# Learning flow — lessons, quizzes, XP, background jobs

## jobs.jsx — the background queue (ALL LLM actions go through it)
`JobsProvider` wraps the app; `useJobs()` gives:
- `enqueue(projectId, files)` — upload jobs: POST papers → POST analyze,
  sequential single-pump queue, statuses queued→converting→analyzing→done/error
- `startLesson(projectId, node)` — lesson jobs: POST /lesson
- `lessonState(pid, cid)` / `clearLesson` — per-concept status the UI reads
  to render spinners and the failure step-up (Retry / Open settings on the
  trigger button)
- `completions[projectId]` — counter bumped when a job finishes; ProjectView
  watches it to refetch
- `JobsIndicator` — the progress dock (bottom), per-job card with dismiss
**Rule:** never call the lesson/analyze endpoints with a bare fetch from a
component; enqueue a job so progress + failure UX stay consistent.

## LearnModal.jsx
Renders the lesson (sections + `MathText`/`normalizeMath` for math) then the
quiz; on pass → `POST /api/complete {projectId, conceptId}` → server marks
GLOBAL mastery + awards XP (`xpForNode`; `skipped` variant for skip-ahead) →
`Confetti`, toast, `refreshProfile`. Lesson JSON comes from
`GET`-through-cache `POST /projects/:id/lesson` (see server/ai-pipeline.md).

## LessonChat.jsx — follow-up Q&A under the refresher
Rendered at the bottom of `LearnModal` (below the quiz). LearnModal owns the
thread (`chat`, seeded from the lesson payload) and passes `chat`/`onChat`.
Two actions: **Ask** (free text; Enter sends, Shift+Enter newlines) and
**Ask for sources** (`mode: "source"`, works with an empty box). Each call is
`POST /projects/:id/lesson/ask` and returns the WHOLE thread, so history
survives closing the modal, reopening it, and regenerating the lesson (the
thread lives in its own `lessons/<id>.chat.json`). A turn renders the model's
**paraphrase of the question, highlighted**, the raw question underneath when
it differs, the markdown answer, and any sources; the newest turn gets
`.is-new` and is scrolled to. "Clear thread" DELETEs it.
**Exception to the jobs rule below:** ask runs inline (own spinner, own retry)
because it is a foreground conversation inside an open modal, not background work.

## Lessons are written once (do not regress this)
A lesson costs a model call the FIRST time only. The server is cache-first and
the client is built to make that visible, so nobody pays twice:
- `GET /projects/:id` returns `lessons: {conceptId: savedAtMs}`; ProjectView
  threads it to `Overview` and `MapView` → `NodePanel savedAt`.
- With a `savedAt`, NodePanel/Overview show **📖 Open saved refresher** and call
  `onOpenLesson` DIRECTLY — no `startLesson`, no job, no "Preparing…" dock.
  Without one they still enqueue a job (that call really does generate).
- `LearnModal` shows a "your saved copy" strip when the response says `cached`,
  and **Regenerate** (both entry points) confirms first — it is the only control
  in the app that spends tokens on a lesson.
- The lesson job `bump()`s the project so the saved marker appears immediately.

## Where learning starts
`NodePanel` (map) and `Overview.jsx` recommendations → `startLesson` →
LearnModal opens when `lessonState` says ready. Quests (`#quest-card` on
Dashboard) and streaks recompute server-side from events (`/api/quests`,
`computeQuestState`).

## Per-concept notes (user's own notes)
`NodePanel` has a `NotesEditor` (📝 My notes) — a textarea that saves on blur
via `onSaveNote(nodeId, text)` → `ProjectView.saveNote` → `PUT
/projects/:id/nodes/:nodeId/notes` (optimistic local update, empty text clears).
Notes ride in the project payload (`data.notes`, a `{nodeId:{text,updatedAt}}`
map) threaded ProjectView → MapView → NodePanel. `Overview.jsx` surfaces them in
the **Your notes** card and also shows a **Recently covered** card (derived from
history events: concept_mastered/skipped/viewed/lesson_generated, matched back to
nodes by name). Both cards' items call `onOpenConcept` (see shell.md — routes via
App so the map remounts with the concept preselected).

**Change here when:** quiz behavior, XP amounts (server `xpForNode`), lesson
rendering, job progress UX. Lesson *content* quality → `server/prompts.js`
(`lessonMessages`).

Hosted builds store saved lessons in the encrypted workspace; the UI uses storage-neutral wording. Cached lessons bypass background jobs as well as AI. See `../hosting.md`.
