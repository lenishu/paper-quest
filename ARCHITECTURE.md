# PaperQuest — Architecture

How the app is put together: the user flow, the tech behind each screen, and — for every process — **what is done by plain local tools** vs **what is done by an AI model**, and which AI that is.

> Legend used in every diagram:
> 🟧 **AI** = one call to the configured LLM provider · 🟦 **Local tool** = deterministic code on your machine · 🟩 **External API** = non-AI web service

---

## 1. System overview

```mermaid
flowchart LR
    subgraph Browser["🖥️ Browser — React 18 + Vite SPA"]
        UI["App shell<br/>TopBar · Sidebar · Views"]
        G3D["3D Knowledge Galaxy<br/>(3d-force-graph / three.js)"]
        TREE["Skill-tree map<br/>(Canvas 2D)"]
        LESSON["Lesson + Quiz modal<br/>(react-markdown + KaTeX)"]
    end

    subgraph Server["⚙️ Node 18 + Express (server/index.js)"]
        API["REST API /api/*"]
        PDF["pdfToMd.js<br/>PDF → Markdown (pdf.js)"]
        GRAPH["graphUtil.js<br/>sanitize · depths · states · XP"]
        LLM["llm.js<br/>provider-agnostic adapter"]
        REFS["references.js"]
    end

    subgraph Data["📁 data/ — plain files, all local"]
        SETTINGS["settings.json<br/>provider + API keys"]
        PROJ["projects/&lt;id&gt;/<br/>project.json · papers/*.md|pdf<br/>lessons/*.json · events.jsonl · project.md"]
        GLOBAL["mastery.json · profile.json<br/>bookmarks.json"]
    end

    subgraph Cloud["☁️ External services"]
        GEM["🟧 Google Gemini<br/>gemini-2.5-flash"]
        CLA["🟧 Anthropic Claude<br/>claude-sonnet-5"]
        OAI["🟧 OpenAI<br/>gpt-4o-mini"]
        S2["🟩 Semantic Scholar API<br/>(references, no AI)"]
    end

    Browser <-->|"fetch JSON"| API
    API --> PDF & GRAPH & REFS
    API <--> Data
    API --> LLM
    LLM -->|"one active provider"| GEM & CLA & OAI
    REFS --> S2

    style GEM fill:#E4572E,color:#fff
    style CLA fill:#E4572E,color:#fff
    style OAI fill:#E4572E,color:#fff
    style S2 fill:#1F9D57,color:#fff
```

**Key property:** the AI never sees your PDF. PDFs are converted to text locally with pdf.js; only the extracted Markdown is sent to the provider you chose. Keys live in `data/settings.json` and go nowhere else.

---

## 2. Tech stack

| Layer | Technology | Used for |
|---|---|---|
| Frontend | React 18, Vite 5 | SPA, state, build/dev server |
| 3D galaxy | `3d-force-graph` (three.js + d3-force-3d) | Dashboard/Explore hero: cross-project concept network |
| 2D graphics | HTML Canvas 2D | Skill-tree map (`SkillTreeCanvas`), 2D galaxy fallback (`BrainMap`) |
| Math & docs | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, KaTeX | Lesson rendering, paper reader |
| Design | Custom CSS design system (warm-paper light theme from the claude.ai/design project) | Space Grotesk / Inter / JetBrains Mono, `#E4572E` primary, `#2E86AB` secondary |
| Backend | Node 18+, Express 4, multer | REST API, file uploads |
| PDF extraction | `pdfjs-dist` (Mozilla pdf.js) | **Local, no AI** PDF → Markdown |
| AI adapter | `server/llm.js` (plain `fetch`, no SDKs) | One interface over Gemini / Anthropic / OpenAI(-compatible) / OpenRouter, JSON mode, reasoning passthrough, 240 s timeout, malformed-JSON repair |
| Storage | Plain JSON / Markdown / JSONL files in `data/` | No database — copy the folder to back up everything |
| References | Semantic Scholar Graph API | Citation network (external API, **not** AI) |

### Which AI, exactly?

