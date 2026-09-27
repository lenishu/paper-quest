const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const store = require('./store');
const { sanitizeGraph, computeDepths, computeStates, xpForNode, levelInfo, repairGraph, isDegenerate, effectiveTier, isAdvanced, slugify } = require('./graphUtil');
const { callLLM, callLLMRaw, parseModelJSON, httpError } = require('./llm');
const { conceptExtractionMessages, conceptMergeMessages, lessonMessages, lessonAskMessages, careerSkillsMessages, careerJdMergeMessages, resumeSkillsMessages } = require('./prompts');
const { pdfToMarkdown } = require('./pdfToMd');
const { resolveReferences, expandPaper, MODES } = require('./references');
const { DEMO_NODES, DEMO_PAPER_MD, DEMO_LESSON_LINEAR_ALGEBRA } = require('./demo');

if (!process.env.NETLIFY) store.init();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (process.env.NETLIFY ? 4 : 80) * 1024 * 1024 }
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function masteredIdSet() {
  return new Set(Object.keys(store.getMastery()));
}

function projectSummary(p, mastered) {
  const learnable = p.nodes.filter((n) => n.level !== 0);
  const done = learnable.filter((n) => mastered.has(n.id));
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    paperCount: p.papers.length,
    conceptCount: learnable.length,
    masteredCount: done.length,
    progress: learnable.length ? done.length / learnable.length : 0
  };
}

// Diff two node arrays by id, for the audit trail.
function graphDiff(prev, next) {
  const a = new Map((prev || []).map((n) => [n.id, n]));
  const b = new Map((next || []).map((n) => [n.id, n]));
  const added = [...b.keys()].filter((id) => !a.has(id)).map((id) => b.get(id).name);
  const removed = [...a.keys()].filter((id) => !b.has(id)).map((id) => a.get(id).name);
  return { added, removed };
}

// Seed / template for the per-project memory file the agent respects.
function memorySeed(p) {
  const concepts = (p.nodes || [])
    .filter((n) => n.level !== 0)
    .map((n) => `- ${n.id} — ${n.name}${n.branch ? ` (${n.branch})` : ''}`)
    .join('\n');
  return `# Project memory — ${p.name}

Field: ${p.field || '(unset)'}

## Notes (edit freely — the AI reads this before every analysis)
- Keep concept ids canonical and reuse them across papers.
- Add any preferences here (e.g. "assume the reader knows basic linear algebra").

## Canonical concepts (auto-maintained)
${concepts || '(none yet)'}
`;
}

// ---------------- settings & profile ----------------

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/settings', (req, res) => {
  res.json({ ...store.getSettings(), providers: store.PROVIDERS });
});

app.put('/api/settings', (req, res) => {
  const s = store.saveSettings(req.body || {});
  res.json({ ...s, providers: store.PROVIDERS });
});

app.post(
  '/api/settings/test',
  wrap(async (req, res) => {
    const settings = store.getSettings();
    // Optionally test a specific connection (before activating it).
    const connectionId = req.body && req.body.connectionId;
    const testSettings = connectionId ? { ...settings, activeId: connectionId } : settings;
    const text = await callLLM(
      testSettings,
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      { json: false, maxTokens: 1000 }
    );
    res.json({ ok: true, message: `Connected — ${store.activeModel(testSettings)} replied: "${String(text).trim().slice(0, 40)}"` });
  })
);

app.get('/api/profile', (req, res) => {
  const profile = store.getProfile();
  const mastery = store.getMastery();
  res.json({ ...levelInfo(profile.xp || 0), masteredCount: Object.keys(mastery).length });
});

// ---------------- projects ----------------

app.get('/api/projects', (req, res) => {
  const mastered = masteredIdSet();
  const projects = store.listProjects();
  const summaries = projects.map((p) => projectSummary(p, mastered));

  for (const s of summaries) {
    const mine = new Set(
      (projects.find((p) => p.id === s.id)?.nodes || []).filter((n) => n.level !== 0).map((n) => n.id)
    );
    s.overlaps = summaries
      .filter((o) => o.id !== s.id)
      .map((o) => {
        const other = projects.find((p) => p.id === o.id);
        const shared = (other?.nodes || []).filter((n) => n.level !== 0 && mine.has(n.id));
        return { id: o.id, name: o.name, count: shared.length, sample: shared.slice(0, 3).map((n) => n.name) };
      })
      .filter((o) => o.count > 0)
      .sort((a, b) => b.count - a.count);
  }
  res.json(summaries);
});

app.post('/api/projects', (req, res) => {
  const p = store.createProject((req.body && req.body.name) || 'Untitled project');
  store.logEvent(p.id, 'project_created', { name: p.name });
  res.json(p);
});

app.post('/api/projects/demo', (req, res) => {
  const p = store.createProject('Demo — Attention Is All You Need');
  const paperId = store.id();
  store.savePaperFiles(p.id, paperId, 'attention-demo.md', Buffer.from(DEMO_PAPER_MD), DEMO_PAPER_MD);
  p.papers.push({
    id: paperId,
    name: 'Attention Is All You Need (demo)',
    pages: 0,
    addedAt: Date.now(),
    analyzed: true
  });
  p.nodes = sanitizeGraph(DEMO_NODES.map((n) => ({ ...n, sources: [paperId] })));
  for (const n of p.nodes) {
    n.usage = n.usedInPaper ? { [paperId]: n.usedInPaper } : {};
    delete n.usedInPaper;
    delete n.forNewPaper;
  }
  p.field = 'machine learning';
  store.saveProject(p);
  store.saveLesson(p.id, 'linear_algebra', DEMO_LESSON_LINEAR_ALGEBRA);
  store.logEvent(p.id, 'paper_added', { paper: 'Attention Is All You Need (demo)' });
  res.json(p);
});

app.get('/api/projects/:id', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const mastery = store.getMastery();
  const states = computeStates(p.nodes, new Set(Object.keys(mastery)));

  const sharedWith = {};
  for (const other of store.listProjects()) {
    if (other.id === p.id) continue;
    for (const n of other.nodes || []) {
      if (n.level === 0) continue;
      (sharedWith[n.id] = sharedWith[n.id] || []).push(other.name);
    }
  }
  const relevantShared = {};
  for (const n of p.nodes) if (sharedWith[n.id]) relevantShared[n.id] = sharedWith[n.id];

  const canUndo = !!store.readNodesSnapshot(p.id);
  const bm = store.getBookmarks();
  const bookmarks = Object.values(bm).filter((x) => x.projectId === p.id).map((x) => x.conceptId);
  const notes = store.readNodeNotes(p.id);
  const lessons = store.listLessons(p.id); // { conceptId: savedAtMs } — cached lessons
  res.json({ project: p, states, mastery, sharedWith: relevantShared, canUndo, bookmarks, notes, lessons });
});

app.patch('/api/projects/:id', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  if (req.body && req.body.name) p.name = String(req.body.name).trim().slice(0, 80);
  store.saveProject(p);
  res.json(p);
});

app.delete('/api/projects/:id', (req, res) => {
  store.deleteProject(req.params.id);
  res.json({ ok: true });
});

// ---------------- project memory ----------------

