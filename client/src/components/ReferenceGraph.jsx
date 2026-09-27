import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ResearchRabbit-style citation map: papers are placed by publication year (x)
// and citation count (y, log scale — a handful of papers have thousands of
// cites and would otherwise flatten everything else onto one line). Positions
// are deterministic, so the map does not reshuffle every time a node is added.

const PAD = 54;
const MIN_R = 6;
const MAX_R = 20;

function radiusOf(p) {
  const c = Math.log1p(p.citationCount || 0);
  return MIN_R + Math.min(1, c / Math.log1p(4000)) * (MAX_R - MIN_R);
}

// Canvas can't read CSS custom properties, so pull them off the DOM once and
// keep the design tokens as the single source of colour truth.
function readTokens(el) {
  const cs = getComputedStyle(el);
  const t = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    primary: t('--primary', '#E4572E'),
    secondary: t('--secondary', '#2E86AB'),
    green: t('--green', '#1F9D57'),
    line: t('--line', '#E6E4DE'),
    line2: t('--line-2', '#D6D3CD'),
    surface: t('--surface', '#FFFFFF'),
    text: t('--text', '#1B1917'),
    muted: t('--muted', '#98938B')
  };
}

function layoutPapers(nodes, W, H) {
  const pos = {};
  if (!nodes.length) return pos;
  const years = nodes.map((n) => n.year).filter(Boolean);
  const minYear = years.length ? Math.min(...years) : 2000;
  const maxYear = years.length ? Math.max(...years) : minYear + 1;
  const spanYear = Math.max(1, maxYear - minYear);
  const logMax = Math.log1p(Math.max(1, ...nodes.map((n) => n.citationCount || 0)));

  const innerW = Math.max(120, W - PAD * 2);
  const innerH = Math.max(120, H - PAD * 2);

  nodes.forEach((n, i) => {
    const year = n.year || minYear;
    // fan same-year papers apart deterministically so the relaxation below has
    // something to work with instead of a perfect vertical pile
    const jitter = ((i % 7) - 3) * 3;
    const x = PAD + ((year - minYear) / spanYear) * innerW + jitter;
    const c = logMax > 0 ? Math.log1p(n.citationCount || 0) / logMax : 0;
    const y = PAD + (1 - c) * innerH;
    pos[n.id] = { x, y, homeX: x };
  });

  // Push overlapping nodes apart, then ease each back toward its year column so
  // the x axis keeps meaning something. Relaxation is O(n^2) per pass, so a
  // heavily expanded map trades a little spacing for staying responsive.
  const passes = nodes.length > 250 ? 12 : 40;
  for (let iter = 0; iter < passes; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos[nodes[i].id];
        const b = pos[nodes[j].id];
        const need = radiusOf(nodes[i]) + radiusOf(nodes[j]) + 14;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = (i % 2 ? 1 : -1) * 0.5; dy = 0.5; d = 0.71; }
        if (d < need) {
          const push = ((need - d) / 2) / d;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
          moved = true;
        }
      }
    }
    for (const n of nodes) {
      const p = pos[n.id];
      p.x += (p.homeX - p.x) * 0.08;
      p.y = Math.max(PAD * 0.5, Math.min(H - PAD * 0.5, p.y));
    }
    if (!moved) break;
  }
  return pos;
}

function shortLabel(p) {
  const first = (p.authors && p.authors[0]) || '';
  const last = first.split(/\s+/).filter(Boolean).pop() || 'Unknown';
  return p.year ? `${last}, ${p.year}` : last;
}

