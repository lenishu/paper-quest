import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { api, downloadUrl } from '../api';
import { useToast } from './bits';

export default function PaperReader({ id, paper, onClose }) {
  const [notes, setNotes] = useState(paper.notes || '');
  const [saved, setSaved] = useState(paper.notes || '');
  const [md, setMd] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  // The demo paper is the official PDF on arXiv (its licence doesn't let us re-host it).
  const isPdf = (paper.pages || 0) > 0 || !!paper.pdfUrl;
  const pdfSrc = paper.pdfUrl || downloadUrl(`/projects/${id}/papers/${paper.id}/pdf`);

  useEffect(() => {
    if (!isPdf) {
      fetch(downloadUrl(`/projects/${id}/papers/${paper.id}/markdown`))
        .then((r) => r.text()).then(setMd).catch(() => setMd('*Could not load the extracted text.*'));
    }
  }, [id, paper.id, isPdf]);

  async function save() {
    setSaving(true);
    try { await api(`/projects/${id}/papers/${paper.id}/notes`, { method: 'PUT', body: { notes } }); setSaved(notes); }
    catch (e) { toast(e.message, 'err'); }
    setSaving(false);
  }

  return (
    <div className="reader-overlay">
      <div className="reader">
        <div className="reader-head">
          <div className="reader-title"><span className={`ftype ${isPdf ? 'ftype-pdf' : 'ftype-txt'}`}>{isPdf ? 'PDF' : 'TEXT / MD'}</span> {paper.title || paper.name}</div>
          <div className="reader-head-right">
            {paper.pdfUrl && <a className="btn btn-ghost small-btn" href={paper.sourceUrl || paper.pdfUrl} target="_blank" rel="noreferrer">arXiv ↗</a>}
            <a className="btn btn-ghost small-btn" href={downloadUrl(`/projects/${id}/papers/${paper.id}/markdown`)}>⬇ {paper.pdfUrl ? 'Study guide' : 'Markdown'}</a>
            <button className="iconbtn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="reader-body">
          <div className="reader-doc">
            {isPdf ? (
              <iframe title={paper.title || paper.name} className="reader-frame" src={pdfSrc} />
            ) : md === null ? (
              <div className="dim" style={{ padding: 24 }}>Loading…</div>
            ) : (
              <article className="reader-md lesson-md">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{md}</ReactMarkdown>
              </article>
            )}
          </div>
          <aside className="reader-notes">
            <div className="np-label">📝 Notes</div>
            <textarea className="reader-notes-edit" placeholder="Jot notes as you read — saved to this paper." value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} spellCheck={false} />
            <div className="reader-notes-foot">
              <button className="btn btn-primary small-btn" disabled={saving || notes === saved} onClick={save}>{saving ? 'Saving…' : notes === saved ? 'Saved' : 'Save notes'}</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
