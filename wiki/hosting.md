# Netlify hosting

`netlify.toml` builds the React client with `VITE_CLOUD=true` and publishes
`client/dist`. Netlify runs `netlify/functions/api.mjs` at `/api/*` and
`worker-background.mjs` for slow jobs. Explicit external dependencies include
Express, Multer, serverless-http and PDF.js so the deployment package contains
the modules required by the CommonJS server. The v2 entries load cloud.js with
createRequire so the file tracer follows the original CommonJS requires; an
ESM import had transformed them into untraceable bundled aliases. Netlify traces
these functions file by file, so `included_files` also lists PDF.js's
`legacy/build/pdf.worker.mjs`. PDF.js imports that worker at runtime, the tracer
cannot follow the import, and without it hosted PDF uploads fail with "Setting up
fake worker failed". Use a credit-based Free plan (legacy Free
plans do not include background functions). No paid database or hosted AI key
is required. Visitors supply their own provider keys.

## Private workspaces

`server/cloud.js` issues a random 256-bit recovery token in a Secure, HttpOnly,
SameSite=Strict, host-only cookie. All API requests check Origin/Fetch Metadata.
The SHA-256-derived namespace separates users. Possession of the recovery key
grants workspace access. Optional Google accounts also reopen linked workspaces.
Settings lets users sign in, save their key, or restore a workspace. Losing both
cookie and recovery key for an unlinked workspace requires an independent backup.
Separate people sharing one browser profile should sign out between accounts.

Site-wide Netlify Blobs (`paperquest-private-v1`, strong consistency) stores
AES-256-GCM-encrypted compressed snapshots. Encryption keys derive from the
recovery token, which is never stored with the snapshot. Nothing from local
`data/` is deployed. The site owner controls the running service; this is not
end-to-end encryption against the operator.

Each request hydrates a unique temporary directory. `server/workspace.js`
uses AsyncLocalStorage so the existing atomic file store stays isolated across
simultaneous requests. Identifiers must be safe path segments. Completed
requests save only changed files, merging unrelated changes with conditional
ETag writes. Concurrent edits to the same file return 409 rather than silently
losing data. Temporary files are removed in `finally`. No success response is
returned before persistence succeeds.

## Importing local projects

`npm run workspace:export` runs `scripts/export-workspace.js` and writes the
gitignored `.netlify/paperquest-projects-backup.json`. `server/backup.js`
validates the versioned file map, safe paths, base64, JSON, project metadata,
file count and 24 MB decoded size. Only project files and mastery/profile/
bookmarks are included; credentials and career/resume files are excluded.

Settings > Import local projects sends 1 MB chunks to `/api/session/import`.
One encrypted staging record per workspace expires logically after 30 minutes;
a new upload replaces it. Ordered chunks are retry-safe and use ETag writes.
Finish checks SHA-256, validates the whole backup, and atomically merges it into
an empty workspace with conflict checks. Existing projects/progress cannot be
overwritten; repeating an identical completed import is safe. Successful import
replaces the staging payload with a small receipt. Incomplete uploads remain
encrypted until replaced. Tests cover ownership, corruption, unsafe paths,
credentials exclusion, retries, preservation and original saved lessons.

## Google accounts and developer recovery

`server/auth.js` handles Google sign-up/sign-in and developer authorization.
`AccountSettings.jsx` presents the Google button and recovery preview in Settings;
the profile menu opens it. Local single-user mode has no account requirement.

