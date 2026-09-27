import React, { useEffect, useState } from 'react';
import { api, downloadUrl } from '../api';
import { useToast } from './bits';

const EVENT_META = {
  project_created: ['🌱', 'Project created'],
  paper_added: ['📄', 'Paper added'],
  paper_removed: ['🗑️', 'Paper removed'],
  paper_analyzed: ['🧠', 'Paper analyzed'],
  analysis_undone: ['↩️', 'Analysis undone'],
  lesson_generated: ['📖', 'Lesson opened'],
  lesson_question: ['💬', 'Asked about a lesson'],
  concept_viewed: ['👁️', 'Reviewed concept'],
  concept_mastered: ['✅', 'Concept mastered'],
  concept_skipped: ['⏭️', 'Marked as known'],
  memory_edited: ['🧠', 'Memory edited']
};
const timeAgo = (t) => {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};

export default function HistoryView({ id, canUndo, onReload }) {
  const [history, setHistory] = useState(null);
  const [memory, setMemory] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = () => {
    api(`/projects/${id}/history`).then(setHistory).catch((e) => toast(e.message, 'err'));
    api(`/projects/${id}/memory`).then((d) => { setMemory(d.memory || ''); setDraft(d.memory || ''); }).catch(() => {});
  };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveMemory() {
    setSaving(true);
    try {
      await api(`/projects/${id}/memory`, { method: 'PUT', body: { memory: draft } });
      setMemory(draft);
      toast('Memory saved — used on the next analysis.', 'info');
    } catch (e) { toast(e.message, 'err'); }
    setSaving(false);
  }
  async function undo() {
    if (!window.confirm('Undo the last analysis and restore the previous map?')) return;
    try { await api(`/projects/${id}/undo`, { method: 'POST', body: {} }); toast('Restored previous map.', 'info'); onReload(); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="history-view">
      <div className="hv-col">
        <div className="hv-head">
          <h2>Activity</h2>
          <div className="hv-actions">
            <a className="btn btn-ghost small-btn" href={downloadUrl(`/projects/${id}/export.txt`)}>⬇ Export .txt</a>
            {canUndo && <button className="btn btn-ghost small-btn" onClick={undo}>↩ Undo last analysis</button>}
          </div>
        </div>
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
      </div>

      <div className="hv-col">
        <div className="hv-head"><h2>Project memory</h2></div>
        <p className="dim small">The AI reads this before every analysis — canonical concept names, goals, preferences. Edit the notes; the concept list is kept current automatically.</p>
        <textarea className="memory-edit" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={saving || draft === memory} onClick={saveMemory}>{saving ? 'Saving…' : 'Save memory'}</button>
        </div>
      </div>
    </div>
  );
}
