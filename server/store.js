// File-based storage. Everything lives in ./data — plain JSON and .md files you can open.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { dataDir, segment } = require('./workspace');
// Folders whose names aren't ids (e.g. an editor's hidden .obsidian) are skipped, not fatal.
const isSegment = (name) => { try { segment(name); return true; } catch { return false; } };
const projectsDir = () => path.join(dataDir(), 'projects');
const SCHEMA_VERSION = 1;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function init() {
  ensureDir(dataDir());
  ensureDir(projectsDir());
}

function readJSON(file, fallback) {
  try {
    let raw = fs.readFileSync(file, 'utf8');
    raw = raw.replace(/ +$/g, '');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Atomic write: temp file, fsync, then rename over the target.
function writeJSON(file, obj) {
  ensureDir(path.dirname(file));
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  const data = JSON.stringify(obj, null, 2);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  renameWithRetry(tmp, file);
}

// On Windows, antivirus and the search indexer briefly lock a file that was just
// written, so renaming over it can fail with EPERM/EBUSY/EACCES. Retry for up to
// ~1.5 s (as graceful-fs does) instead of failing the save.
function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return fs.renameSync(from, to);
    } catch (e) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || attempt >= 20) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(10 * (attempt + 1), 100));
    }
  }
}

function appendLine(file, obj) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8');
}

function readLines(file, limit) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const slice = limit ? lines.slice(-limit) : lines;
  return slice.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function id() {
  return crypto.randomBytes(6).toString('hex');
}

const SETTINGS_FILE = () => path.join(dataDir(), 'settings.json');
const PROFILE_FILE = () => path.join(dataDir(), 'profile.json');
const MASTERY_FILE = () => path.join(dataDir(), 'mastery.json');

// Provider registry — shared by the server (llm dispatch: `kind` + `baseUrl`)
// and the client (Settings UI: name/keyHint/getKey). OpenAI-compatible vendors
// (Groq, Zhipu GLM, custom) all use the `openai` kind with a different baseUrl.
const PROVIDERS = {
  gemini:    { name: 'Google Gemini',      kind: 'gemini',    baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash',        keyHint: 'AQ.… or AIza…', getKey: 'https://aistudio.google.com/apikey' },
  anthropic: { name: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com',                 defaultModel: 'claude-sonnet-5',         keyHint: 'sk-ant-…', getKey: 'https://console.anthropic.com/settings/keys' },
  openai:    { name: 'OpenAI',             kind: 'openai',    baseUrl: 'https://api.openai.com/v1',                 defaultModel: 'gpt-4o-mini',             keyHint: 'sk-…',     getKey: 'https://platform.openai.com/api-keys' },
  groq:      { name: 'Groq',               kind: 'openai',    baseUrl: 'https://api.groq.com/openai/v1',            defaultModel: 'llama-3.3-70b-versatile', keyHint: 'gsk_…',    getKey: 'https://console.groq.com/keys' },
  glm:       { name: 'Zhipu GLM',          kind: 'openai',    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',      defaultModel: 'glm-4-flash',             keyHint: 'id.secret', getKey: 'https://open.bigmodel.cn/usercenter/apikeys' },
  openrouter: { name: 'OpenRouter',        kind: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',             defaultModel: 'google/gemma-4-31b-it:free', keyHint: 'sk-or-v1-…', getKey: 'https://openrouter.ai/keys', reasoning: true },
  openai_compatible: { name: 'OpenAI-compatible (custom)', kind: 'openai', baseUrl: '', defaultModel: '', keyHint: 'sk-…', getKey: '', custom: true }
};

const DEFAULT_MODELS = Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.defaultModel]));

const REASONING_EFFORTS = ['low', 'medium', 'high'];

function providerMeta(provider) { return PROVIDERS[provider] || PROVIDERS.openai; }

// A "connection" is one saved credential the user can activate.
function sanitizeConnection(c) {
  const provider = PROVIDERS[c && c.provider] ? c.provider : 'openai';
  return {
    id: (c && c.id) || id(),
    provider,
    label: String((c && c.label) || PROVIDERS[provider].name).slice(0, 60),
    key: String((c && c.key) || ''),
    model: String((c && c.model) || '').slice(0, 120),
    baseUrl: String((c && c.baseUrl) || '').slice(0, 200),
    // Reasoning ('thinking') tokens — currently honoured by the openrouter kind.
    reasoning: !!(c && c.reasoning),
    reasoningEffort: REASONING_EFFORTS.includes(c && c.reasoningEffort) ? c.reasoningEffort : ''
  };
}

// Normalize any on-disk shape (legacy {provider,keys,models} or new {connections}) to the new one.
function migrateSettings(raw) {
  const s = raw || {};
  if (Array.isArray(s.connections)) {
    const connections = s.connections.map(sanitizeConnection);
    let activeId = connections.some((c) => c.id === s.activeId) ? s.activeId : ((connections[0] || {}).id || null);
    return { connections, activeId, s2Key: String(s.s2Key || '') };
  }
  const legacyKeys = s.keys || {};
  const legacyModels = s.models || {};
  const legacyProvider = s.provider || 'gemini';
  const connections = [];
  for (const prov of ['gemini', 'anthropic', 'openai']) {
    if ((legacyKeys[prov] && String(legacyKeys[prov]).trim()) || prov === legacyProvider) {
      connections.push(sanitizeConnection({ provider: prov, key: legacyKeys[prov] || '', model: legacyModels[prov] || '' }));
    }
  }
  if (!connections.length) connections.push(sanitizeConnection({ provider: legacyProvider }));
  const active = connections.find((c) => c.provider === legacyProvider) || connections[0];
  return { connections, activeId: active ? active.id : null, s2Key: String(s.s2Key || '') };
}

// Shared Gemini keys held by the server (PAPERQUEST_SHARED_GEMINI_KEYS, comma or
// whitespace separated). They never reach a browser or a workspace file: settings
// expose a keyless virtual connection and llm.js cycles through the pool.
const SHARED_ID = 'shared-gemini';
function sharedGeminiKeys() {
  return [...new Set(String(process.env.PAPERQUEST_SHARED_GEMINI_KEYS || '').split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean))];
}
function sharedConnection() {
  if (!sharedGeminiKeys().length) return null;
  return { id: SHARED_ID, provider: 'gemini', label: 'Shared Gemini (free)', key: '', model: '', baseUrl: '', reasoning: false, reasoningEffort: '', shared: true };
}