export default function ReferenceGraph({ nodes, edges, seedId, selectedId, onSelect }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 800, h: 560 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef(null);
  const moved = useRef(false);
  const hoverRef = useRef(null);
  const rafRef = useRef(0);
  const tokensRef = useRef(null);

  const layout = useMemo(() => layoutPapers(nodes, size.w, size.h), [nodes, size.w, size.h]);

  // ids one hop from the selection — these stay bright while everything else dims
  const neighbours = useMemo(() => {
    const set = new Set();
    if (!selectedId) return set;
    for (const e of edges) {
      if (e.from === selectedId) set.add(e.to);
      else if (e.to === selectedId) set.add(e.from);
    }
    return set;
  }, [edges, selectedId]);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    setView({ x: 0, y: 0, k: 1 });
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 560 });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 560 });
    if (!window.ResizeObserver) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 560 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const el = wrapRef.current;
    if (!canvas || !el) return;
    if (!tokensRef.current) tokensRef.current = readTokens(el);
    const C = tokensRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
    }
    const ctx = canvas.getContext('2d');
    const v = viewRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.translate(v.x, v.y);
    ctx.scale(v.k, v.k);

    // edges first, so nodes sit on top
    for (const e of edges) {
      const a = layout[e.from];
      const b = layout[e.to];
      if (!a || !b) continue;
      const lit = selectedId && (e.from === selectedId || e.to === selectedId);
      ctx.strokeStyle = lit ? (e.type === 'similar' ? C.secondary : C.primary) : C.line;
      ctx.lineWidth = lit ? 1.8 : 1;
      ctx.globalAlpha = lit ? 0.95 : selectedId ? 0.25 : 0.55;
      ctx.setLineDash(e.type === 'similar' ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.08;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // nodes
    for (const n of nodes) {
      const p = layout[n.id];
      if (!p) continue;
      const r = radiusOf(n);
      const sel = n.id === selectedId;
      const near = neighbours.has(n.id);
      const seed = n.id === seedId;
      const dim = selectedId && !sel && !near;

      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = sel ? C.primary : seed ? C.secondary : C.surface;
      ctx.fill();
      ctx.lineWidth = sel || seed ? 2.4 : 1.4;
      ctx.strokeStyle = sel ? C.primary : seed ? C.secondary : near ? C.primary : C.line2;
      ctx.stroke();

      // labels: everything when zoomed in, otherwise only what matters
      const showLabel = v.k > 0.75 || sel || seed || near || hoverRef.current === n.id;
      if (showLabel) {
        ctx.globalAlpha = dim ? 0.4 : 1;
        ctx.fillStyle = sel || seed ? C.text : C.muted;
        ctx.font = `${sel || seed ? '600 ' : ''}11px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(shortLabel(n), p.x, p.y + r + 13);
        ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;
    }
  }, [nodes, edges, layout, selectedId, seedId, neighbours]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, view, size]);

  // wheel zoom (to cursor)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((cur) => {
        const k = Math.min(3, Math.max(0.3, cur.k * Math.exp(-e.deltaY * 0.0013)));
        return { k, x: mx - ((mx - cur.x) * k) / cur.k, y: my - ((my - cur.y) * k) / cur.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const hitTest = (mx, my) => {
    const v = viewRef.current;
    const gx = (mx - v.x) / v.k;
    const gy = (my - v.y) / v.k;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const p = layout[nodes[i].id];
      if (!p) continue;
      const r = radiusOf(nodes[i]) + 4;
      if ((gx - p.x) ** 2 + (gy - p.y) ** 2 <= r * r) return nodes[i].id;
    }
    return null;
  };

  const endDrag = (selectOnTap) => {
    const d = drag.current;
    if (!d) return;
    // release on the SAME element that captured — the canvas, not the wrapper
    if (d.captured) { try { canvasRef.current.releasePointerCapture(d.id); } catch (_) {} }
    if (selectOnTap && !moved.current) onSelect(hitTest(d.mx, d.my) || null);
    drag.current = null;
    moved.current = false;
    if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const rect = wrapRef.current.getBoundingClientRect();
    drag.current = {
      px: e.clientX, py: e.clientY, x: view.x, y: view.y, id: e.pointerId, captured: false,
      mx: e.clientX - rect.left, my: e.clientY - rect.top
    };
    moved.current = false;
  };

  const onPointerMove = (e) => {
    const el = wrapRef.current;
    if (drag.current) {
      // if the button was released off-canvas we never get pointerup — bail out
      // instead of letting the map stick to the cursor
      if ((e.buttons & 1) === 0) { endDrag(false); return; }
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      if (!moved.current && Math.abs(dx) + Math.abs(dy) > 4) {
        moved.current = true;
        // Capture on the CANVAS — these handlers are bound to it. Capturing on
        // the wrapper retargets pointer events to it, and React then stops
        // dispatching to a child's handlers, freezing the pan after 4px.
        try { canvasRef.current.setPointerCapture(drag.current.id); drag.current.captured = true; } catch (_) {}
      }
      if (moved.current) {
        // Read the origin NOW — React runs the updater asynchronously, and if
        // pointerup lands first endDrag has already nulled drag.current.
        const ox = drag.current.x;
        const oy = drag.current.y;
        setView((v) => ({ ...v, x: ox + dx, y: oy + dy }));
      }
      return;
    }
    const rect = el.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit !== hoverRef.current) {
      hoverRef.current = hit;
      el.style.cursor = hit ? 'pointer' : 'grab';
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    }
  };

  const zoom = (f) =>
    setView((v) => {
      const el = wrapRef.current;
      const cx = (el?.clientWidth || 800) / 2;
      const cy = (el?.clientHeight || 560) / 2;
      const k = Math.min(3, Math.max(0.3, v.k * f));
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });

  return (
    <div className="refgraph" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="refgraph-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
      />
      <div className="refgraph-axis refgraph-axis-x">More recently published →</div>
      <div className="refgraph-axis refgraph-axis-y">More citations ↑</div>
      <div className="refgraph-controls">
        <button className="iconbtn" onClick={() => zoom(1.25)} title="Zoom in">＋</button>
        <button className="iconbtn" onClick={() => zoom(0.8)} title="Zoom out">－</button>
        <button className="iconbtn" onClick={fit} title="Reset view">⊡</button>
      </div>
      <div className="refgraph-legend">
        <span><i className="rg-dot rg-seed" /> this paper</span>
        <span><i className="rg-dot rg-sel" /> selected</span>
        <span className="dim">size = citations · click a paper to pull in similar work</span>
      </div>
    </div>
  );
}
