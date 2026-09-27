import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { api } from '../api';
import { Modal, useToast } from './bits';
import MathText, { normalizeMath } from './MathText';
import { tierOf, TIER_LABELS } from '../graphLayout';
import LessonChat from './LessonChat';

const LOADING_LINES = [
  'Reading what you already know…',
  'Writing a lesson that builds on it…',
  'Working out a good example…',
  'Crafting quiz questions…',
  'Almost there…'
];

export default function LearnModal({ projectId, node, isMastered, onClose, onCompleted, openSettings }) {
  const [phase, setPhase] = useState('loading'); // loading | error | ready
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);
  const [chat, setChat] = useState([]); // follow-up Q&A thread, arrives with the lesson
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loadingLine, setLoadingLine] = useState(0);
  const resultRef = useRef(null);
  const toast = useToast();

  const load = (regenerate = false) => {
    setPhase('loading');
    setErr('');
    setResult(null);
    setAnswers({});
    api(`/projects/${projectId}/lesson`, { method: 'POST', body: { conceptId: node.id, regenerate } })
      .then((d) => {
        setData(d);
        setChat(d.chat || []);
        setPhase('ready');
      })
      .catch((e) => {
        setErr(e.message);
        setPhase('error');
      });
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useEffect(() => {
    if (phase !== 'loading') return;
    const t = setInterval(() => setLoadingLine((i) => (i + 1) % LOADING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [phase]);

  const quiz = data?.quiz || [];
  const allAnswered = quiz.length > 0 && quiz.every((_, i) => answers[i] !== undefined);

  function submit() {
    let correct = 0;
    quiz.forEach((q, i) => {
      if (answers[i] === q.answer) correct++;
    });
    const pass = correct >= Math.ceil(quiz.length * 0.75);
    setResult({ correct, total: quiz.length, pass });
    if (pass) {
      api('/complete', {
        method: 'POST',
        body: { projectId, conceptId: node.id, score: correct, total: quiz.length }
      })
        .then((r) => onCompleted(r))
        .catch((e) => toast(e.message, 'err'));
    }
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }

  function regenerate() {
    if (!window.confirm("Write a new lesson and quiz with AI? This replaces the saved one for this concept and uses your API key — reopening the saved lesson is free.")) return;
    load(true);
  }

  function skip() {
    if (!window.confirm(`Mark "${node.name}" as already reviewed? (counts toward progress, half XP)`)) return;
    api('/complete', { method: 'POST', body: { projectId, conceptId: node.id, skipped: true } })
      .then((r) => {
        onCompleted(r);
        onClose();
      })
      .catch((e) => toast(e.message, 'err'));
  }

  return (
    <Modal onClose={onClose} wide className="learn-modal">
      <div className="modal-head">
        <div>
          <span className={`chip tierchip tier-${tierOf(node)}`}>{node.core ? '★ ' : ''}{TIER_LABELS[tierOf(node)]}</span>
          <h2 className="learn-title">{node.name}</h2>
        </div>
        <div className="learn-head-actions">
          {phase === 'ready' && (
            <button className="btn btn-ghost small-btn" title="Write a new lesson with AI — replaces the saved one" onClick={regenerate}>
              🔁 Regenerate
            </button>
          )}
          {!isMastered && phase === 'ready' && (
            <button className="btn btn-ghost small-btn" onClick={skip}>
              Skip — I know this
            </button>
          )}
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
      </div>

      {phase === 'loading' && (
        <div className="learn-loading">
          <div className="spinner" />
          <div className="spinner-label">{LOADING_LINES[loadingLine]}</div>
          <div className="dim small">Written once, then saved — every time after this it opens instantly, free.</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="learn-error">
          <p>⚠️ {err}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => load(false)}>Try again</button>
            <button className="btn btn-ghost" onClick={openSettings}>Open settings</button>
          </div>
        </div>
      )}

      {phase === 'ready' && data && (
        <div className="learn-body">
          {data.cached && (
            <div className="lesson-saved dim small">
              📖 Your saved copy — written once and kept for you, so reopening it never calls the model.
              Use 🔁 Regenerate only if you want a different one.
            </div>
          )}
          <article className="lesson-md">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {normalizeMath(data.lesson)}
            </ReactMarkdown>
          </article>

          <div className="quiz">
            <h3 className="quiz-title">🎯 Prove it — {quiz.length} questions, {Math.ceil(quiz.length * 0.75)} to pass</h3>
            {quiz.map((q, qi) => {
              const chosen = answers[qi];
              return (
                <div key={qi} className="quiz-q">
                  <div className="quiz-qtext">
                    {qi + 1}. <MathText>{q.q}</MathText>
                  </div>
                  <div className="quiz-opts">
                    {q.options.map((opt, oi) => {
                      let cls = 'quiz-opt';
                      if (!result && chosen === oi) cls += ' chosen';
                      if (result) {
                        if (oi === q.answer) cls += ' right';
                        else if (chosen === oi) cls += ' wrong';
                      }
                      return (
                        <button
                          key={oi}
                          className={cls}
                          disabled={!!result}
                          onClick={() => setAnswers({ ...answers, [qi]: oi })}
                        >
                          <span className="opt-letter">{'ABCD'[oi]}</span> <MathText>{opt}</MathText>
                        </button>
                      );
                    })}
                  </div>
                  {result && q.why && (
                    <div className={`quiz-why ${chosen === q.answer ? 'ok' : 'bad'}`}>
                      {chosen === q.answer ? '✓' : '✗'} <MathText>{q.why}</MathText>
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={resultRef} className="quiz-footer">
              {!result && (
                <button className="btn btn-primary" disabled={!allAnswered} onClick={submit}>
                  {allAnswered ? 'Submit answers' : `Answer all ${quiz.length} questions`}
                </button>
              )}
              {result && result.pass && (
                <div className="quiz-result pass">
                  <div className="quiz-result-big">🎉 Mastered — {result.correct}/{result.total}</div>
                  <div className="dim">Marked as reviewed — nice work.</div>
                  <button className="btn btn-primary" onClick={onClose}>Continue exploring →</button>
                </div>
              )}
              {result && !result.pass && (
                <div className="quiz-result fail">
                  <div className="quiz-result-big">Not yet — {result.correct}/{result.total}</div>
                  <div className="dim">Skim the lesson again; the explanations above show what to revisit.</div>
                  <div className="modal-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setResult(null);
                        setAnswers({});
                      }}
                    >
                      Try again
                    </button>
                    <button className="btn btn-ghost" onClick={regenerate}>New lesson &amp; questions</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <LessonChat
            projectId={projectId}
            node={node}
            chat={chat}
            onChat={setChat}
            openSettings={openSettings}
          />
        </div>
      )}
    </Modal>
  );
}
