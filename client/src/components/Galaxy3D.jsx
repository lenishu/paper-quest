import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import ForceGraph3D from '3d-force-graph';
import { branchColor } from '../graphLayout';

// Learning-state colors tuned for the dark galaxy panel.
const STATE = { mastered: '#34d399', ready: '#F59E0B' };

function nodeColor(n, selectedId) {
  if (n.id === selectedId) return '#F4F1EC';
  if (n.state === 'mastered') return STATE.mastered;
  if (n.state === 'ready') return STATE.ready;
  return (branchColor(n.branch) || '#98938B') + '55'; // locked: dimmed branch hue
}

// 3D force-directed network of every concept across projects.
const Galaxy3D = forwardRef(function Galaxy3D({ concepts, edges, onSelect, selectedId, rotate = true }, ref) {
  const mountRef = useRef(null);
  const graphRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;

  useEffect(() => {
    const mount = mountRef.current;
    const Graph = new ForceGraph3D(mount)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .nodeResolution(12)
      .nodeOpacity(0.95)
      .nodeVal((n) => (n.core ? 7 : n.tier === 'advanced' ? 3.4 : n.tier === 'intermediate' ? 2.3 : 1.6) * (n.id === selRef.current ? 1.6 : 1))
      .nodeColor((n) => nodeColor(n, selRef.current))
      .nodeLabel((n) => `<div class="gx-tip"><b>${n.core ? '★ ' : ''}${n.name}</b><span>${n.branch || ''} · ${n.tier || ''} · ${n.state === 'mastered' ? 'mastered' : n.state === 'ready' ? 'ready to learn' : 'not yet'}</span></div>`)
      .linkColor(() => 'rgba(244,241,236,0.22)')
      .linkOpacity(0.3)
      .linkWidth(0.4)
      .onNodeClick((n) => onSelectRef.current && onSelectRef.current(n))
      .onNodeHover((n) => { mount.style.cursor = n ? 'pointer' : 'grab'; })
      .onBackgroundClick(() => onSelectRef.current && onSelectRef.current(null));
    Graph.cameraPosition({ z: 300 });
    const controls = Graph.controls();
    controls.autoRotateSpeed = 0.55;
    graphRef.current = Graph;
    mount.__graph = Graph; // testability hook
    const resize = () => Graph.width(mount.clientWidth).height(mount.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    return () => { ro.disconnect(); if (Graph._destructor) Graph._destructor(); };
  }, []);

  useEffect(() => {
    const nodes = concepts.map((c) => ({ ...c }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = (edges || []).filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to }));
    graphRef.current.graphData({ nodes, links });
  }, [concepts, edges]);

  useEffect(() => {
    // re-evaluate accessor-driven styles when selection changes
    const g = graphRef.current;
    g.nodeColor(g.nodeColor());
    g.nodeVal(g.nodeVal());
  }, [selectedId]);

  useEffect(() => {
    graphRef.current.controls().autoRotate = rotate;
  }, [rotate]);

  useImperativeHandle(ref, () => ({
    fit: () => graphRef.current && graphRef.current.zoomToFit(600, 60)
  }));

  return <div className="galaxy3d" ref={mountRef} />;
});

export default Galaxy3D;
