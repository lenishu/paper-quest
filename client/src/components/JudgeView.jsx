import React, { useEffect, useMemo, useState } from 'react';
import KnowledgeGraph from './KnowledgeGraph';
import SkillTreeCanvas from './SkillTreeCanvas';
import { CareerGraph, STATE_STYLE } from './CareerView';
import { Heatmap } from './Dashboard';
import { MarkdownDoc } from './StudyDocs';
import MathText from './MathText';
import Logo from './Logo';
import { PROJECT_KINDS, kindOf } from '../projectKinds';
import { tierOf, TIER_LABELS } from '../graphLayout';

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const files = (p) => count(p.paperCount, p.kind === 'paper' ? 'paper' : 'file');

// Read-only showcase for judges: a guided explanation of each feature next to a
// live snapshot of the developer's workspace (server/sharing.js decides what is
// shared). Nothing here writes to the server; quizzes are checked in the browser.
async function judgeApi(path, body) {
  const r = await fetch('/api/judge/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await r.json(); if (!r.ok) throw Error(data.error || 'Could not open judge access.'); return data;
}

const TABS = [['overview', 'Overview'], ['dashboard', 'Dashboard'], ['projects', 'Projects'], ['graph', 'Knowledge graph'], ['careers', 'Career paths']];

const FLOW = [
  ['Add anything you are learning', 'A research paper, a class, a course, a club, a hackathon or your own notes. Drop in PDFs, Markdown or text.'],
  ['AI maps the prerequisites', 'Every concept you need, from high-school basics up to the core idea, as a connected map with tiers and branches.'],
  ['Learn from the ground up', 'Each concept has a refresher and a quiz. Cheatsheets, paper summaries and progress tracking keep you moving.'],
  ['Turn knowledge into a career', 'The knowledge graph suggests roles and builds career maps of real tools, compared with job descriptions and your resume.']
];

const FEATURES = {
  dashboard: {
    title: 'Dashboard tracking',
    lead: 'One screen shows how much you know and what to do next, across every project.',
    points: ['XP and levels for every concept you master (core concepts are worth more)', 'Daily streaks, a 70-day activity heatmap and daily quests with XP rewards', 'Knowledge overview: mastered, learning, ready and locked concepts', 'Progress by branch (linear algebra, probability, machine learning…) and badges', 'A recommended next concept: ready to learn, and it unlocks the most']
  },
  projects: {
    title: 'Projects: papers, classes, courses, clubs, hackathons, notes',
    lead: 'Each project grows its own prerequisite map from the material you add. Click a project to explore it like a student would.',
    points: ['Map: concepts layered from high-school baseline to the core (★), with the prerequisites between them', 'Refresher and quiz for any concept, written once by AI and saved; pass the quiz to master it', 'Cheatsheet: the whole map on one page (formulas, definitions, build-up path, pitfalls)', 'Summaries: TL;DR, key ideas, method and results for every paper or file', 'Read the original paper beside your notes, and explore its citation network']
  },
  graph: {
    title: 'Knowledge graph',
    lead: 'Every concept from every project and career, merged by canonical id into one 3D map. Shared concepts link projects together.',
    points: ['Search, rotate and fly from star to star', 'Colours show mastery; filter by branch', 'Career tools link back to the concepts they use']
  },
  careers: {
    title: 'Career paths from the knowledge graph',
    lead: 'AI reads what you have studied and suggests roles, or you type an interest. Each career map lists the tools and skills job postings actually ask for, not courses.',
    points: ['Tools light up as you master the concepts they rely on (PyTorch builds on backpropagation…)', 'Upload a resume: skills it evidences count as known, critical gaps are listed', 'Add a job description: its skills join the map and you get a match score for that job', 'Mark tools you already know; next steps focus on critical missing skills']
  }
};

function Features({ id }) {
  const f = FEATURES[id];
  return (
    <div className="judge-feature">
      <h2>{f.title}</h2>
      <p className="judge-lead">{f.lead}</p>
      <ul>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

// A saved quiz, checked locally (judge access is read-only).
function Quiz({ quiz }) {
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  if (!quiz || !quiz.length) return null;
  const correct = quiz.filter((q, i) => answers[i] === q.answer).length;
  return (
    <div className="quiz">
      <h3 className="quiz-title">🎯 Quiz · {quiz.length} questions</h3>
      {quiz.map((q, i) => (
        <div key={i} className="judge-q">
          <div className="judge-q-text">{i + 1}. <MathText>{q.q}</MathText></div>
          {q.options.map((o, j) => {
            const state = checked ? (j === q.answer ? 'right' : answers[i] === j ? 'wrong' : '') : answers[i] === j ? 'picked' : '';
            return (
              <button key={j} className={`judge-opt ${state}`} disabled={checked} onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}>
                <span className="opt-letter">{'ABCD'[j]}</span> <MathText>{o}</MathText>
              </button>
            );
          })}
          {checked && q.why && <div className="judge-why dim small"><MathText>{q.why}</MathText></div>}
        </div>
      ))}
      <div className="judge-quiz-foot">
        {checked
          ? <><b>{correct} / {quiz.length} correct</b><button className="btn btn-ghost small-btn" onClick={() => { setAnswers({}); setChecked(false); }}>Try again</button></>
          : <button className="btn-primary" disabled={Object.keys(answers).length < quiz.length} onClick={() => setChecked(true)}>Check answers</button>}
      </div>
    </div>
  );
}

function ProjectExplorer({ project }) {
  const [tab, setTab] = useState('map');
  const [sel, setSel] = useState(null);
  const [lesson, setLesson] = useState(false);
  const node = sel ? project.nodes.find((n) => n.id === sel) : null;
  const saved = node && project.lessons[node.id];
  const learnable = project.nodes.filter((n) => n.level !== 0);
  const mastered = learnable.filter((n) => project.states[n.id] === 'done').length;
  const withLessons = Object.keys(project.lessons || {}).length;
  const summaries = project.papers.filter((p) => p.summary).length;
  return (
    <div className="card judge-explorer">
      <div className="judge-explorer-head">
        <div>
          <span className="eyebrow">{kindOf(project.kind).icon} {kindOf(project.kind).label}{project.field ? ` · ${project.field}` : ''}</span>
          <h2>{project.name}</h2>
          <p className="dim small">{count(learnable.length, 'concept')} · {mastered} mastered · {count(withLessons, 'saved refresher')} · {files(project)}</p>
        </div>
        <div className="seg">
          {[['map', 'Map'], ['cheatsheet', 'Cheatsheet'], ['papers', `Summaries (${summaries})`]].map(([id, label]) => (
            <button key={id} className={`seg-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'map' && (
        <div className="judge-map-row">
          <div className="judge-map"><SkillTreeCanvas nodes={project.nodes} states={project.states} selectedId={sel} onSelect={(id) => { setSel(id); setLesson(false); }} /></div>
          <aside className="judge-node">
            {node ? (
              <>
                <span className="eyebrow">{node.level === 0 ? 'Baseline' : (node.core ? '★ ' : '') + TIER_LABELS[tierOf(node)]} · {node.branch}</span>
                <h3>{node.name}</h3>
                <p>{node.blurb}</p>
                <p className="dim small">{project.states[node.id] === 'done' ? '✓ Mastered' : project.states[node.id] === 'open' ? 'Ready to learn' : project.states[node.id] === 'known' ? 'Baseline (assumed known)' : 'Locked until its prerequisites are mastered'}</p>
                {saved ? (
                  lesson ? <><MarkdownDoc>{saved.lesson}</MarkdownDoc><Quiz quiz={saved.quiz} /></>
                    : <button className="btn-primary" onClick={() => setLesson(true)}>📖 Open refresher & quiz</button>
                ) : node.level !== 0 && <p className="dim small">No saved refresher for this concept yet. In the app, one click writes it.</p>}
              </>
            ) : (
              <p className="dim">Click a concept on the map. Concepts with a saved refresher open with their quiz{withLessons ? ` (${withLessons} in this project)` : ''}.</p>
            )}
          </aside>
        </div>
      )}
      {tab === 'cheatsheet' && (project.cheatsheet
        ? <MarkdownDoc className="doc-md">{project.cheatsheet}</MarkdownDoc>
        : <p className="dim">No cheatsheet saved for this project yet. In the app, one click writes it from the map.</p>)}
      {tab === 'papers' && (
        <div className="judge-papers">
          {project.papers.map((p) => (
            <details key={p.id} className="judge-paper" open={project.papers.length === 1}>
              <summary><b>{p.title}</b>{p.pdfUrl && <a href={p.pdfUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}> · original PDF ↗</a>}{!p.summary && <span className="dim small"> · no summary yet</span>}</summary>
              {p.summary && <MarkdownDoc>{p.summary}</MarkdownDoc>}
            </details>
          ))}
          {!project.papers.length && <p className="dim">No files in this project.</p>}
        </div>
      )}
    </div>
  );
}

function CareerExplorer({ career }) {
  const [sel, setSel] = useState(null);
  const byId = useMemo(() => new Map(career.nodes.map((n) => [n.id, n])), [career]);
  const name = (id) => (byId.get(id) || {}).name || id;
  const stats = career.stats;
  const st = sel ? STATE_STYLE[career.states[sel.id]] : null;
  const concepts = sel ? (sel.concepts || []).map((id) => career.knowledge[id]).filter(Boolean) : [];
  return (
    <div className="card judge-explorer">
      <div className="judge-explorer-head">
        <div>
          <span className="eyebrow">Career path{career.field ? ` · ${career.field}` : ''}</span>
          <h2>{career.name}</h2>
          {stats && <p className="dim small">{stats.matchPct}% match · {stats.known} known · {stats.learning} in progress · {stats.tolearn} to learn</p>}
        </div>
      </div>
      <div className="judge-career-row">
        <div className="judge-career-graph"><CareerGraph skills={career.nodes} states={career.states} selected={sel} onSelect={setSel} /></div>
        <aside className="judge-node">
          {sel ? (
            <>
              <span className="eyebrow">{sel.importance} · {sel.branch}</span>
              <h3>{sel.name} {st && <span className="state-chip" style={{ background: st.fill, borderColor: st.border, color: st.text }}>{st.label}</span>}</h3>
              <p>{sel.blurb}</p>
              {sel.roleNote && <p className="cgd-role"><b>In this role:</b> {sel.roleNote}</p>}
              {concepts.length > 0 && <div className="cgd-links">From the knowledge graph:{concepts.map((c) => <span key={c.id} className={`kg-chip ${c.state === 'mastered' ? 'done' : ''}`}>{c.state === 'mastered' ? '✓ ' : ''}{c.name}</span>)}</div>}
            </>
          ) : <p className="dim">Click a tool or skill. Colours compare it with what the developer knows: from mastered concepts, the resume and tools marked as known.</p>}
          <div className="judge-compare">
            <span className="eyebrow">Compared with</span>
            {career.resume
              ? <p><b>Resume</b> · covers {career.resume.matched} skills on this map{career.resume.gaps.length ? ` · critical gaps: ${career.resume.gaps.slice(0, 4).map(name).join(', ')}` : ''}</p>
              : <p className="dim small">No resume on this career.</p>}
            {career.jds.length ? career.jds.map((j, i) => (
              <p key={i}><b>{j.name}</b>{j.match && j.match.total ? ` · ${j.match.pct}% match (${j.match.known}/${j.match.total} skills)${j.match.missing.length ? ` · missing ${j.match.missing.slice(0, 3).map(name).join(', ')}` : ''}` : ''}</p>
            )) : <p className="dim small">No job descriptions added.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function JudgeView() {
  const [data, setData] = useState(null), [key, setKey] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('overview');
  const [projectId, setProjectId] = useState(null);
  const [careerId, setCareerId] = useState(null);
  const [graphFilter, setGraphFilter] = useState('all');
  useEffect(() => { judgeApi('graphs').then(setData).catch(() => {}); }, []);

  const projects = (data && data.projects) || [];
  const careers = (data && data.careers) || [];
  const dash = data && data.dashboard;
  const groups = useMemo(() => [...projects.map((p) => ({ ...p, kindOf: 'project' })), ...careers.map((c) => ({ ...c, kindOf: 'career' }))], [projects, careers]);
  const graph = useMemo(() => {
    const nodes = new Map(), edges = new Map();
    for (const group of groups.filter((g) => graphFilter === 'all' || g.kindOf + ':' + g.id === graphFilter)) {
      for (const n of group.nodes) {
        const s = group.states[n.id];
        const state = s === 'done' || s === 'known' ? 'mastered' : s === 'open' || s === 'learning' ? 'ready' : 'locked';
        if (!nodes.has(n.id)) nodes.set(n.id, { ...n, state, projects: [], careers: [] });
        const node = nodes.get(n.id); node[group.kindOf === 'career' ? 'careers' : 'projects'].push({ id: group.id, name: group.name });
        for (const id of n.prereqs || []) edges.set(id + ':' + n.id, { from: id, to: n.id });
      }
    }
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }, [groups, graphFilter]);
  const project = projects.find((p) => p.id === projectId) || null;
  const career = careers.find((c) => c.id === careerId) || careers[0] || null;
  const totals = useMemo(() => {
    const concepts = new Set(), lessons = projects.reduce((a, p) => a + Object.keys(p.lessons || {}).length, 0);
    for (const p of projects) for (const n of p.nodes) if (n.level !== 0) concepts.add(n.id);
    return { concepts: concepts.size, lessons, summaries: projects.reduce((a, p) => a + p.papers.filter((x) => x.summary).length, 0) };
  }, [projects]);

  async function enter(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { setData(await judgeApi('enter', { key: key.trim() })); setKey(''); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function exit() { await judgeApi('exit', {}); setData(null); setTab('overview'); }
  const go = (t) => { setTab(t); window.scrollTo({ top: 0 }); };

  return <div className="judge-page">
    <header className="judge-header">
      <Logo size={30} /><span className="judge-badge">Judge view · read-only</span>
      {data && <nav className="judge-tabs">{TABS.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(id)}>{label}</button>)}</nav>}
      <a href="/">My workspace</a>{data && <button className="btn-ghost" onClick={exit}>Exit judge view</button>}
    </header>
    {!data ? <form className="judge-entry card" onSubmit={enter}>
      <span className="trail-eyebrow">PAPERQUEST SHOWCASE</span>
      <h1>Explore the ideas behind the papers.</h1>
      <p>Enter the access key shared by the developer to walk through PaperQuest with real data: dashboard tracking, project maps with refreshers, quizzes, cheatsheets and summaries, the knowledge graph, and career paths. No Google account needed.</p>
      <label className="field-label">Judge access key<input autoComplete="off" type="password" placeholder="PQJ-…" value={key} onChange={(e) => setKey(e.target.value)} /></label>
      <button className="btn-primary" disabled={busy || !key.trim()}>{busy ? 'Opening…' : 'Open the showcase'}</button>
      {error && <p role="alert">{error}</p>}
    </form> : <main className="judge-content">
      {tab === 'overview' && <>
        <section className="judge-hero">
          <span className="trail-eyebrow">PaperQuest</span>
          <h1>Learn anything from the ground up, then turn it into a career.</h1>
          <p className="judge-lead">PaperQuest turns a research paper, a class, a course, a club, a hackathon or your notes into a map of every concept you need, from high-school basics to the core idea, and teaches it bottom-up with refreshers, quizzes, cheatsheets and summaries. Everything you learn joins one knowledge graph, which becomes career paths built from the tools real jobs ask for.</p>
          <div className="judge-stats">
            <div><b>{projects.length}</b><span>projects</span></div>
            <div><b>{totals.concepts}</b><span>concepts mapped</span></div>
            <div><b>{dash ? dash.knowledge.mastered || 0 : '–'}</b><span>mastered</span></div>
            <div><b>{totals.lessons}</b><span>saved refreshers</span></div>
            <div><b>{careers.length}</b><span>career paths</span></div>
          </div>
          <p className="dim small">Snapshot from {new Date(data.createdAt).toLocaleDateString()} · shared read-only: maps, progress, refreshers, quizzes, cheatsheets, summaries and career comparisons. Uploaded files, notes, chats, resumes and keys stay private.</p>
        </section>
        <section className="judge-flow">
          {FLOW.map(([title, text], i) => <div key={title} className="card"><span className="judge-step">{i + 1}</span><h3>{title}</h3><p className="dim small">{text}</p></div>)}
        </section>
        <section className="judge-tour-cards">
          {[['dashboard', '⌂'], ['projects', '❐'], ['graph', '◎'], ['careers', '✧']].map(([id, icon]) => (
            <button key={id} className="card judge-project" onClick={() => go(id)}>
              <span className="trail-eyebrow">{icon} See it live</span>
              <h3>{FEATURES[id].title}</h3>
              <p className="dim small">{FEATURES[id].lead}</p>
              <span className="judge-go">Open →</span>
            </button>
          ))}
        </section>
      </>}

      {tab === 'dashboard' && <>
        <Features id="dashboard" />
        {dash ? <div className="judge-dash">
          <div className="card judge-level">
            <span className="eyebrow">Level</span>
            <b className="judge-big">{dash.profile.level} · {dash.profile.title}</b>
            <div className="side-xp-bar"><div style={{ width: `${Math.round((dash.profile.progress || 0) * 100)}%` }} /></div>
            <span className="dim small">{dash.profile.xp.toLocaleString()} / {dash.profile.nextLevelXp.toLocaleString()} XP</span>
            <div className="judge-mini-stats">
              <div><b>{dash.stats.concepts || 0}</b><span>concepts</span></div>
              <div><b>{dash.stats.lessons || 0}</b><span>lessons</span></div>
              <div><b>{dash.stats.projects || 0}</b><span>projects</span></div>
              <div><b>🔥 {dash.streak}</b><span>day streak</span></div>
            </div>
          </div>
          <div className="card"><div className="card-head"><span className="eyebrow">Daily activity</span><span className="card-note">last 70 days</span></div><Heatmap heat={dash.heat} /></div>
          <div className="card">
            <div className="card-head"><span className="eyebrow">Knowledge overview</span></div>
            <div className="judge-knowledge">
              {[['Mastered', 'mastered', 'var(--green)'], ['Learning', 'learning', 'var(--primary)'], ['Ready', 'ready', 'var(--amber)'], ['Locked', 'locked', 'var(--line-2)']].map(([label, k, c]) => (
                <div key={k}><i style={{ background: c }} /><span>{label}</span><b>{dash.knowledge[k] || 0}</b></div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="eyebrow">Skills by branch</span></div>
            <div className="cbars">{dash.branches.map((b) => (
              <div key={b.name} className="cbar"><span className="cbar-mid"><span className="cbar-name">{b.name}</span><span className="cbar-bar"><i style={{ width: `${b.pct}%` }} /></span></span><span className="cbar-pct">{b.pct}%</span></div>
            ))}</div>
          </div>
          <div className="card">
            <div className="card-head"><span className="eyebrow">Badges</span></div>
            <div className="judge-badges">{dash.badges.map((b) => <span key={b.id} className={`judge-badge-item ${b.earned ? 'earned' : ''}`} title={b.desc}>{b.icon} {b.name}</span>)}</div>
            {dash.quests && <><div className="card-head"><span className="eyebrow">Today's quest</span></div>
              {dash.quests.items.map((q) => <div key={q.label} className={`quest ${q.done ? 'done' : ''}`}><span className="quest-check">✓</span><span className="quest-label">{q.label}</span><span className="quest-count">{q.cur} / {q.goal}</span></div>)}</>}
          </div>
        </div> : <p className="dim">This snapshot was created before dashboard numbers were shared. Ask the developer to refresh the judge snapshot.</p>}
      </>}

      {tab === 'projects' && <>
        <Features id="projects" />
        <div className="judge-kinds">{PROJECT_KINDS.map((k) => <div key={k.id} className="judge-kind"><span>{k.icon}</span><b>{k.label}</b><span className="dim small">{k.hint}</span></div>)}</div>
        <div className="judge-project-grid">
          {projects.map((p) => {
            const learnable = p.nodes.filter((n) => n.level !== 0);
            const done = learnable.filter((n) => p.states[n.id] === 'done').length;
            return (
              <button className={`card judge-project ${projectId === p.id ? 'active' : ''}`} key={p.id} onClick={() => setProjectId(p.id)}>
                <span className="trail-eyebrow">{kindOf(p.kind).icon} {kindOf(p.kind).label} · {files(p)}</span>
                <h3>{p.name}</h3>
                <p className="dim small">{count(learnable.length, 'concept')} · {done} mastered · {count(Object.keys(p.lessons || {}).length, 'refresher')}{p.cheatsheet ? ' · cheatsheet' : ''}</p>
                <span className="judge-go">{projectId === p.id ? 'Open below ↓' : 'Explore →'}</span>
              </button>
            );
          })}
        </div>
        {project ? <ProjectExplorer key={project.id} project={project} /> : <p className="dim judge-hint">Choose a project above to open its map, refreshers and quizzes, cheatsheet and summaries.</p>}
      </>}

      {tab === 'graph' && <>
        <Features id="graph" />
        <div className="view-head"><div><p className="dim">{count(graph.nodes.length, 'node')} · {count(totals.summaries, 'paper summary').replace(/summarys$/, 'summaries')} across {count(projects.length, 'project')}</p></div>
          <label className="field-label">Show<select value={graphFilter} onChange={(e) => setGraphFilter(e.target.value)}><option value="all">All knowledge</option>{groups.map((g) => <option key={g.kindOf + g.id} value={g.kindOf + ':' + g.id}>{g.name}</option>)}</select></label></div>
        <KnowledgeGraph key={graphFilter} nodes={graph.nodes} edges={graph.edges} height={600} />
      </>}

      {tab === 'careers' && <>
        <Features id="careers" />
        {careers.length ? <>
          <div className="judge-project-grid">
            {careers.map((c) => (
              <button key={c.id} className={`card judge-project ${career && career.id === c.id ? 'active' : ''}`} onClick={() => setCareerId(c.id)}>
                <span className="trail-eyebrow">Career path · {c.nodes.length} tools & skills</span>
                <h3>{c.name}</h3>
                <p className="dim small">{c.stats ? `${c.stats.matchPct}% match` : ''}{c.jds.length ? ` · ${c.jds.length} job${c.jds.length === 1 ? '' : 's'} compared` : ''}{c.resume ? ' · resume compared' : ''}</p>
              </button>
            ))}
          </div>
          {career && <CareerExplorer key={career.id} career={career} />}
        </> : <p className="dim">No career paths in this snapshot yet.</p>}
      </>}
    </main>}
  </div>;
}