function getSettings() {
  const raw = readJSON(SETTINGS_FILE(), null);
  const s = migrateSettings(raw);
  const shared = sharedConnection();
  if (!shared) return s;
  // A new workspace starts on the shared key; the placeholder empty connection is dropped.
  const own = raw ? s.connections.filter((c) => c.id !== SHARED_ID) : [];
  const picked = own.find((c) => c.id === raw?.activeId);
  // The shared key stays the default until the user activates a connection that has a key.
  const activeId = picked && picked.key.trim() ? picked.id : SHARED_ID;
  return { connections: [shared, ...own], activeId, s2Key: s.s2Key };
}

function saveSettings(patch) {
  const cur = getSettings();
  const p = patch || {};
  const shared = sharedConnection();
  const own = (Array.isArray(p.connections) ? p.connections : cur.connections)
    .filter((c) => c && !c.shared && c.id !== SHARED_ID)
    .map(sanitizeConnection);
  let activeId = p.activeId !== undefined ? p.activeId : cur.activeId;
  if (!(shared && activeId === SHARED_ID) && !own.some((c) => c.id === activeId)) activeId = shared ? SHARED_ID : (own[0] || {}).id || null;
  const s2Key = p.s2Key !== undefined ? String(p.s2Key || '') : cur.s2Key;
  writeJSON(SETTINGS_FILE(), { connections: own, activeId, s2Key });
  return getSettings();
}

function activeConnection(settings) {
  const s = settings && settings.connections ? settings : getSettings();
  if (!s.connections || !s.connections.length) return null;
  return s.connections.find((c) => c.id === s.activeId) || s.connections[0] || null;
}

function activeModel(settings) {
  const c = activeConnection(settings);
  if (!c) return DEFAULT_MODELS.gemini;
  return (c.model && c.model.trim()) || providerMeta(c.provider).defaultModel;
}

function getProfile() { return readJSON(PROFILE_FILE(), { xp: 0 }); }
function saveProfile(p) { writeJSON(PROFILE_FILE(), p); }
function getMastery() { return readJSON(MASTERY_FILE(), {}); }
function saveMastery(m) { writeJSON(MASTERY_FILE(), m); }

