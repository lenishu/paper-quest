import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, downloadUrl } from '../api';
import { useJobs } from '../jobs';
import { Modal, useToast } from './bits';
import { ACCENT_HUES } from '../graphLayout';

const PRESETS = [
  'AI / Machine Learning Engineer',
  'Data Scientist',
  'Research Scientist (ML)',
  'Software Engineer',
  'Data Engineer',
  'Quantitative Researcher'
];
const GLYPHS = ['◈', '◇', '◎', '⬡', '◐', '✦'];
// same rotation as project/badge avatars, minus the off-palette violet
// (indices are used as `i % 4`, so the slice length must stay 4)
const ACCENTS = ACCENT_HUES.slice(0, 4);

// Skill-state palette from the Claude Design mockup (canvas can't read CSS tokens).
export const STATE_STYLE = {
  known: { fill: '#EAF7EF', border: '#1F9D57', text: '#116B3B', label: 'Known' },
  learning: { fill: '#FEF3E0', border: '#F59E0B', text: '#92610A', label: 'Learning' },
  tolearn: { fill: '#FDECEC', border: '#DC2626', text: '#A32424', label: 'To Learn' },
  notreq: { fill: '#F2F1ED', border: '#D6D3CD', text: '#7A766F', label: 'Not Required' }
};

function wrapLabel(name) {
  const words = String(name).split(' ');
  if (words.length === 1 || name.length <= 15) return [name.length > 20 ? name.slice(0, 19) + '…' : name];
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length;
    const d = Math.abs(a - b);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  const l1 = words.slice(0, best).join(' '), l2 = words.slice(best).join(' ');
  return [l1.length > 20 ? l1.slice(0, 19) + '…' : l1, l2.length > 20 ? l2.slice(0, 19) + '…' : l2];
}

// Layered DAG canvas in the mockup's visual language: rounded state-colored
// boxes per depth row, arrows from prerequisite to dependent skill.
export function CareerGraph({ skills, states, selected, onSelect }) {
  const ref = useRef(null);

  const layout = useMemo(() => {
    const NODE_H = 46, ROW_GAP = 44, GAP = 18, PAD = 16;
    const rows = new Map();
    for (const s of skills) {
      const d = s.depth || 0;
      if (!rows.has(d)) rows.set(d, []);
      rows.get(d).push(s);
    }
    const depths = [...rows.keys()].sort((a, b) => a - b);
    const boxes = [];
    let W = 0;
    depths.forEach((d, ri) => {
      const row = rows.get(d);
      const y = PAD + ri * (NODE_H + ROW_GAP);
      const widths = row.map((s) => {
        const lines = wrapLabel(s.name);
        return Math.min(190, Math.max(104, Math.max(...lines.map((l) => l.length)) * 7 + 26));
      });
      const rowW = widths.reduce((a, b) => a + b, 0) + GAP * (row.length - 1);
      W = Math.max(W, rowW + PAD * 2);
      let x = 0;
      row.forEach((s, i) => {
        boxes.push({ s, y, w: widths[i], h: NODE_H, rowW, xOff: x });
        x += widths[i] + GAP;
      });
    });
    for (const b of boxes) b.x = (W - b.rowW) / 2 + b.xOff;
    const H = PAD * 2 + depths.length * NODE_H + Math.max(0, depths.length - 1) * ROW_GAP;
    return { boxes, W: Math.max(W, 320), H: Math.max(H, 120) };
  }, [skills]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { boxes, W, H } = layout;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const byId = new Map(boxes.map((b) => [b.s.id, b]));
    const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];

    for (const b of boxes) {
      for (const pid of b.s.prereqs || []) {
        const from = byId.get(pid);
        if (!from) continue;
        const a = center(from), c = center(b);
        const dx = c[0] - a[0], dy = c[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const pad = 32;
        const x1 = a[0] + ux * pad, y1 = a[1] + uy * pad;
        const x2 = c[0] - ux * pad, y2 = c[1] - uy * pad;
        ctx.strokeStyle = '#C9C5BE';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const ah = 5;
        ctx.fillStyle = '#B7B2A9';
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * ah * 2 - uy * ah, y2 - uy * ah * 2 + ux * ah);
        ctx.lineTo(x2 - ux * ah * 2 + uy * ah, y2 - uy * ah * 2 - ux * ah);
        ctx.closePath(); ctx.fill();
      }
    }

    for (const b of boxes) {
      const st = STATE_STYLE[states[b.s.id]] || STATE_STYLE.notreq;
      const isSel = selected && selected.id === b.s.id;
      ctx.fillStyle = st.fill;
      ctx.strokeStyle = isSel ? '#1B1917' : st.border;
      ctx.lineWidth = isSel ? 2 : 1.4;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 10); else ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = st.text;
      ctx.font = '600 11.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      const lines = wrapLabel(b.s.name);
      const ly0 = b.y + b.h / 2 - (lines.length - 1) * 7 + 4;
      lines.forEach((ln, i) => ctx.fillText((i === 0 && b.s.core ? '★ ' : '') + ln, b.x + b.w / 2, ly0 + i * 14));
    }
    ctx.textAlign = 'left';
  }, [layout, states, selected]);

  const onClick = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = layout.boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    onSelect(hit ? hit.s : null);
  };

  return (
    <div className="cgraph-scroll">
      <canvas ref={ref} onClick={onClick} style={{ display: 'block', cursor: 'pointer' }} />
    </div>
  );
}

