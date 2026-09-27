const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PAPERQUEST_HOSTED = 'true';
const cloud = require('./cloud');
const { createPgStore, TABLE } = require('./pgStore');

// PGlite is real Postgres in-process, so conditional writes are checked against actual SQL.
async function postgres() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  return { db, store: createPgStore((text, params) => db.query(text, params)) };
}
const token = () => crypto.randomBytes(32).toString('hex');
function request(path, key, method = 'GET', body) {
  return new Request('https://paperquest.test' + path, {
    method, headers: { ...(key ? { cookie: cloud.cookie(key).split(';')[0] } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
const api = (blobs, req, dispatch = async () => {}) => cloud.apiHandler(req, blobs, dispatch);

test('Postgres store supports create-once, compare-and-swap and upsert writes', async () => {
  const { db, store } = await postgres();
  try {
    assert.equal(await store.get('k'), null);
    assert.equal(await store.getWithMetadata('k'), null);
    assert.deepEqual(await store.set('k', 'missing', { onlyIfMatch: '1' }), { modified: false });
    const first = await store.set('k', 'one', { onlyIfNew: true });
    assert.equal(first.modified, true);
    assert.deepEqual(await store.set('k', 'again', { onlyIfNew: true }), { modified: false });
    const saved = await store.getWithMetadata('k');
    assert.deepEqual(saved, { data: 'one', etag: first.etag });
    const second = await store.set('k', 'two', { onlyIfMatch: saved.etag });
    assert.equal(second.modified, true);
    assert.notEqual(second.etag, saved.etag);
    assert.deepEqual(await store.set('k', 'stale', { onlyIfMatch: saved.etag }), { modified: false });
    assert.deepEqual(await store.set('k', 'foreign', { onlyIfMatch: 'W/"abc"' }), { modified: false });
    assert.equal(await store.get('k'), 'two');
    const third = await store.set('k', 'three');
    assert.deepEqual(await store.getWithMetadata('k'), { data: 'three', etag: third.etag });
    await assert.rejects(store.set('k', Buffer.from('bytes')), TypeError);
  } finally {
    await db.close();
  }
});

test('Postgres store lets exactly one concurrent writer win', async () => {
  const { db, store } = await postgres();
  try {
    const { etag } = await store.set('race', 'start', { onlyIfNew: true });
    const swaps = await Promise.all(['a', 'b', 'c'].map((value) => store.set('race', value, { onlyIfMatch: etag })));
    assert.equal(swaps.filter((result) => result.modified).length, 1);
    const creates = await Promise.all(['x', 'y'].map((value) => store.set('fresh', value, { onlyIfNew: true })));
    assert.equal(creates.filter((result) => result.modified).length, 1);
  } finally {
    await db.close();
  }
});

test('hosted workspaces isolate users, merge saves and run background uploads on Postgres', async () => {
  const { db, store: blobs } = await postgres();
  try {
    const alice = token(), bob = token();
    const project = await (await api(blobs, request('/api/projects', alice, 'POST', { name: 'Alice only' }))).json();
    assert.deepEqual(await (await api(blobs, request('/api/projects', bob))).json(), []);
    assert.equal((await api(blobs, request('/api/projects/' + project.id, bob))).status, 404);

    const file = (data) => ({ data: Buffer.from(data).toString('base64'), mtime: Date.now() });
    await Promise.all([
      cloud.saveChanges(blobs, 'state', alice, {}, { 'a.json': file('a') }),
      cloud.saveChanges(blobs, 'state', alice, {}, { 'b.json': file('b') })
    ]);
    const before = cloud.unseal(await blobs.get('state'), alice);
    assert.equal(Object.keys(before).length, 2);
    await cloud.saveChanges(blobs, 'state', alice, before, { ...before, 'a.json': file('first') });
    await assert.rejects(cloud.saveChanges(blobs, 'state', alice, before, { ...before, 'a.json': file('second') }), { status: 409 });

    const form = new FormData();
    form.append('file', new Blob(['# A study\n\n' + 'A research paper about learning mathematics. '.repeat(30)], { type: 'text/markdown' }), 'study.md');
    const upload = new Request('https://paperquest.test/api/projects/' + project.id + '/papers', { method: 'POST', headers: { cookie: cloud.cookie(alice).split(';')[0] }, body: form });
    const dispatched = [];
    const queued = await api(blobs, upload, async (...args) => dispatched.push(args));
    assert.equal(queued.status, 202);
    const { jobId } = await queued.json();
    assert.deepEqual(dispatched, [[alice, jobId]]);
    const work = () => cloud.backgroundHandler(request('/api/worker', alice, 'POST', { jobId }), blobs);
    await Promise.all([work(), work()]);
    const result = await api(blobs, request('/api/jobs/' + jobId, alice));
    assert.equal(result.status, 200, await result.clone().text());
    const saved = await (await api(blobs, request('/api/projects/' + project.id, alice))).json();
    assert.equal(saved.project.papers.length, 1);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${TABLE} WHERE data LIKE $1`, ['%Alice only%']);
    assert.equal(rows[0].n, 0, 'workspace contents must be stored encrypted');
  } finally {
    await db.close();
  }
});
