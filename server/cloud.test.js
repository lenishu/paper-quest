const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NETLIFY = 'true';
const cloud = require('./cloud');

class MemoryBlobs {
  constructor() { this.items = new Map(); this.revision = 0; }
  async get(key) { return this.items.get(key)?.data ?? null; }
  async getWithMetadata(key) { return this.items.get(key) ?? null; }
  async set(key, data, options = {}) {
    const previous = this.items.get(key);
    if ((options.onlyIfNew && previous) || (options.onlyIfMatch && previous?.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = String(++this.revision);
    this.items.set(key, { data, etag });
    return { modified: true, etag };
  }
}
const token = () => crypto.randomBytes(32).toString('hex');
function request(path, key, method = 'GET', body, extra = {}) {
  return new Request('https://paperquest.test' + path, {
    method, headers: { ...(key ? { cookie: cloud.cookie(key).split(';')[0] } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
const api = (blobs, req, dispatch = async () => {}) => cloud.apiHandler(req, blobs, dispatch);

async function importFile(blobs, key, backup, mutate = (part) => part) {
  const text = JSON.stringify(backup), id = crypto.randomBytes(16).toString('hex');
  const send = (body) => api(blobs, request('/api/session/import', key, 'POST', { id, ...body }));
  assert.equal((await send({ action: 'start', size: Buffer.byteLength(text), digest: crypto.createHash('sha256').update(text).digest('hex') })).status, 200);
  const part = { action: 'part', index: 0, chunk: mutate(text) };
  assert.equal((await send(part)).status, 200);
  assert.equal((await send(part)).status, 200); // Retry does not append twice.
  return send({ action: 'finish' });
}
const entry = (value) => ({ data: Buffer.from(JSON.stringify(value)).toString('base64'), mtime: 1 });
const sampleBackup = () => ({ format: 'paperquest-projects-v1', files: {
  'projects/old/project.json': entry({ id: 'old', name: 'Previous project', papers: [], nodes: [] }),
  'projects/old/lessons/vectors.json': entry({ title: 'Saved lesson' }),
  'profile.json': entry({ xp: 42 })
} });

test('backup import restores saved projects and lessons privately, with repeat-safe uploads', async () => {
  const blobs = new MemoryBlobs(), key = token(), backup = sampleBackup();
  const result = await importFile(blobs, key, backup);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).lessons, 1);
  const saved = cloud.unseal(await blobs.get(cloud.namespace(key) + '/workspace'), key);
  assert.equal(saved['projects/old/lessons/vectors.json'].data, backup.files['projects/old/lessons/vectors.json'].data);
  assert.equal((await (await api(blobs, request('/api/projects', key))).json())[0].name, 'Previous project');
  assert.deepEqual(await (await api(blobs, request('/api/projects', token()))).json(), []);
  assert.equal((await importFile(blobs, key, backup)).status, 200);
});

test('backup import rejects corruption, traversal, credentials and overwrites without altering projects', async () => {
  const blobs = new MemoryBlobs(), key = token();
  assert.equal((await importFile(blobs, key, sampleBackup(), (s) => s.replace('paperquest', 'xaperquest'))).status, 400);
  for (const name of ['settings.json', 'projects/old/../../settings.json', 'projects/old/../project.json']) {
    const backup = sampleBackup(); backup.files[name] = entry({ secret: 'excluded' });
    assert.equal((await importFile(blobs, key, backup)).status, 400);
  }
  await api(blobs, request('/api/projects', key, 'POST', { name: 'Keep this' }));
  assert.equal((await importFile(blobs, key, sampleBackup())).status, 409);
  assert.equal((await (await api(blobs, request('/api/projects', key))).json())[0].name, 'Keep this');
});

test('cloud sessions reject cross-origin access and recover only an existing workspace', async () => {
  const blobs = new MemoryBlobs();
  assert.equal((await api(blobs, request('/api/projects'))).status, 401);
  assert.equal((await api(blobs, request('/api/session', null, 'GET', null, { origin: 'https://evil.test' }))).status, 403);
  const session = await api(blobs, request('/api/session'));
  assert.match(session.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
  const key = session.headers.get('set-cookie').split('=')[1].split(';')[0];
  await api(blobs, request('/api/projects', key, 'POST', { name: 'Private' }));
  const restored = await api(blobs, request('/api/session/restore', token(), 'POST', { key }));
  assert.equal(restored.status, 200);
  assert.ok(restored.headers.get('set-cookie').includes(key));
  assert.equal((await api(blobs, request('/api/session/restore', key, 'POST', { key: token() }))).status, 404);
});

test('separate users retain isolated projects and API keys across fresh requests', async () => {
  const blobs = new MemoryBlobs();
  const alice = token(), bob = token();
  const made = await api(blobs, request('/api/projects', alice, 'POST', { name: 'Alice only' }));
  assert.equal(made.status, 200);
  const project = await made.json();
  await api(blobs, request('/api/settings', alice, 'PUT', { connections: [{ id: 'a', provider: 'openai', key: 'test-secret' }], activeId: 'a' }));
  const a = await (await api(blobs, request('/api/projects', alice))).json();
  const b = await (await api(blobs, request('/api/projects', bob))).json();
  assert.equal(a[0].name, 'Alice only');
  assert.deepEqual(b, []);
  assert.equal((await api(blobs, request('/api/projects/' + project.id, bob))).status, 404);
  assert.equal((await (await api(blobs, request('/api/settings', alice))).json()).connections[0].key, 'test-secret');
  assert.ok(!JSON.stringify([...blobs.items]).includes('test-secret'));
  assert.throws(() => cloud.unseal(blobs.items.get(cloud.namespace(alice) + '/workspace').data, bob));
  assert.equal((await api(blobs, request('/api/projects/' + project.id + '/lesson/chat?conceptId=..%2F..%2Fsettings', alice))).status, 400);
});

test('concurrent saves merge different files but reject conflicting edits', async () => {
  const blobs = new MemoryBlobs(), key = token();
  const file = (data) => ({ data: Buffer.from(data).toString('base64'), mtime: Date.now() });
  await Promise.all([
    cloud.saveChanges(blobs, 'state', key, {}, { 'a.json': file('a') }),
    cloud.saveChanges(blobs, 'state', key, {}, { 'b.json': file('b') })
  ]);
  const before = cloud.unseal(await blobs.get('state'), key);
  assert.equal(Object.keys(before).length, 2);
  await cloud.saveChanges(blobs, 'state', key, before, { ...before, 'a.json': file('first') });
  await assert.rejects(cloud.saveChanges(blobs, 'state', key, before, { ...before, 'a.json': file('second') }), { status: 409 });
});

test('background jobs persist, enforce ownership, claim once, and return provider errors', async () => {
  const blobs = new MemoryBlobs(), key = token();
  const dispatched = [];
  const queued = await api(blobs, request('/api/settings/test', key, 'POST', {}), async (...args) => dispatched.push(args));
  assert.equal(queued.status, 202);
  const { jobId } = await queued.json();
  assert.equal(dispatched.length, 1);
  assert.equal((await api(blobs, request('/api/settings/test', key, 'POST', {}))).status, 409);
  assert.equal((await api(blobs, request('/api/jobs/' + jobId, token()))).status, 404);
  const work = () => cloud.backgroundHandler(request('/.netlify/functions/worker-background', key, 'POST', { jobId }), blobs);
  await Promise.all([work(), work()]);
  const result = await api(blobs, request('/api/jobs/' + jobId, key));
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /No active API connection/);
});

test('demo and cached lesson work without a provider or background job', async () => {
  const blobs = new MemoryBlobs(), key = token();
  const made = await api(blobs, request('/api/projects/demo', key, 'POST', {}));
  const project = await made.json();
  const result = await api(blobs, request('/api/projects/' + project.id + '/lesson', key, 'POST', { conceptId: 'linear_algebra' }), async () => assert.fail('cached lesson dispatched'));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).cached, true);
});

test('multipart Markdown uploads complete through the background worker', async () => {
  const blobs = new MemoryBlobs(), key = token();
  const project = await (await api(blobs, request('/api/projects', key, 'POST', { name: 'Upload test' }))).json();
  const form = new FormData();
  form.append('file', new Blob(['# A study\n\n' + 'A research paper about learning mathematics. '.repeat(30)], { type: 'text/markdown' }), 'study.md');
  const req = new Request('https://paperquest.test/api/projects/' + project.id + '/papers', { method: 'POST', headers: { cookie: cloud.cookie(key).split(';')[0] }, body: form });
  const queued = await api(blobs, req);
  assert.equal(queued.status, 202);
  const { jobId } = await queued.json();
  await cloud.backgroundHandler(request('/.netlify/functions/worker-background', key, 'POST', { jobId }), blobs);
  const result = await api(blobs, request('/api/jobs/' + jobId, key));
  assert.equal(result.status, 200, await result.clone().text());
  const saved = await (await api(blobs, request('/api/projects/' + project.id, key))).json();
  assert.equal(saved.project.papers.length, 1);
});

test('PDF uploads use the upgraded parser and preserve the original download', async () => {
  const lines = ['A research study about vectors and matrices.', 'This paper introduces linear algebra concepts for students.', 'We compare coordinate systems and vector addition.', 'Our results demonstrate that matrix multiplication represents a linear transformation.', 'These foundations help readers understand the complete method.'];
  const stream = 'BT /F1 12 Tf 50 750 Td ' + lines.map((line, i) => (i ? '0 -20 Td ' : '') + '(' + line + ') Tj').join('\n') + ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => String(n).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blobs = new MemoryBlobs(), key = token();
  const project = await (await api(blobs, request('/api/projects', key, 'POST', { name: 'PDF test' }))).json();
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'vectors.pdf');
  const queued = await api(blobs, new Request('https://paperquest.test/api/projects/' + project.id + '/papers', { method: 'POST', headers: { cookie: cloud.cookie(key).split(';')[0] }, body: form }));
  const { jobId } = await queued.json();
  await cloud.backgroundHandler(request('/.netlify/functions/worker-background', key, 'POST', { jobId }), blobs);
  const result = await api(blobs, request('/api/jobs/' + jobId, key));
  assert.equal(result.status, 200, await result.clone().text());
  const saved = await (await api(blobs, request('/api/projects/' + project.id, key))).json();
  const paper = saved.project.papers[0];
  assert.equal(paper.pages, 1);
  const raw = await api(blobs, request(`/api/projects/${project.id}/papers/${paper.id}/pdf`, key));
  assert.equal(raw.status, 200);
  assert.equal(Buffer.from(await raw.arrayBuffer()).toString(), pdf);
});
