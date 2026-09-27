import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, downloadUrl } from '../api';
import { useJobs } from '../jobs';
import { useToast } from './bits';
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
const STATE_STYLE = {
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
function CareerGraph({ skills, states, selected, onSelect }) {
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

export default function CareerView() {
  const toast = useToast();
  const { startCareerJob, careersVersion, jobs } = useJobs();
  const [data, setData] = useState(null); // { careers, resume }
  const [selId, setSelId] = useState(null);
  const [detail, setDetail] = useState(null); // full career payload with states/stats
  const [selSkill, setSelSkill] = useState(null);
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState('');
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

  const addCareer = async (name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    setAdding(false);
    setCustomName('');
    try {
      const c = await api('/careers', { method: 'POST', body: { name: clean } });
      startCareerJob('career-generate', { careerId: c.id, name: `Career map — ${clean}` });
      setSelId(c.id);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };
  const setPrimary = async (id) => {
    try { await api(`/careers/${id}`, { method: 'PATCH', body: { primary: true } }); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const removeCareer = async (id) => {
    if (!window.confirm('Remove this career and its skills graph?')) return;
    try { await api(`/careers/${id}`, { method: 'DELETE' }); if (selId === id) setSelId(null); load(); } catch (e) { toast(e.message, 'err'); }
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
    startCareerJob('career-jd', { careerId: selId, text, name: 'Pasted job description' });
    setJdText('');
    setJdPasting(false);
  };

  const careers = (data && data.careers) || [];
  const resume = (detail && detail.resume) || null;
  const skills = (detail && detail.skills) || [];
  const states = (detail && detail.states) || {};
  const stats = (detail && detail.stats) || { total: 0, known: 0, learning: 0, tolearn: 0, matchPct: 0 };

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
      .map((s) => ({ glyph: '📖', title: `Continue: ${s.name}`, sub: 'Already in your project graphs — finish its lessons', tag: 'in progress' }));
    const learn = missing.slice(0, 2).map((s) => ({ glyph: '◇', title: `Learn: ${s.name}`, sub: s.roleNote || s.blurb, tag: s.importance }));
    return [...cont, ...learn].slice(0, 3);
  }, [missing, skills, states]);

  return (
    <div className="careerv">
      <div className="view-head">
        <div>
          <h1 className="view-title">Career Path</h1>
          <p className="view-sub">Discover. Plan. Learn. Achieve.</p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>＋ Add Career Path</button>
      </div>

      {!careers.length ? (
        <div className="card career-hero">
          <h2>Where are you headed?</h2>
          <p className="dim">
            Pick a career trajectory and PaperQuest maps the skills the field demands, shows which ones you
            already have — from your resume and everything you have mastered here — and what to learn next.
          </p>
          <button className="btn-primary" onClick={() => setAdding(true)}>＋ Add your first career path</button>
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
                    <div className="cc-match">{careerBusy(c.id) ? 'Working…' : c.skillCount ? `${c.stats.matchPct}% Match` : 'No skills map yet'}</div>
                    <div className="cc-bar"><i style={{ width: `${c.stats.matchPct}%`, background: ACCENTS[i % 4] }} /></div>
                  </div>
                ))}
              </div>
              <button className="career-addmore" onClick={() => setAdding(true)}>＋ Add another career</button>
            </div>

            <div className="card career-up">
              <div className="card-head">Resume for This Career</div>
              <div className="career-uprow">
                <span className="cu-icon cu-green">▤</span>
                <div className="cu-hint"><b>PDF → Markdown</b><br />Each career keeps its own tailored resume — skills found in it count as known</div>
              </div>
              {resume ? (
                <>
                  <a className="cu-file cu-open" href={downloadUrl(`/careers/${selId}/resume/file`)} target="_blank" rel="noreferrer" title="Open this resume">
                    <span>📎 {resume.name}</span><span className="c-green">✓ open ↗</span>
                  </a>
                  <div className="cu-status c-green">Processed ✓ — {(resume.skills || []).length} skills detected</div>
                  <button className="btn-tint" onClick={() => resumeInput.current && resumeInput.current.click()}>Replace resume</button>
                </>
              ) : (
                <button className="btn-tint" disabled={!selId} onClick={() => resumeInput.current && resumeInput.current.click()}>
                  {selId ? 'Choose file…' : 'Select a career first'}
                </button>
              )}
              <input ref={resumeInput} type="file" accept=".pdf,.md,.markdown,.txt" hidden onChange={onResumeFile} />
            </div>

            <div className="card career-up">
              <div className="card-head">Add Job Description</div>
              <div className="career-uprow">
                <span className="cu-icon cu-blue">▤</span>
                <div className="cu-hint"><b>Upload or paste</b><br />AI extracts the required skills into the graph</div>
              </div>
              {detail && detail.jds && detail.jds.length > 0 && (
                <div className="cu-file"><span>📎 {detail.jds[detail.jds.length - 1].name}</span><span className="c-green">✓</span></div>
              )}
              {jdPasting ? (
                <>
                  <textarea className="jd-paste" value={jdText} autoFocus disabled={!selId}
                    placeholder="Paste the job description here…"
                    onChange={(e) => setJdText(e.target.value)} />
                  <div className="jd-paste-row">
                    <button className="btn-primary" disabled={!selId || !jdText.trim()} onClick={submitJdText}>Add skills</button>
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
            <div className="card cgraph-card">
              <div className="cg-head">
                <div className="card-head">{detail ? `${detail.name} — Skills Graph` : 'Skills Graph'}</div>
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
                        {states[selSkill.id] === 'tolearn' && (
                          <p className="cgd-suggest">Suggested: learn this next — start with any unlearned prerequisite above, or add a paper that uses it to a project.</p>
                        )}
                      </div>
                    );
                  })()}
                  <div className="dim small">Arrows point from a prerequisite to the skill that builds on it. Click a skill for details.</div>
                </>
              ) : (
                <div className="career-empty">
                  {selId && careerBusy(selId) ? (
                    <p className="dim">Mapping the skills for this career…</p>
                  ) : (
                    <>
                      <p className="dim">No skills map yet for this career.</p>
                      <button className="btn-primary" disabled={!detail}
                        onClick={() => detail && startCareerJob('career-generate', { careerId: detail.id, name: `Career map — ${detail.name}` })}>
                        Generate skills map
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
                      : 'Upload your resume and complete lessons — every mastered concept counts toward this match.'}
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
                  {!missing.length && <span className="dim small">Nothing missing — you cover this role.</span>}
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

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="modal career-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Choose a career trajectory</h2></div>
            <p className="dim small">Pick a preset or type your own — the AI maps the skills this field requires.</p>
            <div className="career-presets">
              {PRESETS.map((p) => (
                <button key={p} className="preset-btn" onClick={() => addCareer(p)}>{p}</button>
              ))}
            </div>
            <div className="career-custom">
              <input placeholder="Or type any career… e.g. Robotics Engineer" value={customName} autoFocus
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCareer(customName)} />
              <button className="btn-primary" disabled={!customName.trim()} onClick={() => addCareer(customName)}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
