# Client shell — App.jsx, navigation, views

`main.jsx` → `App.jsx`. No router lib — route is plain state:
`{ view, id?, tab?, sel? }` with views `dashboard | projects | explore |
career | paths | project`. Project tabs (`ProjectView.jsx`): overview / map / papers /
history. `sel` = selected concept id on the map.

**Opening a concept:** the `ErrorBoundary` is keyed by `view+id+tab`, so switching
tabs REMOUNTS `ProjectView` (internal `sel` state is lost) and `setTab` clears
`route.sel`. So the only way to land on the map with a node preselected is App's
`openConcept(pid, cid)` (sets `{tab:'map', sel:cid}` in one go → remount reads
`initialSel`). App passes `openConcept` down to `ProjectView` as `onOpenConcept`;
ProjectView's own "View in map"/Overview links route through it. Don't rely on an
internal `setSel` surviving a tab switch.

## Deep links (read once on load, then stripped from the URL)
`/?project=ID&tab=map&sel=CID` (external/legacy entry links), `/?view=projects`,
`/?new=1` (creates a project), `/?settings=1`.
**Change here when:** adding an externally linkable target.

## Data loading
Hosted builds (`VITE_CLOUD=true`) first establish a private workspace cookie
through `/api/session`. `api.js` polls 202 background jobs transparently and
checks the 4 MB upload limit. `WorkspaceSettings.jsx` in Settings exposes the
recovery-key and workspace-switching controls. `AccountSettings.jsx` adds Google
sign-up/sign-in, sign-out, and allowlisted developer backup preview/restore. The
TopBar profile menu opens account settings and shows the signed-in name. Account
changes reload the app to clear cached projects and pending UI state; see
[hosting.md](../hosting.md).

`api.js` is the only fetch helper. App loads `GET /api/dashboard` (→ `dash`,
passed everywhere) and `GET /api/projects` (→ `projects`). `refreshAll` after
mutations. `ProjectView` fetches its own `GET /api/projects/:id` and refetches
when `useJobs().completions[projectId]` bumps (job finished).

## Component map (live ones)
- `TopBar.jsx` — top nav, project rename, tab switch, search, modal openers
- `Sidebar.jsx` — quick actions (upload/new/explore/daily quest/resume)
- `Dashboard.jsx` — home: galaxy panel, quest card (`#quest-card`), stats
- `ProjectsView.jsx` / `PathsView.jsx` / `ExploreView.jsx` (fullscreen galaxy)
- `ProjectView.jsx` — per-project shell: Overview / MapView / PapersView /
  HistoryView + `LearnModal` + `PaperReader` overlays
- `SettingsModal.jsx`, `InfoModals.jsx` (badges/bookmarks/about/help)
  Settings offers two ways to set up a connection: the form, or the
  "Set up with code" panel (`ConnCodePanel`, same file) which parses a pasted
  Python/JS/cURL request into the fields and renders the equivalent request
  back in all three languages — both directions live in `client/src/snippet.js`
  (`parseSnippet` / `renderSnippet`, no network, keys never leave the page).
  Google AI Studio snippets parse too: the key from the `x-goog-api-key`
  header, the model from the `…/models/<model>:generateContent` path, and
  google-genai SDK imports as the provider. For Gemini and Anthropic only the
  host root is kept, because PaperQuest adds the API version itself. A hint
  under each Model field names the model the connection will use (the typed
  value or the provider default). After a paste, the status line repeats that
  model and says when the snippet had no key.
  Providers with `reasoning: true` (OpenRouter) also get a reasoning toggle
  + effort select.
- `bits.jsx` — ToastCtx/ToastHost, Spinner, Confetti (shared primitives)
- Errors: per-view `ErrorBoundary` in App.jsx (crash → reload card);
  errors surface as toasts via `useToast`

## Legacy — do not edit (zero importers)
`SkillTree.jsx`, `Home.jsx`, `HomeDashboard.jsx`, `TopNav.jsx`,
`ProjectTools.jsx`. Live equivalents: SkillTreeCanvas, Dashboard, TopBar,
ProjectView.

## When adding a view
Add the branch in App.jsx's render switch, a nav entry in TopBar/Sidebar, and
(if deep-linkable) a param in the deep-link effect. Styles into `styles.css`
with tokens.
