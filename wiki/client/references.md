# Reference explorer — ResearchRabbit-style citation map

Click 🔗 References on a paper (`PapersView.jsx`) and you get a three-pane
explorer: every paper on the map (left), the citation map itself (centre), the
selected paper (right). Selecting anywhere selects everywhere; from the detail
pane you pull in more papers and the map grows.

Files: `client/src/components/ReferencesModal.jsx` (panes, data, expansion),
`client/src/components/ReferenceGraph.jsx` (canvas map),
`server/references.js`, references + `/api/s2/…` routes in `server/index.js`.

## Data flow
1. **Seed** — `GET /projects/:id/papers/:paperId/references` matches the local
   paper on Semantic Scholar and returns `{ matched, references[], citations[] }`.
   The modal turns that into nodes + edges and marks `refs:<seed>` /
   `cited:<seed>` as already expanded.
2. **Pivot** — selecting any paper (list card or map node) **auto-fetches its
   similar work**: a debounced effect calls `GET /api/s2/papers/:s2Id/similar`
   ~450 ms after the selection settles, so clicking through the list fires one
   request, not one per card. It re-arms when `busy` clears, so a click made
   mid-fetch is not dropped. Refs / Cited By stay manual — they are large, and
   pulling every citing paper on every click would drown the map. Same endpoint,
   `mode` = `similar|refs|cited`.

Edges are always **citing → cited**; `similar` edges carry `type: 'similar'` and
draw dashed. `merge()` de-dupes by paper id and by edge key, so a paper arriving
twice (a reference that is also "similar") enriches the existing node instead of
duplicating it.

## Panes
Detail pane order is title → meta → links → **abstract** (flex, scrolls, sticky
heading) → dive bar pinned to the bottom with `margin-top: auto`. The abstract
appears instantly on click because `FIELDS` already carries it — no request.

Grid gotcha worth keeping: `.refs-explorer-body` needs
`grid-template-rows: minmax(0, 1fr)` **and** `min-height: 0` on the panes.
Without both, the row sizes to `max-content` and a long list stretches the modal
to thousands of pixels instead of scrolling inside its own pane.

## Layout (ReferenceGraph.jsx)
No force simulation — positions are deterministic so the map does not reshuffle
when a node is added: **x = publication year**, **y = citation count on a log
scale** (a few papers have thousands of cites and would flatten the rest onto
one line), radius = citations. Overlaps are resolved by a short relaxation pass
that eases each node back toward its year column, capped at 12 passes above 250
nodes because it is O(n²).

Canvas cannot read CSS custom properties, so `readTokens()` pulls the `--`
design tokens off the DOM once — **do not hardcode colours here** (same rule as
everywhere else, just enforced differently).

## When changing this
- The selection auto-fetch is one `useEffect` in the modal. If you add another
  automatic mode, keep the debounce and the `busy` guard — without them the
  keyless free tier 429s immediately.
- New expansion mode ⇒ add it to `MODES` in `server/references.js` (server
  validates against that map) and add a `diveButton` in the modal.
- Rate limits bite: the seed lookup is the slow, throttled part (title search).
  Expansions are memoised in-process (`CACHE`, 30 min TTL) — that is why
  clicking back and forth is instant. Empty results are never cached.
- The seed lookup's result caches to `paper.refsCache` in `project.json`;
  expansions deliberately do not, or the file would grow without bound.
