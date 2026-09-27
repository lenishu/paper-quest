import React, { useEffect, useMemo, useRef, useState } from 'react';
import { layoutGraph, wrapLabel, tierOf, branchColor, NODE_W, NODE_H, ROW_H, PAD } from '../graphLayout';

const STATE_ICON = { known: '◆', done: '✓', open: '▶', locked: '🔒' };

export default function SkillTree({ nodes, states, selectedId, onSelect }) {
  const wrapRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);
  const moved = useRef(false);

  const layout = useMemo(() => layoutGraph(nodes), [nodes]);

  const fit = () => {
    const el = wrapRef.current;
    if (!el) return;
    const cw = el.clientWidth || 800;
    const ch = el.clientHeight || 600;
    const k = Math.min(cw / layout.width, ch / layout.height, 1.15);
    setView({ k, x: (cw - layout.width * k) / 2, y: (ch - layout.height * k) / 2 });
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.height]);

  // non-passive wheel handler for zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(2.6, Math.max(0.15, v.k * Math.exp(-e.deltaY * 0.0013)));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (f) =>
    setView((v) => {
      const el = wrapRef.current;
      const cw = (el?.clientWidth || 800) / 2;
      const ch = (el?.clientHeight || 600) / 2;
      const k = Math.min(2.6, Math.max(0.15, v.k * f));
      return { k, x: cw - ((cw - v.x) * k) / v.k, y: ch - ((ch - v.y) * k) / v.k };
    });

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    // Do NOT capture the pointer here — capturing on mousedown redirects the
    // subsequent click to the <svg>, swallowing node selections. We only start
    // capturing once an actual drag (pan) begins.
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, id: e.pointerId, captured: false };
    moved.current = false;
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    if (!moved.current && Math.abs(dx) + Math.abs(dy) > 4) {
      moved.current = true;
      try {
        e.currentTarget.setPointerCapture(drag.current.id);
        drag.current.captured = true;
      } catch (_) {}
    }
    if (moved.current) setView((v) => ({ ...v, x: drag.current.x + dx, y: drag.current.y + dy }));
  };
  const onPointerUp = (e) => {
    if (drag.current && drag.current.captured) {
      try { e.currentTarget.releasePointerCapture(drag.current.id); } catch (_) {}
    }
    drag.current = null;
  };

  const satisfied = (nid) => {
    const st = states[nid];
    return st === 'known' || st === 'done';
  };

  const groundY = layout.maxDepth * ROW_H + PAD + NODE_H + 22;

  return (
    <div className="tree" ref={wrapRef}>
      <svg
        className="tree-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (!moved.current) onSelect(null);
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* ground line under the baseline row */}
          <line x1={PAD / 2} x2={layout.width - PAD / 2} y1={groundY} y2={groundY} className="ground" />
          <text x={layout.width / 2} y={groundY + 20} className="ground-label" textAnchor="middle">
            High-school math &amp; physics — assumed known
          </text>

          {layout.edges.map((e, i) => {
            const f = layout.positions[e.from];
            const t = layout.positions[e.to];
            if (!f || !t) return null;
            const x1 = f.x + NODE_W / 2;
            const y1 = f.y;
            const x2 = t.x + NODE_W / 2;
            const y2 = t.y + NODE_H;
            const cls = [
              'edge',
              satisfied(e.from) ? 'lit' : 'dim',
              states[e.to] === 'open' && satisfied(e.from) ? 'pulse' : '',
              selectedId === e.from || selectedId === e.to ? 'sel' : ''
            ].join(' ');
            return (
              <path
                key={i}
                className={cls}
                d={`M ${x1} ${y1} C ${x1} ${y1 - 60}, ${x2} ${y2 + 60}, ${x2} ${y2}`}
              />
            );
          })}

          {nodes.map((n) => {
            const pos = layout.positions[n.id];
            if (!pos) return null;
            const st = states[n.id] || 'locked';
            const lines = wrapLabel(n.name);
            const cls = `node st-${st} tier-${tierOf(n)} ${selectedId === n.id ? 'selected' : ''}`;
            return (
              <g
                key={n.id}
                className={cls}
                transform={`translate(${pos.x},${pos.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (moved.current) return;
                  onSelect(n.id);
                }}
              >
                <rect className="nbox" width={NODE_W} height={NODE_H} rx="14" />
                <rect
                  className="stripe"
                  x="8"
                  y="9"
                  width="5"
                  height={NODE_H - 18}
                  rx="2.5"
                  style={branchColor(n.branch) ? { fill: branchColor(n.branch) } : undefined}
                >
                  {n.branch ? <title>{n.branch}</title> : null}
                </rect>
                <text className="nicon" x="24" y={NODE_H / 2 + 5}>
                  {STATE_ICON[st]}
                </text>
                <text className="nname" x="46" y={lines.length === 1 ? NODE_H / 2 + 4 : NODE_H / 2 - 3}>
                  {lines.map((ln, i) => (
                    <tspan key={i} x="46" dy={i === 0 ? 0 : 15}>
                      {ln}
                    </tspan>
                  ))}
                </text>
                {n.core && (
                  <text className="crown" x={NODE_W - 14} y="19" textAnchor="middle">
                    ★
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="tree-controls">
        <button className="iconbtn" onClick={() => zoom(1.25)} title="Zoom in">＋</button>
        <button className="iconbtn" onClick={() => zoom(0.8)} title="Zoom out">－</button>
        <button className="iconbtn" onClick={fit} title="Fit to view">⊡</button>
      </div>

      <div className="tree-legend">
        <span><i className="lg lg-open" /> ready to review</span>
        <span><i className="lg lg-done" /> reviewed</span>
        <span><i className="lg lg-locked" /> builds on earlier topics</span>
        <span><i className="lg lg-core" /> ★ the paper itself</span>
        <span className="lg-note">side stripe = math branch</span>
      </div>
    </div>
  );
}
