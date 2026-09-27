import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { layoutGraph, wrapLabel, tierOf, branchColor, NODE_W, NODE_H, ROW_H, PAD } from '../graphLayout';

// Canvas can't read CSS custom properties, so pull the design tokens off the DOM
// once (same pattern as ReferenceGraph.jsx). The tints below — open/done node
// fills, lit edges — have no token of their own, so they are DERIVED from the
// token colours instead of hardcoded, and follow --primary/--green if those
// ever change.
function hexToRgb(h) {
  const v = String(h).replace('#', '').trim();
  const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
// blend toward white — amt 0 = the colour itself, 1 = white
function tint(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const m = (c) => Math.round(c + (255 - c) * amt);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
function alpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function readTokens(el) {
  const cs = getComputedStyle(el);
  const t = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  const primary = t('--primary', '#E4572E');
  const green = t('--green', '#1F9D57');
  const line = t('--line', '#E6E4DE');
  const muted = t('--muted', '#98938B');
  const text = t('--text', '#1B1917');
  return {
    bg: 'transparent',
    ground: t('--line-2', '#D6D3CD'),
    groundText: muted,
    edge: line,
    edgeLit: tint(primary, 0.66),
    edgePulse: primary,
    edgeSel: primary,
    nodeFill: t('--surface', '#FFFFFF'),
    nodeFillOpen: tint(primary, 0.92),
    nodeFillDone: tint(green, 0.92),
    nodeFillKnown: t('--surface-2', '#F2F1ED'),
    nodeStroke: line,
    nodeStrokeOpen: primary,
    nodeStrokeDone: green,
    nodeStrokeSel: primary,
    nodeStrokeCore: t('--secondary', '#2E86AB'),
    text,
    textDim: muted,
    icon: muted,
    shadow: alpha(text, 0.12),
    shadowSel: alpha(primary, 0.35),
    // was an off-palette blue (rgba(37,71,230,…)) glowing around an
    // orange-stroked node — the "ready" glow belongs to --primary
    glowOpen: alpha(primary, 0.28)
  };
}

const STATE_ICON = { known: '◆', done: '✓', open: '▶', locked: '' };

function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function SkillTreeCanvas({ nodes, states, selectedId, onSelect }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef(null);
  const moved = useRef(false);
  const hoverRef = useRef(null);
  const rafRef = useRef(0);
  const tokensRef = useRef(null);

  const layout = useMemo(() => layoutGraph(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const labelCache = useMemo(() => {
    const m = new Map();
    for (const n of nodes) m.set(n.id, wrapLabel(n.name));
    return m;
  }, [nodes]);

  const satisfied = useCallback(
    (id) => states[id] === 'known' || states[id] === 'done',
    [states]
  );

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cw = el.clientWidth || 800;
    const ch = el.clientHeight || 600;
    const k = Math.min(cw / layout.width, ch / layout.height, 1.1);
    setView({ k, x: (cw - layout.width * k) / 2, y: (ch - layout.height * k) / 2 });
  }, [layout.width, layout.height]);

  useEffect(() => {
    fit();
  }, [fit]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const el = wrapRef.current;
    if (!canvas || !el) return;
    if (!tokensRef.current) tokensRef.current = readTokens(el);
    const COLORS = tokensRef.current;
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

    const groundY = layout.maxDepth * ROW_H + PAD + NODE_H + 22;

    // ground line
    ctx.strokeStyle = COLORS.ground;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.moveTo(PAD / 2, groundY);
    ctx.lineTo(layout.width - PAD / 2, groundY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.groundText;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('High-school math & physics — assumed known', layout.width / 2, groundY + 20);
    ctx.textAlign = 'left';

    // edges
    for (const e of layout.edges) {
      const f = layout.positions[e.from];
      const t = layout.positions[e.to];
      if (!f || !t) continue;
      const x1 = f.x + NODE_W / 2;
      const y1 = f.y;
      const x2 = t.x + NODE_W / 2;
      const y2 = t.y + NODE_H;
      const isSel = selectedId === e.from || selectedId === e.to;
      const lit = satisfied(e.from);
      const pulse = states[e.to] === 'open' && lit;
      ctx.strokeStyle = isSel ? COLORS.edgeSel : pulse ? COLORS.edgePulse : lit ? COLORS.edgeLit : COLORS.edge;
      ctx.lineWidth = isSel ? 2.4 : 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1, y1 - 60, x2, y2 + 60, x2, y2);
      ctx.stroke();
    }

    // nodes
    for (const n of nodes) {
      const pos = layout.positions[n.id];
      if (!pos) continue;
      const st = states[n.id] || 'locked';
      const sel = selectedId === n.id;
      const hovered = hoverRef.current === n.id;
      const fill =
        st === 'done' ? COLORS.nodeFillDone : st === 'open' ? COLORS.nodeFillOpen : st === 'known' ? COLORS.nodeFillKnown : COLORS.nodeFill;
      let stroke = COLORS.nodeStroke;
      if (n.core) stroke = COLORS.nodeStrokeCore;
      else if (st === 'done') stroke = COLORS.nodeStrokeDone;
      else if (st === 'open') stroke = COLORS.nodeStrokeOpen;
      if (sel) stroke = COLORS.nodeStrokeSel;

      // shadow
      ctx.save();
      ctx.shadowColor = sel ? COLORS.shadowSel : COLORS.shadow;
      ctx.shadowBlur = sel || hovered ? 16 : 8;
      ctx.shadowOffsetY = 3;
      roundRectPath(ctx, pos.x, pos.y, NODE_W, NODE_H, 14);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();

      // glow ring for open (ready) nodes
      if (st === 'open' && !sel) {
        roundRectPath(ctx, pos.x - 1, pos.y - 1, NODE_W + 2, NODE_H + 2, 15);
        ctx.strokeStyle = COLORS.glowOpen;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      roundRectPath(ctx, pos.x, pos.y, NODE_W, NODE_H, 14);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sel ? 2.4 : n.core ? 1.8 : 1.3;
      ctx.stroke();

      // branch stripe
      const bc = branchColor(n.branch);
      if (bc) {
        roundRectPath(ctx, pos.x + 8, pos.y + 9, 5, NODE_H - 18, 2.5);
        ctx.fillStyle = bc;
        ctx.fill();
      }

      // state icon
      const icon = STATE_ICON[st];
      if (icon) {
        ctx.fillStyle = st === 'done' ? COLORS.nodeStrokeDone : st === 'open' ? COLORS.nodeStrokeOpen : COLORS.icon;
        ctx.font = '13px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, pos.x + 22, pos.y + NODE_H / 2);
      }

      // label
      const lines = labelCache.get(n.id) || [n.name];
      ctx.fillStyle = st === 'locked' ? COLORS.textDim : COLORS.text;
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const lx = pos.x + 46;
      if (lines.length === 1) {
        ctx.fillText(lines[0], lx, pos.y + NODE_H / 2);
      } else {
        ctx.fillText(lines[0], lx, pos.y + NODE_H / 2 - 8);
        ctx.fillText(lines[1], lx, pos.y + NODE_H / 2 + 8);
      }

      // crown for core
      if (n.core) {
        ctx.fillStyle = COLORS.nodeStrokeCore;
        ctx.font = '13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', pos.x + NODE_W - 14, pos.y + 12);
        ctx.textAlign = 'left';
      }
      ctx.textBaseline = 'alphabetic';
    }
  }, [nodes, layout, states, selectedId, satisfied, labelCache]);

  // redraw on state change
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, view]);

  // resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

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
        const k = Math.min(2.6, Math.max(0.15, cur.k * Math.exp(-e.deltaY * 0.0013)));
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
      const pos = layout.positions[nodes[i].id];
      if (!pos) continue;
      if (gx >= pos.x && gx <= pos.x + NODE_W && gy >= pos.y && gy <= pos.y + NODE_H) return nodes[i].id;
    }
    return null;
  };

  // Release the pan gesture. `selectOnTap` fires a click-select only for a genuine
  // pointerup that never turned into a drag.
  const endDrag = (selectOnTap) => {
    const d = drag.current;
    if (!d) return;
    if (d.captured) {
      // release on the SAME element that captured — the canvas, not the wrapper
      try { canvasRef.current.releasePointerCapture(d.id); } catch (_) {}
    }
    if (selectOnTap && !moved.current) {
      const hit = hitTest(d.mx, d.my);
      onSelect(hit || null);
    }
    drag.current = null;
    moved.current = false;
    if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const rect = wrapRef.current.getBoundingClientRect();
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, id: e.pointerId, captured: false, mx: e.clientX - rect.left, my: e.clientY - rect.top };
    moved.current = false;
  };
  const onPointerMove = (e) => {
    const el = wrapRef.current;
    if (drag.current) {
      // Safety net: if the button is no longer held (a pointerup we never received —
      // e.g. after a double-click, or released off-canvas), stop panning instead of
      // letting the map stick to the cursor.
      if ((e.buttons & 1) === 0) { endDrag(false); return; }
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      if (!moved.current && Math.abs(dx) + Math.abs(dy) > 4) {
        moved.current = true;
        try {
          // Capture on the CANVAS, which is where these handlers are bound.
          // Capturing on the wrapper retargets every subsequent pointer event to
          // it, and since the canvas is a child (not an ancestor) React stops
          // dispatching to these handlers entirely — the pan froze after 4px and
          // pointerup never arrived, which is what made the map feel stuck.
          canvasRef.current.setPointerCapture(drag.current.id);
          drag.current.captured = true;
        } catch (_) {}
      }
      if (moved.current) {
        // Read the origin NOW, not inside the updater. React runs the updater
        // asynchronously, and if pointerup lands first endDrag has already set
        // drag.current to null — dereferencing it there crashed the view.
        const ox = drag.current.x;
        const oy = drag.current.y;
        setView((v) => ({ ...v, x: ox + dx, y: oy + dy }));
      }
      return;
    }
    // hover cursor
    const rect = el.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit !== hoverRef.current) {
      hoverRef.current = hit;
      el.style.cursor = hit ? 'pointer' : 'grab';
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    }
  };
  const onPointerUp = () => endDrag(true);
  const onPointerCancel = () => endDrag(false);

  const zoom = (f) =>
    setView((v) => {
      const el = wrapRef.current;
      const cx = (el?.clientWidth || 800) / 2;
      const cy = (el?.clientHeight || 600) / 2;
      const k = Math.min(2.6, Math.max(0.15, v.k * f));
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });

  return (
    <div className="tree" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="tree-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <div className="tree-controls">
        <button className="iconbtn" onClick={() => zoom(1.25)} title="Zoom in">＋</button>
        <button className="iconbtn" onClick={() => zoom(0.8)} title="Zoom out">－</button>
        <button className="iconbtn" onClick={fit} title="Fit to view">⊡</button>
      </div>
      <div className="tree-legend">
        <span><i className="lg lg-open" /> ready to review</span>
        <span><i className="lg lg-done" /> reviewed</span>
        <span><i className="lg lg-locked" /> builds on earlier</span>
        <span><i className="lg lg-core" /> ★ the paper</span>
        <span className="lg-note">stripe = math branch</span>
      </div>
    </div>
  );
}
