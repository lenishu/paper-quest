const crypto = require('node:crypto');
const { computeStates } = require('./graphUtil');
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const KEY = /^PQJ-[a-f0-9]{64}$/;
const COOKIE = '__Host-paperquest-judge';
const { PROJECT_KINDS: KINDS } = require('./store');
const helpers = () => require('./cloud');
const secret = () => {
  const value = process.env.PAPERQUEST_AUTH_SECRET || '';
  if (!/^[a-f0-9]{64}$/.test(value)) throw fail(503, 'Sharing is not configured.');
  return 'judge-sharing:' + value;
};
const readJSON = (files, name, fallback = {}) => {
  if (!files[name]) return fallback;
  try { return JSON.parse(Buffer.from(files[name].data, 'base64').toString()); } catch { return fallback; }
};
const text = (value, max) => String(value || '').slice(0, max);
const list = value => (Array.isArray(value) ? value : []);

// Explicit projection: never share workspace tokens, provider keys, personal notes,
// chats, resumes (only match counts), uploaded documents (only arXiv links), recovery
// backups, or arbitrary saved fields. Shared: maps, progress, saved refreshers with
// their quizzes, AI summaries and cheatsheets, and career comparisons.
const projectNode = n => ({ id: n.id, name: n.name, level: n.level, tier: n.tier, depth: n.depth,
  branch: n.branch || 'other', core: !!n.core, blurb: n.blurb || '', prereqs: list(n.prereqs) });
const careerNode = n => ({ ...projectNode(n), importance: ['critical', 'important', 'optional'].includes(n.importance) ? n.importance : 'important',
  roleNote: text(n.roleNote, 400), concepts: list(n.concepts).map(String).slice(0, 6) });
const quizItem = q => ({ q: text(q && q.q, 600), options: list(q && q.options).slice(0, 4).map(o => text(o, 300)),
  answer: Number(q && q.answer) || 0, why: text(q && q.why, 600) });

function projectSnapshot(files, name, masteredIds) {
  const p = readJSON(files, name);
  const dir = name.slice(0, -'project.json'.length);
  const nodes = list(p.nodes).map(projectNode);
  const ids = new Set(nodes.map(n => n.id));
  const lessons = {};
  for (const file of Object.keys(files)) {
    // lessons/<conceptId>.json only; *.chat.json threads never match the id pattern
    const m = file.startsWith(dir + 'lessons/') && /^([A-Za-z0-9_-]+)\.json$/.exec(file.slice(dir.length + 8));
    if (!m || !ids.has(m[1])) continue;
    const lesson = readJSON(files, file, null);
    if (lesson && lesson.lesson) lessons[m[1]] = { lesson: text(lesson.lesson, 20000), quiz: list(lesson.quiz).slice(0, 8).map(quizItem) };
  }
  const sheet = readJSON(files, dir + 'cheatsheet.json', null);
  const papers = list(p.papers).map(paper => {
    const summary = /^[A-Za-z0-9_-]+$/.test(paper.id || '') ? readJSON(files, dir + 'papers/' + paper.id + '.summary.json', null) : null;
    return { id: text(paper.id, 40), title: text(paper.title || paper.name || 'Paper', 200), pages: Number(paper.pages) || 0,
      pdfUrl: String(paper.pdfUrl || '').startsWith('https://arxiv.org/') ? paper.pdfUrl : '',
      summary: summary && summary.markdown ? text(summary.markdown, 12000) : '' };
  });
  return { id: p.id, name: p.name, kind: KINDS.includes(p.kind) ? p.kind : 'paper', field: p.field || '',
    paperCount: papers.length, papers, nodes, states: computeStates(nodes, masteredIds), lessons,
    cheatsheet: sheet && sheet.markdown ? text(sheet.markdown, 12000) : '' };
}

// Career payloads come from the live /api/careers/:id route (states, comparisons);
// without one, fall back to the raw file and prerequisite states.
function careerSnapshot(c, masteredIds) {
  const nodes = list(c.skills).map(careerNode);
  const resume = c.resume && typeof c.resume === 'object' && !Array.isArray(c.resume) ? c.resume : null;
  const knowledge = {};
  for (const [id, k] of Object.entries(c.knowledge || {})) knowledge[id] = { id, name: text(k && k.name, 90), state: k && k.state === 'mastered' ? 'mastered' : 'studying' };
  return { id: c.id, name: c.name, field: text(c.field, 60), nodes, states: c.states || computeStates(nodes, masteredIds),
    stats: c.stats || null, knowledge,
    jds: list(c.jds).map(j => ({ name: text(j && j.name, 120), match: j && j.match ? { total: j.match.total, known: j.match.known,
      learning: j.match.learning, pct: j.match.pct, missing: list(j.match.missing).slice(0, 25) } : null })),
    resume: resume ? { skillCount: list(resume.skills).length, matched: list(resume.matched).length, gaps: list(resume.gaps).slice(0, 25) } : null };
}

