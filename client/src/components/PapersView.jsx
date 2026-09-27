import React, { useRef, useState } from 'react';
import { downloadUrl, api } from '../api';
import { useJobs } from '../jobs';
import { useToast } from './bits';
import ReferencesModal from './ReferencesModal';
import { kindOf } from '../projectKinds';

export default function PapersView({ id, project, onReload, refreshProjects, onRead, onSummary }) {
  const kind = kindOf(project.kind);
  const fileRef = useRef(null);
  const { enqueue } = useJobs();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const [refsPaper, setRefsPaper] = useState(null);

  function addFiles(list) {
    const n = enqueue(id, list);
    if (n > 0) toast(`Added ${n} paper${n > 1 ? 's' : ''} — parsing & mapping in the background.`, 'info');
    else toast('Drop a .pdf, .md or .txt file', 'err');
  }
  async function reanalyze(pid) {
    setBusyId(pid);
    toast('Re-analyzing in the background…', 'info');
    try {
      await api(`/projects/${id}/papers/${pid}/analyze`, { method: 'POST', body: {} });
      onReload();
      toast('Concept map updated.', 'info');
    } catch (e) {
      toast(e.message, 'err', 8000);
    }
    setBusyId(null);
  }
  async function remove(pid) {
    if (!window.confirm('Remove this paper? Concepts stay on the map.')) return;
    try {
      await api(`/projects/${id}/papers/${pid}`, { method: 'DELETE' });
      onReload();
      refreshProjects && refreshProjects();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <div className="papers-view" data-tour="papers">
      <div className="pv-head">
        <h2>{kind.material}</h2>
        <button className="btn btn-primary" data-tour="add-paper" onClick={() => fileRef.current && fileRef.current.click()}>＋ {kind.add}</button>
        <input ref={fileRef} type="file" accept=".pdf,.md,.markdown,.txt" multiple hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="pv-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        {project.papers.length === 0 && (
          <div className="pv-drop">Drop a PDF, Markdown or text file here ({kind.id === 'paper' ? 'a paper' : kind.material.toLowerCase()}). Its text is extracted, then AI maps every prerequisite concept in the background.</div>
        )}
        {project.papers.map((p) => (
          <div key={p.id} className="pv-card">
            <div className="pv-card-top">
              <span className="pv-icon">📄</span>
              <div className="pv-meta">
                <div className="pv-name">{p.title || p.name}</div>
                {p.authors && <div className="dim small">{p.authors}</div>}
                <div className="dim small">{p.pages ? `${p.pages} pages · ` : ''}{p.analyzed ? 'mapped' : 'not analyzed'}{p.pdfUrl ? ' · original PDF from arXiv' : ''}{p.summarizedAt ? ' · summary ready' : ''}</div>
              </div>
            </div>
            <div className="pv-actions">
              <button className="btn btn-primary small-btn" onClick={() => onRead(p)}>📖 Read</button>
              {onSummary && <button className="btn btn-ghost small-btn" onClick={() => onSummary(p)}>✦ Summary</button>}
              <button className="btn btn-ghost small-btn" onClick={() => setRefsPaper(p)}>🔗 References</button>
              <a className="btn btn-ghost small-btn" href={downloadUrl(`/projects/${id}/papers/${p.id}/markdown`)}>⬇ Markdown</a>
              <button className="btn btn-ghost small-btn" disabled={busyId === p.id} onClick={() => reanalyze(p.id)}>🔁 Re-analyze</button>
              <button className="btn btn-ghost small-btn danger" onClick={() => remove(p.id)}>✕ Remove</button>
            </div>
          </div>
        ))}
      </div>
      {refsPaper && <ReferencesModal id={id} paper={refsPaper} onClose={() => setRefsPaper(null)} />}
    </div>
  );
}