app.get('/api/projects/:id/memory', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  let mem = store.readMemory(p.id);
  if (!mem) {
    mem = memorySeed(p);
    store.writeMemory(p.id, mem);
  }
  res.json({ memory: mem });
});

app.put('/api/projects/:id/memory', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  store.writeMemory(p.id, String((req.body && req.body.memory) || ''));
  store.logEvent(p.id, 'memory_edited', {});
  res.json({ ok: true });
});

// ---------------- per-node notes (user's own notes on a concept) ----------------

app.put('/api/projects/:id/nodes/:nodeId/notes', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const node = (p.nodes || []).find((n) => n.id === req.params.nodeId);
  if (!node) return res.status(404).json({ error: 'Concept not found' });
  const notes = store.writeNodeNote(p.id, req.params.nodeId, (req.body && req.body.text) || '');
  store.logEvent(p.id, 'note_edited', { conceptId: req.params.nodeId, concept: node.name });
  res.json({ notes });
});

// ---------------- activity history & events ----------------

app.get('/api/projects/:id/history', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  res.json({ events: store.readEvents(p.id, 300), audit: store.readAudit(p.id, 100) });
});

const CLIENT_EVENTS = new Set(['concept_viewed', 'paper_previewed', 'chat_message']);
app.post('/api/projects/:id/events', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const { type, ...rest } = req.body || {};
  if (!CLIENT_EVENTS.has(type)) return res.status(400).json({ error: 'Unknown event type' });
  const data = {};
  for (const k of ['concept', 'conceptId', 'paper', 'text']) if (rest[k] != null) data[k] = String(rest[k]).slice(0, 200);
  store.logEvent(p.id, type, data);
  res.json({ ok: true });
});

// ---------------- undo last analysis ----------------

app.post('/api/projects/:id/undo', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const snap = store.readNodesSnapshot(p.id);
  if (!snap || !Array.isArray(snap.nodes)) return res.status(400).json({ error: 'Nothing to undo' });
  p.nodes = snap.nodes;
  store.saveProject(p);
  store.saveNodesSnapshot(p.id, []); // consume the snapshot (single-level undo)
  store.logAudit(p.id, { action: 'undo', total: p.nodes.length });
  store.logEvent(p.id, 'analysis_undone', {});
  const mastery = store.getMastery();
  const states = computeStates(p.nodes, new Set(Object.keys(mastery)));
  res.json({ project: p, states });
});

// ---------------- export ----------------

app.get('/api/projects/:id/export.txt', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const mastery = store.getMastery();
  const lines = [];
  lines.push(`PAPERQUEST STUDY PACK`);
  lines.push(`Project: ${p.name}`);
  if (p.field) lines.push(`Field: ${p.field}`);
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`PAPERS (${p.papers.length})`);
  for (const pp of p.papers) lines.push(`  - ${pp.title || pp.name}${pp.pages ? ` (${pp.pages}p)` : ''}`);
  lines.push('');
  lines.push(`PREREQUISITE MAP — review from the bottom up`);
  const byDepth = {};
  for (const n of p.nodes) (byDepth[n.depth || 0] = byDepth[n.depth || 0] || []).push(n);
  const depths = Object.keys(byDepth).map(Number).sort((a, b) => a - b);
  for (const d of depths) {
    const label = d === 0 ? 'Baseline (assumed known)' : `Level ${d}`;
    lines.push(`\n[${label}]`);
    for (const n of byDepth[d]) {
      const done = mastery[n.id] ? ' ✓' : '';
      lines.push(`  ${n.core ? '★ ' : ''}${n.name}${n.branch ? ` — ${n.branch}` : ''}${done}`);
      if (n.blurb) lines.push(`      ${n.blurb}`);
      const usage = Object.values(n.usage || {})[0];
      if (usage) lines.push(`      Used in paper: ${usage}`);
    }
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${(p.name || 'studypack').replace(/[^\w\- ]/g, '')}.txt"`);
  res.send(lines.join('\n'));
});

// ---------------- papers ----------------

app.post(
  '/api/projects/:id/papers',
  upload.single('file'),
  wrap(async (req, res) => {
    const p = store.getProject(req.params.id);
    if (!p) throw httpError(404, 'Project not found');
    if (!req.file) throw httpError(400, 'No file uploaded');

    const name = req.file.originalname || 'paper';
    const ext = path.extname(name).toLowerCase();
    let markdown;
    let pages = 0;

    if (ext === '.pdf') {
      const out = await pdfToMarkdown(req.file.buffer, name);
      markdown = out.markdown;
      pages = out.pages;
    } else if (['.md', '.markdown', '.txt'].includes(ext)) {
      markdown = req.file.buffer.toString('utf8');
      if (markdown.replace(/\s/g, '').length < 100) throw httpError(400, 'That file looks empty.');
    } else {
      throw httpError(400, `Unsupported file type "${ext}". Upload a .pdf, .md or .txt file.`);
    }

    const paperId = store.id();
    store.savePaperFiles(p.id, paperId, name, req.file.buffer, markdown);
    const paper = {
      id: paperId,
      name: name.replace(/\.(pdf|md|markdown|txt)$/i, ''),
      pages,
      addedAt: Date.now(),
      analyzed: false
    };
    p.papers.push(paper);
    store.saveProject(p);
    store.logEvent(p.id, 'paper_added', { paper: paper.name });
    res.json({ paper, chars: markdown.length });
  })
);

app.post(
  '/api/projects/:id/papers/:paperId/analyze',
  wrap(async (req, res) => {
    const p = store.getProject(req.params.id);
    if (!p) throw httpError(404, 'Project not found');
    const paper = p.papers.find((x) => x.id === req.params.paperId);
    if (!paper) throw httpError(404, 'Paper not found');
    const md = store.readPaperMarkdown(p.id, paper.id);
    if (!md) throw httpError(404, 'Paper markdown missing');

    const settings = store.getSettings();
    const hasGraph = p.nodes && p.nodes.length > 0;
    const memory = store.readMemory(p.id);

    const buildMessages = () => {
      const msgs = hasGraph ? conceptMergeMessages(p.nodes, md, paper.name) : conceptExtractionMessages(md, paper.name);
      if (memory && memory.trim()) {
        msgs.unshift({
          role: 'system',
          content: 'PROJECT MEMORY — respect this canonical vocabulary, goals and notes:\n' + memory.slice(0, 4000)
        });
      }
      return msgs;
    };

    const attempt = async () => {
      const rawText = await callLLM(settings, buildMessages(), { json: true, maxTokens: 16000 });
      const parsed = parseModelJSON(rawText);
      return { parsed, nodes: sanitizeGraph(parsed.nodes) };
    };

    // First pass; if the model returns a flat/structureless graph, retry once.
    let { parsed, nodes } = await attempt();
    if (isDegenerate(nodes)) {
      try {
        const retry = await attempt();
        if (!isDegenerate(retry.nodes)) ({ parsed, nodes } = retry);
      } catch (_) {}
    }

    const oldById = new Map((p.nodes || []).map((n) => [n.id, n]));
    for (const n of nodes) {
      const old = oldById.get(n.id);
      const needsIt = hasGraph ? n.forNewPaper : true;
      n.sources = [...new Set([...(old?.sources || []), ...(needsIt ? [paper.id] : [])])];
      n.usage = { ...(old?.usage || {}) };
      if (needsIt && n.usedInPaper) n.usage[paper.id] = n.usedInPaper;
      if (!n.branch && old?.branch) n.branch = old.branch;
      delete n.usedInPaper;
      delete n.forNewPaper;
    }

    // Backstop: guarantee a connected, layered DAG.
    repairGraph(nodes);

    // Safety: snapshot the previous graph for one-level undo, and audit the change.
    const prevNodes = p.nodes || [];
    store.saveNodesSnapshot(p.id, prevNodes);
    const diff = graphDiff(prevNodes, nodes);

    p.nodes = nodes;
    if (parsed.field && !p.field) p.field = String(parsed.field).slice(0, 60);
    if (parsed.paper_title) paper.title = String(parsed.paper_title).slice(0, 200);
    paper.analyzed = true;
    store.saveProject(p);

    // Refresh the auto-maintained memory (keeps user notes if they already saved some).
    if (!store.readMemory(p.id)) store.writeMemory(p.id, memorySeed(p));
    store.logAudit(p.id, {
      action: hasGraph ? 'merge' : 'analyze',
      paper: paper.name,
      added: diff.added,
      removed: diff.removed,
      total: nodes.length
    });
    store.logEvent(p.id, 'paper_analyzed', { paper: paper.name, concepts: nodes.length });

    res.json({ project: p, canUndo: true });
  })
);

