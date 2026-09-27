import React, { useMemo } from 'react';
import { branchColor } from '../graphLayout';

const STATE_ICON = { mastered: '✓', ready: '▶', locked: '' };

// "Branches": every branch of math/science in your galaxy, with progress and its concepts.
export default function PathsView({ dash, onOpenConcept }) {
  const concepts = dash?.galaxy?.concepts || [];
  const branches = useMemo(() => {
    const m = new Map();
    for (const c of concepts) {
      const b = c.branch || 'other';
      if (!m.has(b)) m.set(b, { name: b, concepts: [] });
      m.get(b).concepts.push(c);
    }
    return [...m.values()]
      .map((b) => ({ ...b, done: b.concepts.filter((c) => c.state === 'mastered').length, total: b.concepts.length }))
      .sort((a, b) => b.total - a.total);
  }, [concepts]);

  const mastered = concepts.filter((c) => c.state === 'mastered').length;

  if (!concepts.length) {
    return (
      <div className="pathsv">
        <div className="view-head"><div><h1 className="view-title">Branches</h1>
          <p className="view-sub">Add and analyze a paper — every branch of math it stands on becomes a path here.</p></div></div>
      </div>
    );
  }

  return (
    <div className="pathsv">
      <div className="view-head">
        <div>
          <h1 className="view-title">Branches</h1>
          <p className="view-sub">{mastered} of {concepts.length} concepts mastered across {branches.length} branches.</p>
        </div>
      </div>
      <div className="paths-grid">
        {branches.map((b) => {
          const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
          const col = branchColor(b.name);
          return (
            <div key={b.name} className="card path-card">
              <div className="path-head">
                <span className="path-dot" style={{ background: col }} />
                <span className="path-name">{b.name}</span>
                <span className="path-frac mono">{b.done}/{b.total}</span>
              </div>
              <div className="path-bar"><i style={{ width: `${pct}%`, background: col }} /></div>
              <div className="path-chips">
                {b.concepts
                  .slice()
                  .sort((a, c) => (a.state === 'mastered' ? 0 : a.state === 'ready' ? 1 : 2) - (c.state === 'mastered' ? 0 : c.state === 'ready' ? 1 : 2))
                  .map((c) => (
                    <button key={c.id} className={`path-chip st-${c.state}`}
                      title={`${c.name} — ${c.state === 'mastered' ? 'mastered' : c.state === 'ready' ? 'ready to learn' : 'locked'}`}
                      onClick={() => c.projects && c.projects[0] && onOpenConcept(c.projects[0].id, c.id)}>
                      {STATE_ICON[c.state] ? `${STATE_ICON[c.state]} ` : ''}{c.core ? '★ ' : ''}{c.name}
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
