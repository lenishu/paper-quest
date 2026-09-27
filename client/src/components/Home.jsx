import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { ProgressRing, Spinner, useToast } from './bits';

export default function Home({ openProject }) {
  const [projects, setProjects] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = () => api('/projects').then(setProjects).catch((e) => toast(e.message, 'err'));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    const n = name.trim();
    setCreating(true);
    try {
      const p = await api('/projects', { method: 'POST', body: { name: n || 'Untitled project' } });
      openProject(p.id);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setCreating(false);
    }
  }

  async function createDemo() {
    setCreating(true);
    try {
      const p = await api('/projects/demo', { method: 'POST' });
      toast('Demo project created — the first lesson works without any API key', 'info', 6000);
      openProject(p.id);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setCreating(false);
    }
  }

  async function remove(e, id) {
    e.stopPropagation();
    if (!window.confirm('Delete this project? Its papers and tree will be removed (your mastered concepts stay).')) return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  if (!projects) return <Spinner label="Loading projects…" />;

  return (
    <main className="home">
      <div className="home-head">
        <div>
          <h1>Your projects</h1>
          <p className="dim">
            A project is a set of papers. PaperQuest converts each PDF to Markdown, finds the concepts the papers
            stand on, and grows a skill tree from high-school math &amp; physics up to the papers themselves.
          </p>
        </div>
        <div className="newproj">
          <input
            value={name}
            placeholder="New project name…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="btn btn-primary" onClick={create} disabled={creating}>
            + Create project
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-hero">
          <div className="empty-emoji">🌱</div>
          <h2>No projects yet</h2>
          <p className="dim">Create one above and drop in a PDF — or explore the demo first.</p>
          <button className="btn" onClick={createDemo} disabled={creating}>
            🎓 Try the demo project (no API key needed)
          </button>
        </div>
      ) : (
        <>
          <div className="cards">
            {projects.map((p) => (
              <div key={p.id} className="card" onClick={() => openProject(p.id)}>
                <div className="card-top">
                  <ProgressRing value={p.progress} label={`${p.masteredCount}/${p.conceptCount} concepts mastered`} />
                  <div className="card-title">
                    <h3>{p.name}</h3>
                    <div className="dim small">
                      {p.paperCount} paper{p.paperCount === 1 ? '' : 's'} · {p.masteredCount}/{p.conceptCount} concepts
                    </div>
                  </div>
                  <button className="iconbtn danger" title="Delete project" onClick={(e) => remove(e, p.id)}>
                    ✕
                  </button>
                </div>
                {p.overlaps && p.overlaps.length > 0 && (
                  <div className="overlaps">
                    {p.overlaps.slice(0, 3).map((o) => (
                      <span key={o.id} className="chip" title={`Shared: ${o.sample.join(', ')}${o.count > 3 ? '…' : ''}`}>
                        ↔ {o.count} shared with “{o.name}”
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="home-foot dim small">
            Concepts you master carry across projects — shared foundations come pre-unlocked.
            {' '}
            <button className="linkbtn" onClick={createDemo}>Add the demo project</button>
          </div>
        </>
      )}
    </main>
  );
}
