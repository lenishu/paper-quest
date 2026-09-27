# 🌳 PaperQuest

Drop any research paper (PDF or Markdown) into a project. PaperQuest converts it to Markdown, identifies the concepts it stands on, and grows a **prerequisite skill tree** rooted in high-school math & physics. You learn bottom-up: pass a short quiz on a concept to unlock the branches that build on it, until you reach the paper's core idea — explained using everything you just learned.

No chat interface. Just: *this paper has these foundations — start climbing.*

## Hosted app on Netlify (free plan)

The full app can run on a Netlify credit-based Free plan: build command `npm run build`, publish directory `client/dist`, and functions from `netlify/functions`. The checked-in `netlify.toml` supplies these settings. GitHub Pages supports static websites and cannot run this app's API.

Each browser gets a separate encrypted workspace, saved persistently in Netlify Blobs. Open **Settings → Your account** to sign up or sign in with Google (requires the site owner's [Google setup](wiki/hosting.md#google-accounts-and-developer-recovery)). First sign-up links your current workspace; returning accounts reopen their saved workspace on any device. You can also save your **recovery key**. Anyone with that key can access the workspace. Sign out opens a fresh guest workspace. Your existing local papers and API keys are never uploaded by deployment.

Lost the old recovery key? **Developer access** lets an approved Google account preview and restore a private backup staged by the site owner. Restore keeps newer projects and includes previous papers, lessons, notes and progress; conflicting projects or progress stop recovery without overwriting your data. It does not decrypt a lost-key cloud workspace: a local backup is required. You can also use **Import local projects** below without developer access.

To bring your local projects online, run `npm run workspace:export` in this folder. In the hosted app, open **Settings → Import local projects** and choose `.netlify/paperquest-projects-backup.json`. Import into an empty workspace. The backup includes projects, original papers, saved lessons and chats, notes, bookmarks, progress and XP; it excludes API keys and career/resume documents. Keep the backup private. Your local files remain unchanged.

Hosted uploads are limited to **4 MB per file**, with **24 MB per workspace**. AI jobs run in the background; cached lessons remain free to reopen. Visitors use their own provider API keys, and provider charges are separate from hosting. Netlify Free has finite monthly credits and pauses sites at its limit. Custom AI endpoints require the site owner to enable their trusted HTTPS origin. See [hosting details](wiki/hosting.md).

## Requirements

- [Node.js](https://nodejs.org) 22.13 or newer
- An API key from **one** of: Google Gemini, Anthropic (Claude), OpenAI, OpenRouter, Groq, Zhipu GLM, or any OpenAI-compatible endpoint

## Quick start

**Windows, easiest:** double-click **`start.bat`**. It installs dependencies (first run only), builds the app, starts the server and opens your browser. Keep the black window open while you use the app.

> ⚠️ Don't open `client/index.html` directly — that gives a blank page. The app must run through its server: use `start.bat` or the commands below, then go to **http://localhost:3001**.

Manual:

```bash
npm install
npm run build
npm start
```

Then open **http://localhost:3001**.

For development with hot reload use `npm run dev` and open http://localhost:5173.

First steps:

1. Click **⚙️** (top right), add a connection (provider + key), **Test** it, then **Save**. Two ways to fill it in: type into the form, or open **Set up with code** and paste the request snippet from your provider's docs (Python, JavaScript or cURL) — PaperQuest reads the URL, model, key and reasoning setting out of it. This includes the code Google AI Studio gives you. Under each **Model** field, Settings shows which model that connection uses. The same panel shows the exact request PaperQuest will send, in all three languages, ready to copy. You can add several connections — even multiple keys for the same provider — and pick which one is **active**. An optional Semantic Scholar API key (same screen) speeds up the paper reference/citation lookups.
2. Create a project and drop in a PDF — or click **Try the demo project** first (its first lesson works with no key at all).

## How it works

- **PDF → Markdown (local tool, no AI)** — converted on your machine by docling (best quality, installed automatically when Python is present) or pdf.js as fallback and cleaned into a `.md` file (downloadable from the paper chip). The AI never touches the PDF itself, only the extracted text. Scanned/image-only PDFs aren't supported — use an OCRed copy.
- **Concept network** — the AI reads the extracted text, identifies the mathematical tools the paper actually uses and which **branch of math** each comes from (linear algebra, probability, optimization, …), then uses its knowledge of how those branches interrelate to build a prerequisite network: 12–22 learnable concepts anchored in 3–6 high-school baseline topics, topped by 1–3 ★ **core** nodes (the paper's own contribution). Node side-stripes are colour-coded by branch.
- **Click a topic → see it in the paper** — every node records *how this specific paper uses that concept* (which method, equation or section relies on it), shown in the side panel per paper.
- **Your own notes per concept** — click a topic on the map and jot notes (resources to learn it, reminders, links). They save automatically and collect on the project **Overview** tab under *Your notes*, alongside a *Recently covered* list and per-branch progress bars that fill one box per concept (e.g. 2 of 11).
- **Multiple papers per project** — each new paper is *merged* into the existing tree, reusing concepts that are already there.
- **Gamified learning** — glowing nodes are ready to learn. Each opens a generated lesson (with proper math rendering) followed by a 4-question quiz; score 75%+ to master it and unlock its branches. Know it already? Skip for half XP. Lessons build only on what you've already mastered, and are **written once**: the first open generates it, every open after that loads the saved copy from disk — instantly, with no API call. Concepts that already have one say **📖 Open saved refresher**, and the lesson shows a "your saved copy" note. **🔁 Regenerate** is the only control that spends tokens, and it asks first.
- **Ask about a lesson** — every refresher has a Q&A thread at the bottom. Ask anything, or hit **📚 Ask for sources** to get the books and papers it rests on. Each answer is filed under the model's own one-sentence paraphrase of your question (highlighted), so a long thread stays skimmable. The whole thread comes back every time you reopen that refresher — including after regenerating the lesson — and each answer builds on the ones before it.
- **Knowledge Graph (Explore tab)** — your whole knowledge as one navigable **3D** star field: every concept across every project **plus** every career skill, merged where they share a concept. Drag to rotate, scroll to zoom, click any star to travel to it — the camera flies to that concept framed with its prerequisites and what it unlocks, and you hop node to node from the detail panel. Search to jump anywhere, filter by branch. Colour shows progress (mastered / known / ready), size shows tier, and locked concepts keep their branch hue. The ▦ button switches to a 2D map at any time, and PaperQuest falls back to 2D automatically if your machine can't do WebGL. The compact version on the dashboard stays 2D by design.
- **Reference explorer (🔗 on any paper)** — a ResearchRabbit-style citation map. Three panes: every paper found so far (left), the map itself (centre), and the selected paper with its abstract (right). Papers are placed by **year** (left→right) and **citation count** (bottom→top), with dot size following citations. **Click any paper — on the map or in the list — and PaperQuest pulls in similar work automatically**, growing the network; the buttons under the abstract add its references or the papers citing it on demand. Powered by Semantic Scholar (an external web service, not AI).
- **Cross-project foundations** — mastery is global. If two projects share `gradient_descent`, mastering it in one pre-unlocks it in the other; project cards show how many concepts they share.
- **XP & levels** — Novice → Apprentice → Scholar → … Deeper and core concepts award more XP.
- **Career Path (✧ tab)** — pick one or more career trajectories (or type your own); the AI maps the skills the field requires as a prerequisite graph. Upload a tailored resume per career (openable later) and job descriptions per career (upload a file **or paste the text**); skills you already have — from your resume or anything you mastered in your projects — show green, and the missing critical ones become your suggested next steps with a live match %.

## Where your data lives

When running locally, everything is in the `data/` folder. Hosted workspaces use encrypted Netlify Blobs instead:

- `data/settings.json` — AI connections (provider, key, model, base URL), which one is active, and an optional Semantic Scholar key (keys never leave your machine except to the provider they belong to)
- `data/projects/<id>/papers/*.md` — the converted Markdown files
- `data/projects/<id>/lessons/*.json` — cached lessons & quizzes
- `data/projects/<id>/lessons/*.chat.json` — the Q&A thread for that lesson
- `data/mastery.json`, `data/profile.json` — your progress and XP
- `data/careers/<id>/` — each career: skills graph (`career.json`), its resume (`resume.pdf`/`.md`) and job descriptions (`jds/`)

Back up or delete `data/` to export or reset everything.

## Knowledge graphs (optional, offline)

With [graphify](https://github.com/safishamsi/graphify) installed (`pip install graphifyy`), two interactive graph visualizations can be generated — no API key or tokens needed:

- `npm run graph:knowledge` → **`graphify-out/knowledge/graph.html`** — YOUR knowledge as one network: every concept from every project + every career skill, merged by canonical id (careers literally connect to your paper galaxy through shared skills), colored by branch, ✓ = mastered, ★ = core, ◈ projects / ✧ careers as hubs. Regenerate any time; it reads `data/` directly.
- `/graphify .` (in Claude Code) → **`graphify-out/graph.html`** — the codebase itself as a graph (for contributors/AI sessions). Refresh after code changes with `graphify update .`.

Both are static HTML files — just open them in a browser.

## Troubleshooting

- **Blank page?** You probably opened `client/index.html` directly. Use `start.bat` (or `npm start`) and go to http://localhost:3001 instead.
- **"Something went wrong" / WebGL error?** The dashboard now falls back to a 2D map automatically when your browser can't do 3D (WebGL). To get the 3D galaxy back, enable **Settings → System → "Use graphics acceleration when available"** in Chrome and relaunch, or check `chrome://gpu`.
- **"No active API connection with a key"** — open ⚙️ settings, add a connection with a key and mark it **active**.
- **Model errors** — each connection's model name is editable; defaults are `gemini-2.5-flash`, `claude-sonnet-5`, `gpt-4o-mini`, OpenRouter `google/gemma-4-31b-it:free`, Groq `llama-3.3-70b-versatile`, GLM `glm-4-flash`. Any current model string from your provider works. Leave the field blank to use the default. The line under it shows which model is in use, and **Test** reports the model that answered. For an OpenAI-compatible custom endpoint, set the **Base URL** (e.g. `https://host/v1`).
- **Google Gemini keys** — Google AI Studio now issues keys starting with `AQ.`, and older `AIza` keys also work. In AI Studio's code, the model code is the part of the URL between `models/` and `:generateContent`, for example `gemini-flash-latest`.
- **OpenRouter** — pick any model from openrouter.ai/models as the model name. Tick **Reasoning tokens** to have the model think before it answers; PaperQuest carries that thinking forward through a lesson's Q&A thread, so follow-ups continue where the last answer left off. If a model rejects reasoning or JSON mode, the request is retried without them.
- **References slow / rate-limited** — add a Semantic Scholar API key in ⚙️ settings to lift the shared free-tier limit. The first lookup for a paper is the slow one (title search); once it lands it is cached, and clicking around the map afterwards is fast.
- **Reference explorer says it couldn't match the paper** — the lookup goes by title, so rename the paper to its exact published title and hit ↻ Refresh.
- **Malformed JSON from model** — occasionally a model returns a broken graph; just hit analyze again (the 🔁 button on the paper chip). Math that a model writes with single backslashes (Gemini does this) is repaired automatically, so math-heavy lessons no longer fail this way.
- **Port in use** — set `PORT=3002 npm start`.
