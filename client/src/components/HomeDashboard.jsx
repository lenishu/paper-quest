import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Spinner } from './bits';
import BrainMap from './BrainMap';

export default function HomeDashboard({ onOpenProject, onOpenConcept, onNew, onDemo }) {
  const [data, setData] = useState(null);
  const [projOpen, setProjOpen] = useState(false);
  const reload = () => api('/brain').then(setData).catch(() => {});
  useEffect(() => { reload(); }, []);
  async function del(id) {
    if (!window.confirm('Delete this project? Its papers and map are removed (mastered concepts stay).')) return;
    try { await api(`/projects/${id}`, { method: 'DELETE' }); reload(); } catch (_) {}
  }
  if (!data) return <Spinner label="Assembling your knowledge…" />;

  const { concepts, edges, counts, projects, profile, daily, suggestion } = data;
  const empty = !concepts || concepts.length === 0;

  return (
    <div className="brain-home">
      <div className="brain-bar">
        <div className="brain-bar-left">
          <span className="stat-chip"><b>L{profile.level || 0}</b> {profile.title || 'Novice'} · {profile.xp || 0} XP</span>
          <span className="stat-chip">🔥 <b>{daily?.streak || 0}</b>d · <b>{daily?.today || 0}</b> today</span>
          <span className="stat-chip dim2"><b className="c-known">{counts.known || 0}</b> known · <b className="c-ready">{counts.ready || 0}</b> ready{counts.flagged ? <> · <b className="c-flag">{counts.flagged}</b> flagged</> : null}</span>
        </div>
        <div className="brain-actions">
          <div className="proj-pop">
            <button className="btn btn-ghost small-btn" onClick={() => setProjOpen((o) => !o)}>Projects ({(projects || []).length}) ▾</button>
            {projOpen && (
              <>
                <div className="pop-back" onClick={() => setProjOpen(false)} />
                <div className="pop-menu">
                  {(projects || []).map((p) => (
                    <div key={p.id} className="pop-item">
                      <button className="pop-open" onClick={() => { onOpenProject(p.id); setProjOpen(false); }}>
                        <span>{p.name}</span><span className="dim small">{p.paperCount}p</span>
                      </button>
                      <button className="pop-del" title="Delete project" onClick={() => del(p.id)}>✕</button>
                    </div>
                  ))}
                  {(!projects || projects.length === 0) && <div className="dim small" style={{ padding: '8px 10px' }}>No projects yet.</div>}
                </div>
              </>
            )}
          </div>
          <button className="btn btn-ghost small-btn" onClick={onDemo}>Demo</button>
          <button className="btn btn-primary small-btn" onClick={onNew}>＋ New paper</button>
        </div>
      </div>

      {suggestion && (
        <button className="suggest-pill" onClick={() => onOpenConcept(suggestion.projectId, suggestion.id)}>
          <span className="suggest-label">Learn next</span>
          <span className="suggest-name">{suggestion.name}</span>
          <span className="suggest-meta">{suggestion.branch} · {suggestion.tier}{suggestion.unblocks ? ` · unlocks ${suggestion.unblocks}` : ''}</span>
          <span className="suggest-go">Start →</span>
        </button>
      )}

      {empty ? (
        <div className="brain-empty">
          <div className="welcome-logo">🧠</div>
          <h1>Your mind map is empty</h1>
          <p className="dim">Add a paper and its concepts light up here — bright means you know it, glowing means you're ready to learn it next, lines connect what builds on what.</p>
          <div className="home-hero-actions">
            <button className="btn btn-primary btn-lg" onClick={onNew}>＋ New paper</button>
            <button className="btn btn-ghost btn-lg" onClick={onDemo}>Try the demo</button>
          </div>
        </div>
      ) : (
        <>
          <BrainMap concepts={concepts} edges={edges} onOpen={onOpenConcept} />
          <div className="brain-legend">
            <span><i className="bl bl-known" /> known</span>
            <span><i className="bl bl-ready" /> ready</span>
            <span><i className="bl bl-locked" /> not yet</span>
            <span className="dim2">drag to pan · scroll to zoom · click a node</span>
          </div>
        </>
      )}
    </div>
  );
}
