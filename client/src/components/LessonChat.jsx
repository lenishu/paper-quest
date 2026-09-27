import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { api } from '../api';
import { useToast } from './bits';
import MathText, { normalizeMath } from './MathText';

const when = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return new Date(t).toLocaleDateString();
};

// Follow-up Q&A under an open refresher. The thread is owned by LearnModal (it
// arrives with the lesson payload); every ask returns the WHOLE thread from the
// server, so history survives closing the modal and regenerating the lesson.
export default function LessonChat({ projectId, node, chat, onChat, openSettings }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null); // 'ask' | 'source' | null
  const [err, setErr] = useState('');
  const [newestId, setNewestId] = useState(null);
  const endRef = useRef(null);
  const toast = useToast();

  const turns = chat || [];

  useEffect(() => {
    if (newestId) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [newestId, turns.length]);

  async function ask(mode) {
    const question = q.trim();
    if (mode === 'ask' && !question) return;
    setBusy(mode);
    setErr('');
    try {
      const r = await api(`/projects/${projectId}/lesson/ask`, {
        method: 'POST',
        body: { conceptId: node.id, question, mode }
      });
      onChat(r.chat || []);
      setNewestId((r.entry && r.entry.id) || null);
      setQ('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function clearThread() {
    if (!window.confirm('Delete every question and answer for this refresher?')) return;
    try {
      const r = await api(`/projects/${projectId}/lesson/chat?conceptId=${encodeURIComponent(node.id)}`, { method: 'DELETE' });
      onChat(r.chat || []);
      setNewestId(null);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <section className="qa">
      <div className="qa-head">
        <h3 className="quiz-title">💬 Still unsure? Ask</h3>
        {turns.length > 0 && (
          <button className="linkbtn" onClick={clearThread}>Clear thread</button>
        )}
      </div>
      <p className="dim small qa-intro">
        Questions about <b>{node.name}</b> stay with this refresher — the whole thread comes back
        every time you open it, and each answer builds on the ones before.
      </p>

      {turns.length === 0 && !busy && (
        <div className="qa-empty dim small">
          No questions yet. Ask anything about the lesson above, or get the sources it rests on.
        </div>
      )}

      <div className="qa-thread">
        {turns.map((t) => (
          <article key={t.id} className={`qa-turn ${t.id === newestId ? 'is-new' : ''}`}>
            <header className="qa-q">
              <span className={`chip qa-badge ${t.mode === 'source' ? 'src' : ''}`}>
                {t.mode === 'source' ? '📚 Sources' : '❓ Question'}
              </span>
              <mark className="qa-qtext"><MathText>{t.question}</MathText></mark>
            </header>

            {t.raw && t.raw.trim() && t.raw.trim() !== (t.question || '').trim() && (
              <div className="qa-raw dim small">you asked: “{t.raw}”</div>
            )}

            <div className="qa-a lesson-md">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {normalizeMath(t.answer)}
              </ReactMarkdown>
            </div>

            {Array.isArray(t.sources) && t.sources.length > 0 && (
              <div className="qa-sources">
                <span className="field-sub">Where to read more</span>
                <ul>
                  {t.sources.map((sname, i) => (
                    <li key={i}><MathText>{sname}</MathText></li>
                  ))}
                </ul>
              </div>
            )}

            <footer className="qa-time dim small">{when(t.ts)}</footer>
          </article>
        ))}
        <div ref={endRef} />
      </div>

      {busy && (
        <div className="qa-busy">
          <span className="mini-spinner" />
          {busy === 'source' ? 'Finding where this comes from…' : 'Thinking it through…'}
        </div>
      )}

      {err && (
        <div className="qa-error">
          ⚠️ {err}
          <button className="linkbtn" onClick={() => ask(busyModeFallback(q))}>Try again</button>
          {openSettings && <button className="linkbtn" onClick={openSettings}>Open settings</button>}
        </div>
      )}

      <div className="qa-compose">
        <textarea
          className="qa-input"
          rows={2}
          placeholder={`Ask anything about ${node.name} — "why does the example work?", "how is this different from…?"`}
          value={q}
          disabled={!!busy}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask('ask');
            }
          }}
        />
        <div className="qa-actions">
          <button className="btn btn-primary small-btn" disabled={!!busy || !q.trim()} onClick={() => ask('ask')}>
            {busy === 'ask' ? 'Asking…' : 'Ask'}
          </button>
          <button
            className="btn btn-ghost small-btn"
            disabled={!!busy}
            title="Get the books and papers this rests on — optionally narrowed by what you typed"
            onClick={() => ask('source')}
          >
            {busy === 'source' ? 'Looking…' : '📚 Ask for sources'}
          </button>
          <span className="dim small qa-hint">Enter sends · Shift+Enter for a new line</span>
        </div>
      </div>
    </section>
  );
}

// After an error the retry re-sends whatever is still in the box, as a question.
function busyModeFallback(text) {
  return text && text.trim() ? 'ask' : 'source';
}