app.get('/api/projects/:id/papers/:paperId/markdown', (req, res) => {
  const p = store.getProject(req.params.id);
  const paper = p && p.papers.find((x) => x.id === req.params.paperId);
  const md = p && store.readPaperMarkdown(p.id, req.params.paperId);
  if (!paper || md == null) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${paper.name.replace(/[^\w\- ]/g, '')}.md"`);
  res.send(md);
});

app.delete('/api/projects/:id/papers/:paperId', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const paper = p.papers.find((x) => x.id === req.params.paperId);
  p.papers = p.papers.filter((x) => x.id !== req.params.paperId);
  for (const n of p.nodes) {
    n.sources = (n.sources || []).filter((s) => s !== req.params.paperId);
    if (n.usage) delete n.usage[req.params.paperId];
  }
  store.deletePaperFiles(p.id, req.params.paperId);
  store.saveProject(p);
  if (paper) store.logEvent(p.id, 'paper_removed', { paper: paper.name });
  res.json({ project: p });
});

// ---------------- lessons & mastery ----------------

app.post(
  '/api/projects/:id/lesson',
  wrap(async (req, res) => {
    const { conceptId, regenerate } = req.body || {};
    const p = store.getProject(req.params.id);
    if (!p) throw httpError(404, 'Project not found');
    const node = p.nodes.find((n) => n.id === conceptId);
    if (!node) throw httpError(404, 'Concept not found in this project');

    if (!regenerate) {
      const cached = store.readLesson(p.id, conceptId);
      if (cached) return res.json({ ...cached, chat: store.readLessonChat(p.id, conceptId), cached: true });
    }

    const mastery = store.getMastery();
    const masteredNames = p.nodes
      .filter((n) => n.level !== 0 && mastery[n.id] && n.id !== conceptId)
      .map((n) => n.name);
    const paperTitles = p.papers.map((x) => x.title || x.name);
    const usageText = Object.values(node.usage || {}).join(' ').slice(0, 1200);

    const settings = store.getSettings();
    const raw = await callLLM(
      settings,
      lessonMessages({ node, masteredNames, paperTitles, field: p.field, usageText }),
      { json: true, maxTokens: 12000 }
    );
    const parsed = parseModelJSON(raw);
    if (!parsed.lesson || !Array.isArray(parsed.quiz) || parsed.quiz.length === 0) {
      throw httpError(502, 'The model returned an incomplete lesson. Try again.');
    }
    parsed.quiz = parsed.quiz
      .filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => ({
        q: String(q.q),
        options: q.options.slice(0, 4).map(String),
        answer: Math.min(Math.max(0, Number(q.answer) || 0), Math.min(q.options.length, 4) - 1),
        why: String(q.why || '')
      }));
    const lesson = { lesson: String(parsed.lesson), quiz: parsed.quiz, generatedAt: Date.now() };
    store.saveLesson(p.id, conceptId, lesson);
    store.logEvent(p.id, 'lesson_generated', { concept: node.name });
    res.json({ ...lesson, chat: store.readLessonChat(p.id, conceptId), cached: false });
  })
);

app.get('/api/projects/:id/lesson/chat', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const conceptId = String(req.query.conceptId || '');
  res.json({ chat: store.readLessonChat(p.id, conceptId) });
});

app.delete('/api/projects/:id/lesson/chat', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const conceptId = String(req.query.conceptId || '');
  res.json({ chat: store.clearLessonChat(p.id, conceptId) });
});

// Follow-up Q&A inside an open refresher. Always returns the WHOLE thread so the
// modal can render history and the new answer from one response.
app.post(
  '/api/projects/:id/lesson/ask',
  wrap(async (req, res) => {
    const { conceptId, question, mode } = req.body || {};
    const p = store.getProject(req.params.id);
    if (!p) throw httpError(404, 'Project not found');
    const node = p.nodes.find((n) => n.id === conceptId);
    if (!node) throw httpError(404, 'Concept not found in this project');
    const askMode = mode === 'source' ? 'source' : 'ask';
    const raw = String(question || '').trim().slice(0, 1000);
    if (askMode === 'ask' && !raw) throw httpError(400, 'Ask a question first.');

    const lesson = store.readLesson(p.id, conceptId);
    if (!lesson) throw httpError(400, 'Open the refresher before asking about it.');

    const chat = store.readLessonChat(p.id, conceptId);
    const messages = lessonAskMessages({
      node,
      lesson: lesson.lesson,
      chat,
      question: raw,
      mode: askMode,
      paperTitles: p.papers.map((x) => x.title || x.name),
      field: p.field
    });

    const { text, message } = await callLLMRaw(store.getSettings(), messages, { json: true, maxTokens: 4000 });
    const parsed = parseModelJSON(text);
    if (!parsed.answer) throw httpError(502, 'The model returned an empty answer. Try again.');

    const entry = {
      id: store.id(),
      ts: Date.now(),
      mode: askMode,
      raw: raw || (askMode === 'source' ? 'Where does this come from?' : ''),
      question: String(parsed.question || raw || 'Sources for this concept'),
      answer: String(parsed.answer),
      sources: (Array.isArray(parsed.sources) ? parsed.sources : []).slice(0, 8).map((x) => String(x).slice(0, 400)),
      ...(message && message.reasoning_details ? { reasoningDetails: message.reasoning_details } : {})
    };
    const saved = store.saveLessonChat(p.id, conceptId, [...chat, entry]);
    store.logEvent(p.id, 'lesson_question', { concept: node.name, mode: askMode });
    res.json({ chat: saved, entry });
  })
);

