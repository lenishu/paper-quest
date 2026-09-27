import React, { useMemo, useState } from 'react';
import KnowledgeGraph from './KnowledgeGraph';
import { api } from '../api';
import { branchColor, ACCENT_HUES } from '../graphLayout';
import { useToast } from './bits';

const HEAT_COLORS = ['#EFEEE9', '#D3EBD9', '#A5D9B1', '#63BE7B', '#1F9D57'];
const PROJ_GLYPHS = ['◈', '◇', '◉', '◆', '❖'];
const PROJ_HUES = ACCENT_HUES;
const BRANCH_GLYPHS = [
  [/linear algebra/, 'Σ'], [/trig/, 'θ'], [/calculus/, '∂'], [/probability|statistic/, 'ℙ'],
  [/optimi[sz]ation/, '∇'], [/machine learning|deep learning/, '⊞'], [/algebra/, 'ƒ'],
  [/physics/, '⚛'], [/geometry/, '△'], [/information/, 'ℹ']
];
const EV = {
  paper_added: ['📄', 'Uploaded a paper'], paper_removed: ['🗑', 'Removed a paper'], paper_analyzed: ['🧠', 'Mapped a paper'],
  lesson_generated: ['📖', 'Opened lesson'], concept_mastered: ['✅', 'Mastered concept'], concept_skipped: ['⏭', 'Marked as known'],
  concept_viewed: ['👁', 'Reviewed concept'], concept_bookmarked: ['♥', 'Bookmarked'], project_created: ['🌱', 'Created project'],
  analysis_undone: ['↩', 'Undid analysis'], memory_edited: ['🧠', 'Edited project memory'], lesson_question: ['💬', 'Asked about a lesson']
};
const branchGlyph = (name) => { const s = (name || '').toLowerCase(); for (const [re, g] of BRANCH_GLYPHS) if (re.test(s)) return g; return (name || '?').trim()[0].toUpperCase(); };
const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 172800) return 'Yesterday'; return Math.floor(s / 86400) + 'd ago'; };

function Donut({ segments, centerTop, centerBottom }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 140 140" className="donut">
      <circle cx="70" cy="70" r={R} fill="none" stroke="#F2F1ED" strokeWidth="14" />
      {segments.filter((s) => s.value > 0).map((s, i) => {
        const len = (s.value / total) * C;
        const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />;
        off += len;
        return el;
      })}
      <text x="70" y="67" textAnchor="middle" className="donut-num">{centerTop}</text>
      <text x="70" y="86" textAnchor="middle" className="donut-lbl">{centerBottom}</text>
    </svg>
  );
}

function Legend({ segments, pct }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className="donut-legend">
      {segments.map((s) => (
        <div key={s.label}><span className="dl-dot" style={{ background: s.color }} /><span className="dl-name">{s.label}</span>
          <b>{s.value.toLocaleString()}{pct && total > 0 ? <span className="dl-pct"> ({Math.round((s.value / total) * 100)}%)</span> : null}</b></div>
      ))}
    </div>
  );
}

function Heatmap({ heat }) {
  const cells = useMemo(() => {
    if (!heat || !heat.length) return [];
    const first = new Date(heat[0].date + 'T00:00:00');
    const pad = (first.getDay() + 6) % 7; // Monday-first
    const max = Math.max(1, ...heat.map((h) => h.count));
    const lvl = (c) => (c === 0 ? 0 : c >= max * 0.75 ? 4 : c >= max * 0.5 ? 3 : c >= max * 0.25 ? 2 : 1);
    return [...Array.from({ length: pad }, () => null), ...heat.map((h) => ({ ...h, lvl: lvl(h.count) }))];
  }, [heat]);
  return (
    <div className="heatwrap">
      <div className="heat-days"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
      <div className="heat">
        {cells.map((c, i) => c === null
          ? <span key={i} className="hc hc-empty" />
          : <span key={i} className="hc" title={`${c.date}: ${c.count} ${c.count === 1 ? 'activity' : 'activities'}`} style={{ background: HEAT_COLORS[c.lvl] }} />)}
      </div>
    </div>
  );
}