function dashboardSnapshot(d) {
  if (!d || typeof d !== 'object') return null;
  const pr = d.profile || {};
  return {
    profile: { level: pr.level || 0, title: text(pr.title, 40), xp: pr.xp || 0, nextLevelXp: pr.nextLevelXp || 0, progress: pr.progress || 0 },
    stats: d.stats || {}, knowledge: d.knowledge || {}, streak: d.streak || 0,
    heat: list(d.heat).map(h => ({ date: text(h.date, 10), count: Number(h.count) || 0 })),
    branches: list(d.branches).slice(0, 8).map(b => ({ name: text(b.name, 50), pct: b.pct || 0, total: b.total || 0 })),
    xpWeek: d.xpWeek || null, weeklyGoal: d.weeklyGoal || 300,
    badges: list(d.badges).map(b => ({ id: b.id, icon: b.icon, name: text(b.name, 40), desc: text(b.desc, 100), earned: !!b.earned })),
    quests: d.quests ? { reward: d.quests.reward || 0, items: list(d.quests.items).map(q => ({ label: text(q.label, 80), cur: q.cur || 0, goal: q.goal || 0, done: !!q.done })) } : null
  };
}

function graphSnapshot(files, live = {}) {
  const mastery = readJSON(files, 'mastery.json');
  const masteredIds = new Set(Object.keys(mastery));
  const projects = Object.keys(files).filter(n => /^projects\/[^/]+\/project.json$/.test(n)).map(name => projectSnapshot(files, name, masteredIds));
  const raw = Object.keys(files).filter(n => /^careers\/[^/]+\/career.json$/.test(n)).map(name => readJSON(files, name));
  const liveById = new Map(list(live.careers).map(c => [c.id, c]));
  const careers = raw.map(c => careerSnapshot(liveById.get(c.id) || c, masteredIds));
  return { projects, careers, dashboard: dashboardSnapshot(live.dashboard), createdAt: Date.now() };
}

// Run one read-only API route inside the owner's workspace (same numbers they see).
async function readRoute(blobs, token, route) {
  try {
    const result = await helpers().execute(blobs, token, { httpMethod: 'GET', path: route, rawUrl: 'https://paperquest.local' + route,
      headers: {}, queryStringParameters: {}, body: '', isBase64Encoded: true, requestContext: { identity: {} } });
    if (result.statusCode !== 200) return null;
    return JSON.parse(result.isBase64Encoded ? Buffer.from(result.body, 'base64').toString() : result.body);
  } catch { return null; }
}

async function manage(req, blobs, token) {
  const { json, namespace, seal, unseal } = helpers();
  const owner = namespace(token), recordKey = owner + '/judge-access';
  const saved = await blobs.get(recordKey);
  const old = saved ? unseal(saved, secret()) : null;
  if (req.method === 'GET') return json({ active: !!old && !old.revoked && old.expires > Date.now(), expires: old?.expires,
    projects: old?.snapshot.projects.length || 0, careers: old?.snapshot.careers?.length || 0, createdAt: old?.snapshot.createdAt });
  if (req.method === 'DELETE') {
    if (old) await blobs.set(recordKey, seal({ ...old, revoked: true }, secret()));
    return json({ revoked: true });
  }
  if (req.method !== 'POST') throw fail(405, 'Method not allowed.');
  const workspace = await blobs.get(owner + '/workspace');
  const files = workspace ? unseal(workspace, token) : {};
  const careerIds = Object.keys(files).map(n => /^careers\/([A-Za-z0-9_-]+)\/career.json$/.exec(n)?.[1]).filter(Boolean);
  const careers = [];
  for (const id of careerIds) {
    const payload = await readRoute(blobs, token, '/api/careers/' + id);
    if (payload) careers.push(payload);
  }
  const snapshot = graphSnapshot(files, { dashboard: await readRoute(blobs, token, '/api/dashboard'), careers });
  if (!snapshot.projects.length && !snapshot.careers.length) throw fail(400, 'Add or restore projects before creating judge access.');
  const key = 'PQJ-' + crypto.randomBytes(32).toString('hex');
  const keyHash = hash(key), expires = Date.now() + 30 * 86400000;
  await blobs.set('judge-index/' + keyHash, owner, { onlyIfNew: true });
  await blobs.set(recordKey, seal({ keyHash, snapshot, expires, revoked: false }, secret()));
  return json({ key, expires, projects: snapshot.projects.length, careers: snapshot.careers.length });
}
async function shared(blobs, key) {
  if (!KEY.test(key || '')) throw fail(401, 'This access key is invalid, expired, or revoked.');
  const keyHash = hash(key), owner = await blobs.get('judge-index/' + keyHash);
  const saved = owner && await blobs.get(owner + '/judge-access');
  const share = saved ? helpers().unseal(saved, secret()) : null;
  if (!share || share.keyHash !== keyHash || share.revoked || share.expires <= Date.now()) throw fail(401, 'This access key is invalid, expired, or revoked.');
  return share;
}
async function handle(req, blobs) {
  const { json } = helpers();
  const route = new URL(req.url).pathname;
  if (!route.startsWith('/api/judge/')) return null;
  const cookie = key => `${COOKIE}=${key}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${key ? 86400 : 0}`;
  if (route === '/api/judge/enter' && req.method === 'POST') {
    const raw = await req.text();
    if (raw.length > 200) throw fail(400, 'Enter a valid access key.');
    let key; try { key = JSON.parse(raw).key; } catch { throw fail(400, 'Enter a valid access key.'); }
    const share = await shared(blobs, key);
    return json({ ...share.snapshot, expires: share.expires }, 200, { 'Set-Cookie': cookie(key) });
  }
  if (route === '/api/judge/exit' && req.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('') });
  if (route === '/api/judge/graphs' && req.method === 'GET') {
    const key = (req.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    const share = await shared(blobs, key);
    return json({ ...share.snapshot, expires: share.expires });
  }
  throw fail(405, 'Judge access is read-only.');
}
module.exports = { graphSnapshot, manage, handle };
