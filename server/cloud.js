// Netlify adapter: encrypted, per-workspace durable snapshots and long-running jobs.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const workspace = require('./workspace');
const { validateBackup, canImport, MAX_TEXT } = require('./backup');
const auth = require('./auth').createAuth();

const COOKIE = '__Host-paperquest';
const TOKEN = /^[a-f0-9]{64}$/;
const MAX_BYTES = 24 * 1024 * 1024;
const JOB_TTL = 15 * 60 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const namespace = (token) => hash('paperquest-workspace:' + token);
const cookie = (token) => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000`;
function tokenFrom(req) {
  const found = (req.headers.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  const token = found?.slice(COOKIE.length + 1);
  return TOKEN.test(token || '') ? token : null;
}
function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if ((origin && origin !== new URL(req.url).origin) || req.headers.get('sec-fetch-site') === 'cross-site') {
    throw fail(403, 'Please use PaperQuest from its own website.');
  }
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
    'Netlify-CDN-Cache-Control': 'no-store', 'Vary': 'Cookie',
    'X-Content-Type-Options': 'nosniff', ...extra
  } });
}
function seal(value, token) {
  const key = crypto.createHash('sha256').update('paperquest-encryption:' + token).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const zipped = zlib.gzipSync(Buffer.from(JSON.stringify(value)));
  const body = Buffer.concat([cipher.update(zipped), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
function unseal(text, token) {
  const bytes = Buffer.from(text, 'base64');
  const key = crypto.createHash('sha256').update('paperquest-encryption:' + token).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const zipped = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  return JSON.parse(zlib.gunzipSync(zipped, { maxOutputLength: MAX_BYTES * 2 }).toString());
}
function snapshot(directory) {
  const files = {};
  let size = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
        const data = fs.readFileSync(file);
        size += data.length;
        if (size > MAX_BYTES) throw fail(413, 'This workspace has reached its 24 MB storage limit. Delete unused papers to make space.');
        files[path.relative(directory, file).split(path.sep).join('/')] = { data: data.toString('base64'), mtime: fs.statSync(file).mtimeMs };
      }
    }
  }
  walk(directory);
  return files;
}
function hydrate(directory, files) {
  for (const [name, value] of Object.entries(files)) {
    if (name.split('/').some((part) => !part || part === '.' || part === '..') || name.includes('\\') || name.includes(':')) throw fail(500, 'Invalid workspace data.');
    const target = path.resolve(directory, name);
    if (!target.startsWith(path.resolve(directory) + path.sep)) throw fail(500, 'Invalid workspace path.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(value.data, 'base64'));
    if (Number.isFinite(value.mtime)) fs.utimesSync(target, new Date(value.mtime), new Date(value.mtime));
  }
}
const sameFile = (a, b) => a?.data === b?.data;
async function saveChanges(blobs, key, token, original, current, validateLatest) {
  const changed = [...new Set([...Object.keys(original), ...Object.keys(current)])].filter((name) => !sameFile(original[name], current[name]));
  if (!changed.length) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await blobs.getWithMetadata(key, { type: 'text', consistency: 'strong' });
    const merged = latest ? unseal(latest.data, token) : {};
    if (validateLatest) validateLatest(merged);
    for (const name of changed) {
      if (!sameFile(merged[name], original[name]) && !sameFile(merged[name], current[name])) throw fail(409, 'This item changed in another request. Reload it before trying again.');
      if (current[name]) merged[name] = current[name];
      else delete merged[name];
    }
    const size = Object.values(merged).reduce((sum, f) => sum + Buffer.byteLength(f.data, 'base64'), 0);
    if (size > MAX_BYTES) throw fail(413, 'Workspace storage limit reached (24 MB).');
    const result = await blobs.set(key, seal(merged, token), latest ? { onlyIfMatch: latest.etag } : { onlyIfNew: true });
    if (result.modified) return;
  }
  throw fail(409, 'Your workspace is busy. Please try again.');
}

let expressHandler;
async function execute(blobs, token, event) {
  const key = namespace(token) + '/workspace';
  const saved = await blobs.get(key, { type: 'text', consistency: 'strong' });
  const original = saved ? unseal(saved, token) : {};
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paperquest-cloud-'));
  try {
    hydrate(directory, original);
    return await workspace.run(directory, async () => {
      require('./store').init();
      expressHandler ||= require('serverless-http')(require('./index'), { binary: ['application/pdf', 'application/octet-stream'] });
      const result = await expressHandler(event, {});
      // Persist partial progress even if a provider failed (e.g. converted resumes).
      await saveChanges(blobs, key, token, original, snapshot(directory));
      return result;
    });
  } finally {
    // directory was created by mkdtemp above, never derived from user input.
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
async function eventFrom(req) {
  const url = new URL(req.url);
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > 4.2 * 1024 * 1024) throw fail(413, 'Uploads on the hosted app must be 4 MB or smaller.');
  return {
    httpMethod: req.method, path: url.pathname, rawUrl: req.url,
    headers: Object.fromEntries([...req.headers].filter(([name]) => !['cookie', 'authorization'].includes(name))),
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: body.toString('base64'), isBase64Encoded: true,
    requestContext: { identity: {} }
  };
}
function resultResponse(result) {
  const headers = new Headers(result.headers || {});
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Netlify-CDN-Cache-Control', 'no-store');
  headers.set('Vary', 'Cookie');
  headers.delete('content-length');
  return new Response(result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body, { status: result.statusCode, headers });
}
function slow(event) {
  const p = event.path;
  return (event.httpMethod === 'POST' && (/\/(analyze|lesson|ask|generate|resume|jd|papers)$/.test(p) || p === '/api/settings/test')) ||
    (event.httpMethod === 'GET' && (/\/references$/.test(p) || p.startsWith('/api/s2/')));
}
async function queue(blobs, token, event, dispatch) {
  const key = namespace(token) + '/job';
  const previous = await blobs.getWithMetadata(key, { type: 'text', consistency: 'strong' });
  if (previous) {
    const job = unseal(previous.data, token);
    if (['pending', 'running'].includes(job.status) && Date.now() - job.createdAt < JOB_TTL) throw fail(409, 'An AI or upload task is already running in this workspace. Wait for it to finish.');
  }
  const job = { id: crypto.randomBytes(16).toString('hex'), status: 'pending', createdAt: Date.now(), event };
  const written = await blobs.set(key, seal(job, token), previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true });
  if (!written.modified) throw fail(409, 'Another task just started. Please wait for it to finish.');
  try {
    await dispatch(token, job.id);
  } catch {
    await blobs.set(key, seal({ ...job, event: undefined, status: 'failed', error: 'Could not start the background worker. Please retry.' }, token), { onlyIfMatch: written.etag });
    throw fail(503, 'Could not start the background worker. Please retry.');
  }
  return json({ jobId: job.id }, 202);
}
async function importBackup(req, blobs, token) {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw fail(413, 'Backup chunks must be smaller than 2 MB.');
  let body;
  try { body = JSON.parse(raw); } catch { throw fail(400, 'Invalid backup request.'); }
  if (!/^[a-f0-9]{32}$/.test(body.id || '')) throw fail(400, 'Invalid import ID.');
  const key = namespace(token) + '/import';
  const previous = await blobs.getWithMetadata(key, { type: 'text', consistency: 'strong' });
  let state = previous ? unseal(previous.data, token) : null;
  const options = previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true };
  if (body.action === 'start') {
    if (!Number.isInteger(body.size) || body.size < 1 || body.size > MAX_TEXT || !TOKEN.test(body.digest || '')) throw fail(400, 'Invalid backup size or checksum.');
    state = { id: body.id, size: body.size, digest: body.digest, chunks: [], received: 0, createdAt: Date.now() };
  } else {
    if (!state || state.id !== body.id || Date.now() - state.createdAt > 30 * 60 * 1000) throw fail(409, 'The import expired. Choose the backup and start again.');
    if (body.action === 'finish' && state.done) return json(state.summary);
    if (state.done) throw fail(409, 'This import is already complete.');
    if (body.action === 'part') {
      if (!Number.isInteger(body.index) || typeof body.chunk !== 'string' || !body.chunk.length || body.chunk.length > 1024 * 1024) throw fail(400, 'Invalid backup chunk.');
      if (body.index < state.chunks.length && state.chunks[body.index] === body.chunk) return json({ received: state.received });
      if (body.index !== state.chunks.length) throw fail(409, 'Backup chunks arrived out of order.');
      state.received += Buffer.byteLength(body.chunk);
      if (state.received > state.size) throw fail(413, 'Backup exceeds its declared size.');
      state.chunks.push(body.chunk);
    } else if (body.action === 'finish') {
      const text = state.chunks.join('');
      if (state.received !== state.size || hash(text) !== state.digest) throw fail(400, 'The backup is incomplete or damaged.');
      let backup;
      try { backup = JSON.parse(text); } catch { throw fail(400, 'Invalid backup JSON.'); }
      const { files, ...summary } = validateBackup(backup);
      const workspaceKey = namespace(token) + '/workspace';
      const saved = await blobs.get(workspaceKey, { type: 'text', consistency: 'strong' });
      const current = saved ? unseal(saved, token) : {};
      if (!canImport(current, files)) throw fail(409, 'Import needs an empty workspace so existing projects and progress stay safe.');
      await saveChanges(blobs, workspaceKey, token, current, { ...current, ...files }, latest => {
        if (!canImport(latest, files)) throw fail(409, 'Your workspace changed during import. Existing projects and progress were preserved.');
      });
      state = { id: state.id, createdAt: state.createdAt, done: true, summary };
    } else throw fail(400, 'Unknown import action.');
  }
  const result = await blobs.set(key, seal(state, token), options);
  if (!result.modified) throw fail(409, 'Another import request changed this upload. Please retry.');
  return json(state.summary || { received: state.received });
}
async function apiHandler(req, blobs, dispatch, accounts = auth) {
  try {
    sameOrigin(req);
    const url = new URL(req.url);
    let token = tokenFrom(req);
    if (url.pathname === '/api/session' && req.method === 'GET') {
      token ||= crypto.randomBytes(32).toString('hex');
      return json({ cloud: true, workspace: namespace(token).slice(0, 12), maxUploadMB: 4, ...accounts.info(req, token) }, 200, { 'Set-Cookie': cookie(token) });
    }
    const authResponse = await accounts.handle(req, blobs, token);
    if (authResponse) return authResponse;
    if (!token) throw fail(401, 'Reload the page to open your private workspace.');
    if (url.pathname === '/api/session/import' && req.method === 'POST') return await importBackup(req, blobs, token);
    if (url.pathname === '/api/session/recovery' && req.method === 'POST') {
      await blobs.set(namespace(token) + '/workspace', seal({}, token), { onlyIfNew: true });
      return json({ key: token });
    }
    if (url.pathname === '/api/session/restore' && req.method === 'POST') {
      const { key } = await req.json();
      if (!TOKEN.test(key || '') || !(await blobs.get(namespace(key) + '/workspace', { type: 'text', consistency: 'strong' }))) throw fail(404, 'No saved workspace matches that recovery key.');
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(key) });
    }
    if (url.pathname.startsWith('/api/jobs/') && req.method === 'GET') {
      const saved = await blobs.get(namespace(token) + '/job', { type: 'text', consistency: 'strong' });
      const job = saved ? unseal(saved, token) : null;
      if (!job || job.id !== url.pathname.slice('/api/jobs/'.length)) throw fail(404, 'Task not found.');
      if (job.status === 'done') return resultResponse(job.result);
      if (job.status === 'failed') throw fail(job.code || 500, job.error || 'Task failed.');
      if (Date.now() - job.createdAt > JOB_TTL) throw fail(504, 'The task timed out. Reload to check saved progress before retrying.');
      return json({ jobId: job.id }, 202);
    }
    if (!url.pathname.startsWith('/api/')) throw fail(404, 'Not found.');
    const event = await eventFrom(req);
    // Cached lessons stay synchronous and never invoke an AI provider.
    if (event.httpMethod === 'POST' && /\/lesson$/.test(event.path)) {
      const body = JSON.parse(Buffer.from(event.body, 'base64').toString() || '{}');
      const projectId = event.path.split('/')[3];
      const stored = await blobs.get(namespace(token) + '/workspace', { type: 'text', consistency: 'strong' });
      const files = stored ? unseal(stored, token) : {};
      if (!body.regenerate && files[`projects/${workspace.segment(projectId)}/lessons/${workspace.segment(body.conceptId)}.json`]) return resultResponse(await execute(blobs, token, event));
    }
    if (slow(event)) return await queue(blobs, token, event, dispatch);
    return resultResponse(await execute(blobs, token, event));
  } catch (error) {
    return json({ error: error.status ? error.message : 'Unable to load or save this workspace. Please retry.' }, error.status || 500);
  }
}
async function backgroundHandler(req, blobs) {
  sameOrigin(req);
  const token = tokenFrom(req);
  if (!token) return;
  const { jobId } = await req.json();
  const key = namespace(token) + '/job';
  const saved = await blobs.getWithMetadata(key, { type: 'text', consistency: 'strong' });
  if (!saved) return;
  const job = unseal(saved.data, token);
  if (job.id !== jobId || job.status !== 'pending' || Date.now() - job.createdAt > JOB_TTL) return;
  const claimed = await blobs.set(key, seal({ ...job, status: 'running' }, token), { onlyIfMatch: saved.etag });
  if (!claimed.modified) return;
  let completed;
  try {
    completed = { ...job, event: undefined, status: 'done', result: await execute(blobs, token, job.event) };
  } catch (error) {
    completed = { ...job, event: undefined, status: 'failed', code: error.status || 500, error: error.status ? error.message : 'The background task failed. Please retry.' };
  }
  await blobs.set(key, seal(completed, token), { onlyIfMatch: claimed.etag });
}

module.exports = { apiHandler, backgroundHandler, cookie, namespace, seal, unseal, execute, saveChanges, snapshot, hydrate, json };