| Provider | Default model | API |
|---|---|---|
| Google Gemini *(default)* | `gemini-2.5-flash` | `generativelanguage.googleapis.com :generateContent` |
| Anthropic | `claude-sonnet-5` | `api.anthropic.com/v1/messages` |
| OpenAI | `gpt-4o-mini` | `api.openai.com/v1/chat/completions` |
| OpenRouter | `google/gemma-4-31b-it:free` | `openrouter.ai/api/v1/chat/completions` — plus optional `reasoning` and `reasoning_details` carried across turns |

(Groq, Zhipu GLM and any OpenAI-compatible endpoint reuse the OpenAI request shape with a different base URL.)

Exactly **one provider is active at a time** (chosen in ⚙ Settings; model name is free-text so any current model works). Every AI feature goes through the same `callLLM()` in `server/llm.js`. The core AI call sites are:

1. **Settings → Test connection** — a tiny prompt to validate the key/model.
2. **Paper analysis** — build or merge the prerequisite concept graph.
3. **Lesson generation** — write a lesson + 4-question quiz for one concept.
4. **Lesson Q&A** — answer a follow-up question (or list sources) about an open refresher, replaying the stored thread.

Everything else — XP, levels, streaks, quests, badges, graph layout, unlock logic, heatmaps, recommendations — is deterministic local code.

---

## 3. User flow (end to end)

```mermaid
flowchart TD
    START(["First visit — http://localhost:3001"]) --> KEY{"API key set?"}
    KEY -- "No" --> SET["⚙ Settings: pick Gemini / Claude / OpenAI,<br/>paste key, Test connection 🟧"]
    KEY -- "Demo instead" --> DEMO["🟦 'Try the demo' — prebuilt<br/>Attention Is All You Need project,<br/>first lesson needs no key"]
    SET --> DASH
    DEMO --> DASH

    DASH["🏠 Dashboard<br/>3D Knowledge Galaxy · projects · heatmap ·<br/>XP summary · quests · recommended next"]

    DASH -->|"＋ New Project / ⬆ Upload"| UP["Papers tab: drop PDF / MD / TXT"]
    UP --> PIPE["Ingestion pipeline<br/>(see §4 — runs in background job queue)"]
    PIPE --> MAP

    DASH -->|"click galaxy node / search Ctrl-K /<br/>Recommended: Start Lesson"| MAP
    MAP["🗺 Project Map — layered skill tree,<br/>baseline at bottom, ★ paper at top"]
    MAP -->|"click node"| PANEL["Node panel: what it is,<br/>how THIS paper uses it,<br/>prereqs · leads to"]
    PANEL -->|"▶ Start refresher"| LGEN["Lesson ready?<br/>cached on disk after first generation"]
    LGEN -->|"cache miss 🟧"| AI2["AI writes lesson + quiz"]
    LGEN -->|"cache hit 🟦"| QUIZ
    AI2 --> QUIZ["📖 Lesson + 4-question quiz"]
    PANEL -->|"'I already know this'"| SKIP["🟦 Marked known — half XP"]

    QUIZ --> PASS{"score ≥ 75%?"}
    PASS -- "Yes 🟦" --> MASTER["Concept mastered:<br/>XP awarded · branches unlock ·<br/>global mastery (counts in every project)"]
    PASS -- "No" --> RETRY["Re-read / retry / regenerate 🟧"]
    RETRY --> QUIZ
    SKIP --> MASTER
    MASTER --> MORE{"More concepts open?"}
    MORE -- "Yes" --> MAP
    MORE -- "★ reached the core" --> CORE(["🎉 The paper itself —<br/>explained with everything just learned"])
    MASTER -.->|"XP · streak · quests · badges update"| DASH

    style AI2 fill:#E4572E,color:#fff
    style SET fill:#FDEFE9
    style RETRY fill:#FDEFE9
```

Other journeys from the same dashboard: **Projects** view (open/rename/delete), **Explore** (full-screen galaxy), **Career Paths** (per-branch progress), **Read** drawer (paper reader with notes), **History** tab (activity log, undo last analysis, project memory), **References** (Semantic Scholar 🟩), **Daily Quest** (claim +45 XP — computed and granted locally 🟦).

---

