import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Modal } from './bits';
import ReferenceGraph from './ReferenceGraph';

// ResearchRabbit-style explorer: a list of every paper on the map (left), the
// citation map itself (centre), and the selected paper (right). Selecting a
// paper anywhere selects it everywhere; from the detail panel you can pull in
// its references, the papers citing it, or similar work, and the map grows.

const MODE_LABEL = { refs: 'references', cited: 'citing papers', similar: 'similar papers' };

function authorLine(p) {
  if (!p.authors || !p.authors.length) return '';
  return p.authors.join(', ') + (p.authors.length >= 4 ? ' et al.' : '');
}

function PaperCard({ p, active, seed, onClick }) {
  return (
    <button className={`ref-card${active ? ' is-active' : ''}`} onClick={onClick}>
      <div className="ref-card-title">{p.title}</div>
      <div className="ref-meta">
        {seed && <span className="ref-tag">this paper</span>}
        {authorLine(p) || 'Unknown authors'}
        {p.year ? ` · ${p.year}` : ''}
        {p.citationCount ? ` · ${p.citationCount} cites` : ''}
      </div>
    </button>
  );
}

export default function ReferencesModal({ id, paper, onClose }) {
  const [phase, setPhase] = useState('loading');
  const [err, setErr] = useState('');
  const [seedId, setSeedId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');

  // Merge new papers/links in without disturbing what is already on the map —
  // the same paper often arrives twice (a reference that is also "similar").
  const merge = (papers, links) => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      for (const p of papers) {
        if (!p || !p.id) continue;
        byId.set(p.id, byId.has(p.id) ? { ...byId.get(p.id), ...p } : p);
      }
      return [...byId.values()];
    });
    setEdges((prev) => {
      const key = (e) => `${e.from}>${e.to}:${e.type || 'cite'}`;
      const seen = new Set(prev.map(key));
      const add = (links || []).filter((e) => e.from && e.to && e.from !== e.to && !seen.has(key(e)));
      return add.length ? [...prev, ...add] : prev;
    });
  };

  const load = (refresh) => {
    setPhase('loading');
    setNote('');
    api(`/projects/${id}/papers/${paper.id}/references${refresh ? '?refresh=1' : ''}`)
      .then((d) => {
        if (!d.matched) { setSeedId(null); setPhase('ready'); return; }
        const seed = d.matched;
        const refs = d.references || [];
        const cites = d.citations || [];
        setSeedId(seed.id);
        setSelectedId(seed.id);
        setNodes([seed, ...refs, ...cites].filter((p) => p && p.id));
        setEdges([
          ...refs.filter((p) => p.id).map((p) => ({ from: seed.id, to: p.id })),
          ...cites.filter((p) => p.id).map((p) => ({ from: p.id, to: seed.id }))
        ]);
        // the seed's own refs/citations just arrived — don't offer to fetch them again
        setExpanded(new Set([`refs:${seed.id}`, `cited:${seed.id}`]));
        setPhase('ready');
      })
      .catch((e) => { setErr(e.message); setPhase('error'); });
  };
  useEffect(() => { load(false); }, [id, paper.id]); // eslint-disable-line

  const expand = async (pid, mode) => {
    const key = `${mode}:${pid}`;
    if (!pid || busy || expanded.has(key)) return;
    setBusy(key);
    setNote('');
    try {
      const d = await api(`/s2/papers/${encodeURIComponent(pid)}/${mode}`);
      const papers = d.papers || [];
      merge(papers, papers.map((p) =>
        mode === 'refs' ? { from: pid, to: p.id }
          : mode === 'cited' ? { from: p.id, to: pid }
            : { from: pid, to: p.id, type: 'similar' }
      ));
      setExpanded((s) => new Set(s).add(key));
      setNote(papers.length ? `Added ${papers.length} ${MODE_LABEL[mode]}.` : `No ${MODE_LABEL[mode]} found for this paper.`);
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(null);
    }
  };

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId]
  );

  // the status line belongs to the expansion that produced it, not to whatever
  // paper the user clicks next
  useEffect(() => { setNote(''); }, [selectedId]);

  // Selecting a paper pulls its similar work in on its own — that is the whole
  // point of the explorer. Debounced so clicking through the list doesn't fire
  // a request per card (Semantic Scholar's free tier is thin), and re-armed
  // when `busy` clears so a click made mid-fetch isn't silently dropped.
  useEffect(() => {
    if (phase !== 'ready' || !selectedId || busy) return;
    if (expanded.has(`similar:${selectedId}`)) return;
    const t = setTimeout(() => expand(selectedId, 'similar'), 450);
    return () => clearTimeout(t);
  }, [selectedId, phase, busy, expanded]); // eslint-disable-line

  const listed = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const match = q
      ? nodes.filter((n) => n.title.toLowerCase().includes(q) || (n.authors || []).join(' ').toLowerCase().includes(q))
      : nodes;
    return [...match].sort((a, b) => {
      if (a.id === seedId) return -1;
      if (b.id === seedId) return 1;
      return (b.citationCount || 0) - (a.citationCount || 0);
    });
  }, [nodes, filter, seedId]);

  const diveButton = (mode, label, count) => {
    const key = `${mode}:${selectedId}`;
    const isDone = expanded.has(key);
    const isBusy = busy === key;
    return (
      <button
        className={`btn small-btn${isDone ? ' btn-ghost' : ''}`}
        disabled={isBusy || isDone || !!busy}
        onClick={() => expand(selectedId, mode)}
        title={isDone ? 'Already on the map' : `Add ${MODE_LABEL[mode]} to the map`}
      >
        {isBusy ? '…' : isDone ? '✓ ' : ''}{label}{count ? ` ${count}` : ''}
      </button>
    );
  };

  return (
    <Modal onClose={onClose} wide className="refs-modal refs-explorer">
      <div className="modal-head">
        <div>
          <span className="eyebrow">Reference network</span>
          <h2 className="refs-title">🔗 {paper.title || paper.name}</h2>
        </div>
        <div className="learn-head-actions">
          {phase === 'ready' && seedId && (
            <span className="dim small refs-count">{nodes.length} papers · {edges.length} links</span>
          )}
          {phase === 'ready' && <button className="btn btn-ghost small-btn" onClick={() => load(true)}>↻ Refresh</button>}
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
      </div>

      {phase === 'loading' && (
        <div className="learn-loading">
          <div className="spinner" />
          <div className="spinner-label">Looking this paper up on Semantic Scholar…</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="learn-error">
          <p>⚠️ {err}</p>
          <div className="modal-actions"><button className="btn" onClick={() => load(false)}>Try again</button></div>
          <p className="dim small">This feature looks papers up online — it needs internet access on the machine running PaperQuest.</p>
        </div>
      )}

      {phase === 'ready' && !seedId && (
        <div className="dim">
          Couldn't match "{paper.title || paper.name}" on Semantic Scholar. Try renaming the paper to its exact published title, then Refresh.
        </div>
      )}

      {phase === 'ready' && seedId && (
        <div className="refs-explorer-body">
          <div className="refs-pane refs-pane-list">
            <input
              className="input refs-filter"
              placeholder={`Filter ${nodes.length} papers…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="refs-list">
              {listed.length === 0 && <div className="dim small">Nothing matches "{filter}".</div>}
              {listed.map((p) => (
                <PaperCard
                  key={p.id}
                  p={p}
                  seed={p.id === seedId}
                  active={p.id === selectedId}
                  onClick={() => setSelectedId(p.id)}
                />
              ))}
            </div>
          </div>

          <div className="refs-pane refs-pane-graph">
            <ReferenceGraph
              nodes={nodes}
              edges={edges}
              seedId={seedId}
              selectedId={selectedId}
              onSelect={(nid) => nid && setSelectedId(nid)}
            />
          </div>

          <div className="refs-pane refs-pane-detail">
            {!selected && <div className="dim small">Click any paper on the map to see it here.</div>}
            {selected && (
              <>
                <div className="refs-col-head">{selected.id === seedId ? 'This paper' : 'Selected paper'}</div>
                <h3 className="refs-detail-title">
                  {selected.url
                    ? <a href={selected.url} target="_blank" rel="noreferrer">{selected.title}</a>
                    : selected.title}
                </h3>
                <div className="ref-meta">
                  {authorLine(selected) || 'Unknown authors'}
                  {selected.venue ? ` · ${selected.venue}` : ''}
                  {selected.year ? ` · ${selected.year}` : ''}
                </div>
                <div className="ref-links">
                  {selected.arxiv && <a href={selected.arxiv} target="_blank" rel="noreferrer">arXiv ↗</a>}
                  {selected.doi && <a href={selected.doi} target="_blank" rel="noreferrer">DOI ↗</a>}
                  {selected.url && <a href={selected.url} target="_blank" rel="noreferrer">Semantic Scholar ↗</a>}
                </div>

                <div className="refs-abstract">
                  <div className="refs-col-head">Abstract</div>
                  {selected.abstract
                    ? <p>{selected.abstract}</p>
                    : <p className="dim small">Semantic Scholar has no abstract on file for this paper.</p>}
                </div>

                <div className="refs-dive">
                  <div className="refs-dive-head">
                    Dive deeper on this paper
                    {busy === `similar:${selected.id}` && <span className="refs-dive-busy">finding similar work…</span>}
                  </div>
                  <div className="refs-dive-row">
                    {diveButton('similar', 'Similar')}
                    {diveButton('refs', 'Refs', selected.referenceCount)}
                    {diveButton('cited', 'Cited By', selected.citationCount)}
                  </div>
                  {note && <div className="dim small refs-note">{note}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