app.post('/api/complete', (req, res) => {
  const { projectId, conceptId, score, total, skipped } = req.body || {};
  const p = store.getProject(projectId);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const node = p.nodes.find((n) => n.id === conceptId);
  if (!node) return res.status(404).json({ error: 'Concept not found' });

  const mastery = store.getMastery();
  const already = !!mastery[conceptId];

  const before = computeStates(p.nodes, new Set(Object.keys(mastery)));
  mastery[conceptId] = {
    name: node.name,
    projectId,
    projectName: p.name,
    completedAt: Date.now(),
    score: score ?? null,
    total: total ?? null,
    skipped: !!skipped
  };
  store.saveMastery(mastery);
  const after = computeStates(p.nodes, new Set(Object.keys(mastery)));

  const unlocked = p.nodes
    .filter((n) => before[n.id] === 'locked' && after[n.id] === 'open')
    .map((n) => n.name);

  let xpGained = 0;
  if (!already) {
    xpGained = xpForNode(node, !!skipped);
    const profile = store.getProfile();
    profile.xp = (profile.xp || 0) + xpGained;
    store.saveProfile(profile);
  }
  store.logEvent(projectId, skipped ? 'concept_skipped' : 'concept_mastered', { concept: node.name });

  const profile = store.getProfile();
  res.json({
    ok: true,
    xpGained,
    unlocked,
    profile: { ...levelInfo(profile.xp || 0), masteredCount: Object.keys(mastery).length },
    states: after,
    mastery
  });
});

// ---------------- bookmarks (to-review) ----------------

app.get('/api/bookmarks', (req, res) => {
  const list = Object.values(store.getBookmarks()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  res.json(list);
});

app.post('/api/projects/:id/bookmarks/toggle', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const node = p.nodes.find((n) => n.id === (req.body && req.body.conceptId));
  if (!node) return res.status(404).json({ error: 'Concept not found' });
  if (!isAdvanced(node)) return res.status(400).json({ error: 'Only advanced (or core) concepts are worth flagging to review.' });
  const bm = store.getBookmarks();
  const key = p.id + ':' + node.id;
  let bookmarked;
  if (bm[key]) { delete bm[key]; bookmarked = false; }
  else {
    bm[key] = { projectId: p.id, projectName: p.name, conceptId: node.id, name: node.name, branch: node.branch || '', addedAt: Date.now() };
    bookmarked = true;
    store.logEvent(p.id, 'concept_bookmarked', { concept: node.name });
  }
  store.saveBookmarks(bm);
  res.json({ bookmarked });
});

// ---------------- per-paper notes ----------------

app.put('/api/projects/:id/papers/:paperId/notes', (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const paper = p.papers.find((x) => x.id === req.params.paperId);
  if (!paper) return res.status(404).json({ error: 'Paper not found' });
  paper.notes = String((req.body && req.body.notes) || '').slice(0, 20000);
  store.saveProject(p);
  res.json({ ok: true });
});

// ---------------- reference network (Semantic Scholar) ----------------

app.get(
  '/api/projects/:id/papers/:paperId/references',
  wrap(async (req, res) => {
    const p = store.getProject(req.params.id);
    if (!p) throw httpError(404, 'Project not found');
    const paper = p.papers.find((x) => x.id === req.params.paperId);
    if (!paper) throw httpError(404, 'Paper not found');
    if (paper.refsCache && !req.query.refresh) return res.json({ ...paper.refsCache, cached: true });
    const data = await resolveReferences(paper.title || paper.name, store.getSettings().s2Key);
    // only cache useful results — a rate-limited empty answer should stay retryable
    if (data.matched && (data.references.length || data.citations.length)) {
      paper.refsCache = { ...data, fetchedAt: Date.now() };
      store.saveProject(p);
      store.logEvent(p.id, 'references_fetched', { paper: paper.name });
    }
    res.json({ ...data, cached: false });
  })
);

// Expand the graph from ANY paper already on it (not just a local one), so the
// explorer can pivot: click a node -> pull its refs / citations / similar
// papers. Pure Semantic Scholar proxy, so it is not project-scoped; results are
// memoised in references.js (in-process, TTL) rather than in project.json,
// which would grow without bound as the user explores.
app.get(
  '/api/s2/papers/:s2Id/:mode',
  wrap(async (req, res) => {
    const { s2Id, mode } = req.params;
    if (!MODES[mode]) throw httpError(400, `Unknown mode "${mode}" — expected one of: ${Object.keys(MODES).join(', ')}`);
    const data = await expandPaper(s2Id, mode, store.getSettings().s2Key);
    res.json(data);
  })
);

// ---------------- raw PDF (for the reader) ----------------

