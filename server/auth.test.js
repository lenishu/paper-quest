const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NETLIFY = 'true';
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