## 4. Paper ingestion: where tools end and AI begins

```mermaid
flowchart TD
    A["User drops file<br/>(PDF / MD / TXT)"] --> B["🟦 multer upload<br/>POST /api/projects/:id/papers"]
    B --> C{"file type?"}
    C -- "PDF" --> D["🟦 pdfToMd.js — pdf.js extracts text,<br/>cleans & structures it into Markdown<br/><b>local, no AI, PDF never leaves machine</b>"]
    C -- "MD / TXT" --> E["🟦 stored as-is"]
    D --> F["🟦 saved to data/projects/&lt;id&gt;/papers/"]
    E --> F

    F --> G["POST …/analyze"]
    G --> H["🟦 read project memory (project.md):<br/>canonical names, goals, prefs"]
    H --> I{"project already<br/>has a graph?"}
    I -- "No" --> J["🟧 <b>AI call #1 — concept extraction</b><br/>conceptExtractionMessages(): read the Markdown,<br/>find the math the paper actually uses,<br/>build 12–22 concepts on a high-school baseline,<br/>with per-paper 'how it's used' notes<br/>(JSON mode, up to 16k tokens out)"]
    I -- "Yes" --> K["🟧 <b>AI call #1b — merge</b><br/>conceptMergeMessages(): fit the new paper<br/>into the existing graph, reusing concepts"]

    J --> L
    K --> L["🟦 graphUtil.js — <b>deterministic cleanup</b><br/>sanitizeGraph · repairGraph (cycles, orphans)<br/>computeDepths · inferBranch"]
    L --> M["🟦 snapshot previous graph (undo) ·<br/>audit log · events.jsonl"]
    M --> N["🟦 computeStates(): known / done /<br/>open / locked from global mastery.json"]
    N --> O["🗺 Map renders — glowing nodes are ready"]

    style J fill:#E4572E,color:#fff
    style K fill:#E4572E,color:#fff
```

## 5. Learning loop: lesson, quiz, progress

```mermaid
flowchart TD
    A["User clicks ▶ Start refresher"] --> B{"🟦 lesson cached in<br/>data/…/lessons/&lt;concept&gt;.json?"}
    B -- "Yes" --> R["📖 render instantly — costs tokens once, ever"]
    B -- "No" --> C["🟧 <b>AI call #2 — lessonMessages()</b><br/>inputs: the concept, its paper-usage notes,<br/>the list of concepts you've ALREADY mastered<br/>(lesson builds only on what you know),<br/>project field & memory<br/>output: Markdown lesson + 4 MCQs w/ explanations"]
    C --> D["🟦 parseModelJSON() — strip fences,<br/>repair trailing commas"]
    D --> E["🟦 cached to disk"] --> R
    R --> F["🟦 quiz graded <b>client-side</b> — no AI"]
    F --> G{"≥ 75%?"}
    G -- "Yes" --> H["🟦 POST /api/complete —<br/>xpForNode(depth, core) · levelInfo() ·<br/>unlock recompute · event logged"]
    G -- "No" --> A2["retry / 🟧 regenerate fresh lesson"]
    H --> I["🟦 dashboard recomputes:<br/>streak · heatmap · daily quests (+45 XP claim) ·<br/>badges · weekly XP · recommended next<br/><b>all derived from local files, zero AI</b>"]

    style C fill:#E4572E,color:#fff
    style A2 fill:#FDEFE9
```

---

## 6. Career Path: resume, job descriptions, skill graph

