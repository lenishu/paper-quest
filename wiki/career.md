# Career Path — user's career trajectories vs. their knowledge

Global feature (not tied to a project): the user picks career trajectories,
uploads a resume and job descriptions, and gets an AI skills graph colored by
what they already know. Design source: the Claude Design career mockup
(project "Frontend color scheme update", file PaperQuest.dc.html).

## Data (data/careers/, all via store.js)
```
data/careers/<careerId>/
  career.json            { id, name, primary, createdAt, skills[], jds[], resume }
                         resume = { name, addedAt, skills[] } — LLM-extracted skill names
  resume.md / resume.pdf converted + raw resume (PER CAREER — each career holds its own tailored resume)
  jds/<jdId>.md          converted job descriptions
```
Career skill node = same shape as a project concept node (id/name/level/core/
tier/branch/blurb/prereqs/depth) PLUS `importance` (critical|important|optional)
and `roleNote` (how the role uses it). Level 0 = foundation skills.

## Server (routes in index.js, "career paths" section)
- `GET/POST /api/careers`, `GET/PATCH/DELETE /api/careers/:id` (PATCH `primary`
  un-primaries the others; `GET :id` registered last so it can't shadow).
- `POST /api/careers/:id/generate` — LLM builds the field's skills graph
  (`careerSkillsMessages`) through the SAME pipeline as papers:
  sanitizeGraph → degenerate retry → repairGraph (`runCareerGraph` helper;
  prompts emit `used_in_role`, mapped to `used_in_paper` pre-sanitize, and
  `importance` is re-attached post-sanitize because sanitize whitelists keys).
- `POST /api/careers/:id/resume` — per-career upload (multer) → pdfToMarkdown →
  `resumeSkillsMessages` extracts skill names into career.resume. File kept even
  if extraction fails (502; retry = re-upload). `GET …/resume/file` serves the
  raw file (openable from the UI); `GET …/resume/markdown` the converted md.
- `POST /api/careers/:id/jd` — file or `{text,name}` → `careerJdMergeMessages`
  merges JD skills into the existing graph (keeps ids, bumps importance). The UI
  "Add Job Description" card offers both **Upload file…** and **Paste text…**
  (textarea → `career-jd` job with `{text}`); server requires ≥80 non-space chars.
- **Skill states** (computed per request in `careerStates`): `known` if the
  skill canonical id is globally mastered OR its normalized name matches a
  mastered concept or a skill from THIS career's resume; `learning` if it matches an unmastered project
  concept; `notreq` for unmatched optional; else `tolearn`.
  `careerStats` → { total (known+learning+tolearn), matchPct = known + ½·learning }.

## Client
- `CareerView.jsx` (view `career` in App.jsx; TopBar pill "✧ Career Path").
  Contains `CareerGraph` (canvas: depth-layered rounded boxes in the mockup's
  state palette, prereq arrows, click-to-inspect), `MatchDonut`, `StatBar`.
- Jobs (jobs.jsx kinds): `career-generate`, `career-resume`, `career-jd` —
  all LLM work is queued; `careersVersion` counter bumps on settle and
  CareerView refetches. Failure shows in the dock; card shows "Working…".
- Styles: `.career*` / `.cgraph*` / `.miss-chip` / `.imp-chip` block in
  styles.css, tokens only (canvas colors are mockup constants — canvas can't
  read CSS variables).
- The old "Career Paths" nav slot became "⋔ Branches" (PathsView, branch
  progress) — CareerView is a NEW view, PathsView was not replaced.

## Change here when
Skill matching feels wrong → `normSkill`/`skillMatches` (index.js). Graph
quality → career prompts (prompts.js). Page layout → CareerView.jsx + the
career CSS block. New career-scoped data → store.js career accessors.
