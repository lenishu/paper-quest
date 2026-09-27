import React, { useEffect, useState } from 'react';
import { api } from '../api';
import KnowledgeGraph from './KnowledgeGraph';
import { Spinner } from './bits';

// Full-page Constellation Navigator: the whole knowledge graph — every concept
// across projects + every career skill, merged by canonical id. Travel node-to-node.
export default function ExploreView({ onOpenConcept, onTryDemo }) {
  const [graph, setGraph] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { api('/graph?scope=all').then(setGraph).catch((e) => setErr(e.message)); }, []);

  const empty = graph && graph.nodes.length === 0;

  return (
    <div className="explore">
      <div className="explore-head">
        <div>
          <h1 className="view-title">Knowledge Graph</h1>
          <p className="view-sub">Every concept and career skill you've touched — one map. Click a star to travel through it.</p>
        </div>
        {graph && <div className="explore-counts">
          <span><b>{graph.meta.counts.total}</b> nodes</span>
          <span className="c-green"><b>{graph.meta.counts.mastered}</b> mastered</span>
          <span className="c-orange"><b>{graph.meta.counts.ready}</b> ready</span>
          <span>{graph.meta.branches.length} branches</span>
        </div>}
      </div>
      {err && <div className="card" style={{ padding: 20 }}>Couldn't load the graph: {err}</div>}
      {!graph && !err && <div className="explore-loading"><Spinner /> Building your knowledge graph…</div>}
      {empty && (
        <div className="card explore-empty">
          <p className="dim">Your graph is empty — add and analyze a paper, or set up a career, and everything you touch appears here as a connected star map.</p>
          {onTryDemo && <button className="btn-primary" onClick={onTryDemo}>✦ Try the demo project</button>}
        </div>
      )}
      {graph && !empty && (
        <KnowledgeGraph nodes={graph.nodes} edges={graph.edges} height={560} onOpenConcept={onOpenConcept} />
      )}
    </div>
  );
}
