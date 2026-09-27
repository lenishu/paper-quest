import React, { useEffect, useMemo, useRef, useState } from 'react';
import { branchColor } from '../graphLayout';
import { WEBGL_OK, GL3DBoundary } from '../webgl';
import KnowledgeGraph3D from './KnowledgeGraph3D';

const STATE = {
  mastered: { c: '#1F9D57', t: 'Mastered' },
  known: { c: '#2E86AB', t: 'Known (from your resume)' },
  ready: { c: '#F59E0B', t: 'Ready to learn' },
  locked: { c: '#8a837b', t: 'Locked — finish prerequisites first' }
};

// One force-directed pass, deterministic, run once per data change (no live jitter).
function layout(nodes, edges) {
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const branches = [];
  nodes.forEach((n) => { if (branches.indexOf(n.branch) < 0) branches.push(n.branch); });
  nodes.forEach((n, i) => {
    const bi = branches.indexOf(n.branch);
    const a = (bi / Math.max(1, branches.length)) * 6.283 + i * 0.15;
    const r = 120 + ((i * 53) % 170);
    n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; n.vx = 0; n.vy = 0;
  });
  const E = edges.filter((e) => byId[e.from] && byId[e.to]);
  for (let it = 0; it < 190; it++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]; a.vx *= 0.85; a.vy *= 0.85;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]; const dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy + 0.01;
        const f = 560 / d2; const d = Math.sqrt(d2); const ux = dx / d, uy = dy / d;
        a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
      }
      a.vx -= a.x * 0.0016; a.vy -= a.y * 0.0016;
    }
    E.forEach((e) => {
      const a = byId[e.from], b = byId[e.to]; const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1; const f = (d - 66) * 0.012; const ux = dx / d, uy = dy / d;
      a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
    });
    for (let k = 0; k < nodes.length; k++) { nodes[k].x += nodes[k].vx; nodes[k].y += nodes[k].vy; }
  }
  return branches;
}

