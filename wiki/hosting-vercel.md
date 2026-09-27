# Vercel hosting (current)

Vercel's free Hobby plan hosts the app, with a free Neon Postgres database for
storage. The Netlify setup in [hosting.md](hosting.md) still works and describes
the shared parts: private workspaces, Google accounts, developer recovery and
local project import.

## Current deployment

- Production: https://paper-quest-lovat.vercel.app
- Vercel project: `paper-quest`, Hobby plan, connected to `lenishu/paper-quest`.
- Neon database: `paper-quest-db`, Free plan, Washington DC (`iad1`).
- `DATABASE_URL` is connected to production and preview; authentication and
  developer-access variables are configured as production secrets.
- A private, Git-ignored copy of the new authentication secret is saved in
  `.env.vercel.auth`. Keep it stable and backed up; do not publish that file.
- Deployed GitHub commit `de1e7d0` on 2026-09-27. Existing uncommitted local
  changes were not included in this Git-based deployment.
- Live verification passed: session configuration, project persistence,
  workspace isolation, cross-origin rejection, and Markdown/PDF background
  uploads. Temporary verification projects were removed.
- A real Google sign-in remains to be verified on the production origin.
- The production `GOOGLE_CLIENT_ID` override uses the existing `Paper-quest`
  Google web client ending in `ml5p7u4stha35athmf3f6aqcp5p5v5pb.apps.googleusercontent.com`.
  Its authorized JavaScript origins include both the Vercel production URL
  and the existing Netlify URL. The code's default client was not listed in
  the connected Google project, so this environment override is required.

## How it runs

- `vercel.json` builds the client with `VITE_CLOUD=true npm run build` (Vite
  preset, output `client/dist`) and rewrites every `/api/*` request to one Node
  function, `api/index.mjs`. Other paths fall back to `index.html`.
- `api/index.mjs` calls the same `server/cloud.js` handler as the Netlify
  functions. It sets `PAPERQUEST_HOSTED`, the host-neutral switch that replaced
  the old `NETLIFY` check (4 MB uploads, AI redirects blocked, Docling off,
  private workspace required).
- Storage is `server/pgStore.js`: a Postgres table `paperquest_blobs`, created
  on first use, that implements the Blobs calls `cloud.js` and `auth.js` make
  (`get`, `getWithMetadata`, `set` with `onlyIfNew` / `onlyIfMatch`). Each
  write is one atomic statement, and the `etag` column works as
  compare-and-swap, so concurrent requests keep the same conflict behavior as
  on Netlify. Rows hold the same AES-256-GCM sealed snapshots.
- Slow tasks (AI, uploads, reference lookups) run in the same invocation after
  the 202 response, through `waitUntil` from `@vercel/functions`. Hobby caps an
  invocation at 300 seconds, so a task that needs longer fails; its job record
  expires after 15 minutes and can then be retried.
- `includeFiles` adds PDF.js's `pdf.worker.mjs`, which the file tracer cannot
  find on its own (the same problem as on Netlify), and `server/auth-config.json`.
  `excludeFiles` keeps the client build (traced through `express.static`),
  tests, local `data/` and `.env*` out of the function.

## Setup

1. In Vercel, import `lenishu/paper-quest`. `vercel.json` supplies the build
   settings (Vite preset, output `client/dist`).
2. Storage: Project > Storage > Marketplace > **Neon**, free plan, connected to
   the project. It adds `DATABASE_URL`; `POSTGRES_URL` also works.
3. Environment variables (Project > Settings > Environment Variables):

   | Variable | Value |
   | --- | --- |
   | `PAPERQUEST_AUTH_SECRET` | 64 lowercase hex characters; mark **Sensitive** and keep a private copy |
   | `PAPERQUEST_DEVELOPER_EMAILS` | Comma-separated approved Google emails |
   | `PAPERQUEST_DEVELOPER_GOOGLE_SUBS` | Optional Google subject IDs |
   | `GOOGLE_CLIENT_ID` | Optional override of `server/auth-config.json` |
   | `PAPERQUEST_ALLOWED_AI_ORIGINS` | Optional extra trusted AI origins |
   | `PAPERQUEST_SHARED_GEMINI_KEYS` | Free Google AI Studio keys, comma separated; mark **Sensitive**. Every workspace uses them by default, and requests rotate to the next key when one hits its rate limit. Add or replace keys here to cycle them |

4. Redeploy. Environment changes apply only to new deployments.
5. Google Auth Platform: add `https://<project>.vercel.app`, and each custom
   domain, to the web client's **Authorized JavaScript origins**. Preview
   deployments have their own hostnames and cannot sign in unless added.

## Verify

- `GET /api/session` returns `cloud: true` and `googleEnabled: true`.
- Smoke test with a fresh cookie: create a project, upload Markdown and a PDF
  (each finishes as a background job), reload, delete the project. Check that a
  second cookie cannot see the project and that a cross-origin request gets 403.
- Then sign in with Google on the live site.

## Limits and data

- Request bodies are capped at 4.5 MB; the app accepts uploads up to 4 MB.
- Neon's free storage quota bounds the total size of all workspaces. Check the
  current quota in Neon's dashboard.
- Hobby is for personal, non-commercial use.
- Workspaces from a Netlify site do not move to Vercel. Use Settings > Import
  local projects. To stage the private developer backup, run
  `npm run workspace:stage-developer` with `DATABASE_URL` and the deployed
  `PAPERQUEST_AUTH_SECRET` set in your shell.

## Account switching, tours and judge access

- The account menu opens a dedicated account dialog. Switch Google account revokes
  the current app session, preserves its saved workspace, and reopens a neutral
  Google button with automatic account selection disabled.
- A fresh workspace (no projects) starts a 12-step spotlight tour on its first
  dashboard visit: dashboard tracking, the New Project button and form, the real
  Attention Is All You Need paper (embedded from arXiv), its map, the saved
  refresher and quiz, study tools, a sample career built from real tools, the
  knowledge graph, and the API key button. No AI provider key is needed. The
  profile menu restarts it.
- AI works out of the box when `PAPERQUEST_SHARED_GEMINI_KEYS` is set: settings
  show a keyless "Shared API · free" connection, the keys stay on the server, and
  users can still add their own key under 🔑 API key.
- Developer account > Judge access creates a 30-day, revocable read-only snapshot
  at `/?judge=1`: a guided showcase that explains each feature next to live data
  (dashboard tracking, projects of every kind with their maps, saved refreshers
  and quizzes, cheatsheets and summaries, the knowledge graph, and career paths
  with job and resume comparisons). Send the link and key to the judge.
  Refreshing generates a new key and invalidates the previous key. New uploads or
  maps appear after refreshing. Uploaded documents (only arXiv links), notes,
  chats, resumes (only match counts), API keys and workspace recovery tokens are
  excluded.
- Developer backup imports add missing project folders while retaining existing
  project folders and newer progress. A staged backup is restored once on the
  developer's next session. Recovery receipts prevent deleted projects returning.
- On 2026-09-27, the user's nine original projects (31 papers, 27 saved lessons)
  were imported through the authenticated production app. Private backups remain
  outside the repository.

### Full-page Google chooser

The account dialog also offers an OpenID Connect ID-token-only redirect with
`prompt=select_account`. Register `https://paper-quest-lovat.vercel.app/` as an
exact authorized redirect URI. It requests only openid/email/profile, never an
API access token. The callback removes the fragment immediately, validates the
browser state, and submits to the existing server verifier and one-use nonce
challenge. Session cookies remain HttpOnly, Secure and SameSite=Strict; sign-in
finishes through a same-origin API request after returning to the site.
