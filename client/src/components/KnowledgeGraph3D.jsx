import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import ForceGraph3D from '3d-force-graph';
import { branchColor } from '../graphLayout';

// 3D Constellation Navigator — the same graph KnowledgeGraph draws in 2D, as a
// force-directed star field. Colour semantics deliberately match the 2D legend
// (mastered / known / ready / locked); branch hue survives as the locked colour
// and in the label, because in 3D a state ring around every node is noise.
const STATE = {
  mastered: '#1F9D57',
  known: '#2E86AB',
  ready: '#F59E0B'
};

function nodeColor(n, focusId) {
  if (n.id === focusId) return '#FFFFFF';
  if (STATE[n.state]) return STATE[n.state];
  return (branchColor(n.branch) || '#98938B') + '66'; // locked: dimmed branch hue
}

const KnowledgeGraph3D = forwardRef(function KnowledgeGraph3D({ nodes, edges, focusId, onSelect }, ref) {
  const mountRef = useRef(null);
  const graphRef = useRef(null);
  const byIdRef = useRef(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const focusRef = useRef(focusId);
  focusRef.current = focusId;
  // Auto-framing stops the moment the user takes control of the camera.
  const userMovedRef = useRef(false);
  const refitRef = useRef(null);

  // zoomToFit() frames EVERY node, so a couple of loosely-connected outliers
  // drag the camera far back and shrink the dense core to a speck. Frame the
  // bulk instead — outliers simply sit outside the opening shot.
  const fitCore = (ms = 500) => {
    const g = graphRef.current;
    if (!g) return;
    const ns = g.graphData().nodes.filter((n) => typeof n.x === 'number');
    if (!ns.length) return;
    const dists = ns.map((n) => Math.hypot(n.x, n.y, n.z || 0)).sort((a, b) => a - b);
    const cutoff = dists[Math.floor(dists.length * 0.88)] || Infinity;
    g.zoomToFit(ms, 70, (n) => Math.hypot(n.x, n.y, n.z || 0) <= cutoff);
  };

  useEffect(() => {
    const mount = mountRef.current;
    const Graph = new ForceGraph3D(mount)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .nodeResolution(12)
      .nodeOpacity(0.95)
      .nodeVal((n) => (n.core ? 7 : n.tier === 'advanced' ? 3.4 : n.tier === 'intermediate' ? 2.3 : 1.6) * (n.id === focusRef.current ? 1.7 : 1))
      .nodeColor((n) => nodeColor(n, focusRef.current))
      .nodeLabel((n) => `<div class="gx-tip"><b>${n.core ? '★ ' : ''}${n.name}</b><span>${n.branch || ''} · ${n.state === 'mastered' ? 'mastered' : n.state === 'known' ? 'known' : n.state === 'ready' ? 'ready to learn' : 'locked'}</span></div>`)
      .linkColor(() => 'rgba(244,241,236,0.22)')
      .linkOpacity(0.3)
      .linkWidth(0.4)
      .onNodeClick((n) => onSelectRef.current && onSelectRef.current(n.id))
      .onNodeHover((n) => { mount.style.cursor = n ? 'pointer' : 'grab'; })
      // Frame the whole field once the layout settles. A fixed camera distance
      // cannot work here — this graph is every concept across every project, so
      // it ranges from a handful of nodes to several hundred.
      .onEngineStop(() => {
        clearInterval(refitRef.current);
        if (!userMovedRef.current) fitCore(700);
      })
      .cooldownTime(8000);
    Graph.cameraPosition({ z: 320 });

    // Any camera input means the user is driving — stop auto-framing.
    const claim = () => { userMovedRef.current = true; };
    mount.addEventListener('pointerdown', claim);
    mount.addEventListener('wheel', claim, { passive: true });
    graphRef.current = Graph;
    mount.__graph = Graph; // testability hook, same as Galaxy3D

    const resize = () => Graph.width(mount.clientWidth).height(mount.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    return () => {
      ro.disconnect();
      mount.removeEventListener('pointerdown', claim);
      mount.removeEventListener('wheel', claim);
      if (Graph._destructor) Graph._destructor();
    };
  }, []);

  useEffect(() => {
    const ns = nodes.map((n) => ({ ...n }));
    const ids = new Set(ns.map((n) => n.id));
    const links = (edges || []).filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to }));
    // keep the live objects — the force engine writes x/y/z onto them, which is
    // what warp() needs to aim the camera
    byIdRef.current = new Map(ns.map((n) => [n.id, n]));
    graphRef.current.graphData({ nodes: ns, links });
    // The layout keeps expanding for several seconds, so a single early fit
    // frames a cloud that then grows out of shot. Re-fit on a short cadence
    // instead, tracking the expansion until onEngineStop takes the final shot.
    userMovedRef.current = false;
    clearInterval(refitRef.current);
    refitRef.current = setInterval(() => {
      if (userMovedRef.current) { clearInterval(refitRef.current); return; }
      fitCore(400);
    }, 900);
    return () => clearInterval(refitRef.current);
  }, [nodes, edges]);

  useEffect(() => {
    // re-evaluate accessor-driven styles when the focus changes
    const g = graphRef.current;
    if (!g) return;
    g.nodeColor(g.nodeColor());
    g.nodeVal(g.nodeVal());
  }, [focusId]);

  useImperativeHandle(ref, () => ({
    fit: () => fitCore(600),
    warp: (id) => {
      const g = graphRef.current;
      const n = byIdRef.current.get(id);
      if (!g || !n || typeof n.x !== 'number') return;
      // Travelling to a concept is the user taking control — otherwise the
      // auto-framing interval immediately drags the camera back off the node.
      userMovedRef.current = true;
      clearInterval(refitRef.current);

      // Frame the node WITH its prerequisites and unlocks. A fixed fly-in
      // distance cannot work — it is either inside the cloud or miles away
      // depending on how big the graph is — and seeing a concept in context is
      // the point of travelling to it anyway.
      const keep = new Set([id]);
      for (const l of g.graphData().links) {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (s === id) keep.add(t);
        else if (t === id) keep.add(s);
      }
      if (keep.size >= 3) {
        g.zoomToFit(800, 90, (nd) => keep.has(nd.id));
        return;
      }
      // Isolated concept: nothing to frame it against, so pull back a distance
      // proportional to the field rather than fitting one sphere.
      const ns = g.graphData().nodes.filter((d) => typeof d.x === 'number');
      const radius = ns.length
        ? ns.map((d) => Math.hypot(d.x, d.y, d.z || 0)).sort((a, b) => a - b)[Math.floor(ns.length * 0.5)]
        : 200;
      const dist = Math.max(160, radius * 1.6);
      const len = Math.hypot(n.x, n.y, n.z) || 1;
      const ratio = 1 + dist / len;
      g.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: n.z * ratio }, n, 800);
    }
  }));

  return <div className="kgraph-3d" ref={mountRef} />;
});

export default KnowledgeGraph3D;