function MatchDonut({ pct }) {
  const C = 2 * Math.PI * 52;
  return (
    <svg viewBox="0 0 140 140" className="career-donut">
      <circle cx="70" cy="70" r="52" fill="none" stroke="var(--surface-2)" strokeWidth="14" />
      <circle cx="70" cy="70" r="52" fill="none" stroke="var(--green)" strokeWidth="14"
        strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 70 70)" strokeLinecap="round" />
      <text x="70" y="66" textAnchor="middle" className="donut-big">{pct}%</text>
      <text x="70" y="86" textAnchor="middle" className="donut-small">OVERALL MATCH</text>
    </svg>
  );
}

function StatBar({ label, value, total, color }) {
  const w = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="career-statbar">
      <div className="csb-top"><span>{label}</span><b>{value}</b></div>
      <div className="csb-track"><i style={{ width: `${w}%`, background: color }} /></div>
    </div>
  );
}

// Choosing a career: AI suggestions read from the knowledge graph, popular roles, or
// free text (an interest or a title) that the AI turns into the best-fitting role.
function AddCareerModal({ suggestions, conceptCount, onClose, onPick, onInterest, onSuggested, openApiKey }) {
  const [interest, setInterest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = (suggestions && suggestions.suggestions) || [];

  async function suggest() {
    setBusy(true); setError('');
    try { onSuggested(await api('/careers/suggest', { method: 'POST', body: { interest: interest.trim() } })); }
    catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <Modal onClose={onClose} wide className="career-modal" label="Choose a career path">
      <div className="modal-head">
        <div>
          <span className="eyebrow">Career path</span>
          <h2>Where are you headed?</h2>
        </div>
        <button className="iconbtn" aria-label="Close" onClick={onClose}>✕</button>
      </div>

      <section className="cm-section">
        <div className="cm-head">
          <div>
            <b>✦ Suggested from your knowledge graph</b>
            <div className="dim small">{conceptCount ? `AI reads the ${conceptCount} concepts in your projects and matches them to real job titles.` : 'Add a project first, or type an interest below, and AI suggests roles that fit.'}</div>
          </div>
          <button className="btn btn-ghost small-btn" disabled={busy || (!conceptCount && !interest.trim())} onClick={suggest}>
            {busy ? 'Thinking…' : list.length ? '↻ Suggest again' : 'Suggest roles'}
          </button>
        </div>
        {error && <p className="doc-error" role="alert">{error} <button className="linkbtn" onClick={openApiKey}>API key</button></p>}
        {busy && !list.length && <div className="dim small">Reading your knowledge graph…</div>}
        {list.length > 0 && (
          <div className="cm-suggestions">
            {list.map((s) => (
              <div key={s.title} className="cm-suggestion">
                <div className="cm-sug-title">{s.title}</div>
                <p className="dim small">{s.why}</p>
                {s.concepts && s.concepts.length > 0 && (
                  <div className="cm-chips">{s.concepts.map((c) => <span key={c.id} className={`kg-chip ${c.state === 'mastered' ? 'done' : ''}`}>{c.state === 'mastered' ? '✓ ' : ''}{c.name}</span>)}</div>
                )}
                {s.tools && s.tools.length > 0 && <div className="dim small">Starter tools: {s.tools.join(' · ')}</div>}
                <button className="btn btn-primary small-btn" onClick={() => onPick(s.title)}>Build this map →</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="cm-section">
        <b>Or describe your interest</b>
        <div className="dim small">A role or a direction. AI picks the job title that fits and maps the tools it needs.</div>
        <div className="career-custom">
          <input className="input" placeholder="e.g. I like robotics and computer vision · or: Quant Researcher" value={interest}
            onChange={(e) => setInterest(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && interest.trim() && onInterest(interest)} />
          <button className="btn-primary" disabled={!interest.trim()} onClick={() => onInterest(interest)}>Build map</button>
        </div>
      </section>

      <section className="cm-section">
        <b>Popular roles</b>
        <div className="career-presets">
          {PRESETS.map((p) => <button key={p} className="preset-btn" onClick={() => onPick(p)}>{p}</button>)}
        </div>
      </section>
      <p className="dim small">Career maps list the tools and skills most job postings ask for (Python, PyTorch, Docker, SQL…), not courses. Compare them with a real job description or your resume afterwards.</p>
    </Modal>
  );
}

export default function CareerView({ initialId, openApiKey }) {
  const toast = useToast();
  const { startCareerJob, careersVersion, jobs } = useJobs();
  const [data, setData] = useState(null); // { careers, suggestions, concepts }
  const [selId, setSelId] = useState(initialId || null);
  const [detail, setDetail] = useState(null); // full career payload with states/stats
  const [selSkill, setSelSkill] = useState(null);
  const [adding, setAdding] = useState(false);
  const [jdPasting, setJdPasting] = useState(false);
  const [jdText, setJdText] = useState('');
  const resumeInput = useRef(null);
  const jdInput = useRef(null);

  const load = useCallback(
    () =>
      api('/careers')
        .then((d) => {
          setData(d);
          setSelId((cur) => (cur && d.careers.some((c) => c.id === cur) ? cur : ((d.careers.find((c) => c.primary) || d.careers[0] || {}).id || null)));
        })
        .catch((e) => toast(e.message, 'err')),
    [toast]
  );
  useEffect(() => { load(); }, [load, careersVersion]);
  useEffect(() => {
    if (!selId) { setDetail(null); return; }
    setSelSkill(null);
    api(`/careers/${selId}`).then(setDetail).catch(() => setDetail(null));
  }, [selId, careersVersion]);

  const careerBusy = useCallback(
    (cid) => jobs.some((j) => String(j.kind).startsWith('career') && (j.careerId === cid || j.kind === 'career-resume') && j.status !== 'done' && j.status !== 'error'),
    [jobs]
  );

  const create = async (body, label) => {
    setAdding(false);
    try {
      const c = await api('/careers', { method: 'POST', body });
      startCareerJob('career-generate', { careerId: c.id, name: `Career map — ${label}` });
      setSelId(c.id);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };
  const addCareer = (name) => String(name || '').trim() && create({ name: String(name).trim() }, String(name).trim());
  const addFromInterest = (text) => String(text || '').trim() && create({ interest: String(text).trim() }, 'your interest');
  const setPrimary = async (id) => {
    try { await api(`/careers/${id}`, { method: 'PATCH', body: { primary: true } }); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const removeCareer = async (id) => {
    if (!window.confirm('Remove this career and its map?')) return;
    try { await api(`/careers/${id}`, { method: 'DELETE' }); if (selId === id) setSelId(null); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const toggleKnown = async (skill, value) => {
    try {
      const d = await api(`/careers/${selId}`, { method: 'PATCH', body: { known: { id: skill.id, value } } });
      setDetail(d);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };
  const onResumeFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f && selId) startCareerJob('career-resume', { careerId: selId, file: f, name: `Resume — ${f.name}` });
  };
  const onJdFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f && selId) startCareerJob('career-jd', { careerId: selId, file: f, name: `JD — ${f.name}` });
  };
  const submitJdText = () => {
    const text = jdText.trim();
    if (!selId || text.replace(/\s/g, '').length < 80) { toast('Paste the full job description first (a bit more text).', 'err'); return; }
    // Name the job after its first line (usually the title and company).
    const first = (text.split('\n').map((l) => l.trim()).find(Boolean) || 'Pasted job description').replace(/^#+\s*/, '').slice(0, 80);
    startCareerJob('career-jd', { careerId: selId, text, name: first });
    setJdText('');
    setJdPasting(false);
  };

  const careers = (data && data.careers) || [];
  const resume = (detail && detail.resume) || null;
  const skills = (detail && detail.skills) || [];
  const states = (detail && detail.states) || {};
  const knowledge = (detail && detail.knowledge) || {};
  const stats = (detail && detail.stats) || { total: 0, known: 0, learning: 0, tolearn: 0, matchPct: 0 };
  const skillName = useMemo(() => { const m = new Map(skills.map((s) => [s.id, s.name])); return (id) => m.get(id) || id; }, [skills]);

  const missing = useMemo(
    () =>
      skills
        .filter((s) => states[s.id] === 'tolearn')
        .sort((a, b) => (a.importance === 'critical' ? 0 : 1) - (b.importance === 'critical' ? 0 : 1)),
    [skills, states]
  );
  const nextSteps = useMemo(() => {
    const cont = skills
      .filter((s) => states[s.id] === 'learning')
      .slice(0, 1)
      .map((s) => ({ glyph: '📖', title: `Practice: ${s.name}`, sub: 'You know the concepts behind it. Now use the tool in a project.', tag: 'in progress' }));
    const learn = missing.slice(0, 2).map((s) => ({ glyph: '◇', title: `Learn: ${s.name}`, sub: s.roleNote || s.blurb, tag: s.importance }));
    return [...cont, ...learn].slice(0, 3);
  }, [missing, skills, states]);

  const modal = adding && (
    <AddCareerModal suggestions={data && data.suggestions} conceptCount={(data && data.concepts) || 0} openApiKey={openApiKey}
      onClose={() => setAdding(false)} onPick={addCareer} onInterest={addFromInterest}
      onSuggested={(s) => setData((d) => ({ ...d, suggestions: s }))} />
  );

  return (
    <div className="careerv">
      <div className="view-head">
        <div>
          <h1 className="view-title">Career Path</h1>
          <p className="view-sub">Your knowledge graph, turned into the tools and skills jobs ask for.</p>
        </div>
        <button className="btn-primary" data-tour="career-add" onClick={() => setAdding(true)}>＋ Add Career Path</button>
      </div>

      {!careers.length ? (
        <div className="card career-hero">
          <h2>Where are you headed?</h2>
          <p className="dim">
            AI reads your knowledge graph (every concept in your projects) and suggests roles that fit, or you type an
            interest. Each career path maps the real tools and skills job postings ask for, shows which you already have,
            and lets you compare yourself with a job description or your resume.
          </p>
          <div className="career-hero-actions">
            <button className="btn-primary" onClick={() => setAdding(true)}>✦ Suggest careers for me</button>
            <button className="btn btn-ghost" onClick={() => setAdding(true)}>Type an interest</button>
          </div>
        </div>
      ) : (
        <>
          <div className="career-grid">
            <div className="card career-sel">
              <div className="card-head">My Selected Careers</div>
              <div className="career-cards">
                {careers.map((c, i) => (
                  <div key={c.id} role="button" tabIndex={0}
                    className={`career-card ${selId === c.id ? 'active' : ''}`}
                    onClick={() => setSelId(c.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelId(c.id)}>
                    <div className="cc-top">
                      <span className="cc-glyph" style={{ color: ACCENTS[i % 4], background: ACCENTS[i % 4] + '1F', borderColor: ACCENTS[i % 4] + '4D' }}>{GLYPHS[i % 6]}</span>
                      <span className="cc-actions">
                        {!c.primary && <button title="Set as primary" onClick={(e) => { e.stopPropagation(); setPrimary(c.id); }}>★</button>}
                        <button title="Remove career" onClick={(e) => { e.stopPropagation(); removeCareer(c.id); }}>✕</button>
                      </span>
                    </div>
                    <div className="cc-name">{c.name}</div>
                    {c.primary && <div className="cc-primary">Primary</div>}
                    <div className="cc-match">{careerBusy(c.id) ? 'Working…' : c.skillCount ? `${c.stats.matchPct}% Match` : 'No map yet'}</div>
                    <div className="cc-bar"><i style={{ width: `${c.stats.matchPct}%`, background: ACCENTS[i % 4] }} /></div>
                  </div>
                ))}
              </div>
              <button className="career-addmore" onClick={() => setAdding(true)}>＋ Add another career</button>
            </div>

            <div className="card career-up">
              <div className="card-head">Compare with Your Resume</div>
              <div className="career-uprow">
                <span className="cu-icon cu-green">▤</span>
                <div className="cu-hint"><b>PDF → Markdown</b><br />Each career keeps its own tailored resume. Skills on it count as known.</div>
              </div>
              {resume ? (
                <>
                  <a className="cu-file cu-open" href={downloadUrl(`/careers/${selId}/resume/file`)} target="_blank" rel="noreferrer" title="Open this resume">
                    <span>📎 {resume.name}</span><span className="c-green">✓ open ↗</span>
                  </a>
                  <div className="cu-status c-green">Covers {(resume.matched || []).length} of {skills.length} skills on this map</div>
                  {(resume.gaps || []).length > 0 && <div className="cu-gaps">Critical gaps: {resume.gaps.slice(0, 4).map(skillName).join(', ')}{resume.gaps.length > 4 ? ` +${resume.gaps.length - 4}` : ''}</div>}
                  <button className="btn-tint" onClick={() => resumeInput.current && resumeInput.current.click()}>Replace resume</button>
                </>
              ) : (
                <button className="btn-tint" disabled={!selId} onClick={() => resumeInput.current && resumeInput.current.click()}>
                  {selId ? 'Upload resume…' : 'Select a career first'}
                </button>
              )}
              <input ref={resumeInput} type="file" accept=".pdf,.md,.markdown,.txt" hidden onChange={onResumeFile} />
            </div>

            <div className="card career-up">
              <div className="card-head">Compare with a Job</div>
              <div className="career-uprow">
                <span className="cu-icon cu-blue">▤</span>
                <div className="cu-hint"><b>Upload or paste a job description</b><br />Its skills join the map and you see your match for that job.</div>
              </div>
              {detail && detail.jds && detail.jds.length > 0 && (
                <div className="jd-list">
                  {detail.jds.slice(-3).reverse().map((j) => (
                    <div key={j.id} className="jd-row" title={j.match && j.match.missing.length ? 'Missing: ' + j.match.missing.map(skillName).join(', ') : ''}>
                      <span className="jd-name">📎 {j.name}</span>
                      {j.match && j.match.total > 0 ? (
                        <span className="jd-match"><b>{j.match.pct}%</b> · {j.match.known}/{j.match.total} skills{j.match.missing.length ? ` · missing ${j.match.missing.slice(0, 2).map(skillName).join(', ')}${j.match.missing.length > 2 ? '…' : ''}` : ''}</span>
                      ) : <span className="jd-match dim">added</span>}
                    </div>
                  ))}
                </div>
              )}
              {jdPasting ? (
                <>
                  <textarea className="jd-paste" value={jdText} autoFocus disabled={!selId}
                    placeholder="Paste the job description here…"
                    onChange={(e) => setJdText(e.target.value)} />
                  <div className="jd-paste-row">
                    <button className="btn-primary" disabled={!selId || !jdText.trim()} onClick={submitJdText}>Compare</button>
                    <button className="btn-tint" onClick={() => { setJdPasting(false); setJdText(''); }}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="jd-paste-row">
                  <button className="btn-tint" disabled={!selId} onClick={() => jdInput.current && jdInput.current.click()}>
                    {selId ? 'Upload file…' : 'Select a career first'}
                  </button>
                  <button className="btn-tint" disabled={!selId} onClick={() => setJdPasting(true)}>Paste text…</button>
                </div>
              )}
              <input ref={jdInput} type="file" accept=".pdf,.md,.markdown,.txt" hidden onChange={onJdFile} />
            </div>

            <div className="card career-sum">
              <div className="card-head">Profile Summary</div>
              <div className="career-sumrows">
                <div><span className="c-blue">◆</span><span>Total Skills</span><b>{stats.total}</b></div>
                <div><span className="c-green">◆</span><span>Known Skills</span><b>{stats.known}</b></div>
                <div><span className="cs-amber">◆</span><span>Learning</span><b>{stats.learning}</b></div>
                <div><span className="cs-red">◆</span><span>To Learn</span><b>{stats.tolearn}</b></div>
              </div>
            </div>
          </div>

          <div className="career-two">
            <div className="card cgraph-card" data-tour="career-map">
              <div className="cg-head">
                <div className="card-head">{detail ? `${detail.name} — Tools & Skills Map` : 'Tools & Skills Map'}</div>
                <div className="cg-legend">
                  {['known', 'learning', 'tolearn', 'notreq'].map((k) => (
                    <span key={k}><i style={{ background: STATE_STYLE[k].border }} />{STATE_STYLE[k].label}</span>
                  ))}
                </div>
              </div>
              {skills.length ? (
                <>
                  <CareerGraph skills={skills} states={states} selected={selSkill} onSelect={setSelSkill} />
                  {selSkill && (() => {
                    const st = STATE_STYLE[states[selSkill.id]] || STATE_STYLE.notreq;
                    const byId = new Map(skills.map((s) => [s.id, s]));
                    const prereqs = (selSkill.prereqs || []).map((id) => byId.get(id)).filter(Boolean);
                    const leads = skills.filter((s) => (s.prereqs || []).includes(selSkill.id));
                    const concepts = (selSkill.concepts || []).map((id) => knowledge[id]).filter(Boolean);
                    const marked = !!(detail.known || {})[selSkill.id];
                    return (
                      <div className="cg-detail">
                        <div className="cgd-top">
                          <b>{selSkill.name}</b>
                          <span className="state-chip" style={{ background: st.fill, borderColor: st.border, color: st.text }}>{st.label}</span>
                          <span className={`imp-chip imp-${selSkill.importance || 'important'}`}>{selSkill.importance || 'important'}</span>
                          {selSkill.tier && <span className="dim small">{selSkill.tier}{selSkill.branch ? ` · ${selSkill.branch}` : ''}</span>}
                        </div>
                        <p>{selSkill.blurb}</p>
                        {selSkill.roleNote && <p className="cgd-role"><b>In this role:</b> {selSkill.roleNote}</p>}
                        {concepts.length > 0 && (
                          <div className="cgd-links">From your knowledge graph:{concepts.map((c) => (
                            <span key={c.id} className={`kg-chip ${c.state === 'mastered' ? 'done' : ''}`}>{c.state === 'mastered' ? '✓ ' : ''}{c.name}</span>
                          ))}</div>
                        )}
                        {prereqs.length > 0 && (
                          <div className="cgd-links">Builds on:{prereqs.map((p) => (
                            <button key={p.id} onClick={() => setSelSkill(p)}>{p.name}</button>
                          ))}</div>
                        )}
                        {leads.length > 0 && (
                          <div className="cgd-links">Unlocks:{leads.map((p) => (
                            <button key={p.id} onClick={() => setSelSkill(p)}>{p.name}</button>
                          ))}</div>
                        )}
                        <div className="cgd-actions">
                          {marked
                            ? <button className="btn btn-ghost small-btn" onClick={() => toggleKnown(selSkill, false)}>✓ Marked as known · undo</button>
                            : states[selSkill.id] !== 'known' && <button className="btn btn-ghost small-btn" onClick={() => toggleKnown(selSkill, true)}>I already know this</button>}
                        </div>
                        {states[selSkill.id] === 'tolearn' && (
                          <p className="cgd-suggest">{concepts.some((c) => c.state !== 'mastered')
                            ? 'Suggested: master the concepts above in your projects first, then practise the tool.'
                            : 'Suggested: learn this next. Start with any unlearned tool it builds on.'}</p>
                        )}
                      </div>
                    );
                  })()}
                  <div className="dim small">Arrows point from a tool to the one that builds on it. Tools turn amber once you master the concepts they use. Click one for details.</div>
                </>
              ) : (
                <div className="career-empty">
                  {selId && careerBusy(selId) ? (
                    <p className="dim">Mapping the tools and skills for this career…</p>
                  ) : (
                    <>
                      <p className="dim">No map yet for this career.</p>
                      <button className="btn-primary" disabled={!detail}
                        onClick={() => detail && startCareerJob('career-generate', { careerId: detail.id, name: `Career map — ${detail.name}` })}>
                        Generate map
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="career-side">
              <div className="card">
                <div className="card-head">Skill Match Analysis</div>
                <div className="career-matchrow">
                  <MatchDonut pct={stats.matchPct} />
                  <div className="career-statbars">
                    <StatBar label="Matched Skills" value={stats.known} total={stats.total} color="var(--green)" />
                    <StatBar label="In Progress" value={stats.learning} total={stats.total} color="var(--amber)" />
                    <StatBar label="Missing Skills" value={stats.tolearn} total={stats.total} color="var(--danger)" />
                  </div>
                </div>
                {stats.total > 0 && (
                  <div className="career-tip">
                    ⚡ {stats.matchPct >= 70
                      ? 'Great progress! Focus on the missing critical skills to improve your match.'
                      : 'Upload your resume, mark tools you know, and master concepts: every one counts toward this match.'}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-head">Top Missing Skills for This Role</div>
                <div className="career-chips">
                  {missing.slice(0, 8).map((s) => (
                    <span key={s.id} className={`miss-chip ${s.importance === 'critical' ? 'crit' : ''}`}>
                      {s.importance === 'critical' ? '● ' : ''}{s.name}
                    </span>
                  ))}
                  {!missing.length && <span className="dim small">Nothing missing: you cover this role.</span>}
                </div>
              </div>

              <div className="card">
                <div className="card-head">Recommended Next Steps</div>
                {nextSteps.map((n, i) => (
                  <div key={i} className="career-step">
                    <span className="cs-glyph">{n.glyph}</span>
                    <span className="cs-body">
                      <span className="cs-title">{n.title}</span>
                      <span className="cs-sub">{n.sub}</span>
                    </span>
                    <span className={`imp-chip imp-${n.tag === 'critical' ? 'critical' : 'important'}`}>{n.tag}</span>
                  </div>
                ))}
                {!nextSteps.length && <span className="dim small">Add a career or a job description to get recommendations.</span>}
              </div>
            </div>
          </div>
        </>
      )}

      {modal}
    </div>
  );
}
