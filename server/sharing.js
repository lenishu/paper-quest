const crypto = require('node:crypto');
const { computeStates } = require('./graphUtil');
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const KEY = /^PQJ-[a-f0-9]{64}$/;
const COOKIE = '__Host-paperquest-judge';
const helpers = () => require('./cloud');
const secret = () => {
  const value = process.env.PAPERQUEST_AUTH_SECRET || '';
  if (!/^[a-f0-9]{64}$/.test(value)) throw fail(503, 'Sharing is not configured.');
  return 'judge-sharing:' + value;
};
const readJSON = (files, name, fallback = {}) => files[name] ? JSON.parse(Buffer.from(files[name].data, 'base64').toString()) : fallback;
// Explicit projection: never share workspace tokens, provider keys, notes, chats,
// resumes, uploaded documents, recovery backups, or arbitrary saved fields.
function graphSnapshot(files) {
  const mastery = readJSON(files, 'mastery.json');
  const projectNode = n => ({ id: n.id, name: n.name, level: n.level, tier: n.tier, depth: n.depth,
    branch: n.branch || 'other', core: !!n.core, blurb: n.blurb || '', prereqs: Array.isArray(n.prereqs) ? n.prereqs : [] });
  const projects = Object.keys(files).filter(n => /^projects\/[^/]+\/project.json$/.test(n)).map(name => {
    const p = readJSON(files, name);
    const nodes = (p.nodes || []).map(projectNode);
    return { id: p.id, name: p.name, field: p.field || '', paperCount: (p.papers || []).length,
      nodes, states: computeStates(nodes, new Set(Object.keys(mastery))) };
  });
  const careers = Object.keys(files).filter(n => /^careers\/[^/]+\/career.json$/.test(n)).map(name => {
    const c = readJSON(files, name);
    const nodes = (c.skills || []).map(projectNode);
    return { id: c.id, name: c.name, nodes, states: computeStates(nodes, new Set(Object.keys(mastery))) };
  });
  return { projects, careers, createdAt: Date.now() };
}
async function manage(req, blobs, token) {
  const { json, namespace, seal, unseal } = helpers();
  const owner = namespace(token), recordKey = owner + '/judge-access';
  const saved = await blobs.get(recordKey);
  const old = saved ? unseal(saved, secret()) : null;
  if (req.method === 'GET') return json({ active: !!old && !old.revoked && old.expires > Date.now(), expires: old?.expires,
    projects: old?.snapshot.projects.length || 0, createdAt: old?.snapshot.createdAt });
  if (req.method === 'DELETE') {
    if (old) await blobs.set(recordKey, seal({ ...old, revoked: true }, secret()));
    return json({ revoked: true });
  }
  if (req.method !== 'POST') throw fail(405, 'Method not allowed.');
  const workspace = await blobs.get(owner + '/workspace');
  const snapshot = graphSnapshot(workspace ? unseal(workspace, token) : {});
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