app.get('/api/projects/:id/papers/:paperId/pdf', (req, res) => {
  const raw = store.paperRawPath(req.params.id, req.params.paperId);
  if (!raw || !fs.existsSync(raw) || !raw.toLowerCase().endsWith('.pdf'))
    return res.status(404).json({ error: 'No PDF for this paper (it may be a Markdown/text upload).' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  fs.createReadStream(raw).pipe(res);
});

// ---------------- cross-project overview (front dashboard) ----------------

app.get('/api/overview', (req, res) => {
  const mastery = store.getMastery();
  const masteredIds = new Set(Object.keys(mastery));
  const projects = store.listProjects();

  const masteryLabel = (pr) => (pr >= 1 ? 'Mastered' : pr >= 0.67 ? 'Almost there' : pr >= 0.34 ? 'Progressing' : pr > 0 ? 'Getting started' : 'Not started');

  const enriched = projects.map((p) => {
    const st = computeStates(p.nodes, masteredIds);
    const learnable = p.nodes.filter((n) => n.level !== 0);
    const done = learnable.filter((n) => masteredIds.has(n.id)).length;
    const learning = p.nodes
      .filter((n) => st[n.id] === 'open')
      .sort((a, b) => (a.depth || 0) - (b.depth || 0))
      .slice(0, 5)
      .map((n) => ({ id: n.id, name: n.name, tier: effectiveTier(n) }));
    const progress = learnable.length ? done / learnable.length : 0;
    return { id: p.id, name: p.name, createdAt: p.createdAt, paperCount: p.papers.length, conceptCount: learnable.length, masteredCount: done, progress, masteryLabel: masteryLabel(progress), learning };
  });

  // cross-project network of ADVANCED (or core) skills shared across papers/projects
  const advMap = new Map();
  for (const p of projects) {
    for (const n of p.nodes) {
      if (!isAdvanced(n)) continue;
      if (!advMap.has(n.id)) advMap.set(n.id, { id: n.id, name: n.name, tier: effectiveTier(n), branch: n.branch || '', projects: [] });
      advMap.get(n.id).projects.push({ id: p.id, name: p.name });
    }
  }
  const network = [...advMap.values()].filter((x) => x.projects.length > 1).sort((a, b) => b.projects.length - a.projects.length);

  const skills = Object.entries(mastery)
    .map(([id, m]) => ({ id, name: m.name, projectName: m.projectName, completedAt: m.completedAt, skipped: !!m.skipped }))
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const bookmarks = Object.values(store.getBookmarks()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  for (const b of bookmarks) {
    b.sources = projects.filter((p) => p.nodes.some((n) => n.id === b.conceptId)).map((p) => ({ id: p.id, name: p.name }));
  }

  const profile = store.getProfile();
  res.json({
    totals: { projects: projects.length, concepts: enriched.reduce((a, s2) => a + s2.conceptCount, 0), reviewed: skills.length },
    profile: { ...levelInfo(profile.xp || 0), masteredCount: skills.length },
    projects: enriched,
    network,
    skills,
    bookmarks
  });
});

// ---------------- knowledge brain (aggregate constellation) ----------------

app.get('/api/brain', (req, res) => {
  const mastery = store.getMastery();
  const masteredIds = new Set(Object.keys(mastery));
  const projects = store.listProjects();
  const flagged = new Set(Object.values(store.getBookmarks()).map((b) => b.conceptId));

  const agg = new Map();
  for (const p of projects) {
    const st = computeStates(p.nodes, masteredIds);
    for (const n of p.nodes) {
      if (n.level === 0) continue; // baseline is assumed known; not shown as a star
      let e = agg.get(n.id);
      if (!e) {
        e = { id: n.id, name: n.name, branch: n.branch || 'other', tier: effectiveTier(n), core: !!n.core, state: 'locked', flagged: flagged.has(n.id), projects: [] };
        agg.set(n.id, e);
      }
      if (!e.projects.some((x) => x.id === p.id)) e.projects.push({ id: p.id, name: p.name });
      if (masteredIds.has(n.id)) e.state = 'mastered';
      else if (st[n.id] === 'open' && e.state !== 'mastered') e.state = 'ready';
    }
  }
  // prerequisite edges between concepts (aggregated across projects, deduped)
  const edgeSet = new Set();
  const edges = [];
  for (const p of projects) {
    const ids = new Set(p.nodes.filter((n) => n.level !== 0).map((n) => n.id));
    for (const n of p.nodes) {
      if (n.level === 0) continue;
      for (const pr of n.prereqs || []) {
        if (!ids.has(pr)) continue;
        const key = pr + '>' + n.id;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: pr, to: n.id }); }
      }
    }
  }
  const concepts = [...agg.values()];
  const counts = {
    total: concepts.length,
    known: concepts.filter((c) => c.state === 'mastered').length,
    ready: concepts.filter((c) => c.state === 'ready').length,
    flagged: concepts.filter((c) => c.flagged).length
  };
  // daily activity + streak from event logs
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const daysActive = new Set();
  let today = 0;
  for (const p of projects) {
    for (const e of store.readEvents(p.id, 800)) {
      if (e.type === 'concept_mastered' || e.type === 'concept_skipped') {
        daysActive.add(new Date(e.t).toISOString().slice(0, 10));
        if (e.t >= startToday.getTime()) today++;
      }
    }
  }
  let streak = 0;
  for (let i = 0; ; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (daysActive.has(d.toISOString().slice(0, 10))) streak++; else break; }

  // suggestion: the ready concept that unblocks the most others (else lowest tier)
  const unblocks = {};
  for (const e of edges) unblocks[e.from] = (unblocks[e.from] || 0) + 1;
  const tierRank = { novice: 0, intermediate: 1, advanced: 2 };
  const ready = concepts.filter((c) => c.state === 'ready')
    .sort((a, b) => (unblocks[b.id] || 0) - (unblocks[a.id] || 0) || (tierRank[a.tier] || 0) - (tierRank[b.tier] || 0));
  const sg = ready[0];
  const suggestion = sg ? { id: sg.id, name: sg.name, branch: sg.branch, tier: sg.tier, projectId: sg.projects[0].id, projectName: sg.projects[0].name, unblocks: unblocks[sg.id] || 0 } : null;

  const profile = store.getProfile();
  res.json({ concepts, edges, counts, daily: { today, streak }, suggestion, profile: { ...levelInfo(profile.xp || 0) }, projects: projects.map((p) => ({ id: p.id, name: p.name, paperCount: p.papers.length })) });
});

// ---------------- unified knowledge graph ----------------
// ONE network: every concept (across projects) + every career skill, merged by
// canonical id, so careers connect to the paper galaxy through shared skills.
// Powers the in-app Constellation Navigator (client/src/components/KnowledgeGraph.jsx).
app.get('/api/graph', (req, res) => {
  const scope = req.query.scope || 'all'; // all | concepts | careers
  const mastered = masteredIdSet();
  const flagged = new Set(Object.values(store.getBookmarks()).map((b) => b.conceptId));

  const nodes = new Map(); // id -> node
  const edgeSet = new Set();
  const edges = [];
  const addEdge = (from, to, rel) => { const k = rel + ':' + from + '>' + to; if (!edgeSet.has(k) && from !== to) { edgeSet.add(k); edges.push({ from, to, rel }); } };
  const ensure = (id, name, branch, tier, core) => {
    let n = nodes.get(id);
    if (!n) { n = { id, name, kind: 'concept', branch: branch || 'other', tier: tier || '', core: !!core, state: 'locked', flagged: flagged.has(id), projects: [], careers: [] }; nodes.set(id, n); }
    if (core) n.core = true;
    if (!n.branch || n.branch === 'other') n.branch = branch || n.branch;
    return n;
  };

  // ---- projects: concepts ----
  if (scope !== 'careers') {
    for (const p of store.listProjects()) {
      const st = computeStates(p.nodes, mastered);
      for (const n of p.nodes) {
        if (n.level === 0) continue; // baseline assumed known — not a star
        const node = ensure(n.id, n.name, n.branch, effectiveTier(n), n.core);
        if (!node.projects.some((x) => x.id === p.id)) node.projects.push({ id: p.id, name: p.name });
        if (mastered.has(n.id)) node.state = 'mastered';
        else if (st[n.id] === 'open' && node.state !== 'mastered') node.state = 'ready';
        for (const pr of n.prereqs || []) { if (p.nodes.some((x) => x.id === pr && x.level !== 0)) addEdge(pr, n.id, 'prerequisite_of'); }
      }
    }
  }

  // ---- careers: skills (merge into the same nodes by canonical id) ----
  if (scope !== 'concepts') {
    for (const c of store.listCareers()) {
      const resumeNames = new Set((((c.resume || {}).skills) || []).map(normSkill).filter(Boolean));
      for (const s of c.skills || []) {
        if (s.level === 0) continue;
        const node = ensure(s.id, s.name, s.branch, s.tier, s.core || s.importance === 'critical');
        if (!node.careers.some((x) => x.id === c.id)) node.careers.push({ id: c.id, name: c.name });
        // a skill counts as known if mastered, or evidenced by this career's resume
        if (node.state === 'locked' && (mastered.has(s.id) || skillMatches(resumeNames, s.name))) node.state = 'known';
        for (const pr of s.prereqs || []) { if ((c.skills || []).some((x) => x.id === pr && x.level !== 0)) addEdge(pr, s.id, 'prerequisite_of'); }
      }
    }
  }

  // degree (for node sizing)
  const deg = {};
  for (const e of edges) { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; }
  const list = [...nodes.values()].map((n) => ({ ...n, degree: deg[n.id] || 0 }));

  const branches = [...new Set(list.map((n) => n.branch))];
  const meta = {
    counts: {
      total: list.length,
      mastered: list.filter((n) => n.state === 'mastered').length,
      ready: list.filter((n) => n.state === 'ready').length,
      known: list.filter((n) => n.state === 'known').length,
      locked: list.filter((n) => n.state === 'locked').length
    },
    branches,
    projects: store.listProjects().map((p) => ({ id: p.id, name: p.name })),
    careers: store.listCareers().map((c) => ({ id: c.id, name: c.name, primary: !!c.primary }))
  };
  res.json({ nodes: list, edges, meta });
});