function projectDir(pid) { return path.join(projectsDir(), segment(pid)); }
function projectFile(pid) { return path.join(projectDir(pid), 'project.json'); }
function papersDir(pid) { return path.join(projectDir(pid), 'papers'); }
function lessonsDir(pid) { return path.join(projectDir(pid), 'lessons'); }
function eventsFile(pid) { return path.join(projectDir(pid), 'events.jsonl'); }
function auditFile(pid) { return path.join(projectDir(pid), 'audit.jsonl'); }
function memoryFile(pid) { return path.join(projectDir(pid), 'project.md'); }
function snapshotFile(pid) { return path.join(projectDir(pid), 'nodes.prev.json'); }

function listProjectIds() {
  if (!fs.existsSync(projectsDir())) return [];
  return fs.readdirSync(projectsDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && isSegment(d.name) && fs.existsSync(projectFile(d.name)))
    .map((d) => d.name);
}

// Older analyses stored UTF-8 text double-encoded as Latin-1 ("Î¸" instead of "θ").
// Detect the tell-tale lead-byte pairs and reverse the damage; leave clean strings alone.
const MOJI = /[\u00c2\u00c3\u00ce\u00cf\u00e2][\u0080-\u00bf]/;
function fixMojibake(s) {
  if (typeof s !== 'string' || !MOJI.test(s)) return s;
  try {
    const repaired = Buffer.from(s, 'latin1').toString('utf8');
    return repaired.includes('�') ? s : repaired;
  } catch {
    return s;
  }
}

function migrate(p) {
  if (!p) return p;
  if (!p.schemaVersion) p.schemaVersion = SCHEMA_VERSION;
  if (!Array.isArray(p.papers)) p.papers = [];
  if (!Array.isArray(p.nodes)) p.nodes = [];
  p.kind = projectKind(p.kind);
  for (const n of p.nodes) {
    n.name = fixMojibake(n.name);
    n.blurb = fixMojibake(n.blurb);
    if (n.usage) for (const k of Object.keys(n.usage)) n.usage[k] = fixMojibake(n.usage[k]);
  }
  for (const paper of p.papers) {
    paper.title = fixMojibake(paper.title);
    paper.name = fixMojibake(paper.name);
  }
  return p;
}

function getProject(pid) { return migrate(readJSON(projectFile(pid), null)); }

function listProjects() {
  return listProjectIds().map(getProject).filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function saveProject(p) {
  p.schemaVersion = SCHEMA_VERSION;
  p.updatedAt = Date.now();
  writeJSON(projectFile(p.id), p);
  return p;
}

// What a project holds. Every kind grows the same concept map; the kind tunes wording
// in the UI and tells the analysis prompt what sort of material it is reading.
const PROJECT_KINDS = ['paper', 'class', 'course', 'club', 'hackathon', 'notes'];
const projectKind = (kind) => (PROJECT_KINDS.includes(kind) ? kind : 'paper');

function createProject(name, kind) {
  const p = {
    id: id(),
    schemaVersion: SCHEMA_VERSION,
    name: (name || 'Untitled project').trim().slice(0, 80),
    kind: projectKind(kind),
    createdAt: Date.now(),
    papers: [],
    nodes: []
  };
  ensureDir(projectDir(p.id));
  ensureDir(papersDir(p.id));
  ensureDir(lessonsDir(p.id));
  return saveProject(p);
}

function deleteProject(pid) {
  const dir = projectDir(pid);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function savePaperFiles(pid, paperId, originalName, buffer, markdown) {
  ensureDir(papersDir(pid));
  const ext = path.extname(originalName || '').toLowerCase() || '.bin';
  const rawPath = path.join(papersDir(pid), segment(paperId) + ext);
  const mdPath = path.join(papersDir(pid), segment(paperId) + '.md');
  if (ext !== '.md') fs.writeFileSync(rawPath, buffer);
  fs.writeFileSync(mdPath, markdown, 'utf8');
  return { rawPath, mdPath };
}

function readPaperMarkdown(pid, paperId) {
  const mdPath = path.join(papersDir(pid), segment(paperId) + '.md');
  if (!fs.existsSync(mdPath)) return null;
  return fs.readFileSync(mdPath, 'utf8');
}

function deletePaperFiles(pid, paperId) {
  const dir = papersDir(pid);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(paperId + '.')) fs.rmSync(path.join(dir, f), { force: true });
  }
}

