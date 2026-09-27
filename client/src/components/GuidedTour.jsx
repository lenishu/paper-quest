import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api';

// Spotlight tour. It starts on its own the first time someone opens a workspace with
// no projects, dims everything except the control a step is about (found by its
// data-tour attribute), and navigates the app itself through `onGo`.
// Step numbers must match server/onboarding.js: TOUR.total = STEPS.length,
// afterProject = 4 (papers), afterCareer = 9 (career-map).
export const STEPS = [
  { id: 'welcome', go: 'dashboard', title: 'Welcome to PaperQuest',
    body: 'Turn research papers, classes, courses, clubs, hackathons and notes into concept maps you learn from the ground up. This short tour builds a real example with you from the Transformer paper, Attention Is All You Need. No API key needed.',
    cta: 'Start the tour' },
  { id: 'dashboard', go: 'dashboard', target: ['dash-overview'], title: 'Your dashboard tracks everything',
    body: 'XP and levels, daily streaks and quests, an activity heatmap, and progress across every project and branch. It fills in as you learn.' },
  { id: 'new-project', go: 'dashboard', target: ['new-project', 'new-project-side'], clickAdvances: true, title: 'Start with a project',
    body: 'A project holds one thing you are learning: a paper, a class, a course, a club, a hackathon or your notes. Create one here. Click New Project.' },
  { id: 'create', go: 'new-project', target: ['new-project-form'], title: 'Name it and pick a type',
    body: 'The type tells the AI what it is reading. For the tour, PaperQuest creates a sample project from the real paper, already mapped.',
    cta: 'Create the sample project', action: 'project' },
  { id: 'papers', go: 'project:papers', target: ['papers'], title: 'Add papers, notes or slides',
    body: 'Drop PDFs or Markdown here and AI maps every prerequisite concept. The original paper is already added: Read opens it next to your notes, and Summary gives you the key ideas.' },
  { id: 'map', go: 'project:map', target: ['project-map'], title: 'Your prerequisite map',
    body: 'High-school math at the bottom, the paper\'s core idea (★) at the top. Click any concept to see what it is and exactly how the paper uses it.' },
  { id: 'refresher', go: 'project:refresher', target: ['lesson-quiz'], title: 'Refreshers and quizzes',
    body: 'Every concept gets a short refresher and a quiz. Pass the quiz to master the concept and earn XP. This one is saved, so it opens for free.' },
  { id: 'study', go: 'project:overview', target: ['study-tools'], title: 'Cheatsheets, summaries and quizzes',
    body: 'One page with the formulas, definitions and pitfalls of the whole map, a summary of every paper, and your next quiz.' },
  { id: 'career', go: 'career', target: ['career-add'], title: 'Turn your knowledge into a career',
    body: 'AI reads your knowledge graph and suggests roles, or you type an interest. Each career maps the tools jobs actually ask for, like Python, PyTorch and Docker. Pick one to build a sample.',
    cta: 'Build the sample career', action: 'career' },
  { id: 'career-map', go: 'career:map', target: ['career-map'], title: 'Tools and skills, matched to you',
    body: 'Foundation tools at the top, role-defining skills (★) at the bottom. A tool turns amber once you master the concepts it uses. Add your resume or a job description to see your match.' },
  { id: 'explore', go: 'explore', target: ['explore-graph'], title: 'One knowledge graph',
    body: 'Every concept from every project and career, connected. Search it, rotate it, and click a star to travel.' },
  { id: 'api-key', go: 'dashboard', target: ['api-key', 'api-key-top', 'profile-menu'], title: 'AI is ready to go',
    body: 'Summaries, lessons, maps and career paths run on a shared free Gemini key, so there is nothing to set up. Add your own key here any time.',
    cta: 'Finish' }
];
const PAD = 8, GAP = 14, CARD_W = 360;
// Overlays the learner opened (reader, summary, another modal): the tour steps aside.
const OVERLAYS = '.modal-backdrop, .reader-overlay, .paper-drawer';