// ---------------- daily quests ----------------

const QUEST_XP = 45;
const QUEST_GOALS = { review: 3, quizzes: 2, xp: 100 };

function localDayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function computeQuestState() {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const t0 = startToday.getTime();
  const key = localDayKey(startToday);
  const projects = store.listProjects();
  let reviewed = 0, quizzes = 0;
  for (const p of projects) {
    for (const e of store.readEvents(p.id, 400)) {
      if (e.t < t0) continue;
      if (e.type === 'concept_viewed' || e.type === 'lesson_generated') reviewed++;
      else if (e.type === 'concept_mastered' || e.type === 'concept_skipped') quizzes++;
    }
  }
  const mastery = store.getMastery();
  const nodeById = new Map();
  for (const p of projects) for (const n of p.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const profile = store.getProfile();
  let xpToday = (profile.questClaims && profile.questClaims[key]) || 0;
  for (const [cid, m] of Object.entries(mastery)) {
    if ((m.completedAt || 0) < t0) continue;
    const n = nodeById.get(cid);
    if (n) xpToday += xpForNode(n, !!m.skipped);
  }
  const items = [
    { id: 'review', label: `Review ${QUEST_GOALS.review} concepts`, cur: Math.min(reviewed, QUEST_GOALS.review), goal: QUEST_GOALS.review },
    { id: 'quizzes', label: `Pass ${QUEST_GOALS.quizzes} quizzes`, cur: Math.min(quizzes, QUEST_GOALS.quizzes), goal: QUEST_GOALS.quizzes },
    { id: 'xp', label: `Earn ${QUEST_GOALS.xp} XP`, cur: Math.min(xpToday, QUEST_GOALS.xp), goal: QUEST_GOALS.xp }
  ].map((q) => ({ ...q, done: q.cur >= q.goal }));
  const claimed = !!(profile.questClaims && profile.questClaims[key]);
  const complete = items.every((q) => q.done);
  return { items, reward: QUEST_XP, claimable: complete && !claimed, claimed, dayKey: key };
}

app.get('/api/quests', (req, res) => res.json(computeQuestState()));

app.post('/api/quest/claim', (req, res) => {
  const q = computeQuestState();
  if (q.claimed) return res.status(400).json({ error: 'Today’s quest reward was already claimed.' });
  if (!q.claimable) return res.status(400).json({ error: 'Finish all three quests first.' });
  const profile = store.getProfile();
  profile.questClaims = profile.questClaims || {};
  profile.questClaims[q.dayKey] = QUEST_XP;
  profile.xp = (profile.xp || 0) + QUEST_XP;
  store.saveProfile(profile);
  res.json({ ok: true, xpGained: QUEST_XP, profile: { ...levelInfo(profile.xp) }, quests: computeQuestState() });
});

// ---------------- dashboard (everything the home needs in one call) ----------------

app.get('/api/dashboard', (req, res) => {
  const mastery = store.getMastery();
  const masteredIds = new Set(Object.keys(mastery));
  const projects = store.listProjects();
  const flagged = new Set(Object.values(store.getBookmarks()).map((b) => b.conceptId));

  // aggregate concepts + edges (galaxy) + learning set from events
  const agg = new Map();
  const learningIds = new Set();
  const events = [];
  for (const p of projects) {
    const st = computeStates(p.nodes, masteredIds);
    for (const e of store.readEvents(p.id, 800)) events.push({ ...e, project: p.name, projectId: p.id });
    for (const n of p.nodes) {
      if (n.level === 0) continue;
      let e = agg.get(n.id);
      if (!e) { e = { id: n.id, name: n.name, branch: n.branch || 'other', tier: effectiveTier(n), core: !!n.core, state: 'locked', flagged: flagged.has(n.id), projects: [] }; agg.set(n.id, e); }
      if (!e.projects.some((x) => x.id === p.id)) e.projects.push({ id: p.id, name: p.name });
      if (masteredIds.has(n.id)) e.state = 'mastered';
      else if (st[n.id] === 'open' && e.state !== 'mastered') e.state = 'ready';
    }
  }
  for (const ev of events) if ((ev.type === 'concept_viewed' || ev.type === 'lesson_generated') && ev.conceptId) learningIds.add(ev.conceptId);
  const concepts = [...agg.values()];
  const edgeSet = new Set(); const edges = [];
  for (const p of projects) { const ids = new Set(p.nodes.filter((n) => n.level !== 0).map((n) => n.id));
    for (const n of p.nodes) { if (n.level === 0) continue; for (const pr of n.prereqs || []) { if (!ids.has(pr)) continue; const k = pr + '>' + n.id; if (!edgeSet.has(k)) { edgeSet.add(k); edges.push({ from: pr, to: n.id }); } } } }

  const mastered = concepts.filter((c) => c.state === 'mastered').length;
  const ready = concepts.filter((c) => c.state === 'ready').length;
  const learning = concepts.filter((c) => c.state !== 'mastered' && learningIds.has(c.id)).length;
  const total = concepts.length;
  const knowledge = { total, mastered, learning, ready, locked: Math.max(0, total - mastered - ready - learning) };

  // per-branch mastery (career path bars)
  const bmap = new Map();
  for (const c of concepts) { const b = bmap.get(c.branch) || { name: c.branch, total: 0, done: 0 }; b.total++; if (c.state === 'mastered') b.done++; bmap.set(c.branch, b); }
  const branches = [...bmap.values()].map((b) => ({ name: b.name, pct: b.total ? Math.round((b.done / b.total) * 100) : 0, total: b.total })).sort((a, b) => b.total - a.total);

  // daily activity heatmap (last 70 days) + streak
  const day = 86400000; const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const counts = {};
  for (const ev of events) if (['concept_mastered', 'concept_skipped', 'concept_viewed', 'lesson_generated', 'paper_analyzed'].includes(ev.type)) { const key = new Date(ev.t).toISOString().slice(0, 10); counts[key] = (counts[key] || 0) + 1; }
  const heat = [];
  for (let i = 69; i >= 0; i--) { const d = new Date(startToday.getTime() - i * day); const key = d.toISOString().slice(0, 10); heat.push({ date: key, count: counts[key] || 0 }); }
  let streak = 0; for (let i = 0; ; i++) { const key = new Date(startToday.getTime() - i * day).toISOString().slice(0, 10); if (counts[key]) streak++; else break; }
  const today = counts[startToday.toISOString().slice(0, 10)] || 0;

  // projects with progress
  const projOut = projects.map((p) => { const learnable = p.nodes.filter((n) => n.level !== 0); const done = learnable.filter((n) => masteredIds.has(n.id)).length;
    return { id: p.id, name: p.name, paperCount: p.papers.length, done, total: learnable.length, progress: learnable.length ? done / learnable.length : 0 }; });

  // recommended next
  const unblocks = {}; for (const e of edges) unblocks[e.from] = (unblocks[e.from] || 0) + 1;
  const tierRank = { novice: 0, intermediate: 1, advanced: 2 };
  const rd = concepts.filter((c) => c.state === 'ready').sort((a, b) => (unblocks[b.id] || 0) - (unblocks[a.id] || 0) || (tierRank[a.tier] || 0) - (tierRank[b.tier] || 0))[0];
  const recommended = rd ? { id: rd.id, name: rd.name, branch: rd.branch, tier: rd.tier, projectId: rd.projects[0].id, projectName: rd.projects[0].name, unblocks: unblocks[rd.id] || 0 } : null;

  // recent activity
  const recent = events.sort((a, b) => b.t - a.t).slice(0, 30).map((e) => ({ type: e.type, name: e.concept || e.paper || e.name || '', project: e.project, projectId: e.projectId, conceptId: e.conceptId, t: e.t }));

  const profile = store.getProfile();
  const lessonsDone = events.filter((e) => e.type === 'lesson_generated').length;

  // weekly XP summary — recomputed from mastery timestamps (+ claimed quest bonuses)
  const weekStart = startToday.getTime() - 6 * day;
  const nodeById = new Map();
  for (const p of projects) for (const n of p.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const xpWeek = { total: 0, sources: { lessons: 0, core: 0, known: 0, quests: 0 } };
  let coreMastered = false;
  for (const [cid, m] of Object.entries(mastery)) {
    const n = nodeById.get(cid);
    if (n && n.core) coreMastered = true;
    if (!n || (m.completedAt || 0) < weekStart) continue;
    const xp = xpForNode(n, !!m.skipped);
    xpWeek.total += xp;
    if (n.core) xpWeek.sources.core += xp;
    else if (m.skipped) xpWeek.sources.known += xp;
    else xpWeek.sources.lessons += xp;
  }
  for (const [k, v] of Object.entries(profile.questClaims || {})) {
    const t = new Date(k + 'T00:00:00').getTime();
    if (t >= weekStart) { xpWeek.total += v; xpWeek.sources.quests += v; }
  }

  const li = levelInfo(profile.xp || 0);
  const papersTotal = projects.reduce((a, p) => a + p.papers.length, 0);
  const badges = [
    { id: 'first-steps', icon: '✦', name: 'First Steps', desc: 'Review your first concept', earned: mastered >= 1 },
    { id: 'bookworm', icon: '📄', name: 'Bookworm', desc: 'Add 3 papers to your projects', earned: papersTotal >= 3 },
    { id: 'on-fire', icon: '🔥', name: 'On Fire', desc: 'Keep a 7-day streak', earned: streak >= 7 },
    { id: 'summit', icon: '★', name: 'Summit', desc: 'Master a paper’s core concept', earned: coreMastered },
    { id: 'constellation', icon: '✧', name: 'Constellation', desc: 'Master 25 concepts', earned: mastered >= 25 },
    { id: 'scholar', icon: '🎓', name: 'Scholar', desc: 'Reach level 5', earned: li.level >= 5 }
  ];

  res.json({
    profile: { ...li },
    stats: { concepts: total, lessons: lessonsDone, projects: projects.length },
    knowledge, branches, heat, streak, today,
    projects: projOut, recommended, recent,
    galaxy: { concepts, edges },
    counts: { known: mastered, ready, flagged: concepts.filter((c) => c.flagged).length },
    xpWeek, weeklyGoal: profile.weeklyGoal || 300,
    quests: computeQuestState(),
    badges
  });
});

// ---------------- career paths ----------------
// Careers are GLOBAL (like mastery/profile), stored under data/careers/.
// Skill graphs reuse the exact paper pipeline: sanitizeGraph -> degenerate retry -> repairGraph.

const normSkill = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

function skillMatches(set, name) {
  const n = normSkill(name);
  if (!n) return false;
  if (set.has(n)) return true;
  if (n.length >= 6) {
    for (const s of set) if (s.length >= 6 && (s.includes(n) || n.includes(s))) return true;
  }
  return false;
}

// What the user already knows: mastered concepts (by canonical id AND name),
// concepts currently in project graphs but not yet mastered ("learning"),
// and skills evidenced by the uploaded resume.
function careerCtx() {
  const mastered = masteredIdSet();
  const masteredNames = new Set();
  const learningNames = new Set();
  for (const p of store.listProjects()) {
    for (const n of p.nodes || []) {
      const nm = normSkill(n.name);
      if (!nm) continue;
      if (n.level === 0 || mastered.has(n.id)) masteredNames.add(nm);
      else learningNames.add(nm);
    }
  }
  return { masteredIds: mastered, masteredNames, learningNames };
}

function careerStates(career, ctx) {
  const resumeNames = new Set((((career.resume || {}).skills) || []).map(normSkill).filter(Boolean));
  const states = {};
  for (const s of career.skills || []) {
    let st;
    if (s.level === 0) st = 'known'; // foundation skills are assumed
    else if (ctx.masteredIds.has(s.id) || skillMatches(ctx.masteredNames, s.name) || skillMatches(resumeNames, s.name)) st = 'known';
    else if (skillMatches(ctx.learningNames, s.name)) st = 'learning';
    else if (s.importance === 'optional') st = 'notreq';
    else st = 'tolearn';
    states[s.id] = st;
  }
  return states;
}

function careerStats(career, states) {
  let known = 0, learning = 0, tolearn = 0;
  for (const s of career.skills || []) {
    const st = states[s.id];
    if (st === 'known') known++;
    else if (st === 'learning') learning++;
    else if (st === 'tolearn') tolearn++;
  }
  const total = known + learning + tolearn;
  const matchPct = total ? Math.round(((known + learning * 0.5) / total) * 100) : 0;
  return { total, known, learning, tolearn, matchPct };
}

// Shared LLM pipeline for career skill graphs (mirrors the paper analyze route).
async function runCareerGraph(career, buildMessages) {
  const settings = store.getSettings();
  const attempt = async () => {
    const rawText = await callLLM(settings, buildMessages(), { json: true, maxTokens: 16000 });
    const parsed = parseModelJSON(rawText);
    const raws = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    // career prompts use "used_in_role"; sanitizeGraph reads "used_in_paper"
    for (const r of raws) if (r && r.used_in_role && !r.used_in_paper) r.used_in_paper = r.used_in_role;
    const nodes = sanitizeGraph(raws);
    // sanitizeGraph whitelists fields - re-attach importance by canonical id
    const imp = new Map();
    for (const r of raws) {
      if (!r || typeof r !== 'object') continue;
      const key = slugify(r.id || r.name);
      if (key && ['critical', 'important', 'optional'].includes(r.importance)) imp.set(key, r.importance);
    }
    const oldById = new Map((career.skills || []).map((n) => [n.id, n]));
    for (const n of nodes) {
      const old = oldById.get(n.id);
      n.importance = imp.get(n.id) || (old && old.importance) || 'important';
      n.roleNote = n.usedInPaper || (old && old.roleNote) || '';
      delete n.usedInPaper;
      delete n.forNewPaper;
    }
    return nodes;
  };
  let nodes = await attempt();
  if (isDegenerate(nodes)) {
    try {
      const retry = await attempt();
      if (!isDegenerate(retry)) nodes = retry;
    } catch (_) {}
  }
  repairGraph(nodes);
  return nodes;
}

function careerPayload(career, ctx) {
  const states = careerStates(career, ctx);
  return { ...career, states, stats: careerStats(career, states) };
}

app.get('/api/careers', (req, res) => {
  const ctx = careerCtx();
  const careers = store.listCareers().map((c) => {
    const states = careerStates(c, ctx);
    return { id: c.id, name: c.name, primary: !!c.primary, createdAt: c.createdAt, skillCount: (c.skills || []).length, jdCount: (c.jds || []).length, resume: c.resume ? { name: c.resume.name, skillCount: (c.resume.skills || []).length } : null, stats: careerStats(c, states) };
  });
  res.json({ careers });
});

app.post('/api/careers', (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) throw httpError(400, 'Career name is required');
  res.json(store.createCareer(name));
});

app.patch('/api/careers/:id', (req, res) => {
  const c = store.getCareer(req.params.id);
  if (!c) throw httpError(404, 'Career not found');
  const { name, primary } = req.body || {};
  if (name) c.name = String(name).trim().slice(0, 80);
  if (primary === true) {
    for (const other of store.listCareers()) {
      if (other.id !== c.id && other.primary) { other.primary = false; store.saveCareer(other); }
    }
    c.primary = true;
  }
  store.saveCareer(c);
  res.json(careerPayload(c, careerCtx()));
});

app.delete('/api/careers/:id', (req, res) => {
  store.deleteCareer(req.params.id);
  res.json({ ok: true });
});

// Generate the skills graph for a career trajectory (LLM, run as a background job client-side).
app.post(
  '/api/careers/:id/generate',
  wrap(async (req, res) => {
    const c = store.getCareer(req.params.id);
    if (!c) throw httpError(404, 'Career not found');
    c.skills = await runCareerGraph(c, () => careerSkillsMessages(c.name));
    c.generatedAt = Date.now();
    store.saveCareer(c);
    res.json(careerPayload(c, careerCtx()));
  })
);

// Upload a resume INTO a career (each career keeps its own tailored resume):
// PDF/MD/TXT -> markdown -> LLM extracts evidenced skills -> career.resume.
app.post(
  '/api/careers/:id/resume',
  upload.single('file'),
  wrap(async (req, res) => {
    const c = store.getCareer(req.params.id);
    if (!c) throw httpError(404, 'Career not found');
    if (!req.file) throw httpError(400, 'No file uploaded');
    const name = req.file.originalname || 'resume';
    const ext = path.extname(name).toLowerCase();
    let markdown;
    if (ext === '.pdf') {
      markdown = (await pdfToMarkdown(req.file.buffer, name)).markdown;
    } else if (['.md', '.markdown', '.txt'].includes(ext)) {
      markdown = req.file.buffer.toString('utf8');
    } else {
      throw httpError(400, 'Unsupported file type "' + ext + '". Upload a .pdf, .md or .txt file.');
    }
    if (markdown.replace(/\s/g, '').length < 80) throw httpError(400, 'That resume looks empty.');

    store.saveCareerResumeFiles(c.id, name, req.file.buffer, markdown);
    c.resume = { name, addedAt: Date.now(), skills: [] };
    try {
      const settings = store.getSettings();
      const parsed = parseModelJSON(await callLLM(settings, resumeSkillsMessages(markdown), { json: true, maxTokens: 4000 }));
      c.resume.skills = (Array.isArray(parsed.skills) ? parsed.skills : []).map((s) => String(s).slice(0, 80)).slice(0, 200);
    } catch (e) {
      store.saveCareer(c); // keep the converted resume even if extraction failed
      throw httpError(502, 'Resume saved, but skill extraction failed: ' + e.message);
    }
    store.saveCareer(c);
    res.json(careerPayload(c, careerCtx()));
  })
);

// Open the career's resume: raw file (pdf/txt/md) and converted markdown.
app.get('/api/careers/:id/resume/file', (req, res) => {
  const p = store.careerResumeRawPath(req.params.id);
  if (!p) throw httpError(404, 'No resume uploaded for this career');
  res.sendFile(p);
});
app.get('/api/careers/:id/resume/markdown', (req, res) => {
  const md = store.readCareerResumeMarkdown(req.params.id);
  if (!md) throw httpError(404, 'No resume uploaded for this career');
  res.json({ markdown: md });
});

// Upload a job description (file or pasted text) and merge its required skills into the career graph.
app.post(
  '/api/careers/:id/jd',
  upload.single('file'),
  wrap(async (req, res) => {
    const c = store.getCareer(req.params.id);
    if (!c) throw httpError(404, 'Career not found');

    let markdown, jdName;
    if (req.file) {
      jdName = req.file.originalname || 'job description';
      const ext = path.extname(jdName).toLowerCase();
      if (ext === '.pdf') markdown = (await pdfToMarkdown(req.file.buffer, jdName)).markdown;
      else if (['.md', '.markdown', '.txt'].includes(ext)) markdown = req.file.buffer.toString('utf8');
      else throw httpError(400, 'Unsupported file type "' + ext + '". Upload a .pdf, .md or .txt file.');
    } else {
      markdown = String((req.body || {}).text || '');
      jdName = String((req.body || {}).name || 'Pasted job description').slice(0, 120);
    }
    if (markdown.replace(/\s/g, '').length < 80) throw httpError(400, 'That job description looks empty.');

    const jdId = store.id();
    store.saveJdMarkdown(c.id, jdId, markdown);

    c.skills = await runCareerGraph(c, () => careerJdMergeMessages(c.skills, markdown, jdName));
    c.jds = [...(c.jds || []), { id: jdId, name: jdName.replace(/\.(pdf|md|markdown|txt)$/i, ''), addedAt: Date.now() }];
    store.saveCareer(c);
    res.json(careerPayload(c, careerCtx()));
  })
);

// GET /api/careers/:id LAST so it never shadows /api/careers/resume.
app.get('/api/careers/:id', (req, res) => {
  const c = store.getCareer(req.params.id);
  if (!c) throw httpError(404, 'Career not found');
  res.json(careerPayload(c, careerCtx()));
});

app.get('/dc', (req, res) => res.redirect('/')); // legacy dashboard retired (archive/PaperQuest.dc.html)

// ---------------- static (production build) ----------------

const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ---------------- errors ----------------

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const msg = err.message || 'Server error';
  if (status >= 500) console.error(err);
  res.status(status).json({ error: msg });
});

if (require.main === module) app.listen(PORT, () => {
  console.log(`PaperQuest API on http://localhost:${PORT}`);
  if (fs.existsSync(DIST)) console.log(`Serving built app at http://localhost:${PORT}`);
  else console.log('Dev mode: run the web app via "npm run dev" and open http://localhost:5173');
});

module.exports = app;
