import React, { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { api } from '../api';
import { useJobs } from '../jobs';
import { Modal, Spinner } from './bits';
import { normalizeMath } from './MathText';

// Markdown with math, in the lesson typography. Shared by summaries, cheatsheets
// and the judge showcase.
export function MarkdownDoc({ children, className = '' }) {
  return (
    <article className={`lesson-md ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMath(children || '')}</ReactMarkdown>
    </article>
  );
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A paper summary ({ paper }) or the project cheatsheet (no paper). Saved copies open
// free; writing one runs as a background job so the modal can be closed meanwhile.
export default function StudyDocModal({ projectId, projectName, paper, onClose, openSettings }) {
  const kind = paper ? 'summary' : 'cheatsheet';
  const title = paper ? paper.title || paper.name : projectName;
  const path = paper ? `/projects/${projectId}/papers/${paper.id}/summary` : `/projects/${projectId}/cheatsheet`;
  const key = paper ? `summary:${projectId}:${paper.id}` : `cheatsheet:${projectId}`;
  const { startDoc, docState } = useJobs();
  const job = docState(key);
  const [doc, setDoc] = useState(undefined); // undefined = loading, null = not written yet

  const load = useCallback(() => {
    fetchDoc(path).then(setDoc);
  }, [path]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (job && job.status === 'ready') load(); }, [job, load]);

  const write = (regenerate) => {
    if (regenerate && !window.confirm(`Write a new ${kind} with AI? It replaces the saved one.`)) return;
    startDoc(kind, { projectId, paperId: paper && paper.id, regenerate, name: `${paper ? 'Summary' : 'Cheatsheet'} — ${title}` });
  };
  const writing = job && job.status === 'writing';

  return (
    <Modal onClose={onClose} wide className="doc-modal">
      <div className="modal-head">
        <div>
          <span className="eyebrow">{paper ? 'Summary' : 'Cheatsheet'}</span>
          <h2>{title}</h2>
          {paper && paper.authors && <div className="dim small">{paper.authors}</div>}
        </div>
        <div className="learn-head-actions">
          {doc && <button className="btn btn-ghost small-btn" onClick={() => download(`${(title || kind).replace(/[^\w\- ]/g, '')} ${kind}.md`, doc.markdown)}>⬇ .md</button>}
          {doc && !writing && <button className="btn btn-ghost small-btn" title="Write a new one with AI" onClick={() => write(true)}>🔁 Regenerate</button>}
          <button className="iconbtn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
      </div>
      {writing ? (
        <div className="doc-writing"><Spinner label={`Writing the ${kind} in the background…`} /><p className="dim small">You can close this. It is saved when done, and opens instantly after that.</p></div>
      ) : doc === undefined ? (
        <Spinner label="Loading…" />
      ) : doc ? (
        <>
          <MarkdownDoc className="doc-md">{doc.markdown}</MarkdownDoc>
          <div className="dim small doc-foot">{doc.demo ? 'Prepared for the demo — no API key used.' : `Written by AI ${new Date(doc.generatedAt).toLocaleDateString()} · saved, so reopening is free.`}</div>
        </>
      ) : (
        <div className="doc-empty">
          <p>{paper
            ? 'No summary yet. AI reads this file and writes the TL;DR, key ideas, how it works, results and why it matters.'
            : 'No cheatsheet yet. AI turns the whole map into one page: core formulas, key definitions, the build-up path and common pitfalls.'}</p>
          {job && job.status === 'error' && <p className="doc-error" role="alert">{job.error}</p>}
          <div className="doc-empty-actions">
            <button className="btn btn-primary" onClick={() => write(false)}>✦ Write {paper ? 'summary' : 'cheatsheet'} with AI</button>
            {job && job.status === 'error' && <button className="btn btn-ghost" onClick={openSettings}>API key</button>}
          </div>
          <p className="dim small">Uses the shared free Gemini key unless you added your own.</p>
        </div>
      )}
    </Modal>
  );
}

// GET a saved doc: the doc, or null when none is saved yet (404).
async function fetchDoc(path) {
  try { return await api(path); } catch { return null; }
}
