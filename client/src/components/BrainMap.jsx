import React, { useEffect, useMemo, useRef, useState } from 'react';
import { branchColor } from '../graphLayout';

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

export default function BrainMap({ concepts, edges, onOpen }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const drag = useRef(null);
  const moved = useRef(false);
  const [hover, setHover] = useState(null);
  const hoverIdRef = useRef(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // build simulation nodes + adjacency (persist across renders)
  const sim = useMemo(() => {
    const branches = [...new Set(concepts.map((c) => c.branch || 'other'))];
    const cen = {};
    branches.forEach((b, i) => { const a = (i / Math.max(1, branches.length)) * Math.PI * 2; cen[b] = { x: Math.cos(a) * 240, y: Math.sin(a) * 240 }; });
    const nodes = concepts.map((c) => {
      const c0 = cen[c.branch || 'other'];
      return { ...c, x: c0.x + (hash(c.id) - 0.5) * 120, y: c0.y + (hash(c.id + 'y') - 0.5) * 120, vx: 0, vy: 0,
        rad: c.core ? 9 : c.tier === 'advanced' ? 6.5 : c.tier === 'intermediate' ? 5.5 : 4.5, cen: c0 };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = (edges || []).map((e) => ({ a: byId.get(e.from), b: byId.get(e.to) })).filter((l) => l.a && l.b);
    const neigh = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const l of links) { neigh.get(l.a.id).add(l.b.id); neigh.get(l.b.id).add(l.a.id); }
    return { nodes, links, neigh, byId };
  }, [concepts, edges]);

  const fit = () => {
    const el = wrapRef.current; if (!el) return;
    setView({ k: Math.min(el.clientWidth, el.clientHeight) / 720, x: el.clientWidth / 2, y: el.clientHeight / 2 });
  };
  useEffect(() => { fit(); /* eslint-disable-next-line */ }, [sim]);

  const step = () => {
    const ns = sim.nodes;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1;
        if (d2 < 90000) { const f = 900 / d2; const d = Math.sqrt(d2); const ux = dx / d, uy = dy / d; a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f; }
      }
      // branch clustering + centering
      a.vx += (a.cen.x - a.x) * 0.006 - a.x * 0.0012;
      a.vy += (a.cen.y - a.y) * 0.006 - a.y * 0.0012;
      if (!reduced) { a.vx += (hash(a.id + Date.now() % 997) - 0.5) * 0.15; a.vy += (hash(a.id + 'j') - 0.5) * 0.02; }
    }
    for (const l of sim.links) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 64) * 0.02; const ux = dx / d, uy = dy / d;
      l.a.vx += ux * f; l.a.vy += uy * f; l.b.vx -= ux * f; l.b.vy -= uy * f;
    }
    for (const n of sim.nodes) { n.vx *= 0.82; n.vy *= 0.82; const sp = Math.hypot(n.vx, n.vy); if (sp > 6) { n.vx = n.vx / sp * 6; n.vy = n.vy / sp * 6; } n.x += n.vx; n.y += n.vy; }
  };

  const draw = () => {
    const canvas = canvasRef.current, el = wrapRef.current; if (!canvas || !el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = el.clientWidth, ch = el.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) { canvas.width = cw * dpr; canvas.height = ch * dpr; canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px'; }
    const ctx = canvas.getContext('2d'); const v = viewRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
    ctx.translate(v.x, v.y); ctx.scale(v.k, v.k);
    const hid = hoverIdRef.current;
    const hn = hid ? sim.neigh.get(hid) : null;

    // edges
    for (const l of sim.links) {
      const active = hid && (l.a.id === hid || l.b.id === hid);
      const col = branchColor(l.a.branch) || '#7788aa';
      ctx.strokeStyle = col; ctx.globalAlpha = hid ? (active ? 0.55 : 0.05) : 0.16;
      ctx.lineWidth = active ? 1.4 : 0.8;
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // nodes
    for (const n of sim.nodes) {
      const col = branchColor(n.branch) || '#8aa';
      const dim = hid && n.id !== hid && !(hn && hn.has(n.id));
      const alpha = dim ? 0.18 : 1;
      const glow = n.state === 'mastered' ? 12 : n.state === 'ready' ? 14 : 4;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = col; ctx.shadowBlur = dim ? 0 : glow;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.rad, 0, Math.PI * 2);
      if (n.state === 'mastered') { ctx.fillStyle = col; ctx.fill(); }
      else if (n.state === 'ready') { ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.globalAlpha = alpha * 0.4; ctx.fill(); }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (n.flagged && !dim) { ctx.beginPath(); ctx.arc(n.x, n.y, n.rad + 3.5, 0, Math.PI * 2); ctx.strokeStyle = '#ffcf33'; ctx.lineWidth = 1.4; ctx.stroke(); }
      if ((hid === n.id || (v.k > 1.4 && !dim)) && !reduced) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(n.name.slice(0, 22), n.x, n.y - n.rad - 5); }
    }
    ctx.globalAlpha = 1;
  };

  useEffect(() => {
    let raf, frame = 0;
    const loop = () => { if (frame < 600 || !reduced) step(); draw(); frame++; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [sim, view]);

  useEffect(() => { const el = wrapRef.current; if (!el || !window.ResizeObserver) return; const ro = new ResizeObserver(() => draw()); ro.observe(el); return () => ro.disconnect(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((c) => { const k = Math.min(3, Math.max(0.3, c.k * Math.exp(-e.deltaY * 0.0012))); return { k, x: mx - ((mx - c.x) * k) / c.k, y: my - ((my - c.y) * k) / c.k }; }); };
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const at = (mx, my) => { const v = viewRef.current; const gx = (mx - v.x) / v.k, gy = (my - v.y) / v.k; let best = null, bd = 18 * 18;
    for (const n of sim.nodes) { const dx = gx - n.x, dy = gy - n.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } } return best; };

  const onDown = (e) => { const r = wrapRef.current.getBoundingClientRect(); drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, id: e.pointerId, cap: false, mx: e.clientX - r.left, my: e.clientY - r.top }; moved.current = false; };
  const onMove = (e) => {
    const el = wrapRef.current; const r = el.getBoundingClientRect();
    if (drag.current) { const dx = e.clientX - drag.current.px, dy = e.clientY - drag.current.py;
      if (!moved.current && Math.abs(dx) + Math.abs(dy) > 4) { moved.current = true; try { el.setPointerCapture(drag.current.id); drag.current.cap = true; } catch (_) {} }
      if (moved.current) setView((v) => ({ ...v, x: drag.current.x + dx, y: drag.current.y + dy })); return; }
    const hit = at(e.clientX - r.left, e.clientY - r.top);
    hoverIdRef.current = hit ? hit.id : null; el.style.cursor = hit ? 'pointer' : 'grab';
    setHover(hit ? { node: hit, x: e.clientX - r.left, y: e.clientY - r.top } : null);
  };
  const onUp = (e) => { if (!drag.current) return; const wasDrag = moved.current; if (drag.current.cap) { try { wrapRef.current.releasePointerCapture(drag.current.id); } catch (_) {} }
    if (!wasDrag) { const hit = at(drag.current.mx, drag.current.my); if (hit && hit.projects && hit.projects[0]) onOpen(hit.projects[0].id, hit.id); } drag.current = null; };

  return (
    <div className="brain" ref={wrapRef}>
      <canvas ref={canvasRef} className="brain-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { setHover(null); hoverIdRef.current = null; }} />
      {hover && (
        <div className="brain-tip" style={{ left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth || 800) - 240), top: hover.y + 14 }}>
          <div className="brain-tip-name">{hover.node.core ? '★ ' : ''}{hover.node.name}</div>
          <div className="brain-tip-meta">{hover.node.branch} · {hover.node.tier} · {hover.node.state === 'mastered' ? 'known' : hover.node.state === 'ready' ? 'ready to learn' : 'not yet'}</div>
          <div className="brain-tip-proj">{hover.node.projects.map((p) => p.name).join(' · ')}</div>
        </div>
      )}
    </div>
  );
}