// AI summaries sit next to the paper (papers/<paperId>.summary.json), so deleting the
// paper removes them; the project cheatsheet is one file per project.
function readPaperSummary(pid, paperId) { return readJSON(path.join(papersDir(pid), segment(paperId) + '.summary.json'), null); }
function savePaperSummary(pid, paperId, summary) { writeJSON(path.join(papersDir(pid), segment(paperId) + '.summary.json'), summary); }
function readCheatsheet(pid) { return readJSON(path.join(projectDir(pid), 'cheatsheet.json'), null); }
function saveCheatsheet(pid, sheet) { writeJSON(path.join(projectDir(pid), 'cheatsheet.json'), sheet); }

function readLesson(pid, conceptId) { return readJSON(path.join(lessonsDir(pid), segment(conceptId) + '.json'), null); }
function saveLesson(pid, conceptId, lesson) { writeJSON(path.join(lessonsDir(pid), segment(conceptId) + '.json'), lesson); }

// Which concepts already have a lesson on disk: { conceptId: savedAtMs }. Stats
// only (no JSON parsing) — the UI uses it to show "saved" and skip the AI path.
function listLessons(pid) {
  const dir = lessonsDir(pid);
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.endsWith('.chat.json')) continue;
    try { out[f.slice(0, -5)] = fs.statSync(path.join(dir, f)).mtimeMs; } catch (_) {}
  }
  return out;
}

// Per-lesson Q&A thread. Kept in its OWN file so regenerating the lesson never
// wipes the learner's questions. Entries:
// { id, ts, mode:'ask'|'source', raw, question (model's paraphrase), answer, sources[], reasoningDetails }
const MAX_CHAT_TURNS = 40;
function lessonChatPath(pid, conceptId) { return path.join(lessonsDir(pid), segment(conceptId) + '.chat.json'); }
function readLessonChat(pid, conceptId) {
  const c = readJSON(lessonChatPath(pid, conceptId), null);
  return Array.isArray(c) ? c : [];
}
function saveLessonChat(pid, conceptId, chat) {
  const trimmed = (Array.isArray(chat) ? chat : []).slice(-MAX_CHAT_TURNS);
  ensureDir(lessonsDir(pid));
  writeJSON(lessonChatPath(pid, conceptId), trimmed);
  return trimmed;
}
function clearLessonChat(pid, conceptId) {
  try { fs.rmSync(lessonChatPath(pid, conceptId), { force: true }); } catch (_) {}
  return [];
}

function logEvent(pid, type, data) {
  try { appendLine(eventsFile(pid), { t: Date.now(), type, ...(data || {}) }); } catch (_) {}
}
function readEvents(pid, limit = 200) { return readLines(eventsFile(pid), limit).reverse(); }

function logAudit(pid, entry) {
  try { appendLine(auditFile(pid), { t: Date.now(), ...(entry || {}) }); } catch (_) {}
}
function readAudit(pid, limit = 100) { return readLines(auditFile(pid), limit).reverse(); }

function saveNodesSnapshot(pid, nodes) { writeJSON(snapshotFile(pid), { savedAt: Date.now(), nodes }); }
function readNodesSnapshot(pid) { return readJSON(snapshotFile(pid), null); }

function readMemory(pid) {
  const f = memoryFile(pid);
  if (!fs.existsSync(f)) return '';
  try { return fs.readFileSync(f, 'utf8'); } catch { return ''; }
}
function writeMemory(pid, text) {
  ensureDir(projectDir(pid));
  fs.writeFileSync(memoryFile(pid), String(text || ''), 'utf8');
}

// ---------- per-node notes (user's own notes on a concept) ----------
function notesFile(pid) { return path.join(projectDir(pid), 'notes.json'); }
function readNodeNotes(pid) { return readJSON(notesFile(pid), {}); }
function writeNodeNote(pid, nodeId, text) {
  const all = readNodeNotes(pid);
  const t = String(text || '').slice(0, 4000);
  if (t.trim()) all[nodeId] = { text: t, updatedAt: Date.now() };
  else delete all[nodeId];
  ensureDir(projectDir(pid));
  writeJSON(notesFile(pid), all);
  return all;
}

// ---------- bookmarks (global "to review" list) ----------
const BOOKMARKS_FILE = () => path.join(dataDir(), 'bookmarks.json');
function getBookmarks() { return readJSON(BOOKMARKS_FILE(), {}); }
function saveBookmarks(b) { writeJSON(BOOKMARKS_FILE(), b); }

