import React, { useState } from 'react';
import { api } from '../api';
import { useToast } from './bits';
import { ACCENT_HUES } from '../graphLayout';
import { kindOf } from '../projectKinds';

const HUES = ACCENT_HUES;
const GLYPHS = ['◈', '◇', '◉', '◆', '❖'];

export default function ProjectsView({ projects, onOpenProject, onNewProject, onTryDemo, onReload }) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(null); // {id, name}

  async function saveRename() {
    try {
      await api(`/projects/${renaming.id}`, { method: 'PATCH', body: { name: renaming.name } });
      setRenaming(null);
      onReload();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function remove(p) {
    if (!window.confirm(`Delete "${p.name}" and its papers? Your mastered concepts stay.`)) return;
    try { await api(`/projects/${p.id}`, { method: 'DELETE' }); toast('Project deleted.', 'info'); onReload(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="pjv">
      <div className="view-head">
        <div>
          <h1 className="view-title">Projects</h1>
          <p className="view-sub">A project is a paper, class, course, club, hackathon or your notes, plus the prerequisite map grown from it.</p>
        </div>
        <div className="view-head-actions">
          <button className="btn-ghost" onClick={onTryDemo}>✦ Try the demo</button>
          <button className="btn-primary" onClick={onNewProject}>＋ New Project</button>
        </div>
      </div>

      <div className="pjv-grid">
        {projects.map((p, i) => {
          const pct = Math.round((p.progress || 0) * 100);
          const hue = HUES[i % HUES.length];
          return (
            <div key={p.id} className="pjv-card">
              <div className="pjv-top">
                <span className="proj-glyph" style={{ color: hue, borderColor: hue + '4d', background: hue + '1a' }}>{p.kind && p.kind !== 'paper' ? kindOf(p.kind).icon : GLYPHS[i % GLYPHS.length]}</span>
                {renaming && renaming.id === p.id ? (
                  <input autoFocus className="pjv-rename" value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }}
                    onBlur={saveRename} />
                ) : (
                  <button className="pjv-name" title="Open project" onClick={() => onOpenProject(p.id)}>{p.name}</button>
                )}
              </div>
              <div className="pjv-meta"><span className="kind-chip">{kindOf(p.kind).icon} {kindOf(p.kind).label}</span> {p.paperCount} {p.kind && p.kind !== 'paper' ? 'file' : 'paper'}{p.paperCount === 1 ? '' : 's'} · {p.masteredCount}/{p.conceptCount} concepts</div>
              <div className="pjv-bar"><i style={{ width: `${pct}%` }} /></div>
              {p.overlaps && p.overlaps.length > 0 && (
                <div className="pjv-overlap" title={p.overlaps.map((o) => `${o.name}: ${o.sample.join(', ')}`).join('\n')}>
                  ↔ shares {p.overlaps.reduce((a, o) => a + o.count, 0)} concept{p.overlaps.reduce((a, o) => a + o.count, 0) === 1 ? '' : 's'} with {p.overlaps.length} other project{p.overlaps.length === 1 ? '' : 's'}
                </div>
              )}
              <div className="pjv-actions">
                <button className="btn-primary small-btn" onClick={() => onOpenProject(p.id)}>Open</button>
                <button className="btn-ghost small-btn" onClick={() => setRenaming({ id: p.id, name: p.name })}>Rename</button>
                <button className="btn-ghost small-btn danger" onClick={() => remove(p)}>Delete</button>
              </div>
            </div>
          );
        })}
        <button className="pjv-new" onClick={onNewProject}>
          <span className="pjv-new-plus">＋</span>
          <span>New project</span>
          <span className="dim small">A paper, class, course, club, hackathon or notes.</span>
        </button>
      </div>
    </div>
  );
}
