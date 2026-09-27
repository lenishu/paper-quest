# Career Path — the knowledge graph turned into the tools jobs ask for

Global feature (not tied to a project). The user picks a career (a preset, an AI
suggestion, or free text), and gets a map of the **tools and skills job postings
require** (Python, PyTorch, Docker, SQL, A/B testing…), never school courses. Each
tool links back to the knowledge-graph concepts it uses, and the map is compared
with what the user knows, their resume and real job descriptions. Design source:
the Claude Design career mockup (project "Frontend color scheme update", file
PaperQuest.dc.html).

## Data (data/careers/, all via store.js)
```
data/careers/
  suggestions.json         last AI suggestions { suggestions[], basedOn, interest, at }
                           (a file, so listCareers never reads it as a career)
  <careerId>/
    career.json            { id, name, primary, createdAt, interest?, fromInterest?,
                             field?, skills[], jds[], resume, known{} }
                           resume = { name, addedAt, skills[] } — LLM-extracted skill names
                           jds[] = { id, name, addedAt, skillIds[] } — skills THIS job asks for
                           known = { skillId: true } — "I already know this" marks
    resume.md / resume.pdf converted + raw resume (PER CAREER)
    jds/<jdId>.md          converted job descriptions
```
Skill node = project node shape (id/name/level/core/tier/branch/blurb/prereqs/depth)
PLUS `importance` (critical = in most postings | important = common | optional),
`roleNote` (how the role uses it) and `concepts` (knowledge-graph concept ids it
puts to work, filtered to ids that exist in the user's projects). Level 0 =
foundation tools (Python, Git, SQL, Linux…).

## Server (routes in index.js, "career paths" section)
- `careerCtx()` — the knowledge graph as careers see it: every project concept
  with its mastery state (`concepts` Map) + name sets for matching.
  `knowledgeList(ctx)` feeds prompts (mastered first).
- `GET /api/careers` → `{ careers[], suggestions, concepts }` (list + cached suggestions).
- `POST /api/careers` — `{name}` (preset/suggestion) or `{interest}` (typed text:
  `fromInterest` → the AI picks the job title and the career is renamed to
  `career_title` on generate).
- `POST /api/careers/suggest` `{interest?}` — `careerSuggestMessages` over the
  knowledge graph → 5 real job titles with `why`, matched concepts (filtered to
  real ids), starter tools. 400 when there is no knowledge and no interest.
- `PATCH /api/careers/:id` — `name`, `primary`, or `known: {id, value}`.
- `POST /api/careers/:id/generate` — `careerSkillsMessages(name, {interest,
  knowledge})` through the SAME pipeline as papers (`runCareerGraph`: sanitize →
  degenerate retry → repair; `used_in_role`→`used_in_paper` pre-sanitize;
  importance/concepts re-attached post-sanitize because sanitize whitelists keys;
  JD merges keep existing concept links).
- `POST /api/careers/:id/resume` — per-career upload → pdfToMarkdown →
  `resumeSkillsMessages`. File kept even if extraction fails (502; retry =
  re-upload). `GET …/resume/file` raw file; `GET …/resume/markdown`.
- `POST /api/careers/:id/jd` — file or `{text,name}` → `careerJdMergeMessages`
  merges the JD's skills AND returns `jd_skill_ids`; stored as `jd.skillIds`
  (fallback: new + critical nodes). Server requires ≥80 non-space chars.
- **States** (`careerStates`, per request): `known` if marked known, globally
  mastered by id, same name as a mastered concept, or on this career's resume;
  `learning` if the tool uses a mastered concept (`concepts`) or its name matches
  an unmastered project concept; `notreq` = optional and not started; else
  `tolearn`. Foundation tools are NOT assumed known.
  `careerStats` → { total (known+learning+tolearn), matchPct = known + ½·learning }.
  `careerPayload` adds `resume.matched/gaps`, `jds[].match` (`coverage()`:
  total/known/learning/missing/pct for that job) and `knowledge` (names + states
  of linked concepts).
- Tour careers (no AI): `CAREER_TOOLS` + `DEMO_CAREERS` + `demoCareerSkills(name)`
  in demo.js, used by `POST /api/onboarding {action:'career'}`.

## Client
- `CareerView.jsx` (view `career`; TopBar "✧ Career Path"). `AddCareerModal`
  (suggestions from the knowledge graph, "describe your interest", popular roles),
  `CareerGraph` (exported; canvas, depth rows top→down: foundations at the top,
  ★ core at the bottom), skill detail with knowledge-graph chips and **I already
  know this**, resume card (coverage + critical gaps), "Compare with a Job" card
  (per-JD match %, pasted JDs named by their first line), `MatchDonut`, `StatBar`.
- `JudgeView.jsx` reuses `CareerGraph` + `STATE_STYLE` read-only.
- Jobs (jobs.jsx): `career-generate`, `career-resume`, `career-jd`;
  `careersVersion` bumps on settle. Suggestions run inline in the modal.
- Styles: `.career*` / `.cgraph*` / `.cm-*` / `.kg-chip` / `.jd-*` / `.miss-chip` /
  `.imp-chip` blocks in styles.css, tokens only (canvas colors are mockup constants).

## Change here when
Matching feels wrong → `normSkill`/`skillMatches`/`careerStates` (index.js). Map
quality (tools vs courses) → `CAREER_RULES`/`CAREER_SCHEMA` (prompts.js). Page
layout → CareerView.jsx + the career CSS blocks. New career-scoped data → store.js
career accessors. Tests: `server/careers.test.js`.