// path to a paper's original uploaded file (e.g. the .pdf), if we kept one
function paperRawPath(pid, paperId) {
  const dir = papersDir(pid);
  if (!fs.existsSync(dir)) return null;
  for (const fn of fs.readdirSync(dir)) {
    if (fn.startsWith(paperId + '.') && !fn.endsWith('.md')) return path.join(dir, fn);
  }
  return null;
}

// ---------------- careers ----------------

const careersDir = () => path.join(dataDir(), 'careers');
const careerDir = (cid) => path.join(careersDir(), segment(cid));
const careerFile = (cid) => path.join(careerDir(cid), 'career.json');

function listCareers() {
  ensureDir(careersDir());
  return fs
    .readdirSync(careersDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && isSegment(d.name))
    .map((d) => readJSON(careerFile(d.name), null))
    .filter(Boolean)
    .sort((a, b) => (b.primary === true) - (a.primary === true) || (a.createdAt || 0) - (b.createdAt || 0));
}

function getCareer(cid) {
  return readJSON(careerFile(cid), null);
}

function saveCareer(c) {
  ensureDir(careerDir(c.id));
  writeJSON(careerFile(c.id), c);
  return c;
}

function createCareer(name) {
  const c = { id: id(), name: String(name || 'Career').trim().slice(0, 80), primary: listCareers().length === 0, createdAt: Date.now(), skills: [], jds: [] };
  return saveCareer(c);
}

// Guided-tour progress for this workspace.
const ONBOARDING_FILE = () => path.join(dataDir(), 'onboarding.json');
function getOnboarding() { return readJSON(ONBOARDING_FILE(), { step: 0, dismissed: false, completed: false }); }
function saveOnboarding(state) { writeJSON(ONBOARDING_FILE(), state); return state; }

// Last AI career suggestions (a file, so listCareers never mistakes it for a career).
function readCareerSuggestions() { return readJSON(path.join(careersDir(), 'suggestions.json'), null); }
function saveCareerSuggestions(value) { writeJSON(path.join(careersDir(), 'suggestions.json'), value); }

function deleteCareer(cid) {
  fs.rmSync(careerDir(cid), { recursive: true, force: true });
}

function saveCareerResumeFiles(cid, originalName, buffer, markdown) {
  ensureDir(careerDir(cid));
  const ext = path.extname(originalName || '').toLowerCase() || '.bin';
  if (ext !== '.md') fs.writeFileSync(path.join(careerDir(cid), 'resume' + ext), buffer);
  fs.writeFileSync(path.join(careerDir(cid), 'resume.md'), markdown, 'utf8');
}

function readCareerResumeMarkdown(cid) {
  const p = path.join(careerDir(cid), 'resume.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function careerResumeRawPath(cid) {
  for (const ext of ['.pdf', '.txt', '.markdown', '.md']) {
    const p = path.join(careerDir(cid), 'resume' + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function saveJdMarkdown(cid, jdId, markdown) {
  ensureDir(path.join(careerDir(cid), 'jds'));
  fs.writeFileSync(path.join(careerDir(cid), 'jds', segment(jdId) + '.md'), markdown, 'utf8');
}

module.exports = {
  listCareers, getCareer, saveCareer, createCareer, deleteCareer, readCareerSuggestions, saveCareerSuggestions,
  getOnboarding, saveOnboarding,
  saveCareerResumeFiles, readCareerResumeMarkdown, careerResumeRawPath, saveJdMarkdown,
  init, id, SCHEMA_VERSION, DEFAULT_MODELS, PROVIDERS, providerMeta,
  getSettings, saveSettings, activeModel, activeConnection, sharedGeminiKeys, SHARED_ID,
  getProfile, saveProfile, getMastery, saveMastery,
  listProjects, getProject, saveProject, createProject, deleteProject,
  PROJECT_KINDS, projectKind,
  savePaperFiles, readPaperMarkdown, deletePaperFiles, readLesson, saveLesson,
  readPaperSummary, savePaperSummary, readCheatsheet, saveCheatsheet,
  readLessonChat, saveLessonChat, clearLessonChat, listLessons,
  logEvent, readEvents, logAudit, readAudit,
  saveNodesSnapshot, readNodesSnapshot, readMemory, writeMemory,
  readNodeNotes, writeNodeNote,
  getBookmarks, saveBookmarks, paperRawPath
};
