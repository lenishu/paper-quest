import React, { useMemo, useRef, useState } from 'react';
import Galaxy3D from './Galaxy3D';
import BrainMap from './BrainMap';
import { api } from '../api';
import { branchColor } from '../graphLayout';
import { useToast } from './bits';
import { WEBGL_OK, GL3DBoundary } from '../webgl';

const TIER_LABEL = { novice: 'NOVICE', intermediate: 'INTERMEDIATE', advanced: 'ADVANCED', base: 'BASELINE' };

// The dark "Your Knowledge Galaxy" panel: 3D concept network + node inspector card.
export default function GalaxyPanel({ galaxy, onOpenConcept, onOpenProject, onRefresh, onTryDemo, tall = false, title = 'Your Knowledge Galaxy', subtitle = 'Explore concepts. Unlock understanding.' }) {
  const toast = useToast();
  const heroRef = useRef(null);
  const g3dRef = useRef(null);
  const [sel, setSel] = useState(null);
  const [branch, setBranch] = useState(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [rotate, setRotate] = useState(true);
  const [mode, setMode] = useState(WEBGL_OK ? '3d' : '2d');
  const [glBroken, setGlBroken] = useState(!WEBGL_OK);

  const concepts = galaxy?.concepts || [];
  const edges = galaxy?.edges || [];
  const branches = useMemo(() => {
    const m = new Map();
    for (const c of concepts) m.set(c.branch || 'other', (m.get(c.branch || 'other') || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [concepts]);

  const shown = useMemo(() => (branch ? concepts.filter((c) => (c.branch || 'other') === branch) : concepts), [concepts, branch]);
  const selConcept = sel ? concepts.find((c) => c.id === sel.id) || sel : null;

  const prereqs = useMemo(() => {
    if (!selConcept) return [];
    return edges.filter((e) => e.to === selConcept.id).map((e) => concepts.find((c) => c.id === e.from)).filter(Boolean);
  }, [selConcept, edges, concepts]);

  const masteryPct = selConcept
    ? selConcept.state === 'mastered' ? 100
      : prereqs.length ? Math.round((prereqs.filter((p) => p.state === 'mastered').length / prereqs.length) * 100)
        : selConcept.state === 'ready' ? 50 : 0
    : 0;

  const isAdvanced = selConcept && (selConcept.core || selConcept.tier === 'advanced');

  async function toggleBookmark() {
    const pid = selConcept.projects && selConcept.projects[0] && selConcept.projects[0].id;
    if (!pid) return;
    try {
      const r = await api(`/projects/${pid}/bookmarks/toggle`, { method: 'POST', body: { conceptId: selConcept.id } });
      toast(r.bookmarked ? 'Added to your “to review” list.' : 'Removed from “to review”.', 'info');
      onRefresh && onRefresh();
    } catch (e) { toast(e.message, 'err'); }
  }

  function fullscreen() {
    const el = heroRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen && el.requestFullscreen();
  }

  return (
    <div ref={heroRef} className={`hero ${tall ? 'hero-tall' : ''}`}>
      {mode === '3d' ? (
        <GL3DBoundary onFail={() => { setMode('2d'); setGlBroken(true); }}>
          <Galaxy3D ref={g3dRef} concepts={shown} edges={edges} selectedId={selConcept?.id} rotate={rotate}
            onSelect={(n) => setSel(n ? { id: n.id } : null)} />
        </GL3DBoundary>
      ) : (
        <div className="galaxy2d"><BrainMap concepts={shown} edges={edges} onOpen={onOpenConcept} /></div>
      )}

      <div className="hero-head">
        <h1 className="hero-title">{title}</h1>
        <p className="hero-sub">{subtitle}</p>
        <div className="hero-filter">
          <button className="hero-pill" onClick={() => setBranchOpen((v) => !v)}>
            <span className="hero-pill-star">✦</span> {branch ? branch : 'All branches'} <span className="hero-pill-caret">▾</span>
          </button>
          {branchOpen && (
            <div className="hero-menu">
              <button className={!branch ? 'on' : ''} onClick={() => { setBranch(null); setBranchOpen(false); }}>All branches</button>
              {branches.map((b) => (
                <button key={b} className={branch === b ? 'on' : ''} onClick={() => { setBranch(b); setBranchOpen(false); }}>
                  <i style={{ background: branchColor(b) }} />{b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hero-controls">
        {mode === '3d' && <button title={rotate ? 'Pause rotation' : 'Resume rotation'} onClick={() => setRotate((v) => !v)}>{rotate ? '☀' : '☾'}</button>}
        {!glBroken && <button title={mode === '3d' ? 'Switch to 2D map' : 'Switch to 3D galaxy'} onClick={() => setMode((m) => (m === '3d' ? '2d' : '3d'))}>▦</button>}
        {mode === '3d' && <button title="Fit view" onClick={() => g3dRef.current && g3dRef.current.fit()}>⊚</button>}
        <button title="Fullscreen" onClick={fullscreen}>⛶</button>
      </div>

      {selConcept && (
        <div className="hero-card">
          <div className="hc-top">
            <div className="hc-name-wrap">
              <span className="hc-stripe" style={{ background: branchColor(selConcept.branch) || '#98938B' }} />
              <span className="hc-name">{selConcept.core ? '★ ' : ''}{selConcept.name}</span>
            </div>
            <div className="hc-top-actions">
              {isAdvanced && <button title={selConcept.flagged ? 'Remove bookmark' : 'Bookmark to review'} className={selConcept.flagged ? 'on' : ''} onClick={toggleBookmark}>{selConcept.flagged ? '♥' : '♡'}</button>}
              <button title="Close" onClick={() => setSel(null)}>✕</button>
            </div>
          </div>
          <div className="hc-meta">
            <span className="hc-branch">{selConcept.branch}</span>
            <span className={`hc-tier hc-tier-${selConcept.core ? 'core' : selConcept.tier}`}>{selConcept.core ? '★ CORE' : TIER_LABEL[selConcept.tier] || 'CONCEPT'}</span>
          </div>
          <div className="hc-row"><span className="hc-label">{selConcept.state === 'mastered' ? 'Mastered' : selConcept.state === 'ready' ? 'Ready to learn' : 'Prereqs done'}</span><span className="hc-pct">{masteryPct}%</span></div>
          <div className="hc-bar"><div style={{ width: `${masteryPct}%` }} /></div>
          {selConcept.projects && selConcept.projects.length > 0 && (
            <>
              <div className="hc-label hc-label-mt">Used in {selConcept.projects.length} project{selConcept.projects.length > 1 ? 's' : ''}</div>
              <div className="hc-chips">
                {selConcept.projects.map((p) => (
                  <button key={p.id} title={p.name} onClick={() => onOpenProject(p.id)}>{(p.name || '?').trim()[0].toUpperCase()}</button>
                ))}
              </div>
            </>
          )}
          {prereqs.length > 0 && (
            <>
              <div className="hc-label hc-label-mt">Prerequisites</div>
              <div className="hc-dots">
                {prereqs.map((p) => (
                  <span key={p.id} title={`${p.name} — ${p.state === 'mastered' ? 'mastered' : p.state === 'ready' ? 'ready' : 'not yet'}`}
                    style={{ background: p.state === 'mastered' ? '#1F9D57' : p.state === 'ready' ? '#F59E0B' : '#5c5854' }} />
                ))}
              </div>
            </>
          )}
          <div className="hc-actions">
            <button className="hc-primary" onClick={() => selConcept.projects && selConcept.projects[0] && onOpenConcept(selConcept.projects[0].id, selConcept.id)}>
              {selConcept.state === 'mastered' ? 'Review Lesson' : 'Open Lesson'}
            </button>
          </div>
        </div>
      )}

      <div className="hero-legend">
        <span><i style={{ background: '#34d399' }} /> mastered</span>
        <span><i style={{ background: '#F59E0B' }} /> ready</span>
        <span><i style={{ background: '#8b857f' }} /> not yet</span>
      </div>

      {concepts.length > 0 ? (
        <div className="hero-hint">
          <span className="hero-hint-dot">◉</span>
          {mode === '3d' ? 'Scroll to zoom · Drag to rotate · Click a node to inspect' : 'Scroll to zoom · Drag to pan · Click a node to open'}
        </div>
      ) : (
        <div className="hero-empty">
          <p>Your galaxy is empty — add a paper and its concepts appear here as stars.</p>
          {onTryDemo && <button onClick={onTryDemo}>✦ Try the demo project</button>}
        </div>
      )}
    </div>
  );
}
