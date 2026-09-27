import React, { useEffect, useState } from 'react';
import { api } from '../api';

const STEPS = [
  ['Add a paper', 'Start with Attention Is All You Need. This sample includes a prepared map and refresher, so you can try the whole journey without an API key.', 'Add sample project'],
  ['See the map', 'Your sample paper is already mapped. Follow the prerequisites from familiar mathematics to the Transformer.', 'Open the map'],
  ['Open a refresher', 'Try the saved matrix multiplication refresher. Read the explanation, then test yourself with its short quiz.', 'Open refresher'],
  ['Choose a career', 'Choose a direction and build a sample career path connected to the concepts in your paper.', 'Build sample career path'],
  ['Explore your knowledge', 'Your paper and career now share one knowledge graph. Search, rotate, and select concepts to see how the ideas connect.', 'Explore knowledge graph']
];
export default function GuidedTour({ restart, onProject, onRefresher, onCareer, onExplore, onRefresh, hidden }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [career, setCareer] = useState('AI / Machine Learning Engineer');
  useEffect(() => { api('/onboarding').then(setState).catch(() => {}); }, []);
  useEffect(() => { if (restart) api('/onboarding', { method: 'POST', body: { action: 'restart' } }).then(s => setState({ ...s, eligible: true })).catch(e => setError(e.message)); }, [restart]);
  const send = body => api('/onboarding', { method: 'POST', body });
  async function next() {
    setBusy(true); setError('');
    try {
      const step = state.step || 0;
      let result;
      if (step === 0) { result = await send({ action: 'project' }); onProject(result.projectId, 'papers'); }
      if (step === 1) { result = await send({ action: 'step', step: 2 }); onProject(state.projectId, 'map'); }
      if (step === 2) { result = await send({ action: 'step', step: 3 }); onRefresher(state.projectId); }
      if (step === 3) { result = await send({ action: 'career', name: career }); onCareer(result.careerId); }
      if (step === 4) { result = await send({ action: 'step', step: 5 }); onExplore(); }
      setState(s => ({ ...s, ...result })); onRefresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function dismiss() { try { const result = await send({ action: 'dismiss' }); setState(result); } catch(e) { setError(e.message); } }
  if (!state || hidden || state.dismissed || state.completed || (!state.eligible && !state.projectId && !restart)) return null;
  const step = Math.min(4, state.step || 0), [title, description, action] = STEPS[step];
  return <aside className="guided-tour" aria-label="Guided tour">
    <div className="trail-top"><span className="trail-eyebrow">YOUR FIRST PAPERQUEST</span><button className="linkbtn" onClick={dismiss} disabled={busy}>Skip tour</button></div>
    <div className="trail-progress" aria-label={`Step ${step + 1} of 5`}>{STEPS.map((s,i) => <span key={s[0]} className={i <= step ? 'active' : ''} />)}</div>
    <span className="dim small">Step {step + 1} of 5</span><h2>{title}</h2><p>{description}</p>
    {step === 3 && <label className="field-label">Choose a career<select value={career} onChange={e => setCareer(e.target.value)}>{['AI / Machine Learning Engineer','Data Scientist','Research Scientist (ML)'].map(c => <option key={c}>{c}</option>)}</select></label>}
    <button className="btn-primary" disabled={busy} onClick={next}>{busy ? 'Preparing…' : action}<span aria-hidden="true"> →</span></button>
    {error && <p role="alert">{error}</p>}
    <p className="trail-footnote">Guided sample · no API key required</p>
  </aside>;
}
