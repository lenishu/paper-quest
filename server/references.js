// Reference / citation network via the free Semantic Scholar Graph API.
// Two jobs:
//   1. resolveReferences(title)  - seed: match a LOCAL paper by title, then get
//      the papers it cites and the papers citing it.
//   2. expandPaper(s2Id, mode)   - pivot: from ANY paper already on the graph,
//      pull its references / citations / similar papers. This is what powers
//      the ResearchRabbit-style click-to-expand explorer.
// The keyless tier is aggressively rate-limited (shared IP pool), so requests
// run sequentially with exponential-backoff retries on 429/5xx, and expansion
// results are memoised (see CACHE below) because exploring a graph revisits
// the same nodes constantly.
const S2 = 'https://api.semanticscholar.org/graph/v1';
const S2_REC = 'https://api.semanticscholar.org/recommendations/v1';
// abstract/venue feed the detail panel; the counts feed the "Refs 61 / Cited By
// 172" chips, so the UI can show them without another round trip.
const FIELDS = 'title,year,authors,externalIds,url,abstract,venue,citationCount,referenceCount';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns parsed JSON, or null on 404 (no match). Retries 429/5xx with backoff.
// An optional API key (Semantic Scholar) lifts the shared keyless rate limit.
async function s2(url, apiKey, attempts = 4) {
  let lastErr;
  const headers = { 'User-Agent': 'PaperQuest/1.0 (learning tool)' };
  if (apiKey) headers['x-api-key'] = apiKey;
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch {
      lastErr = Object.assign(new Error('Could not reach Semantic Scholar — this feature needs internet access on the machine running PaperQuest.'), { status: 502 });
      await sleep(1000 * (i + 1));
      continue;
    }
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      lastErr = Object.assign(new Error('Semantic Scholar is rate-limiting the free API even after several retries. Wait a minute, then try again — results are cached once fetched.'), { status: 503 });
      await sleep(Math.max(retryAfter * 1000, 1200 * Math.pow(2, i)));
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`Semantic Scholar error ${res.status}`), { status: 502 });
    return res.json();
  }
  throw lastErr;
}

function normalize(p) {
  if (!p) return null;
  const ext = p.externalIds || {};
  return {
    id: p.paperId || null,
    title: p.title || 'Untitled',
    year: p.year || null,
    authors: (p.authors || []).slice(0, 4).map((a) => a.name),
    abstract: p.abstract || null,
    venue: p.venue || null,
    citationCount: p.citationCount || 0,
    referenceCount: p.referenceCount || 0,
    arxiv: ext.ArXiv ? `https://arxiv.org/abs/${ext.ArXiv}` : null,
    doi: ext.DOI ? `https://doi.org/${ext.DOI}` : null,
    url: p.url || (p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : null)
  };
}

// Uploaded papers often carry a filename, not a title: strip the extension and
// separators. A trailing "(demo)"/"(copy)" marker goes too — left in, the fuzzy
// title search happily matches some unrelated paper whose title starts with
// "Demo:", which is exactly what the demo project used to do.
function cleanTitle(title) {
  return String(title || '')
    .replace(/\.(pdf|md|markdown|txt)$/i, '')
    .replace(/\s*\((demo|copy|draft|v\d+)\)\s*$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

async function resolveReferences(title, apiKey) {
  const q = cleanTitle(title);
  if (!q) return { matched: null, references: [], citations: [] };

  // exact-ish title match first, relaxed keyword search as fallback
  let paper = null;
  const match = await s2(`${S2}/paper/search/match?query=${encodeURIComponent(q)}&fields=${FIELDS}`, apiKey);
  paper = match && match.data && match.data[0];
  if (!paper || !paper.paperId) {
    await sleep(1100);
    const search = await s2(`${S2}/paper/search?query=${encodeURIComponent(q)}&fields=${FIELDS}&limit=1`, apiKey);
    paper = search && search.data && search.data[0];
  }
  if (!paper || !paper.paperId) return { matched: null, references: [], citations: [] };

  // sequential (not parallel) to stay under the shared rate limit
  await sleep(1100);
  const refs = await s2(`${S2}/paper/${paper.paperId}/references?fields=${FIELDS}&limit=80`, apiKey).catch(() => null);
  await sleep(1100);
  const cites = await s2(`${S2}/paper/${paper.paperId}/citations?fields=${FIELDS}&limit=40`, apiKey).catch(() => null);

  const references = ((refs && refs.data) || []).map((r) => normalize(r.citedPaper)).filter(Boolean);
  const citations = ((cites && cites.data) || []).map((c) => normalize(c.citingPaper)).filter((x) => x && x.title);
  citations.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
  return { matched: normalize(paper), references, citations };
}

// ---------------- graph expansion (click a node, grow the network) ----------

const MODES = {
  // edge direction is always "citing paper -> cited paper"
  refs:    { limit: 40, label: 'references' },
  cited:   { limit: 40, label: 'citations' },
  similar: { limit: 20, label: 'similar papers' }
};

// Exploring a graph revisits nodes constantly (click A, click B, click back to
// A). Without this every revisit is another rate-limited round trip.
const CACHE = new Map(); // `${mode}:${id}` -> { at, value }
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 300;

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  return hit.value;
}

function cacheSet(key, value) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value); // oldest out
  CACHE.set(key, { at: Date.now(), value });
}

// Returns { mode, papers[], cached } — papers are normalized and de-duped.
// Empty results are NOT cached, so a rate-limited answer stays retryable.
async function expandPaper(s2Id, mode, apiKey) {
  const cfg = MODES[mode];
  if (!cfg) throw Object.assign(new Error(`Unknown expansion mode: ${mode}`), { status: 400 });
  if (!s2Id) throw Object.assign(new Error('Missing paper id'), { status: 400 });

  const key = `${mode}:${s2Id}`;
  const hit = cacheGet(key);
  if (hit) return { mode, papers: hit, cached: true };

  let papers = [];
  if (mode === 'similar') {
    // The recommendations API defaults to a "recent papers" pool, which comes
    // back empty for anything older than a couple of years. Try that first
    // (freshest, most relevant work), then fall back to the full CS corpus.
    const rec = (pool) =>
      s2(`${S2_REC}/papers/forpaper/${encodeURIComponent(s2Id)}?${pool}fields=${FIELDS}&limit=${cfg.limit}`, apiKey);
    let out = await rec('');
    let list = (out && out.recommendedPapers) || [];
    if (!list.length) {
      await sleep(700);
      out = await rec('from=all-cs&');
      list = (out && out.recommendedPapers) || [];
    }
    papers = list.map(normalize).filter(Boolean);
  } else {
    const path = mode === 'refs' ? 'references' : 'citations';
    const data = await s2(`${S2}/paper/${encodeURIComponent(s2Id)}/${path}?fields=${FIELDS}&limit=${cfg.limit}`, apiKey);
    const rows = (data && data.data) || [];
    papers = rows.map((r) => normalize(mode === 'refs' ? r.citedPaper : r.citingPaper)).filter(Boolean);
  }

  papers = papers.filter((p) => p.id && p.title);
  const seen = new Set();
  papers = papers.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  papers.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));

  if (papers.length) cacheSet(key, papers);
  return { mode, papers, cached: false };
}

module.exports = { resolveReferences, expandPaper, MODES };
