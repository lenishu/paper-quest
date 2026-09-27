import React, { useEffect, useState } from 'react';
import { api, downloadUrl } from '../api';
import { Modal, useToast } from './bits';

const EVENT_META = {
  project_created: ['🌱', 'Project created'],
  paper_added: ['📄', 'Paper added'],
  paper_removed: ['🗑️', 'Paper removed'],
  paper_analyzed: ['🧠', 'Paper analyzed'],
  analysis_undone: ['↩️', 'Analysis undone'],
  lesson_generated: ['📖', 'Lesson opened'],
  concept_viewed: ['👁️', 'Reviewed concept'],
  concept_mastered: ['✅', 'Concept mastered'],
  concept_skipped: ['⏭️', 'Marked as known'],
  memory_edited: ['🧠', 'Memory edited']
};

function timeAgo(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export default function ProjectTools({ id, project, canUndo, onReload }) {
  const [panel, setPanel] = useState(null); // 'history' | 'memory'
  const [history, setHistory] = useState(null);
  const [memory, setMemory] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (panel === 'history') api(`/projects/${id}/history`).then(setHistory).catch((e) => toast(e.message, 'err'));
    if (panel === 'memory')
      api(`/projects/${id}/memory`).then((d) => {
        setMemory(d.memory || '');
        setMemoryDraft(d.memory || '');
      }).catch((e) => toast(e.message, 'err'));
  }, [panel, id, toast]);

  async function saveMemory() {
    setSaving(true);
    try {
      await api(`/projects/${id}/memory`, { method: 'PUT', body: { memory: memoryDraft } });
      setMemory(memoryDraft);
      toast('Project memory saved — the AI will use it on the next analysis.', 'info');
      setPanel(null);
    } catch (e) {
      toast(e.message, 'err');
    }
    setSaving(false);
  }

  async function undo() {
    if (!window.confirm('Undo the last analysis and restore the previous concept map?')) return;
    try {
      await api(`/projects/${id}/undo`, { method: 'POST', body: {} });
      toast('Restored the previous concept map.', 'info');
      onReload();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function exportPdf() {
    const nodes = [...(project.nodes || [])].sort((a, b) => (a.depth || 0) - (b.depth || 0));
    const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = nodes
      .map((n) => {
        const usage = Object.values(n.usage || {})[0];
        return `<div class="c ${n.core ? 'core' : ''}"><b>${n.core ? '★ ' : ''}${esc(n.name)}</b>
          <span class="b">${esc(n.branch || '')}${n.level === 0 ? ' · baseline' : ' · level ' + (n.depth || 1)}</span>
          ${n.blurb ? `<div class="d">${esc(n.blurb)}</div>` : ''}
          ${usage ? `<div class="u">Used in paper: ${esc(usage)}</div>` : ''}</div>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — Study Pack</title>
      <style>body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 16px}
      h1{font-size:22px}h2{font-size:15px;color:#555;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px}
      .c{margin:10px 0;padding:8px 12px;border-left:3px solid #6c8cff;background:#f6f8ff;border-radius:6px}
      .c.core{border-left-color:#e0a800;background:#fff9e8}.b{color:#888;font-size:12px;margin-left:6px}
      .d{color:#333;margin-top:2px}.u{color:#3355aa;margin-top:4px;font-size:13px}
      @media print{.c{break-inside:avoid}}</style></head><body>
      <h1>🌳 ${esc(project.name)}</h1><div style="color:#666">${esc(project.field || '')} · exported ${new Date().toLocaleString()}</div>
      <h2>Papers</h2>${(project.papers || []).map((p) => `<div>• ${esc(p.title || p.name)}</div>`).join('')}
      <h2>Prerequisite map — review from the bottom up</h2>${rows}
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to export as PDF.', 'err');
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="proj-tools">
      <a className="iconbtn" title="Export as .txt" href={downloadUrl(`/projects/${id}/export.txt`)}>⬇ txt</a>
      <button className="iconbtn" title="Export as PDF (print)" onClick={exportPdf}>⬇ pdf</button>
      <button className="iconbtn" title="Activity history" onClick={() => setPanel('history')}>🕘</button>
      <button className="iconbtn" title="Project memory the AI reads" onClick={() => setPanel('memory')}>🧠</button>
      {canUndo && (
        <button className="iconbtn warn" title="Undo last analysis" onClick={undo}>↩ undo</button>
      )}

      {panel === 'history' && (
        <Modal onClose={() => setPanel(null)} className="tools-modal">
          <div className="modal-head"><h2>🕘 Activity history</h2><button className="iconbtn" onClick={() => setPanel(null)}>✕</button></div>
          {!history ? (
            <div className="dim small">Loading…</div>
          ) : history.events.length === 0 ? (
            <div className="dim small">Nothing yet. Add and analyze a paper, review concepts, and your history builds here.</div>
          ) : (
            <div className="timeline">
              {history.events.map((e, i) => {
                const [icon, label] = EVENT_META[e.type] || ['•', e.type];
                const detail = e.concept || e.paper || e.name || '';
                return (
                  <div key={i} className="tl-item">
                    <span className="tl-icon">{icon}</span>
                    <span className="tl-label">{label}{detail ? ` — ${detail}` : ''}</span>
                    <span className="tl-time">{timeAgo(e.t)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {panel === 'memory' && (
        <Modal onClose={() => setPanel(null)} wide className="tools-modal">
          <div className="modal-head"><h2>🧠 Project memory</h2><button className="iconbtn" onClick={() => setPanel(null)}>✕</button></div>
          <p className="dim small">The AI reads this before every analysis — canonical concept names, goals, and any preferences. Edit the notes; the concept list is kept up to date automatically.</p>
          <textarea className="memory-edit" value={memoryDraft} onChange={(e) => setMemoryDraft(e.target.value)} spellCheck={false} />
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={saving || memoryDraft === memory} onClick={saveMemory}>{saving ? 'Saving…' : 'Save memory'}</button>
            <button className="btn btn-ghost" onClick={() => setPanel(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
