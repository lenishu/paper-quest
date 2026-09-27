# PaperQuest

**Turn complex documents into connected, achievable learning paths.**

PaperQuest organizes documents, identifies the concepts behind them, and maps the prerequisites needed to understand them. Bring together research papers, coursework, personal notes, project briefs, or reference material, then build your knowledge through focused refreshers, quizzes, and career exploration.

[Open the web app](https://paper-quest-lovat.vercel.app/) · [Run locally](#run-locally) · [Deploy to Vercel](#deploy-to-vercel) · [Documentation](wiki/index.md)

## Features

- **Document workspaces:** Organize PDF and Markdown files into projects for research, classes, courses, clubs, hackathons, and notes.
- **Prerequisite maps:** Explore how foundational concepts connect to more advanced ideas, with links back to their use in the source material.
- **Learning tools:** Open saved refreshers, take quizzes, ask follow-up questions, and generate document summaries and project cheatsheets.
- **Connected knowledge:** Explore concepts across projects and career paths in an interactive 3D graph, with a 2D view available.
- **Progress tracking:** Keep concept notes, bookmarks, mastery, XP, and activity history in one workspace. Shared concepts carry progress across projects.
- **Career exploration:** Discover relevant roles, map practical tools and skills, and compare them with resumes and job descriptions.
- **Accounts and sharing:** Reopen hosted workspaces with Google sign-in or a recovery key, and share a read-only showcase through judge access.

The current learning prompts and prepared demo emphasize technical and STEM material. Research papers are one use case within the broader document-based workflow.

## Use the web app

Open **[paper-quest-lovat.vercel.app](https://paper-quest-lovat.vercel.app/)** in your browser. No local installation is required.

1. Follow the guided tour or select **Try the demo project** to explore a prepared example based on *Attention Is All You Need*. The sample map, saved refresher, summary, cheatsheet, and career path work without a personal AI key.
2. Open the profile menu to sign in with Google and associate the workspace with your account. Use **Switch Google account** to change accounts.
3. Create a project, choose its type, and upload PDF or Markdown documents.
4. Explore the generated map, review concepts, and track progress in the dashboard and knowledge graph.
5. Open **Career Path** to connect your learning with professional goals.

New AI requests use a shared Gemini connection when the deployment provides one. You can configure a personal connection through **API key**. Availability and usage charges depend on the selected provider.

### Share a judge showcase

Approved developer accounts can open **Profile → Developer access & account → Create judge access key**. Share the generated key with the [judge-view link](https://paper-quest-lovat.vercel.app/?judge=1).

The read-only snapshot includes graphs, progress, saved learning materials, and career comparisons. Original uploads, personal notes, chat threads, resume text, and provider credentials are excluded. Keys expire after 30 days and can be revoked. Refresh the snapshot after adding content; refreshing replaces the previous key.

## Run locally

### Prerequisites

- **Node.js 22.13 or newer**, with npm.
- **Git** to clone the repository, or a downloaded copy of the source.
- An **AI provider key** to analyze your own documents and generate new learning content. The prepared demo works without one.

Local mode stores a single workspace on disk. It runs without Postgres, a hosting account, or Google sign-in configuration.

### Install and start development mode

```bash
git clone https://github.com/lenishu/paper-quest.git
cd paper-quest
npm ci
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)**.

This starts the Vite frontend with hot reload and the Express API on port `3001`. Vite forwards `/api` requests to Express. Stop both processes with `Ctrl+C` in the terminal.

### Run the production build locally

From the project root, after installing dependencies:

```bash
npm run build
npm start
```

Open **[http://localhost:3001](http://localhost:3001)**. Express serves both the API and the compiled frontend from `client/dist`.

Rebuild after changing frontend code. Local builds use the default configuration, with `VITE_CLOUD` unset; the hosted build enables that flag through the deployment configuration.

### Windows launcher

Run `start.bat` from the project folder. The launcher installs missing dependencies, creates the frontend build if needed, starts the application, and opens `http://localhost:3001`.

The launcher also attempts to install the optional Docling converter when Python is available. The command-line setup above uses the bundled PDF.js extractor unless Docling is already installed.

### Configure AI

1. Open **API key** in the application.
2. Add a connection and select a provider.
3. Enter the API key and model. For a compatible custom provider, also enter its base URL.
4. Select **Test**, save the connection, and make it active.

Supported connections include Google Gemini, Anthropic, OpenAI, OpenRouter, Groq, Zhipu GLM, and OpenAI-compatible endpoints. Multiple connections can be saved and switched in the interface. **Set up with code** can import connection details from a provider's request example.

An optional Semantic Scholar key supports reference and citation lookups for research documents. Saved learning content reopens without a new generation request.

## Deploy to Vercel

PaperQuest's Vercel deployment uses a static Vite frontend, a Node.js API function, and a Neon Postgres database. The repository includes the required build and routing configuration in [`vercel.json`](vercel.json).

### 1. Import the repository

Import your fork or `lenishu/paper-quest` into Vercel. Keep the repository root as the **Root Directory** and select the **Vite** framework preset. Choose a Node.js runtime compatible with `package.json` (22.13 or newer).

The repository supplies these settings:

| Setting | Value |
| --- | --- |
| Install command | `npm install` |
| Build command | `VITE_CLOUD=true npm run build` |
| Output directory | `client/dist` |
| API entry point | `api/index.mjs` |
| API routing | `/api/*` → the API function |

See the [Vercel Vite documentation](https://vercel.com/docs/frameworks/frontend/vite) for the platform's import workflow.

### 2. Connect storage

In the Vercel project, open **Storage** and connect a **Neon Postgres** database through the Marketplace integration. Ensure the integration supplies `DATABASE_URL` to the deployment environment you intend to use.

The application creates its `paperquest_blobs` table on first use. Local `data/` files are migrated separately through the export/import workflow below.

See [Postgres on Vercel](https://vercel.com/docs/postgres) for database integration options.

### 3. Set environment variables

Add the following in **Project Settings → Environment Variables**:

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string supplied by Neon. `POSTGRES_URL` is also accepted. | Required for hosted storage |
| `GOOGLE_CLIENT_ID` | Your Google OAuth web application's client ID. Overrides the repository's default. | Set for Google sign-in on your deployment |
| `PAPERQUEST_AUTH_SECRET` | Stable encryption secret consisting of 64 lowercase hexadecimal characters. | Required for Google accounts and judge sharing |
| `PAPERQUEST_DEVELOPER_EMAILS` | Comma-separated approved developer Google email addresses. | Optional; enables developer recovery and sharing |
| `PAPERQUEST_DEVELOPER_GOOGLE_SUBS` | Comma-separated approved Google subject IDs. | Optional alternative developer allowlist |
| `PAPERQUEST_SHARED_GEMINI_KEYS` | Comma-separated Gemini keys used by the shared connection. | Optional; enables AI access without individual setup |
| `PAPERQUEST_ALLOWED_AI_ORIGINS` | Comma-separated additional trusted HTTPS origins for custom AI endpoints. | Optional |

Generate the authentication secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store the generated value as a sensitive server-side environment variable and retain a private backup. Keep the value stable across deployments so existing accounts and shared snapshots remain readable. Database credentials and shared provider keys also belong in server-side secret storage.

### 4. Configure Google sign-in

In **Google Auth Platform**, create or select an OAuth client of type **Web application**. Register the exact addresses for your deployment:

| Google setting | Example |
| --- | --- |
| Authorized JavaScript origins | `https://your-project.vercel.app` |
| Authorized redirect URIs | `https://your-project.vercel.app/` |

The trailing slash is part of the full-page chooser's redirect URI. Register custom domains separately, and ensure the OAuth audience permits your intended users. See [Google's setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

### 5. Deploy and verify

Deploy after connecting storage and setting the environment variables. Redeploy whenever environment values change so the next deployment receives them.

Verify the installation by opening the app, creating a project, reloading it, and signing in with Google. The `/api/session` endpoint reports `cloud: true`; `googleEnabled: true` confirms that authentication configuration is present. Use the prepared demo to check the map and learning screens without generating new AI content.

Further deployment details are in the [Vercel hosting guide](wiki/hosting-vercel.md). The repository also includes a [Netlify deployment configuration](netlify.toml) and [Netlify hosting guide](wiki/hosting.md).

## Data and backups

| Mode | Storage |
| --- | --- |
| Local | Files under `data/`, including documents, settings, credentials, lessons, careers, and progress |
| Vercel | Encrypted workspace snapshots in Postgres |
| Netlify | Encrypted workspace snapshots in Netlify Blobs |

For a complete local backup, stop the application and copy `data/` to a private backup location. Restoring that folder restores the local workspace, including its settings and career materials.

### Move local projects to the web app

After creating local projects, run:

```bash
npm run workspace:export
```

This writes `.netlify/paperquest-projects-backup.json`. The same export file works with the Vercel deployment.

In the hosted app, open **Settings → Import local projects**, select the export, and complete the import into an empty workspace. Developer imports can add missing project folders to an existing workspace while preserving existing folders and newer progress.

The export contains project documents, saved lessons and chats, notes, bookmarks, and learning progress. Provider credentials and career/resume files are excluded. Hosted **recovery keys** reopen a full workspace; **judge keys** grant access only to the shared snapshot.

Document text and relevant learning context are sent to the selected AI provider when generating content. PDF extraction runs in the application backend using PDF.js, or locally available Docling.

## Development

### Commands

| Command | Description |
| --- | --- |
| `npm ci` | Install the dependency versions recorded in `package-lock.json` |
| `npm run dev` | Start the frontend and API in development mode |
| `npm run build` | Compile the frontend to `client/dist` |
| `npm start` | Run Express and serve the compiled frontend |
| `npm test` | Run the server test suite |
| `npm run workspace:export` | Export local projects for hosted import |
| `npm run workspace:stage-developer` | Stage a private developer backup using configured hosting credentials |
| `npm run graph:knowledge` | Export a standalone knowledge graph using the optional Python/Graphify toolchain |

### Project structure

```text
paper-quest/
├── client/src/         React interface, graph views, and learning screens
├── server/             Express API, AI adapters, authentication, and storage
├── api/index.mjs       Vercel function entry point
├── netlify/functions/  Netlify function entry points
├── scripts/            Export and maintenance utilities
├── wiki/               Feature, API, and deployment documentation
├── data/               Local workspace data, generated at runtime
├── vite.config.mjs     Frontend build and development proxy
└── vercel.json         Vercel build, routing, and function configuration
```

Before submitting changes, run:

```bash
npm test
npm run build
```

Keep pull requests focused and describe the behavior changed and the checks performed. [Architecture](ARCHITECTURE.md) and the [documentation index](wiki/index.md) provide additional context for contributors.

## Troubleshooting

| Issue | Resolution |
| --- | --- |
| AI connection unavailable | Open **API key**, test a connection, and set it active. Shared connections depend on deployment configuration and provider availability. |
| Provider rate limit | Retry after the provider's reset interval or switch to another configured connection. |
| PDF contains no extractable text | Upload a searchable PDF or a Markdown version of the document. |
| Hosted upload exceeds the limit | Use a file under 4 MB. Hosted workspaces have a 24 MB application storage limit. |
| Hosted task times out | Retry with a smaller document or use local mode. The Vercel function is configured for a maximum duration of 300 seconds. |
| 3D rendering unavailable | Use the 2D graph view. The app also provides a fallback when WebGL is unavailable. |
| Google reports an origin or redirect mismatch | Match the deployed origin and redirect URI exactly in the OAuth client configuration, then allow time for the change to apply. |
| API reports storage is not configured | Connect Postgres, confirm `DATABASE_URL` is available to the deployment, and redeploy. |
| Port 3001 is occupied | Set `PORT` before `npm start`. For `npm run dev`, also update the API proxy target in `vite.config.mjs` to match. |

To use another port for the local production build:

```powershell
# PowerShell
$env:PORT = "3002"
npm start
```

```bash
# macOS / Linux
PORT=3002 npm start
```
