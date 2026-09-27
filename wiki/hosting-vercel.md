# Vercel hosting (current)

Vercel's free Hobby plan hosts the app, with a free Neon Postgres database for
storage. The Netlify setup in [hosting.md](hosting.md) still works and describes
the shared parts: private workspaces, Google accounts, developer recovery and
local project import.

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