const shown = (el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
function findTarget(names) {
  for (const name of names || []) {
    const el = document.querySelector(`[data-tour="${name}"]`);
    if (el && shown(el)) return el;
  }
  return null;
}

// Where the card goes: below, above, right or left of the spotlight, else docked.
function place(box, card) {
  const vw = window.innerWidth, vh = window.innerHeight, w = card.width, h = card.height;
  if (vw < 640 || !box) return null; // CSS docks it (bottom sheet / centred)
  const clampX = (x) => Math.max(16, Math.min(x, vw - w - 16));
  const clampY = (y) => Math.max(16, Math.min(y, vh - h - 16));
  const bottom = box.top + box.height;
  if (vh - bottom >= h + GAP + 16) return { top: bottom + GAP, left: clampX(box.left) };
  if (box.top >= h + GAP + 16) return { top: box.top - GAP - h, left: clampX(box.left) };
  if (vw - (box.left + box.width) >= w + GAP + 16) return { top: clampY(box.top), left: box.left + box.width + GAP };
  if (box.left >= w + GAP + 16) return { top: clampY(box.top), left: box.left - GAP - w };
  return { top: vh - h - 16, left: vw - w - 16 }; // target fills the screen: bottom-right corner
}

export default function GuidedTour({ restart, hidden, onGo, onRefresh, onDone }) {
  const [state, setState] = useState(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [career, setCareer] = useState('AI / Machine Learning Engineer');
  const [box, setBox] = useState(null);
  const [lost, setLost] = useState(false);
  const [covered, setCovered] = useState(false);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const send = (body) => api('/onboarding', { method: 'POST', body });

  // First visit: start straight away. A workspace with no projects cannot be past the
  // sample-project step, so any saved progress beyond it starts over.
  useEffect(() => {
    api('/onboarding').then(async (s) => {
      if (s.dismissed || s.completed || !(s.eligible || s.projectId)) return setState(s);
      if (s.eligible && (s.step || 0) >= 4) s = await send({ action: 'restart' });
      setState(s);
      setActive(true);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restart) return;
    send({ action: 'restart' }).then((s) => { setState(s); setActive(true); setError(''); }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restart]);

  const index = Math.min(STEPS.length - 1, (state && state.step) || 0);
  const step = STEPS[index];
  const visible = active && !!state && !hidden;

  // Each step brings its own screen (route, modal, open refresher).
  useEffect(() => {
    if (active && state) onGo(step.go, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Track the target: screens load, modals open and pages scroll, so poll its box.
  useEffect(() => {
    setBox(null); setLost(false); setCovered(false);
    if (!visible || !step.target) return undefined;
    const started = Date.now();
    let scrolled = false;
    const tick = () => {
      const el = findTarget(step.target);
      setCovered([...document.querySelectorAll(OVERLAYS)].some((o) => !el || !o.contains(el)));
      if (!el) { setBox(null); setLost(Date.now() - started > 5000); return; }
      if (!scrolled) {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.7;
        el.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest' });
        scrolled = true;
      }
      const r = el.getBoundingClientRect();
      const next = { top: Math.max(4, r.top - PAD), left: Math.max(4, r.left - PAD),
        width: Math.min(r.width + PAD * 2, window.innerWidth - 8), height: Math.min(r.height + PAD * 2, window.innerHeight - Math.max(4, r.top - PAD) - 4) };
      setBox((b) => (b && ['top', 'left', 'width', 'height'].every((k) => Math.abs(b[k] - next[k]) < 0.5) ? b : next));
      setLost(false);
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [visible, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking the real control (e.g. New Project) moves the tour on.
  useEffect(() => {
    if (!visible || !step.clickAdvances) return undefined;
    const onClick = (e) => {
      const el = findTarget(step.target);
      if (el && el.contains(e.target)) setTimeout(() => advance(), 0);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!visible || !cardRef.current) return;
    const card = cardRef.current.getBoundingClientRect();
    const p = place(box, card);
    setPos((cur) => (cur && p && Math.abs(cur.top - p.top) < 0.5 && Math.abs(cur.left - p.left) < 0.5) || (!cur && !p) ? cur : p);
  });

  async function advance() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const s = step.action === 'project' ? await send({ action: 'project' })
        : step.action === 'career' ? await send({ action: 'career', name: career })
        : await send({ action: 'step', step: index + 1 });
      setState((cur) => ({ ...cur, ...s }));
      if (s.completed) { setActive(false); onDone && onDone(); }
      onRefresh && onRefresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function back() {
    if (busy || index === 0) return;
    try { const s = await send({ action: 'step', step: index - 1 }); setState((cur) => ({ ...cur, ...s })); } catch (e) { setError(e.message); }
  }
  async function skip() {
    try { await send({ action: 'dismiss' }); } catch {}
    setActive(false);
    onGo('dashboard', state);
  }

  if (!visible || covered) return null;
  const spot = step.target && box;
  const careers = (state && state.careers) || [];
  return (
    <div className="tour" aria-live="polite">
      {spot ? (
        <>
          <div className="tour-dim" style={{ top: 0, left: 0, right: 0, height: box.top }} />
          <div className="tour-dim" style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-dim" style={{ top: box.top, left: 0, width: box.left, height: box.height }} />
          <div className="tour-dim" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          <div className="tour-ring" style={box} />
        </>
      ) : <div className="tour-dim" style={{ inset: 0 }} />}
      <div ref={cardRef} role="dialog" aria-label={`Guided tour: ${step.title}`}
        className={`tour-card ${spot && pos ? '' : 'tour-card-center'} ${index === 0 ? 'tour-card-welcome' : ''}`}
        style={spot && pos ? { top: pos.top, left: pos.left, width: CARD_W } : undefined}>
        <div className="trail-top">
          <span className="trail-eyebrow">{index === 0 ? 'Guided tour' : `Step ${index} of ${STEPS.length - 1}`}</span>
          <button className="linkbtn" onClick={skip} disabled={busy}>Skip tour</button>
        </div>
        {index > 0 && <div className="trail-progress" aria-hidden="true">{STEPS.slice(1).map((s, i) => <span key={s.id} className={i < index ? 'active' : ''} />)}</div>}
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        {step.action === 'career' && careers.length > 0 && (
          <label className="field-label tour-select">Sample career
            <select value={career} onChange={(e) => setCareer(e.target.value)}>{careers.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
        )}
        {step.target && !box && (
          lost ? <p className="tour-lost">Can't see it? <button className="linkbtn" onClick={() => onGo(step.go, state)}>Show me</button></p>
            : <p className="tour-lost dim">Opening…</p>
        )}
        {error && <p className="doc-error" role="alert">{error}</p>}
        <div className="tour-actions">
          {index > 0 && <button className="btn btn-ghost small-btn" onClick={back} disabled={busy}>Back</button>}
          <button className="btn-primary" autoFocus={index === 0} disabled={busy} onClick={advance}>
            {busy ? 'Preparing…' : step.cta || 'Next'}<span aria-hidden="true"> →</span>
          </button>
        </div>
        {index === 0 && <p className="trail-footnote">About 2 minutes · you can skip any time</p>}
      </div>
    </div>
  );
}