Global feature, not tied to any project — the user picks career trajectories and
gets an AI-built skills graph (same node shape as a paper's concept graph) colored
by what they already know, cross-referenced against global mastery and their resume.

```mermaid
flowchart TD
    A["✧ Career Path view"] --> B["＋ New career trajectory<br/>(name + primary flag)"]
    B --> C["POST /api/careers/:id/generate"]
    C --> D["🟧 <b>AI call — careerSkillsMessages()</b><br/>builds 12–22 skills for the field,<br/>level 0 = foundation, + importance<br/>(critical/important/optional) + roleNote"]
    D --> E["🟦 SAME pipeline as papers:<br/>sanitizeGraph → degenerate retry → repairGraph<br/>(runCareerGraph helper)"]
    E --> F["🗺 CareerGraph renders —<br/>depth-layered boxes, prereq arrows"]

    A --> G["Upload resume (PDF/MD)"]
    G --> H["🟦 pdfToMd.js (local, no AI)"]
    H --> I["🟧 <b>AI call — resumeSkillsMessages()</b><br/>extracts skill names from resume text"]
    I --> J["🟦 resume.json cached — GLOBAL,<br/>one per user, feeds skill matching below"]

    A --> K["Add job description<br/>(file or pasted text)"]
    K --> L["🟧 <b>AI call — careerJdMergeMessages()</b><br/>merges JD's skills into the career's<br/>existing graph — keeps ids, bumps importance"]
    L --> E

    F --> M["🟦 careerStates() computed per request:<br/>known / learning / notreq / tolearn —<br/>matches skill names against mastery.json,<br/>resume.json, and project concepts"]
    M --> N["🟦 careerStats(): matchPct = known + ½·learning<br/>→ MatchDonut + StatBar"]

    style D fill:#E4572E,color:#fff
    style I fill:#E4572E,color:#fff
    style L fill:#E4572E,color:#fff
```

All three AI calls run through `jobs.jsx` (`career-generate`, `career-resume`,
`career-jd` job kinds) with the same background progress dock and retry-on-failure
as paper analysis and lessons. Details: [wiki/career.md](wiki/career.md).

---

## 7. AI vs tools — the complete ledger

| Process | Done by | Detail |
|---|---|---|
| PDF → Markdown | 🟦 Local tool | pdf.js text extraction + cleanup (`server/pdfToMd.js`) |
| Concept graph (new paper) | 🟧 **AI** | `conceptExtractionMessages` → active provider, JSON out |
| Concept graph (additional paper) | 🟧 **AI** | `conceptMergeMessages` — merge into existing graph |
| Graph repair, cycles, depths, branches | 🟦 Local tool | `graphUtil.js` — deterministic post-processing of AI output |
| Skill-tree layout & rendering | 🟦 Local tool | barycenter DAG layout (`graphLayout.js`) + Canvas 2D |
| 3D galaxy | 🟦 Local tool | force simulation in the browser (three.js), colors from state |
| Lesson + quiz authoring | 🟧 **AI** | `lessonMessages`, cached to disk after first call |
| Quiz grading, XP, levels, unlocks | 🟦 Local tool | pure functions (`xpForNode`, `levelInfo`, `computeStates`) |
| Streak, heatmap, daily quests, badges, weekly XP | 🟦 Local tool | derived from `events.jsonl` + `mastery.json` timestamps |
| Recommended next concept | 🟦 Local tool | ready node that unlocks the most others (edge counting) |
| Paper references / citations | 🟩 External API | Semantic Scholar Graph API — a web service, not an LLM |
| Settings "Test connection" | 🟧 **AI** | 1-line prompt to verify key + model |
| Career skills graph (new field) | 🟧 **AI** | `careerSkillsMessages` → same sanitize/repair pipeline as papers |
| Resume skill extraction | 🟧 **AI** | `resumeSkillsMessages` — reads converted resume Markdown |
| JD merge into career graph | 🟧 **AI** | `careerJdMergeMessages` — keeps ids, bumps importance |
| Career skill match (known/learning/tolearn), match % | 🟦 Local tool | `careerStates`/`careerStats` — name matching against mastery.json/resume.json |
| Search, navigation, project memory, undo, export | 🟦 Local tool | file reads/writes only |

**Rule of thumb:** AI is used exactly where judgment about *content* is needed (what math a paper stands on, how to teach a concept). Every *mechanic* — scoring, unlocking, progress, gamification, rendering — is ordinary local code, so it's fast, free, and reproducible.

## Netlify hosting

The hosted build uses Netlify Functions plus private encrypted workspace snapshots in Netlify Blobs. Slow AI, uploads, and reference lookups run as background jobs. Recovery-key cookies identify workspaces; local data is not deployed. See `wiki/hosting.md` for limits, concurrency, and recovery behavior.
