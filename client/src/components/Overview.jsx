import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { branchColor } from '../graphLayout';
import { useJobs } from '../jobs';
import MathText from './MathText';

function Gauge({ value, done, total }) {
  const pct = total ? done / total : 0;
  const cx = 130, cy = 130, r = 104;
  const a0 = Math.PI, a1 = Math.PI * (1 - pct); // left→right along the top semicircle
  const p = (ang) => [cx + r * Math.cos(ang), cy - r * Math.sin(ang)];
  const [sx, sy] = p(Math.PI);
  const [ex, ey] = p(0);
  const [vx, vy] = p(a1);
  const large = 0; // semicircle arc is always <=180°, never the major arc
  return (
    <svg className="gauge" viewBox="0 0 260 150">
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} className="gauge-track" />
      {pct > 0 && <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${vx} ${vy}`} className="gauge-val" />}
      <circle cx={vx} cy={vy} r="8" className="gauge-knob" />
      <text x="130" y="112" textAnchor="middle" className="gauge-total">{total}</text>
      <text x="130" y="132" textAnchor="middle" className="gauge-label">concepts</text>
    </svg>
  );
}

// One box per concept in the branch; exactly `filled` of `total` lit (e.g. 2/11 → 2 boxes on).
// Very large branches are capped so boxes stay legible, scaling the lit count to match.
function TickBar({ filled, total }) {
  const CAP = 40;
  const boxes = Math.max(1, Math.min(total || 1, CAP));
  const on = total > CAP ? Math.round((filled / total) * boxes) : filled;
  return (
    <div className="tickbar">
      {Array.from({ length: boxes }).map((_, i) => (
        <span key={i} className={`tick ${i < on ? 'on' : ''}`} />
      ))}
    </div>
  );
}

function ActivityChart({ events }) {
  const days = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      out.push({ start: d.getTime(), end: d.getTime() + 86400000, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], reviewed: 0, opened: 0 });
    }
    for (const e of events || []) {
      const day = out.find((d) => e.t >= d.start && e.t < d.end);
      if (!day) continue;
      if (e.type === 'concept_mastered' || e.type === 'concept_skipped') day.reviewed++;
      else if (e.type === 'concept_viewed' || e.type === 'lesson_generated' || e.type === 'paper_analyzed') day.opened++;
    }
    return out;
  }, [events]);

  const W = 720, H = 150, pad = 10;
  const max = Math.max(3, ...days.map((d) => Math.max(d.reviewed, d.opened)));
  const x = (i) => pad + (i * (W - 2 * pad)) / 6;
  const y = (v) => H - 24 - (v / max) * (H - 44);
  const line = (key) => days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');

  return (
    <svg className="activity" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={`${line('opened')}`} className="act-line act-opened" />
      <path d={`${line('reviewed')}`} className="act-line act-reviewed" />
      {days.map((d, i) => (
        <text key={i} x={x(i)} y={H - 4} textAnchor="middle" className="act-label">{d.label}</text>
      ))}
    </svg>
  );
}

export default function Overview({ id, project, states, mastery, notes = {}, lessons = {}, onOpenConcept, onOpenLesson, onOpenSettings, onGotoMap }) {
  const [events, setEvents] = useState([]);
  const { startLesson, lessonState } = useJobs();

  useEffect(() => {
    api(`/projects/${id}/history`).then((h) => setEvents(h.events || [])).catch(() => {});
  }, [id]);

  const learnable = project.nodes.filter((n) => n.level !== 0);
  const done = learnable.filter((n) => mastery[n.id]).length;
  const total = learnable.length;
  const left = total - done;

  const branches = useMemo(() => {
    const m = new Map();
    for (const n of learnable) {
      const b = n.branch || 'other';
      if (!m.has(b)) m.set(b, { name: b, total: 0, done: 0 });
      const e = m.get(b);
      e.total++;
      if (mastery[n.id]) e.done++;
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [learnable, mastery]);

  const nextConcept = useMemo(() => {
    const open = learnable.filter((n) => states[n.id] === 'open').sort((a, b) => (a.depth || 0) - (b.depth || 0));
    if (open.length) return open[0];
    const any = learnable.filter((n) => !mastery[n.id]).sort((a, b) => (a.depth || 0) - (b.depth || 0));
    return any[0] || null;
  }, [learnable, states, mastery]);

  // Recently covered — concepts you opened, reviewed, or generated a lesson for, newest first.
  const byName = useMemo(() => {
    const m = new Map();
    for (const n of project.nodes) m.set((n.name || '').toLowerCase(), n);
    return m;
  }, [project.nodes]);
  const recent = useMemo(() => {
    const COVERED = new Set(['concept_mastered', 'concept_skipped', 'concept_viewed', 'lesson_generated']);
    const seen = new Set();
    const out = [];
    for (const e of [...(events || [])].sort((a, b) => (b.t || 0) - (a.t || 0))) {
      if (!COVERED.has(e.type) || !e.concept) continue;
      const key = e.concept.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const node = byName.get(key);
      if (!node || node.level === 0) continue;
      out.push({ node, at: e.t, reviewed: !!mastery[node.id] });
      if (out.length >= 6) break;
    }
    return out;
  }, [events, byName, mastery]);

  // Notes you've written on concepts (task: surface map notes on the overview), newest first.
  const noteList = useMemo(() => {
    return Object.entries(notes || {})
      .map(([nodeId, v]) => ({ node: project.nodes.find((n) => n.id === nodeId), text: (v && v.text) || '', at: (v && v.updatedAt) || 0 }))
      .filter((x) => x.node && x.text.trim())
      .sort((a, b) => b.at - a.at);
  }, [notes, project.nodes]);

  if (total === 0) {
    return (
      <div className="ov-empty">
        <div className="empty-emoji">🌱</div>
        <h2>No concept map yet</h2>
        <p className="dim">Add a paper (Papers tab) — it's parsed and mapped in the background.</p>
        <button className="btn btn-primary" onClick={onGotoMap}>Go to Papers →</button>
      </div>
    );
  }

  const ls = nextConcept ? lessonState(id, nextConcept.id) : null;

  return (
    <div className="overview">
      <section className="ov-hero">
        <div className="ov-hero-top">
          <div className="ov-hero-metric">
            <div className="ov-hero-label">Concepts still to review</div>
            <div className="ov-hero-num">{left.toLocaleString()}</div>
            <div className="ov-hero-sub dim">of {total} · {done} reviewed</div>
          </div>
          <div className="ov-legend">
            <span><i className="dot dot-black" /> opened</span>
            <span><i className="dot dot-purple" /> reviewed</span>
          </div>
        </div>
        <ActivityChart events={events} />
      </section>

      <section className="ov-cards">
        <div className="ov-card ov-card-dark">
          <div className="ov-card-head"><span>PROJECT OVERVIEW</span></div>
          <Gauge value={done} done={done} total={total} />
          <div className="ov-card-foot">
            <div><b>{done}</b><span className="dim"> Reviewed</span></div>
            <div><b>{total ? Math.round((done / total) * 100) : 0}%</b><span className="dim"> Done</span></div>
            <div><b>{left}</b><span className="dim"> Left</span></div>
          </div>
        </div>

        <div className="ov-card">
          <div className="ov-card-head"><span>BY BRANCH</span></div>
          <div className="ov-branches">
            {branches.slice(0, 5).map((b) => (
              <div key={b.name} className="ov-branch">
                <div className="ov-branch-top">
                  <span className="ov-branch-name"><i className="branch-dot" style={{ background: branchColor(b.name) }} />{b.name}</span>
                  <span className="dim small">{b.done}/{b.total}</span>
                </div>
                <TickBar filled={b.done} total={b.total} />
              </div>
            ))}
          </div>
        </div>

        <div className="ov-card">
          <div className="ov-card-head"><span>CONTINUE</span></div>
          {nextConcept ? (
            <>
              <div className="ov-next-name">{nextConcept.core ? '★ ' : ''}{nextConcept.name}</div>
              <div className="dim small ov-next-branch">{nextConcept.branch}</div>
              <MathText className="ov-next-blurb dim small">{nextConcept.blurb}</MathText>
              <div className="ov-next-actions">
                {ls && ls.status === 'preparing' ? (
                  <div className="np-preparing"><span className="mini-spinner" /> Preparing…</div>
                ) : ls && ls.status === 'error' ? (
                  <div className="np-stepup-actions">
                    <button className="btn btn-primary" onClick={() => startLesson(id, nextConcept)}>↻ Retry</button>
                    <button className="btn btn-ghost" onClick={onOpenSettings}>Settings</button>
                  </div>
                ) : lessons[nextConcept.id] ? (
                  <>
                    <button className="btn btn-primary" onClick={() => onOpenLesson(nextConcept)}>📖 Open saved refresher</button>
                    <button className="btn btn-ghost" onClick={() => onOpenConcept(nextConcept.id)}>View</button>
                    <div className="dim small np-saved">Already written and saved — reopening costs nothing.</div>
                  </>
                ) : ls && ls.status === 'ready' ? (
                  <>
                    <button className="btn btn-primary" onClick={() => onOpenLesson(nextConcept)}>▶ Open refresher</button>
                    <button className="btn btn-ghost" onClick={() => onOpenConcept(nextConcept.id)}>View</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-primary" onClick={() => startLesson(id, nextConcept)}>▶ Start refresher</button>
                    <button className="btn btn-ghost" onClick={() => onOpenConcept(nextConcept.id)}>View in map</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="ov-alldone"><div className="empty-emoji">🎉</div><p>All concepts reviewed. Nice work.</p></div>
          )}
        </div>

        <div className="ov-card">
          <div className="ov-card-head"><span>RECENTLY COVERED</span></div>
          {recent.length ? (
            <div className="ov-recent">
              {recent.map(({ node, reviewed }) => (
                <button key={node.id} className="ov-recent-item" onClick={() => onOpenConcept(node.id)} title="Open in map">
                  <span className={`ov-recent-dot ${reviewed ? 'done' : ''}`} style={{ background: branchColor(node.branch) }} />
                  <span className="ov-recent-name">{reviewed ? '✓ ' : ''}{node.name}</span>
                  <span className="ov-recent-branch dim small">{node.branch}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="dim small">Concepts you open or review will show up here.</div>
          )}
        </div>

        <div className="ov-card">
          <div className="ov-card-head"><span>YOUR NOTES</span></div>
          {noteList.length ? (
            <div className="ov-notes">
              {noteList.map(({ node, text }) => (
                <button key={node.id} className="ov-note-item" onClick={() => onOpenConcept(node.id)} title="Open in map to edit">
                  <span className="ov-note-name"><i className="branch-dot" style={{ background: branchColor(node.branch) }} />{node.name}</span>
                  <span className="ov-note-text dim small">{text.length > 140 ? text.slice(0, 140) + '…' : text}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="dim small">Open a concept in the map and jot a note — resources, reminders, anything. They collect here.</div>
          )}
        </div>
      </section>
    </div>
  );
}