export default function KnowledgeGraph({ nodes, edges, compact = false, height = 460, onOpenConcept, onExpand }) {
  const canvasRef = useRef(null);
  const ctrl = useRef({});
  const g3dRef = useRef(null);
  const [focusId, setFocusId] = useState(null);
  const [hideBranch, setHideBranch] = useState({});
  const [query, setQuery] = useState('');
  // The dashboard mini stays 2D on purpose: the hero galaxy above it already
  // holds a WebGL context, and browsers cap how many can be live at once.
  const [mode, setMode] = useState(!compact && WEBGL_OK ? '3d' : '2d');
  const [glBroken, setGlBroken] = useState(!WEBGL_OK);
  const is3d = mode === '3d' && !compact;

  const data = useMemo(() => {
    const ns = nodes.map((n) => ({ ...n }));
    const branches = layout(ns, edges);
    const byId = {}; ns.forEach((n) => { byId[n.id] = n; });
    const pre = {}, unl = {};
    edges.forEach((e) => { if (!byId[e.from] || !byId[e.to]) return; (unl[e.from] = unl[e.from] || []).push(e.to); (pre[e.to] = pre[e.to] || []).push(e.from); });
    return { ns, byId, branches, pre, unl, edges: edges.filter((e) => byId[e.from] && byId[e.to]) };
  }, [nodes, edges]);

  const focus = focusId ? data.byId[focusId] : null;
  const prereqs = focus ? (data.pre[focus.id] || []).map((id) => data.byId[id]).filter(Boolean) : [];
  const unlocks = focus ? (data.unl[focus.id] || []).map((id) => data.byId[id]).filter(Boolean) : [];

  const travel = (id) => {
    setFocusId(id);
    const n = data.byId[id];
    if (!n) return;
    if (is3d) g3dRef.current && g3dRef.current.warp(id);
    else if (ctrl.current.warp) ctrl.current.warp(n);
  };
  const fitView = () => {
    if (is3d) g3dRef.current && g3dRef.current.fit();
    else if (ctrl.current.fit) ctrl.current.fit();
  };

  // What the 3D view renders: the branch filter is applied to the data rather
  // than at draw time, the way the 2D canvas does it.
  const shown = useMemo(() => {
    const ns = data.ns.filter((n) => !hideBranch[n.branch]);
    const ids = new Set(ns.map((n) => n.id));
    return { nodes: ns, edges: data.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  }, [data, hideBranch]);

  // canvas render loop + interaction (imperative; reads focus/hide via refs)
  const focusRef = useRef(null); focusRef.current = focusId;
  const hideRef = useRef({}); hideRef.current = hideBranch;
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    let W = 0, H = 0; const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const view = { x: 0, y: 0, s: compact ? 0.75 : 1 }; let tview = null; let raf;
    const { ns, byId, pre, unl, edges: E } = data;
    const w2s = (x, y) => [(x - view.x) * view.s + W / 2, (y - view.y) * view.s + H / 2];
    const s2w = (px, py) => [(px - W / 2) / view.s + view.x, (py - H / 2) / view.s + view.y];
    const neigh = (n) => (pre[n.id] || []).concat(unl[n.id] || []);
    function resize() { const r = cv.parentNode.getBoundingClientRect(); if (r.width < 2) return; if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) { W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; } }
    function draw() {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
      const fid = focusRef.current; const hb = hideRef.current;
      const f = fid ? byId[fid] : null;
      let lit = null; if (f) { lit = {}; lit[f.id] = 1; neigh(f).forEach((id) => { lit[id] = 1; }); }
      E.forEach((e) => { const a = byId[e.from], b = byId[e.to]; if (hb[a.branch] || hb[b.branch]) return;
        const on = lit && lit[a.id] && lit[b.id]; const pa = w2s(a.x, a.y), pb = w2s(b.x, b.y);
        ctx.strokeStyle = on ? 'rgba(228,231,236,.5)' : (lit ? 'rgba(244,241,236,.04)' : 'rgba(244,241,236,.08)');
        ctx.lineWidth = on ? 1.6 : 1; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); });
      ns.forEach((n) => { if (hb[n.branch]) return; const p = w2s(n.x, n.y); const dim = lit && !lit[n.id];
        const base = branchColor(n.branch) || '#98938B'; const r = (n.core ? 8 : 5.5) * Math.max(0.8, Math.min(view.s, 2));
        ctx.globalAlpha = dim ? 0.16 : 1; ctx.fillStyle = base; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill();
        const st = STATE[n.state]; if (st && n.state !== 'locked') { ctx.strokeStyle = st.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 3, 0, 6.2832); ctx.stroke(); }
        if (f && f.id === n.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, 6.2832); ctx.stroke(); }
        ctx.globalAlpha = 1;
        const showLabel = (lit && lit[n.id]) || (!lit && (n.core || view.s > 1.5));
        if (showLabel && !dim && !compact) { ctx.fillStyle = f && f.id === n.id ? '#fff' : 'rgba(244,241,236,.82)'; ctx.font = (n.core ? '500 12px ' : '400 11px ') + 'system-ui, sans-serif'; ctx.textAlign = 'center'; const nm = n.name.length > 26 ? n.name.slice(0, 25) + '…' : n.name; ctx.fillText(nm, p[0], p[1] - r - 6); } });
    }
    function loop() { raf = requestAnimationFrame(loop); resize(); if (tview) { view.x += (tview.x - view.x) * 0.16; view.y += (tview.y - view.y) * 0.16; view.s += (tview.s - view.s) * 0.16; if (Math.abs(tview.x - view.x) < 0.4 && Math.abs(tview.y - view.y) < 0.4) { view.x = tview.x; view.y = tview.y; view.s = tview.s; tview = null; } } draw(); }
    function hit(px, py) { let best = null, bd = 18; const hb = hideRef.current; for (let i = ns.length - 1; i >= 0; i--) { const n = ns[i]; if (hb[n.branch]) continue; const p = w2s(n.x, n.y); const d = Math.hypot(p[0] - px, p[1] - py); if (d < bd) { bd = d; best = n; } } return best; }
    let drag = null;
    const onDown = (e) => { const rc = cv.getBoundingClientRect(); const px = e.clientX - rc.left, py = e.clientY - rc.top; const n = hit(px, py); if (n) { ctrl.current._sel(n.id); } else { drag = { px, py, vx: view.x, vy: view.y }; } };
    const onMove = (e) => { if (!drag) return; const rc = cv.getBoundingClientRect(); const px = e.clientX - rc.left, py = e.clientY - rc.top; view.x = drag.vx - (px - drag.px) / view.s; view.y = drag.vy - (py - drag.py) / view.s; tview = null; draw(); };
    const onUp = () => { drag = null; };
    const onWheel = (e) => { e.preventDefault(); const rc = cv.getBoundingClientRect(); const px = e.clientX - rc.left, py = e.clientY - rc.top; const wpt = s2w(px, py); const fc = e.deltaY < 0 ? 1.12 : 0.89; view.s = Math.max(0.35, Math.min(4, view.s * fc)); const np = w2s(wpt[0], wpt[1]); view.x += (np[0] - px) / view.s; view.y += (np[1] - py) / view.s; tview = null; draw(); };
    cv.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); cv.addEventListener('wheel', onWheel, { passive: false });
    // Snap to target immediately (works even if rAF is throttled), loop just smooths it.
    ctrl.current.warp = (n) => { tview = { x: n.x, y: n.y, s: Math.max(view.s, compact ? 1.1 : 1.6) }; draw(); };
    ctrl.current.fit = () => { tview = { x: 0, y: 0, s: compact ? 0.7 : 0.9 }; draw(); };
    ctrl.current.render = draw;
    // ResizeObserver sizes the canvas the moment the stage gets a width — independent
    // of rAF (which browsers throttle in background/offscreen tabs). This is what makes
    // the first paint reliable; the rAF loop only adds smooth warp/pan animation.
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(cv.parentNode);
    resize(); draw();
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); cv.removeEventListener('wheel', onWheel); };
    // is3d is a dep so switching back to 2D re-initialises the canvas (in 3D the
    // canvas is not mounted at all and this effect no-ops on the null ref).
  }, [data, compact, is3d]);

  // Redraw on focus/filter change even when the rAF loop is throttled.
  useEffect(() => { if (ctrl.current.render) ctrl.current.render(); }, [focusId, hideBranch]);

  // bridge canvas node-click -> React travel (stable ref)
  ctrl.current._sel = (id) => { if (compact && onExpand) { onExpand(id); return; } travel(id); };

  const branchCounts = useMemo(() => { const c = {}; data.ns.forEach((n) => { c[n.branch] = (c[n.branch] || 0) + 1; }); return c; }, [data]);
  const topBranches = useMemo(() => data.branches.slice().sort((a, b) => branchCounts[b] - branchCounts[a]).slice(0, 8), [data, branchCounts]);
  const onSearch = (e) => { if (e.key !== 'Enter') return; const q = query.toLowerCase().trim(); if (!q) return; const m = data.ns.find((n) => n.name.toLowerCase().includes(q)); if (m) travel(m.id); };

  return (
    <div className={`kgraph ${compact ? 'kgraph-compact' : ''}`}>
      {!compact && (
        <div className="kgraph-bar">
          <div className="kgraph-crumbs">
            {focus ? <><span className="kgc-focus">{focus.core ? '★ ' : ''}{focus.name}</span></>
              : <span className="kgraph-hint">Click a star to travel · drag to {is3d ? 'rotate' : 'pan'} · scroll to zoom</span>}
          </div>
          <div className="kgraph-search"><span className="ico">⌕</span>
            <input value={query} placeholder="Jump to a concept…" onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearch} /></div>
        </div>
      )}
      <div className="kgraph-stage" style={{ height }}>
        {is3d ? (
          <GL3DBoundary onFail={() => { setMode('2d'); setGlBroken(true); }}>
            <KnowledgeGraph3D ref={g3dRef} nodes={shown.nodes} edges={shown.edges} focusId={focusId}
              onSelect={(id) => ctrl.current._sel(id)} />
          </GL3DBoundary>
        ) : (
          <canvas ref={canvasRef} className="kgraph-canvas" />
        )}
        {compact && <button className="kgraph-expand" onClick={() => onExpand && onExpand(null)}>Open full graph ⤢</button>}
        {!compact && (
          <>
            <div className="kgraph-legend">
              <span><i style={{ background: '#1F9D57' }} />mastered</span>
              <span><i style={{ background: '#2E86AB' }} />known</span>
              <span><i style={{ background: '#F59E0B' }} />ready</span>
              <span><i style={{ background: '#8a837b' }} />locked</span>
              <span className="kgl-note">{is3d ? 'locked keeps its branch hue · size = tier' : 'color = branch'}</span>
            </div>
            <div className="kgraph-chips">
              {topBranches.map((b) => {
                const off = hideBranch[b];
                return <button key={b} className={off ? '' : 'on'} style={{ color: off ? '#6b655d' : branchColor(b) }}
                  onClick={() => setHideBranch((h) => ({ ...h, [b]: !h[b] }))}><i style={{ background: branchColor(b) }} />{b}</button>;
              })}
            </div>
            <div className="kgraph-ctrls">
              {!glBroken && (
                <button title={is3d ? 'Switch to 2D map' : 'Switch to 3D galaxy'}
                  onClick={() => setMode((m) => (m === '3d' ? '2d' : '3d'))}>▦</button>
              )}
              <button title="Fit view" onClick={fitView}>⊚</button>
            </div>
          </>
        )}
        {!compact && focus && (
          <div className="kgraph-panel">
            <button className="kgp-x" onClick={() => setFocusId(null)}>✕</button>
            <div className="kgp-branch">{focus.branch}</div>
            <h3 className="kgp-name">{focus.core ? '★ ' : ''}{focus.name}</h3>
            <div className="kgp-state" style={{ background: STATE[focus.state].c + '22', color: STATE[focus.state].c }}>{STATE[focus.state].t}</div>
            {(focus.projects.length > 0 || focus.careers.length > 0) && (
              <div className="kgp-where">
                {focus.projects.map((p) => <span key={p.id} className="kgp-tag kgp-proj">◈ {p.name}</span>)}
                {focus.careers.map((c) => <span key={c.id} className="kgp-tag kgp-career">✧ {c.name}</span>)}
              </div>
            )}
            <div className="kgp-sec"><div className="kgp-lbl">Builds on</div>
              <div className="kgp-links">{prereqs.length ? prereqs.map((n) => <button key={n.id} onClick={() => travel(n.id)}><i style={{ background: branchColor(n.branch) }} />{n.name}</button>) : <span className="kgp-none">Foundation — nothing below</span>}</div></div>
            <div className="kgp-sec"><div className="kgp-lbl">Unlocks</div>
              <div className="kgp-links">{unlocks.length ? unlocks.map((n) => <button key={n.id} onClick={() => travel(n.id)}><i style={{ background: branchColor(n.branch) }} />{n.name}</button>) : <span className="kgp-none">Leaf — nothing above yet</span>}</div></div>
            {focus.projects.length > 0 && onOpenConcept && (
              <button className="kgp-open" onClick={() => onOpenConcept(focus.projects[0].id, focus.id)}>Open lesson →</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
