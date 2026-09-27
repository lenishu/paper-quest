import React, { useEffect, useMemo, useState } from 'react';
import KnowledgeGraph from './KnowledgeGraph';
import Logo from './Logo';

async function judgeApi(path, body) {
  const r = await fetch('/api/judge/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await r.json(); if (!r.ok) throw Error(data.error || 'Could not open judge access.'); return data;
}
export default function JudgeView() {
  const [data, setData] = useState(null), [key, setKey] = useState(''), [selected, setSelected] = useState('all'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { judgeApi('graphs').then(setData).catch(() => {}); }, []);
  const groups = useMemo(() => [...(data?.projects || []).map(p => ({ ...p, kind: 'project' })), ...(data?.careers || []).map(c => ({ ...c, kind: 'career' }))], [data]);
  const graph = useMemo(() => {
    const nodes = new Map(), edges = new Map();
    for (const group of groups.filter(g => selected === 'all' || g.kind + ':' + g.id === selected)) {
      for (const n of group.nodes) {
        const state = ({done:'mastered',known:'mastered',open:'ready'})[group.states[n.id]] || 'locked';
        if (!nodes.has(n.id)) nodes.set(n.id, { ...n, state, projects: [], careers: [] });
        const node = nodes.get(n.id); node[group.kind === 'career' ? 'careers' : 'projects'].push({ id: group.id, name: group.name });
        for (const id of n.prereqs || []) edges.set(id + ':' + n.id, { from: id, to: n.id });
      }
    }
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }, [groups, selected]);
  async function enter(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { setData(await judgeApi('enter', { key: key.trim() })); setKey(''); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function exit() { await judgeApi('exit', {}); setData(null); setSelected('all'); }
  return <div className="judge-page"><header className="judge-header"><Logo size={30} /><span>Judge view · read-only</span><a href="/">My workspace</a>{data && <button className="btn-ghost" onClick={exit}>Exit judge view</button>}</header>
    {!data ? <form className="judge-entry card" onSubmit={enter}><span className="trail-eyebrow">PAPERQUEST SHOWCASE</span><h1>Explore the ideas behind the papers.</h1><p>Enter the access key shared by the developer to browse project maps and career graphs. No Google account needed.</p><label className="field-label">Judge access key<input autoComplete="off" type="password" placeholder="PQJ-…" value={key} onChange={e => setKey(e.target.value)} /></label><button className="btn-primary" disabled={busy || !key.trim()}>{busy ? 'Opening…' : 'Open shared graphs'}</button>{error && <p role="alert">{error}</p>}</form> : <main className="judge-content">
      <div className="view-head"><div><h1>Research, connected.</h1><p>{data.projects.length} projects · {data.careers.length} career paths · snapshot from {new Date(data.createdAt).toLocaleDateString()}</p></div><label className="field-label">Graph<select value={selected} onChange={e => setSelected(e.target.value)}><option value="all">All knowledge</option>{groups.map(g => <option key={g.kind+g.id} value={g.kind+':'+g.id}>{g.name}</option>)}</select></label></div>
      <KnowledgeGraph key={selected} nodes={graph.nodes} edges={graph.edges} height={600} />
      <div className="judge-project-grid">{groups.map(g => <button className="card judge-project" key={g.kind+g.id} onClick={() => setSelected(g.kind+':'+g.id)}><span className="trail-eyebrow">{g.kind === 'career' ? 'Career path' : `${g.paperCount} papers`}</span><h3>{g.name}</h3><p>{g.nodes.length} concepts · Open graph →</p></button>)}</div>
    </main>}
  </div>;
}