export default function Dashboard({ dash, onOpenConcept, onOpenProject, onNewProject, onTryDemo, onViewProjects, onViewPaths, onRefresh, onExplore }) {
  const toast = useToast();
  const [claiming, setClaiming] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const miniNodes = useMemo(() => (dash?.galaxy?.concepts || []).map((c) => ({ ...c, tier: c.tier || '', projects: c.projects || [], careers: [] })), [dash]);
  const miniEdges = useMemo(() => dash?.galaxy?.edges || [], [dash]);
  if (!dash) return null;
  const { galaxy, knowledge, projects, heat, recommended, recent, branches, xpWeek, weeklyGoal, quests } = dash;

  const kSeg = [
    { label: 'Mastered', value: knowledge.mastered, color: '#1F9D57' },
    { label: 'Learning', value: knowledge.learning, color: '#E4572E' },
    { label: 'Ready', value: knowledge.ready, color: '#F59E0B' },
    { label: 'Locked', value: knowledge.locked, color: '#D6D3CD' }
  ];
  const xpSeg = [
    { label: 'Lessons & quizzes', value: xpWeek?.sources?.lessons || 0, color: '#E4572E' },
    { label: 'Marked known', value: xpWeek?.sources?.known || 0, color: '#2E86AB' },
    { label: 'Core concepts', value: xpWeek?.sources?.core || 0, color: '#1F9D57' },
    { label: 'Quest bonus', value: xpWeek?.sources?.quests || 0, color: '#F59E0B' }
  ];
  const goalPct = Math.min(100, Math.round(((xpWeek?.total || 0) / (weeklyGoal || 300)) * 100));
  const overallPct = knowledge.total ? Math.round((knowledge.mastered / knowledge.total) * 100) : 0;

  // what the recommended concept unlocks, by name
  const unlockNames = recommended
    ? (galaxy.edges || []).filter((e) => e.from === recommended.id)
      .map((e) => (galaxy.concepts || []).find((c) => c.id === e.to)).filter(Boolean).map((c) => c.name)
    : [];

  const hoursLeft = Math.max(1, Math.ceil((new Date().setHours(24, 0, 0, 0) - Date.now()) / 3600000));
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  async function claimQuest() {
    setClaiming(true);
    try {
      const r = await api('/quest/claim', { method: 'POST', body: {} });
      toast(`+${r.xpGained} XP — daily quest complete! 🎉`, 'xp');
      onRefresh && onRefresh();
    } catch (e) { toast(e.message, 'err'); }
    setClaiming(false);
  }

  return (
    <div className="dash">
      <div className="dash-graph">
        <div className="dash-graph-head">
          <div>
            <h1 className="hero-title">Your Knowledge Graph</h1>
            <p className="hero-sub">See everything, travel star to star.</p>
          </div>
          <button className="dash-graph-open" onClick={() => onExplore && onExplore()}>Open full graph ⤢</button>
        </div>
        {galaxy && galaxy.concepts && galaxy.concepts.length > 0 ? (
          <KnowledgeGraph compact height={280} edges={miniEdges} nodes={miniNodes}
            onExpand={() => onExplore && onExplore()} />
        ) : (
          <div className="dash-graph-empty">
            <p>Your galaxy is empty — add a paper and its concepts appear here as a connected star map.</p>
            {onTryDemo && <button className="btn-primary" onClick={onTryDemo}>✦ Try the demo project</button>}
          </div>
        )}
      </div>

      <div className="dash-grid">
        {/* Projects */}
        <div className="card">
          <div className="card-head"><span className="eyebrow">Projects</span><button className="card-link" onClick={onViewProjects}>View all →</button></div>
          <div className="proj-list">
            {projects.slice(0, 4).map((pr, i) => (
              <button key={pr.id} className="proj-row" onClick={() => onOpenProject(pr.id)}>
                <span className="proj-glyph" style={{ color: PROJ_HUES[i % PROJ_HUES.length], borderColor: PROJ_HUES[i % PROJ_HUES.length] + '4d', background: PROJ_HUES[i % PROJ_HUES.length] + '1a' }}>{PROJ_GLYPHS[i % PROJ_GLYPHS.length]}</span>
                <span className="proj-mid">
                  <span className="proj-name">{pr.name}</span>
                  <span className="proj-bar"><i style={{ width: `${Math.round(pr.progress * 100)}%` }} /></span>
                </span>
                <span className="proj-nums">
                  <span className="proj-frac">{pr.done} / {pr.total}</span>
                  <span className="proj-pct">{Math.round(pr.progress * 100)}%</span>
                </span>
              </button>
            ))}
            {!projects.length && <div className="dim small">No projects yet — create one and drop in a paper.</div>}
          </div>
          <button className="btn-tint" onClick={onNewProject}>＋ New Project</button>
        </div>

        {/* Daily Activity */}
        <div className="card">
          <div className="card-head"><span className="eyebrow">Daily Activity</span><span className="card-note">{today}</span></div>
          <Heatmap heat={heat} />
          <div className="heat-legend">Less {HEAT_COLORS.map((c) => <span key={c} className="hc" style={{ background: c }} />)} More</div>
        </div>

        {/* XP Summary */}
        <div className="card">
          <div className="card-head"><span className="eyebrow">XP Summary</span><span className="card-note">This week</span></div>
          <div className="donut-row">
            <Donut segments={xpSeg.some((s) => s.value > 0) ? xpSeg : [{ label: '', value: 1, color: '#F2F1ED' }]} centerTop={(xpWeek?.total || 0).toLocaleString()} centerBottom="XP" />
            <Legend segments={xpSeg} />
          </div>
          <div className="goal">
            <div className="goal-top"><span>Weekly Goal</span><span className="mono">{(xpWeek?.total || 0).toLocaleString()} / {(weeklyGoal || 300).toLocaleString()} XP</span></div>
            <div className="goal-bar"><div style={{ width: `${goalPct}%` }} /></div>
          </div>
        </div>

        {/* Skills by branch */}
        <div className="card">
          <div className="card-head"><span className="eyebrow">Skills by Branch</span><button className="card-link" onClick={onViewPaths}>View full map →</button></div>
          <div className="cbars">
            {branches.slice(0, 6).map((b) => (
              <div key={b.name} className="cbar">
                <span className="cbar-glyph" style={{ color: branchColor(b.name), borderColor: branchColor(b.name) + '4d', background: branchColor(b.name) + '1a' }}>{branchGlyph(b.name)}</span>
                <span className="cbar-mid">
                  <span className="cbar-name">{b.name}</span>
                  <span className="cbar-bar"><i style={{ width: `${b.pct}%`, background: branchColor(b.name) }} /></span>
                </span>
                <span className="cbar-pct">{b.pct}%</span>
              </div>
            ))}
            {!branches.length && <div className="dim small">Analyze a paper to see your branches.</div>}
          </div>
          <div className="goal goal-top-border">
            <div className="goal-top"><span>Overall Progress</span><span className="mono c-orange">{overallPct}%</span></div>
            <div className="goal-bar"><div style={{ width: `${overallPct}%` }} /></div>
          </div>
        </div>

        {/* Knowledge Overview */}
        <div className="card">
          <div className="card-head"><span className="eyebrow">Knowledge Overview</span></div>
          <div className="donut-row">
            <Donut segments={knowledge.total ? kSeg : [{ label: '', value: 1, color: '#F2F1ED' }]} centerTop={knowledge.total} centerBottom="TOTAL CONCEPTS" />
            <Legend segments={kSeg} pct />
          </div>
        </div>

        {/* Recommended Next */}
        <div className="card">
          <div className="card-head"><span className="eyebrow">Recommended Next</span>
            {recommended && <button className="card-link" onClick={() => toast('Chosen because it’s ready to learn and unlocks the most concepts on your frontier.', 'info', 6000)}>Why this?</button>}
          </div>
          {recommended ? (
            <>
              <div className="rec-top">
                <div className="rec-tile" style={{ color: branchColor(recommended.branch) }}>{branchGlyph(recommended.branch)}</div>
                <div className="rec-titles">
                  <div className="rec-name-row">
                    <span className="rec-name">{recommended.name}</span>
                    {recommended.unblocks >= 2 && <span className="rec-badge">HIGH RELEVANCE</span>}
                  </div>
                  <div className="rec-meta">◷ Est. ~10 min · {recommended.branch}</div>
                </div>
              </div>
              <p className="rec-blurb">A {recommended.tier} concept from {recommended.projectName} — the next step you can take right now.</p>
              {unlockNames.length > 0 && (
                <div className="rec-unlocks">Unlocks: <b>{unlockNames[0]}</b>{unlockNames.length > 1 ? ` + ${unlockNames.length - 1} more` : ''}</div>
              )}
              <div className="rec-actions">
                <button className="btn-primary" onClick={() => onOpenConcept(recommended.projectId, recommended.id)}>Start Lesson</button>
                <button className="btn-square" title="View in map" onClick={() => onOpenConcept(recommended.projectId, recommended.id)}>➜</button>
              </div>
            </>
          ) : <div className="dim small">Nothing ready yet — add or analyze a paper and your next step appears here.</div>}
        </div>

        {/* Today's Quest */}
        <div className="card" id="quest-card">
          <div className="card-head"><span className="eyebrow">Today's Quest</span><span className="card-note">Resets in {hoursLeft}h</span></div>
          <div className="quests">
            {(quests?.items || []).map((q) => (
              <div key={q.id} className={`quest ${q.done ? 'done' : ''}`}>
                <span className="quest-check">✓</span>
                <span className="quest-label">{q.label}</span>
                <span className="quest-count">{q.cur} / {q.goal}</span>
              </div>
            ))}
          </div>
          {quests?.claimed ? (
            <div className="quest-reward claimed"><span className="qr-icon">◆</span><span className="qr-label">Reward claimed</span><span className="qr-xp">+{quests.reward} XP ✓</span></div>
          ) : quests?.claimable ? (
            <button className="quest-claim" disabled={claiming} onClick={claimQuest}>◆ Claim reward — +{quests.reward} XP</button>
          ) : (
            <div className="quest-reward"><span className="qr-icon">◆</span><span className="qr-label">Reward</span><span className="qr-xp">+{quests?.reward || 45} XP</span></div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="card-head"><span className="eyebrow">Recent Activity</span>
            {recent.length > 5 && <button className="card-link" onClick={() => setActivityOpen(true)}>View all →</button>}
          </div>
          <div className="recent">
            {recent.slice(0, 5).map((e, i) => {
              const [icon, label] = EV[e.type] || ['•', e.type];
              return (
                <button key={i} className="recent-row" onClick={() => {
                  if (e.projectId && e.conceptId) onOpenConcept(e.projectId, e.conceptId);
                  else if (e.projectId) onOpenProject(e.projectId);
                }}>
                  <span className="recent-icon">{icon}</span>
                  <span className="recent-mid">
                    <span className="recent-kind">{label}</span>
                    <span className="recent-name">{e.name || e.project || ''}</span>
                  </span>
                  <span className="recent-time">{ago(e.t)}</span>
                </button>
              );
            })}
            {!recent.length && <div className="dim small">Your activity will appear here.</div>}
          </div>
        </div>
      </div>

      {activityOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setActivityOpen(false)}>
          <div className="modal">
            <div className="modal-head"><h2>Recent activity</h2><button className="iconbtn" onClick={() => setActivityOpen(false)}>✕</button></div>
            <div className="recent recent-long">
              {recent.map((e, i) => {
                const [icon, label] = EV[e.type] || ['•', e.type];
                return (
                  <button key={i} className="recent-row" onClick={() => {
                    setActivityOpen(false);
                    if (e.projectId && e.conceptId) onOpenConcept(e.projectId, e.conceptId);
                    else if (e.projectId) onOpenProject(e.projectId);
                  }}>
                    <span className="recent-icon">{icon}</span>
                    <span className="recent-mid">
                      <span className="recent-kind">{label} <span className="dim">· {e.project}</span></span>
                      <span className="recent-name">{e.name || ''}</span>
                    </span>
                    <span className="recent-time">{ago(e.t)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
