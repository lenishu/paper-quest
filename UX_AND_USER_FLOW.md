# PaperQuest — User Flow & UX Spec (Notivo-style redesign)

## 1. What the user actually wants (job to be done)

> "I'm holding a paper I can't fully read. Show me what background I'm missing, let me review it fast, and let me get on with reading — without waiting on a spinner."

Three needs, in priority order:
1. **Orient** — at a glance, how much of this paper's background do I already have, and what should I review next?
2. **Review** — open a concept, get a short refresher, mark it known. The AI work must not block me.
3. **Track & take away** — see progress over time, export a study pack.

## 2. Design language (extracted from the reference)

- **Light lavender canvas**, white cards, one **black "hero" card**, purple accent (`#8b5cf6`/`#a78bfa`), near-black text. Bright, airy, high-contrast — the opposite of the current dark theme.
- **Top navigation bar** (not a sidebar): logo left · section tabs center (active = solid **black pill**) · search / notifications / avatar right.
- **Hero band**: one very large, thin-weight metric + a wide **dual line chart** with an axis (weekdays → here: the review timeline), and small **toggle chips** (radio-dot style) for range/series.
- **Stat cards**: big `%` number, a row of mini-stats (Done / Total / Left), and a **tick-bar progress** (rows of thin vertical ticks, filled vs. muted) — a signature element.
- **Semicircle gauge** with a draggable-looking knob for an overview ratio.
- **Action cards** end with **Resume (black) / Cancel (grey)** buttons and a `•••` overflow.
- Rounded ~16px corners, generous whitespace, refined numerals.

## 3. Screen inventory (how the aesthetic maps to PaperQuest)

**Top nav:** `PaperQuest` logo · **Overview · Map · Papers · History** · search · ⚙️ · avatar (XP/level ring).

### A. Overview (the dashboard — the new home for a project)
- **Hero:** big number = *Concepts still to review* (or mastery %). Wide line chart = **your review activity over the week** (from the event log), with `This week / Last week` and `Chart / Table` chips.
- **Card 1 — Project Overview (black card):** semicircle gauge = mastered vs. total; footer mini-stats: papers, branches, % done.
- **Card 2 — By branch:** tick-bar progress per math branch (Linear Algebra 60%, Calculus 30%, …) — the SMS/Calls analogue.
- **Card 3 — Continue (active-campaign analogue):** the next recommended concept (all prereqs met), with a mini progress bar and **Start refresher (black) / Skip (grey)**. Done / In-progress / Locked counts underneath.

### B. Map (the canvas skill tree)
- The interactive prerequisite tree, restyled to the light theme (light nodes, purple accents, branch stripes). Click a node → the concept panel slides in.

### C. Papers
- Cards per paper: title, pages, status, **Re-analyze / Download .md / Remove**, and "Add paper" dropzone. Analysis runs in the background.

### D. History
- The activity timeline (event log) + audit trail + memory editor + export (.txt / PDF).

## 4. Core flows

**First run:** Overview empty state → "Create project" → drop a PDF → *(background)* parse + map → tree appears; toast "Map ready."

**Add paper (background):** drop/upload → job starts immediately → progress dock shows *Converting → Mapping concepts* → user keeps browsing → on finish, tree + overview refresh; failure → job shows error + Retry.

**Review a concept (background AI — the key one):**
1. Click concept → panel shows *what it is / how the paper uses it / prereqs*.
2. Click **Start refresher** → the lesson is requested **in the background**; the button becomes a small **progress pill** ("Preparing lesson…") and a job appears in the dock.
3. **User can do anything else** meanwhile (browse the map, open other concepts, switch tabs).
4. When ready → toast "Lesson ready" + the concept gets a "▶ Ready" badge; clicking opens it. (Optional: auto-open if the user is still idle on that concept.)

**Progress:** pass a quick quiz or "I already know this" → concept turns *reviewed*, gauge + branch bars + hero number update, XP ring ticks up.

**Export:** History → Export → .txt or print-to-PDF study pack.

## 5. Background-AI UX pattern (applies to every AI call)

- **Never block.** Analyze-paper and generate-lesson/refresher are dispatched to a **job queue**. The UI stays fully interactive.
- **Two progress surfaces:** (1) a **global job dock** (bottom-right) listing active jobs with state; (2) **inline** feedback on the button that triggered it (spinner + label, but not disabled navigation).
- **Completion:** toast + the result becomes available where it belongs (lesson opens / "Ready" badge / tree refresh).
- **Concurrency:** jobs run sequentially per project; the user may queue several.

## 6. Failure & "step-up" handling (when Gemini doesn't work)

When an AI job fails (error, timeout, or no key), it must **fail loudly and offer the next step on the same button** — never a dead end:

1. Job dock entry turns to an **error** state with the message.
2. The triggering button **steps up**: `Start refresher` → **`Retry`**, with a small caret menu:
   - **Retry** (run again),
   - **Open settings** (add/replace API key),
   - **Switch provider/model** (e.g., fall back to another configured provider).
3. If the failure is "no key," the step-up jumps straight to **Open settings**.
4. Nothing is silently lost — the concept stays where it was; retry resumes from the click.

## 7. Do we need an MCP?

**No — not to build this.** The interface is hand-written React/CSS; I can recreate the reference aesthetic directly. An MCP would only help if you want:
- **Figma** — if this design exists as a Figma file, connecting it lets me extract exact colors, spacing, and type for a pixel-match.
- **Canva / Adobe** — only if you want generated brand assets/illustrations.

Recommendation: hand-build the look now; connect Figma later only if you want an exact match to a real file.
