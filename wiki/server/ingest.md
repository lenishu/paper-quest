# Ingest — upload, PDF→Markdown, references, demo

## Upload route (`POST /api/projects/:id/papers` in server/index.js)
Multer single-file; validated by extension (client also filters:
pdf/md/markdown/txt) and size limit. PDFs are converted then BOTH the .md and
the raw .pdf are saved (`store.savePaperFiles`; raw pdf serves the in-app
PaperReader via `GET …/pdf`).

## server/pdfToMd.js — conversion
`pdfToMarkdown`: prefers **docling** (Python CLI, detected by `hasDocling()`,
best quality) → falls back to **pdf.js** (`pdfjs-dist` legacy build) text
extraction + `rawTextToMarkdown` heuristics (`looksLikeHeading`,
`SECTION_WORDS` regex for abstract/methods/etc.).
**Change here when:** conversion quality issues. Test both paths — docling
present and absent (it's optional by design; never make it required).

## server/references.js — Semantic Scholar
Two entry points:

`resolveReferences(title, apiKey)` — **seed**: search by cleaned title
(`cleanTitle`), fetch references + citations (`FIELDS`), normalize. This is the
slow, heavily throttled path (the title-search endpoints are the ones that
429). Route caches useful results in `paper.refsCache` on the project —
empty/rate-limited answers are deliberately NOT cached so retry works.

`expandPaper(s2Id, mode, apiKey)` — **pivot**: grow the map from any paper
already on it. `mode` ∈ `MODES` (`refs` | `cited` | `similar`); the route
validates against that map, so a new mode only needs adding there. `similar`
uses the *recommendations* API (`S2_REC`), which defaults to a "recent papers"
pool that returns empty for older papers — it falls back to `from=all-cs`.
Results are memoised in-process (`CACHE`, 30 min TTL, 300 entries) because
exploring a graph revisits the same nodes constantly; empty results are not
cached. Not written to `project.json` — that would grow without bound.

`FIELDS` includes `abstract`/`venue` (detail pane) and `referenceCount`/
`citationCount` (the "Refs 61 / Cited By 172" chips), so the UI needs no extra
round trip.

Rate-limit aware throughout (sleeps, backoff retries). `apiKey` (optional) is
the user's Semantic Scholar key from `settings.s2Key` — sent as `x-api-key` to
lift the shared keyless rate limit; both routes pass `store.getSettings().s2Key`.
Needs internet. UI: `ReferencesModal.jsx` + `ReferenceGraph.jsx` from
`PapersView.jsx` (see [client/references.md](../client/references.md)); the key
is set in Settings.

## server/demo.js — zero-key demo
`DEMO_NODES` (hand-written Transformer concept graph), `DEMO_PAPER_MD`,
`DEMO_LESSON_LINEAR_ALGEBRA` (pre-baked lesson so the demo works with no API
key). `POST /api/projects/demo` seeds a project from these. If the node shape
changes (see storage.md), update DEMO_NODES to match.

Netlify uses PDF.js 6 (Node 22.13+) and a 4 MB upload limit. Docling remains available only in local mode. Long uploads run through the hosted background worker; see `../hosting.md`.