Configure these production environment variables in Netlify (never use a
`VITE_` prefix for secrets), then redeploy. Ensure they are available to Functions
in the intended deploy context. Mark `PAPERQUEST_AUTH_SECRET` as a secret where
supported, and keep it out of frontend code, build output and logs. Recheck
[Netlify's environment variable requirements](https://docs.netlify.com/build/environment-variables/overview/)
for the current account before selecting scopes or secret controls. Preserve a
private copy of the secret for encrypting the recovery backup.

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Optional override of the public web client ID in `server/auth-config.json` |
| `PAPERQUEST_AUTH_SECRET` | Stable random 32-byte secret, encoded as 64 lowercase hex characters |
| `PAPERQUEST_DEVELOPER_EMAILS` | Comma-separated approved Gmail or Google Workspace emails |
| `PAPERQUEST_DEVELOPER_GOOGLE_SUBS` | Optional comma-separated Google subject IDs, including accounts with other email providers |

The supplied PaperQuest web client ID is saved in `server/auth-config.json`.
It is public and is returned to browsers; a Google client secret is never used.
For another deployment, create a **Web application** client in the [Google Auth Platform](https://console.cloud.google.com/auth/clients).
Configure the consent/branding screen, audience and test users if in testing mode.
Add each production origin, such as `https://paper-questapp.netlify.app` (and each
custom domain you use), to **Authorized JavaScript origins**. Google accepts no
wildcards, so every Netlify project and domain needs its own entry. This uses the GIS popup credential callback;
no client secret or OAuth redirect URI is needed. Follow Google's
[client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

For the current hosted app, use these exact console settings:

| Setting | Value |
| --- | --- |
| Authorized JavaScript origin | `https://paper-questapp.netlify.app` |
| Authorized redirect URIs | None for the current GIS popup flow |
| Browser callback | A JavaScript callback posts the ID token to `/api/auth/google`; this API path is not an OAuth redirect URI |

Local single-user mode uses `http://localhost:3001` for the built app and
`http://localhost:5173` for Vite. It deliberately has no Google account routes;
adding those origins alone does not enable local authentication. If a local
Netlify emulator is used to test the hosted flow, register `http://localhost`
and its actual browser origin with the explicit port. Register each fixed preview
or custom origin separately; do not add the older site's origin unless testing it.

`netlify.toml` sends `Referrer-Policy: strict-origin-when-cross-origin`, which that
guide recommends because loading `gsi/client` is a cross-origin request. The
earlier `no-referrer` did not follow that guidance.
Generate the auth secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
and save it privately. Keep it stable and backed up: changing it invalidates
sessions and makes existing account links and staged backups unreadable.
Missing configuration leaves guest workspaces and manual imports usable.

The official `google-auth-library` verifies signature, audience, issuer and expiry.
An expiring, single-use nonce binds sign-in to the browser workspace and is consumed
with a conditional write. Google `sub` identifies the account; email is display
information and only grants developer privileges when Google is authoritative for
it (verified Gmail or Workspace domain). For other providers, allowlist the Google
subject ID. Account links are encrypted with the server secret. A workspace owner
record prevents a second Google identity from linking an already claimed workspace.
First sign-up keeps the guest workspace; later sign-ins open the linked workspace.
An existing account's guest data is not merged automatically: save its recovery key
before switching. Each browser sign-in attempt has a separate challenge so devices
sharing a workspace do not replace each other's nonce. Challenges expire after ten
minutes and cannot be reused, including simultaneous submissions.

The account session uses a separate Secure/HttpOnly/SameSite=Strict cookie bound to
the workspace, valid for seven days. Developer routes check this session and the
current server allowlist on every request; a recovery key alone cannot grant
developer privileges. Sign out records revocation on the server, clears account/nonce
cookies, invalidates the pending challenge and starts a fresh guest workspace. A copied
account cookie cannot authenticate after logout. Other devices keep their own sessions.
Previously issued recovery keys remain valid bearer access to their data.

Before calling Google authentication verified end to end, sign in with a real Google
account on the target host, reload, sign out, and sign back in to confirm the projects
remain intact. A passing test suite or deployment does not complete Google console
configuration or user consent. The automated auth tests verify the real Google library
against locally signed test tokens; they do not perform a real Google login.

To stage the existing nine-project backup, keep
`.netlify/paperquest-projects-backup.json` private. Set `NETLIFY_SITE_ID`,
`NETLIFY_AUTH_TOKEN` (site-owner access), and the same `PAPERQUEST_AUTH_SECRET` in
your local shell, then run `npm run workspace:stage-developer`. An optional source
path can be passed after `--`. The script validates the backup, encrypts it, and
uploads only to the private `paperquest-private-v1` Blobs store. It refuses to
overwrite an already staged backup. Never put the backup in Git or `client/dist`.
`npm run workspace:export` creates a fresh local backup when needed; preserve an
older backup first if you want its exact project set.

Sign in with the approved developer account, then open **Settings → Developer
access → Check previous projects → Restore**. `GET /api/developer/projects` only
returns counts; `POST` restores validated project data into the developer's
workspace, preserving API settings and newer projects with distinct IDs. Existing
global progress must be empty or identical to the backup. Conflicting work is rejected and
repeating an unchanged completed restore is safe. No route enumerates other users'
workspaces. Original encrypted cloud snapshots cannot be recovered without their
key unless they were already linked to a Google account. Manual backup import is
also available to the signed-in account and does not require staging credentials.

## Long operations

AI calls, PDF/Markdown uploads, and reference lookups are queued in one encrypted
job record per workspace. The normal API sends only the task ID and workspace
cookie to the background worker. Production uses `URL` (the public site), while
previews use `DEPLOY_URL`; private deploy permalinks can otherwise reject the
server-to-server request. CAS claims prevent duplicate
execution on Netlify retries. `client/src/api.js` polls for the original API
response with backoff. A cached lesson runs synchronously without AI.

One slow task may run per workspace. A failed or interrupted worker expires
after 15 minutes and can be retried manually. After a page reload the browser's
progress dock resets; server work continues, and refreshing later shows saved
results. Repeated AI work is never retried automatically. Concurrent edits to
the same record may return 409 and require a manual retry, potentially using
provider tokens again.

## Limits and operation

- 4 MB per upload (Netlify binary payload limit), 24 MB per workspace.
- PDFs use PDF.js on Netlify; optional local Docling still works locally.
- Built-in AI provider HTTPS origins only; the owner may add trusted origins
  through the runtime env var `PAPERQUEST_ALLOWED_AI_ORIGINS` (comma-separated).
  Redirects are blocked for hosted provider calls to prevent SSRF.
- Netlify Free credits are finite. Sites pause on exhaustion; do not enable a
  paid plan or recharge when free-only hosting is required. Provider AI charges
  are separate. This small-workspace snapshot store is intended for light use.
- Run `npm test`, `npm run build`, and `npx netlify build` before deployment.
  Check that `.netlify/functions/*.zip` contain the runtime packages and
  `pdf.worker.mjs` but no local data, tests or `.env` files.
- `server/cloud.test.js` tests sessions, isolation, persistence, concurrent
  writes, recovery, job ownership/claims, cached lessons, and multipart uploads.
- `.netlify/` and `.env*` are ignored. Never commit service tokens or local data.

## Deploy

Import `lenishu/paper-quest` (this repo) into Netlify on a credit-based Free team,
branch `main`, with the settings from `netlify.toml`. Or authenticate the Netlify CLI,
link/create a site in the Free team, then run `npx netlify deploy --build --prod`.
No extra secrets are required for storage or sessions. Netlify automatically
provides the Blobs credentials and deployment URL. Verify `/api/session`, an
isolated demo project, reload persistence, upload, and a completed background
task on the live site. Do not call a successful static build a full deployment.

Production URL: https://paper-questapp.netlify.app/ (a Netlify project created on
2026-09-27 from this repo). The older https://paperquestapp.netlify.app/ builds
from `lenishu/Paperquest` and is not updated from here.

**A new Netlify project starts empty.** It has its own Blobs store and no
environment variables. Set `PAPERQUEST_AUTH_SECRET` and
`PAPERQUEST_DEVELOPER_EMAILS` (see above), add the project's origin to the Google
client, then redeploy: environment changes apply only to later deploys. Until
then `/api/session` reports `googleEnabled: false`. Workspaces, account links and
staged developer backups from another project do not carry over. Use Settings >
Import local projects, or stage the backup again for this project.

**Make the project public.** Credit-based teams created on or after 2026-07-28
start new projects private. While private, every path (`/`, `/api/*`, assets)
returns 401 with Netlify's "This site is private" sign-in page. After the first
production deploy, press **Make public**, or open Project configuration >
General > Visitor access > Project visibility and choose Public. If the team
default is "Private for all projects", change it first under Team settings >
General > Visitor access. `api.mjs` starts jobs by fetching the deploy's own
`/.netlify/functions/worker-background`, and that request hits the same gate.
On a private deploy, uploads, AI actions, and reference lookups fail with
"Could not start the background worker", even for the signed-in owner. Production
dispatch now uses the public site URL to support protected deploy previews.
