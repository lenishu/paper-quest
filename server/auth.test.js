const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PAPERQUEST_HOSTED = 'true';
process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
process.env.PAPERQUEST_AUTH_SECRET = crypto.randomBytes(32).toString('hex');
process.env.PAPERQUEST_DEVELOPER_EMAILS = 'owner@gmail.com';
const cloud = require('./cloud');
const { createAuth, BACKUP_KEY } = require('./auth');
const auth = createAuth({ verifyGoogle: async credential => JSON.parse(credential) });
class MemoryBlobs {
  constructor() { this.items = new Map(); this.revision = 0; }
  async get(key) { return this.items.get(key)?.data ?? null; }
  async getWithMetadata(key) { return this.items.get(key) ?? null; }
  async set(key, data, options = {}) {
    const prev = this.items.get(key);
    if ((options.onlyIfNew && prev) || (options.onlyIfMatch && prev?.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = String(++this.revision);
    this.items.set(key, { data, etag });
    return { modified: true, etag };
  }
}
function browser(blobs, accounts = auth) {
  const cookies = new Map();
  async function call(path, method = 'GET', body, headers = {}) {
    const req = new Request('https://paperquest.test/api' + path, { method,
      headers: { cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = await cloud.apiHandler(req, blobs, async () => {}, accounts);
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0], index = pair.indexOf('=');
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  return { call, cookies };
}
const identity = { sub: 'google-owner', email: 'owner@gmail.com', email_verified: true, name: 'Owner' };
async function login(client, user = identity) {
  await client.call('/session');
  const { nonce } = await (await client.call('/auth/google/start', 'POST')).json();
  const credential = JSON.stringify({ ...user, nonce });
  const response = await client.call('/auth/google', 'POST', { credential });
  assert.equal(response.status, 200, await response.clone().text());
  return credential;
}
const entry = data => ({ data: Buffer.from(JSON.stringify(data)).toString('base64'), mtime: 1 });
const backup = { format: 'paperquest-projects-v1', files: {
  'projects/old/project.json': entry({ id: 'old', name: 'Recovered project', nodes: [], papers: [] }),
  'projects/old/lessons/vectors.json': entry({ title: 'Saved vectors lesson' }),
  'profile.json': entry({ xp: 120 })
} };

test('Google signup keeps guest projects, returns to them on a new device, and signout isolates data', async () => {
  const blobs = new MemoryBlobs(), first = browser(blobs), second = browser(blobs);
  await first.call('/session');
  await first.call('/projects', 'POST', { name: 'Guest work' });
  const key = first.cookies.get('__Host-paperquest');
  await login(first);
  assert.equal(first.cookies.get('__Host-paperquest'), key);
  await login(second);
  assert.equal(second.cookies.get('__Host-paperquest'), key);
  assert.equal((await (await second.call('/projects')).json())[0].name, 'Guest work');
  const session = await (await second.call('/session')).json();
  assert.equal(session.account.developer, true);
  assert.equal(session.account.email, identity.email);
  const stored = JSON.stringify([...blobs.items]);
  assert.ok(!stored.includes(key));
  await second.call('/auth/logout', 'POST');
  assert.equal((await (await second.call('/session')).json()).account, null);
  assert.deepEqual(await (await second.call('/projects')).json(), []);
  assert.equal((await second.call('/developer/projects')).status, 403);
});

test('sign-in rejects replay, wrong nonce, unverified email, invalid tokens and cross-site requests', async () => {
  const client = browser(new MemoryBlobs());
  const credential = await login(client);
  assert.equal((await client.call('/auth/google', 'POST', { credential })).status, 401);
  for (const overrides of [{ nonce: 'wrong' }, { email_verified: false }]) {
    const { nonce } = await (await client.call('/auth/google/start', 'POST')).json();
    const response = await client.call('/auth/google', 'POST', { credential: JSON.stringify({ ...identity, nonce, ...overrides }) });
    assert.equal(response.status, 401);
  }
  assert.equal((await client.call('/auth/google', 'POST', { credential: 'invalid' })).status, 401);
  assert.equal((await client.call('/auth/google/start', 'POST', {}, { origin: 'https://evil.test' })).status, 403);
});

test('a different Google account cannot claim an already linked workspace', async () => {
  const blobs = new MemoryBlobs(), owner = browser(blobs), other = browser(blobs);
  await login(owner);
  await owner.call('/projects', 'POST', { name: 'Owner only' });
  other.cookies.set('__Host-paperquest', owner.cookies.get('__Host-paperquest'));
  await login(other, { ...identity, sub: 'other', email: 'other@gmail.com' });
  assert.notEqual(other.cookies.get('__Host-paperquest'), owner.cookies.get('__Host-paperquest'));
  assert.deepEqual(await (await other.call('/projects')).json(), []);
});

test('logout revokes a copied account cookie without signing out another device or losing data', async () => {
  const blobs = new MemoryBlobs(), first = browser(blobs), second = browser(blobs), replay = browser(blobs);
  await login(first);
  await first.call('/projects', 'POST', { name: 'Keep after logout' });
  await login(second);
  for (const [key, value] of first.cookies) replay.cookies.set(key, value);
  const oldSession = first.cookies.get('__Host-paperquest-account');
  assert.equal((await first.call('/auth/logout', 'POST')).status, 200);
  assert.equal((await (await replay.call('/session')).json()).account, null);
  assert.equal((await replay.call('/developer/projects')).status, 403);
  assert.equal((await replay.call('/developer/projects', 'POST')).status, 403);
  assert.equal((await (await second.call('/session')).json()).account.email, identity.email);
  await login(first);
  assert.notEqual(first.cookies.get('__Host-paperquest-account'), oldSession);
  assert.equal((await (await first.call('/projects')).json())[0].name, 'Keep after logout');
});

test('account and developer checks fail closed when revocation storage is unavailable', async () => {
  const blobs = new MemoryBlobs(), client = browser(blobs);
  await login(client);
  const get = blobs.get.bind(blobs);
  const set = blobs.set.bind(blobs);
  blobs.get = async (key, options) => {
    if (key.startsWith('auth/revoked/')) throw new Error('Storage unavailable');
    return get(key, options);
  };
  blobs.set = async (key, data, options) => {
    if (key.startsWith('auth/revoked/')) throw new Error('Storage unavailable');
    return set(key, data, options);
  };
  assert.equal((await client.call('/session')).status, 500);
  assert.equal((await client.call('/developer/projects')).status, 500);
  const response = await client.call('/auth/logout', 'POST');
  assert.equal(response.status, 500);
  assert.deepEqual(response.headers.getSetCookie(), []);
});

test('logout after a recovery-key workspace switch still revokes the original account session', async () => {
  const blobs = new MemoryBlobs(), client = browser(blobs), guest = browser(blobs), replay = browser(blobs);
  await login(client);
  for (const [key, value] of client.cookies) replay.cookies.set(key, value);
  await guest.call('/session');
  const { key } = await (await guest.call('/session/recovery', 'POST')).json();
  assert.equal((await client.call('/session/restore', 'POST', { key })).status, 200);
  assert.equal((await client.call('/auth/logout', 'POST')).status, 200);
  assert.equal((await (await replay.call('/session')).json()).account, null);
  assert.equal((await replay.call('/developer/projects')).status, 403);
});

test('concurrent submissions consume a Google sign-in challenge only once', async () => {
  const blobs = new MemoryBlobs(), client = browser(blobs);
  await client.call('/session');
  const { nonce } = await (await client.call('/auth/google/start', 'POST')).json();
  const credential = JSON.stringify({ ...identity, nonce });
  const get = blobs.getWithMetadata.bind(blobs);
  let reads = 0, release;
  const bothRead = new Promise(resolve => { release = resolve; });
  blobs.getWithMetadata = async (key, options) => {
    const result = await get(key, options);
    if (key.includes('/auth-challenge/')) {
      if (++reads === 2) release();
      await bothRead;
    }
    return result;
  };
  const results = await Promise.all([
    client.call('/auth/google', 'POST', { credential }),
    client.call('/auth/google', 'POST', { credential })
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
});

test('a challenge requires its browser cookie, expires, and is invalidated by logout', async () => {
  const blobs = new MemoryBlobs(), client = browser(blobs), other = browser(blobs);
  await client.call('/session');
  const token = client.cookies.get('__Host-paperquest');
  other.cookies.set('__Host-paperquest', token);
  const { nonce } = await (await client.call('/auth/google/start', 'POST')).json();
  const credential = JSON.stringify({ ...identity, nonce });
  assert.equal((await other.call('/auth/google', 'POST', { credential })).status, 401);
  const challengeKey = cloud.namespace(token) + '/auth-challenge/' + crypto.createHash('sha256').update(nonce).digest('hex');
  const challenge = JSON.parse(await blobs.get(challengeKey));
  await blobs.set(challengeKey, JSON.stringify({ ...challenge, expires: 1 }));
  assert.equal((await client.call('/auth/google', 'POST', { credential })).status, 401);
  const fresh = await (await client.call('/auth/google/start', 'POST')).json();
  other.cookies.set('__Host-paperquest-google', fresh.nonce);
  await client.call('/auth/logout', 'POST');
  assert.equal((await other.call('/auth/google', 'POST', { credential: JSON.stringify({ ...identity, nonce: fresh.nonce }) })).status, 401);
});

test('separate browsers sharing a workspace can start sign-in without replacing each other’s challenge', async () => {
  const blobs = new MemoryBlobs(), first = browser(blobs), second = browser(blobs);
  await first.call('/session');
  second.cookies.set('__Host-paperquest', first.cookies.get('__Host-paperquest'));
  const a = await (await first.call('/auth/google/start', 'POST')).json();
  const b = await (await second.call('/auth/google/start', 'POST')).json();
  assert.notEqual(a.nonce, b.nonce);
  assert.equal((await first.call('/auth/google', 'POST', { credential: JSON.stringify({ ...identity, nonce: a.nonce }) })).status, 200);
  assert.equal((await second.call('/auth/google', 'POST', { credential: JSON.stringify({ ...identity, nonce: b.nonce }) })).status, 200);
});

test('returning sign-in preserves both workspaces and uses the subject even when email changes', async () => {
  const blobs = new MemoryBlobs(), first = browser(blobs), returning = browser(blobs);
  await login(first);
  await first.call('/projects', 'POST', { name: 'Account project' });
  await returning.call('/session');
  await returning.call('/projects', 'POST', { name: 'Unlinked guest project' });
  const guestKey = returning.cookies.get('__Host-paperquest');
  const guestPath = cloud.namespace(guestKey) + '/workspace';
  const before = await blobs.get(guestPath);
  await login(returning, { ...identity, email: 'updated@example.com' });
  assert.equal(returning.cookies.get('__Host-paperquest'), first.cookies.get('__Host-paperquest'));
  assert.equal((await (await returning.call('/projects')).json())[0].name, 'Account project');
  assert.equal(await blobs.get(guestPath), before);
  assert.equal((await returning.call('/developer/projects')).status, 403);
  const guest = browser(blobs);
  await guest.call('/session');
  assert.equal((await guest.call('/session/restore', 'POST', { key: guestKey })).status, 200);
  assert.equal((await (await guest.call('/projects')).json())[0].name, 'Unlinked guest project');
});

test('sign-in rejects malformed claims and sets secure, bounded cookies', async () => {
  const blobs = new MemoryBlobs(), client = browser(blobs);
  await client.call('/session');
  const start = await client.call('/auth/google/start', 'POST');
  const { nonce } = await start.json();
  for (const patch of [{ sub: 123 }, { email: 123 }, { email_verified: 'true' }, { nonce: undefined }]) {
    assert.equal((await client.call('/auth/google', 'POST', { credential: JSON.stringify({ ...identity, nonce, ...patch }) })).status, 401);
  }
  const signedIn = await client.call('/auth/google', 'POST', { credential: JSON.stringify({ ...identity, nonce }) });
  assert.equal(signedIn.status, 200);
  for (const value of [...start.headers.getSetCookie(), ...signedIn.headers.getSetCookie()]) {
    assert.match(value, /^__Host-/);
    for (const flag of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=']) assert.ok(value.includes(flag));
    assert.ok(!value.includes('Domain='));
  }
});

test('developer backup requires account authentication, restores saved lessons, and preserves existing work', async () => {
  const blobs = new MemoryBlobs(), owner = browser(blobs), visitor = browser(blobs);
  await blobs.set(BACKUP_KEY, cloud.seal(backup, 'developer-backup:' + process.env.PAPERQUEST_AUTH_SECRET));
  await login(owner);
  await login(visitor, { ...identity, sub: 'visitor', email: 'visitor@gmail.com' });
  assert.equal((await visitor.call('/developer/projects')).status, 403);
  assert.equal((await visitor.call('/developer/projects', 'POST')).status, 403);
  const recoveryOnly = browser(blobs);
  recoveryOnly.cookies.set('__Host-paperquest', owner.cookies.get('__Host-paperquest'));
  assert.equal((await recoveryOnly.call('/developer/projects', 'POST')).status, 403);
  await owner.call('/projects', 'POST', { name: 'Newer project' });
  const summary = await (await owner.call('/developer/projects')).json();
  assert.equal(summary.projects, 1);
  assert.equal(summary.lessons, 1);
  assert.equal((await owner.call('/developer/projects', 'POST')).status, 200);
  assert.equal((await owner.call('/developer/projects', 'POST')).status, 200);
  const recoveredProjects = await (await owner.call('/projects')).json();
  assert.deepEqual(recoveredProjects.map(p => p.name).sort(), ['Newer project', 'Recovered project']);
  const token = owner.cookies.get('__Host-paperquest');
  const restored = cloud.unseal(await blobs.get(cloud.namespace(token) + '/workspace'), token);
  assert.deepEqual(restored['projects/old/lessons/vectors.json'], backup.files['projects/old/lessons/vectors.json']);
  await owner.call('/projects', 'POST', { name: 'Keep new project' });
  assert.equal((await owner.call('/developer/projects', 'POST')).status, 200);
  assert.equal((await (await owner.call('/projects')).json()).length, 3);
  // A later edit to an imported project must never be silently replaced.
  await owner.call('/projects/old', 'PATCH', { name: 'Edited recovered project' });
  assert.equal((await owner.call('/developer/projects', 'POST')).status, 409);
});

test('developer sessions are bound to workspace and expire; allowlist changes take effect immediately', async () => {
  const blobs = new MemoryBlobs(), owner = browser(blobs);
  await login(owner);
  const original = owner.cookies.get('__Host-paperquest-account');
  const user = cloud.unseal(original, 'account-session:' + process.env.PAPERQUEST_AUTH_SECRET);
  for (const patch of [{ expires: 1 }, { token: 'different-workspace' }]) {
    owner.cookies.set('__Host-paperquest-account', cloud.seal({ ...user, ...patch }, 'account-session:' + process.env.PAPERQUEST_AUTH_SECRET));
    assert.equal((await owner.call('/developer/projects')).status, 403);
  }
  owner.cookies.set('__Host-paperquest-account', original);
  process.env.PAPERQUEST_DEVELOPER_EMAILS = '';
  try { assert.equal((await owner.call('/developer/projects')).status, 403); }
  finally { process.env.PAPERQUEST_DEVELOPER_EMAILS = 'owner@gmail.com'; }
});

test('developer recovery rejects conflicting project creation racing with the restore', async () => {
  const blobs = new MemoryBlobs(), owner = browser(blobs);
  await login(owner);
  await blobs.set(BACKUP_KEY, cloud.seal(backup, 'developer-backup:' + process.env.PAPERQUEST_AUTH_SECRET));
  const token = owner.cookies.get('__Host-paperquest');
  const key = cloud.namespace(token) + '/workspace';
  const getLatest = blobs.getWithMetadata.bind(blobs);
  let injected = false;
  blobs.getWithMetadata = async name => {
    if (name === key && !injected) {
      injected = true;
      await blobs.set(key, cloud.seal({ 'projects/old/project.json': entry({ id: 'old', name: 'Concurrent project', nodes: [], papers: [] }) }, token));
    }
    return getLatest(name);
  };
  assert.equal((await owner.call('/developer/projects', 'POST')).status, 409);
  const saved = cloud.unseal(await blobs.get(key), token);
  assert.equal(JSON.parse(Buffer.from(saved['projects/old/project.json'].data, 'base64')).name, 'Concurrent project');
  assert.ok(!saved['projects/old/lessons/vectors.json']);
});

test('developer recovery preserves progress earned in newer projects', async () => {
  const blobs = new MemoryBlobs(), owner = browser(blobs);
  await login(owner);
  await blobs.set(BACKUP_KEY, cloud.seal(backup, 'developer-backup:' + process.env.PAPERQUEST_AUTH_SECRET));
  const token = owner.cookies.get('__Host-paperquest'), key = cloud.namespace(token) + '/workspace';
  await blobs.set(key, cloud.seal({ 'profile.json': entry({ xp: 50 }) }, token));
  assert.equal((await owner.call('/developer/projects', 'POST')).status, 409);
  const saved = cloud.unseal(await blobs.get(key), token);
  assert.equal(JSON.parse(Buffer.from(saved['profile.json'].data, 'base64')).xp, 50);
  assert.ok(!saved['projects/old/project.json']);
});

test('Google setup is optional and fails closed when missing', async () => {
  const client = browser(new MemoryBlobs());
  const saved = process.env.PAPERQUEST_AUTH_SECRET;
  delete process.env.PAPERQUEST_AUTH_SECRET;
  try {
    assert.equal((await (await client.call('/session')).json()).googleEnabled, false);
    assert.equal((await client.call('/auth/google/start', 'POST')).status, 503);
    assert.equal((await client.call('/projects', 'POST', { name: 'Guest still works' })).status, 200);
  } finally { process.env.PAPERQUEST_AUTH_SECRET = saved; }
});

test('production verifier checks signatures, audience, issuer and expiry with Google library', async () => {
  const { OAuth2Client } = require('google-auth-library');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const original = OAuth2Client.prototype.getFederatedSignonCertsAsync;
  // Replace only certificate transport. Real JWT verification remains enabled.
  OAuth2Client.prototype.getFederatedSignonCertsAsync = async () => ({ certs: { test: publicKey.export({ type: 'spki', format: 'pem' }) } });
  try {
    const client = browser(new MemoryBlobs(), createAuth());
    await client.call('/session');
    const now = Math.floor(Date.now() / 1000);
    async function attempt(overrides = {}, corrupt = false) {
      const { nonce } = await (await client.call('/auth/google/start', 'POST')).json();
      const payload = { ...identity, nonce, aud: process.env.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', iat: now, exp: now + 3600, ...overrides };
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const content = encode({ alg: 'RS256', kid: 'test' }) + '.' + encode(payload);
      const signed = crypto.sign('RSA-SHA256', Buffer.from(content), privateKey);
      if (corrupt) signed[0] ^= 1;
      return client.call('/auth/google', 'POST', { credential: content + '.' + signed.toString('base64url') });
    }
    for (const overrides of [{ aud: 'someone-else' }, { iss: 'https://evil.test' }, { iat: now - 7200, exp: now - 3600 }]) {
      assert.equal((await attempt(overrides)).status, 401);
    }
    assert.equal((await attempt({}, true)).status, 401);
    const success = await attempt();
    assert.equal(success.status, 200, await success.clone().text());
  } finally { OAuth2Client.prototype.getFederatedSignonCertsAsync = original; }
});

test('judge keys share only graphs, isolate the workspace, and enforce rotation, expiry and revocation', async () => {
  const blobs = new MemoryBlobs(), owner = browser(blobs), judge = browser(blobs), visitor = browser(blobs);
  await login(owner);
  const demo = await (await owner.call('/onboarding', 'POST', { action: 'project' })).json();
  const token = owner.cookies.get('__Host-paperquest'), path = cloud.namespace(token) + '/workspace';
  const files = cloud.unseal(await blobs.get(path), token);
  files['settings.json'] = entry({ apiKey: 'provider-secret' });
  files['projects/' + demo.projectId + '/notes.json'] = entry({ personal: 'private-notes' });
  files['projects/' + demo.projectId + '/lessons/linear_algebra.chat.json'] = entry([{ raw: 'private-chat-thread' }]);
  const pfile = 'projects/' + demo.projectId + '/project.json';
  const p = JSON.parse(Buffer.from(files[pfile].data, 'base64'));
  p.privateField = 'private-project-field'; p.nodes[0].internal = 'private-node-field';
  files[pfile] = entry(p);
  files['careers/test/career.json'] = entry({ id: 'test', name: 'ML engineer', skills: p.nodes, resume: 'private-resume' });
  await blobs.set(path, cloud.seal(files, token));
  await visitor.call('/session');
  assert.equal((await visitor.call('/developer/judge-access', 'POST')).status, 403);
  const created = await owner.call('/developer/judge-access', 'POST');
  assert.equal(created.status, 200);
  const { key } = await created.json();
  assert.match(key, /^PQJ-[a-f0-9]{64}$/);
  assert.equal((await judge.call('/judge/enter', 'POST', { key }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await judge.call('/judge/enter', 'POST', { key: 'wrong' })).status, 401);
  const opened = await judge.call('/judge/enter', 'POST', { key });
  assert.equal(opened.status, 200);
  assert.match(opened.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
  const shared = await opened.json(), text = JSON.stringify(shared);
  assert.equal(shared.projects.length, 1); assert.equal(shared.careers.length, 1);
  assert.ok(shared.projects[0].nodes.length > 5);
  for (const hidden of [token, 'provider-secret', 'private-notes', 'private-chat-thread', 'private-project-field', 'private-node-field', 'private-resume', 'DEMO_PAPER_MD']) assert.ok(!text.includes(hidden), hidden);
  // The showcase: saved refreshers with quizzes, the cheatsheet, summaries, dashboard numbers and career stats.
  const proj = shared.projects[0];
  assert.equal(proj.lessons.linear_algebra.quiz.length, 4);
  assert.match(proj.cheatsheet, /## Core formulas/);
  assert.match(proj.papers[0].summary, /## TL;DR/);
  assert.equal(proj.papers[0].pdfUrl, 'https://arxiv.org/pdf/1706.03762v7');
  assert.equal(shared.dashboard.stats.projects, 1);
  assert.equal(shared.dashboard.heat.length, 70);
  assert.ok(shared.careers[0].stats.total > 0);
  assert.equal((await judge.call('/projects')).status, 401);
  await judge.call('/session');
  assert.deepEqual(await (await judge.call('/projects')).json(), []);
  assert.equal((await judge.call('/judge/graphs', 'POST', {})).status, 405);
  assert.equal((await judge.call('/judge/graphs')).status, 200);
  const replacement = await (await owner.call('/developer/judge-access', 'POST')).json();
  assert.equal((await judge.call('/judge/graphs')).status, 401);
  assert.equal((await judge.call('/judge/enter', 'POST', { key })).status, 401);
  assert.equal((await judge.call('/judge/enter', 'POST', { key: replacement.key })).status, 200);
  const sharePath = cloud.namespace(token) + '/judge-access', shareSecret = 'judge-sharing:' + process.env.PAPERQUEST_AUTH_SECRET;
  const share = cloud.unseal(await blobs.get(sharePath), shareSecret);
  await blobs.set(sharePath, cloud.seal({ ...share, expires: 1 }, shareSecret));
  assert.equal((await judge.call('/judge/graphs')).status, 401);
  const fresh = await (await owner.call('/developer/judge-access', 'POST')).json();
  await judge.call('/judge/enter', 'POST', { key: fresh.key });
  assert.equal((await owner.call('/developer/judge-access', 'DELETE')).status, 200);
  assert.equal((await judge.call('/judge/graphs')).status, 401);
  assert.equal((await (await owner.call('/developer/judge-access')).json()).active, false);
});

test('guided tour persists, builds the real-paper demo and a tools-based career without AI', async () => {
  const blobs = new MemoryBlobs(), client = browser(blobs), other = browser(blobs);
  await client.call('/session'); await other.call('/session');
  const start = await (await client.call('/onboarding')).json();
  assert.equal(start.eligible, true); assert.equal(start.total, 12);
  const add = async () => (await client.call('/onboarding', 'POST', { action: 'project' })).json();
  const sample = await add(); assert.equal((await add()).projectId, sample.projectId);
  assert.equal(sample.step, 4);
  assert.equal((await (await client.call('/projects')).json()).length, 1);
  const project = await (await client.call('/projects/' + sample.projectId)).json();
  assert.ok(project.project.nodes.length > 5);
  assert.ok(project.cheatsheetAt > 0);
  const paper = project.project.papers[0];
  assert.equal(paper.pdfUrl, 'https://arxiv.org/pdf/1706.03762v7');
  assert.ok(Object.values(project.project.nodes.find(n => n.id === 'softmax_function').usage)[0].includes('softmax'));
  const summary = await client.call(`/projects/${sample.projectId}/papers/${paper.id}/summary`);
  assert.equal(summary.status, 200); assert.match((await summary.json()).markdown, /## TL;DR/);
  const lesson = await client.call('/projects/' + sample.projectId + '/lesson', 'POST', { conceptId: 'linear_algebra' });
  assert.equal(lesson.status, 200, await lesson.clone().text());
  assert.equal((await lesson.json()).cached, true);
  for (const step of [5, 6, 7, 8]) assert.equal((await client.call('/onboarding', 'POST', { action: 'step', step })).status, 200);
  const career = await (await client.call('/onboarding', 'POST', { action: 'career', name: 'Data Scientist' })).json();
  assert.equal(career.step, 9);
  const detail = await (await client.call('/careers/' + career.careerId)).json();
  const ids = new Set(detail.skills.map(n => n.id));
  for (const tool of ['python', 'sql', 'scikit_learn', 'ab_testing']) assert.ok(ids.has(tool), tool);
  assert.ok(!ids.has('linear_algebra'), 'career maps list tools, not courses');
  assert.ok(detail.skills.some(n => n.depth > 0));
  assert.ok(detail.skills.every(n => n.prereqs.every(id => ids.has(id))));
  assert.ok(detail.skills.find(n => n.id === 'scikit_learn').concepts.includes('gradient_descent'));
  assert.equal(detail.knowledge.gradient_descent.name, 'Gradient Descent');
  assert.equal(detail.states.python, 'tolearn'); // foundation tools are not assumed
  await client.call('/onboarding', 'POST', { action: 'step', step: 12 });
  assert.equal((await (await client.call('/onboarding')).json()).completed, true);
  assert.equal((await (await other.call('/onboarding')).json()).step, 0);
  await client.call('/onboarding', 'POST', { action: 'restart' });
  assert.equal((await add()).projectId, sample.projectId);
  const again = await (await client.call('/onboarding', 'POST', { action: 'career', name: 'AI / Machine Learning Engineer' })).json();
  assert.equal(again.careerId, career.careerId);
  assert.ok((await (await client.call('/careers/' + again.careerId)).json()).skills.some(n => n.id === 'pytorch'));
  await client.call('/onboarding', 'POST', { action: 'dismiss' });
  assert.equal((await (await client.call('/onboarding')).json()).dismissed, true);
  assert.equal((await client.call('/onboarding', 'POST', { action: 'career', name: 'Unknown' })).status, 400);
  assert.equal((await client.call('/onboarding', 'POST', { action: 'step', step: 13 })).status, 400);
});

test('automatic developer restoration adds missing folders once and preserves newer progress and edits', async () => {
  const blobs = new MemoryBlobs(), owner = browser(blobs);
  await login(owner);
  const token = owner.cookies.get('__Host-paperquest'), key = cloud.namespace(token) + '/workspace';
  await blobs.set(key, cloud.seal({ 'profile.json': entry({ xp: 700 }), 'mastery.json': entry({ vectors: { score: 100 } }) }, token));
  await blobs.set(BACKUP_KEY, cloud.seal(backup, 'developer-backup:' + process.env.PAPERQUEST_AUTH_SECRET));
  assert.equal((await owner.call('/session')).status, 200);
  let restored = cloud.unseal(await blobs.get(key), token);
  assert.ok(restored['projects/old/lessons/vectors.json']);
  assert.equal(JSON.parse(Buffer.from(restored['profile.json'].data, 'base64')).xp, 700);
  await owner.call('/projects/old', 'PATCH', { name: 'New title' });
  await owner.call('/session');
  assert.equal((await (await owner.call('/projects')).json())[0].name, 'New title');
  await owner.call('/projects/old', 'DELETE');
  await owner.call('/session');
  assert.deepEqual(await (await owner.call('/projects')).json(), []);
});
