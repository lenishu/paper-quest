// Shared Gemini key pool, career maps (tools, knowledge-graph links, job and resume
// comparisons, suggestions), and saved summaries/cheatsheets — hosted mode, with
// the Gemini API stubbed. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PAPERQUEST_HOSTED = 'true';
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
function request(path, key, method = 'GET', body) {
  return new Request('https://paperquest.test' + path, {
    method, headers: { cookie: cloud.cookie(key).split(';')[0], ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
// Call the API like the browser does: slow (AI) routes are queued, so run the worker.
async function call(blobs, key, path, method = 'GET', body) {
  let res = await cloud.apiHandler(request(path, key, method, body), blobs, async () => {});
  if (res.status === 202) {
    const { jobId } = await res.json();
    await cloud.backgroundHandler(request('/api/worker', key, 'POST', { jobId }), blobs);
    res = await cloud.apiHandler(request('/api/jobs/' + jobId, key), blobs, async () => {});
  }
  return res;
}
const json = async (res) => { const data = await res.json(); assert.ok(res.ok, JSON.stringify(data)); return data; };

// Gemini stub: answers by prompt type; `limited` keys get 429s.
function stubGemini(replies, limited = new Set()) {
  const seen = [];
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    const key = opts.headers['x-goog-api-key'];
    const prompt = JSON.parse(opts.body).contents.map((c) => c.parts[0].text).join('\n');
    seen.push({ key, prompt });
    if (limited.has(key)) return new Response(JSON.stringify({ error: { message: 'Resource has been exhausted (e.g. check quota).' } }), { status: 429, statusText: 'Too Many Requests' });
    const reply = replies.find(([match]) => prompt.includes(match));
    const text = reply ? JSON.stringify(reply[1]) : 'OK';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  };
  return { seen, restore: () => { global.fetch = original; } };
}

test('the shared Gemini key is every workspace\'s default, never leaves the server, and cycles past rate limits', async (t) => {
  process.env.PAPERQUEST_SHARED_GEMINI_KEYS = 'AQ.shared-one, AQ.shared-two';
  t.after(() => { delete process.env.PAPERQUEST_SHARED_GEMINI_KEYS; });
  const blobs = new MemoryBlobs(), key = token();
  const settings = await json(await call(blobs, key, '/api/settings'));
  assert.equal(settings.activeId, 'shared-gemini');
  assert.deepEqual(settings.connections.map((c) => [c.id, c.shared, c.key]), [['shared-gemini', true, '']]);
  assert.ok(!JSON.stringify(settings).includes('AQ.shared'));

  // Saving the list back never stores the shared connection; the shared key stays active.
  const saved = await json(await call(blobs, key, '/api/settings', 'PUT', { connections: [...settings.connections, { id: 'mine', provider: 'openai', key: '' }], activeId: 'mine' }));
  assert.equal(saved.activeId, 'shared-gemini'); // an own connection without a key never replaces it
  const files = cloud.unseal(await blobs.get(cloud.namespace(key) + '/workspace'), key);
  const stored = JSON.parse(Buffer.from(files['settings.json'].data, 'base64'));
  assert.deepEqual(stored.connections.map((c) => c.id), ['mine']);

  const gemini = stubGemini([], new Set(['AQ.shared-one']));
  try {
    for (let i = 0; i < 3; i++) assert.equal((await call(blobs, key, '/api/settings/test', 'POST', {})).status, 200);
    assert.ok(gemini.seen.every((s) => s.key.startsWith('AQ.shared-')));
    assert.ok(gemini.seen.filter((s) => s.key === 'AQ.shared-two').length === 3, 'the limited key is skipped every time');
  } finally { gemini.restore(); }

  const busy = stubGemini([], new Set(['AQ.shared-one', 'AQ.shared-two']));
  try {
    const res = await call(blobs, key, '/api/settings/test', 'POST', {});
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /shared free Gemini key is busy/);
  } finally { busy.restore(); }

  // Activating an own key switches away from the shared one.
  const own = await json(await call(blobs, key, '/api/settings', 'PUT', { connections: [{ id: 'mine', provider: 'gemini', key: 'AQ.personal' }], activeId: 'mine' }));
  assert.equal(own.activeId, 'mine');
});

test('career maps list tools, link the knowledge graph, and compare with a job description and marked skills', async (t) => {
  process.env.PAPERQUEST_SHARED_GEMINI_KEYS = 'AQ.shared-one';
  t.after(() => { delete process.env.PAPERQUEST_SHARED_GEMINI_KEYS; });
  const blobs = new MemoryBlobs(), key = token();
  const demo = await json(await call(blobs, key, '/api/projects/demo', 'POST', {}));
  const node = (id, name, level, prereqs, extra = {}) => ({ id, name, level, core: false, tier: 'novice', branch: 'tools', importance: 'critical', blurb: name + ' basics.', used_in_role: 'Used daily.', concepts: [], prereqs, ...extra });
  const careerMap = { career_title: 'Machine Learning Engineer', field: 'ml engineering', nodes: [
    node('python', 'Python', 0, []), node('git', 'Git', 0, []),
    node('numpy_pandas', 'NumPy & pandas', 1, ['python']),
    node('pytorch', 'PyTorch', 1, ['numpy_pandas'], { concepts: ['backpropagation', 'not_in_the_graph'] }),
    node('docker', 'Docker', 1, ['python']),
    node('mlops', 'Deploy & monitor models', 1, ['docker', 'pytorch'], { core: true, tier: 'advanced' })
  ] };
  const jdMap = { ...careerMap, nodes: [...careerMap.nodes, node('kubernetes', 'Kubernetes', 1, ['docker'])], jd_skill_ids: ['python', 'docker', 'kubernetes', 'made_up'] };
  const gemini = stubGemini([
    ['Suggest 5 career roles', { suggestions: [{ title: 'Machine Learning Engineer', why: 'Uses attention and backpropagation.', matched_concepts: ['attention_mechanism', 'fake_concept'], starter_tools: ['PyTorch', 'Docker'] }] }],
    ['JOB DESCRIPTION', jdMap],
    ['Build the career map', careerMap]
  ]);
  try {
    const suggested = await json(await call(blobs, key, '/api/careers/suggest', 'POST', { interest: 'shipping AI products' }));
    assert.deepEqual(suggested.suggestions[0].concepts.map((c) => c.id), ['attention_mechanism']);
    assert.ok(suggested.basedOn > 5);
    assert.match(gemini.seen[0].prompt, /attention_mechanism — Attention/);

    // Typed text is an interest: the AI names the role.
    const career = await json(await call(blobs, key, '/api/careers', 'POST', { interest: 'I like building ML products' }));
    let detail = await json(await call(blobs, key, `/api/careers/${career.id}/generate`, 'POST', {}));
    assert.equal(detail.name, 'Machine Learning Engineer');
    assert.match(gemini.seen[1].prompt, /CAREER: not chosen yet/);
    assert.match(gemini.seen[1].prompt, /NOT courses or school subjects/);
    const pytorch = detail.skills.find((s) => s.id === 'pytorch');
    assert.deepEqual(pytorch.concepts, ['backpropagation']);
    assert.equal(detail.knowledge.backpropagation.name, 'Backpropagation');
    assert.equal(detail.states.python, 'tolearn');
    assert.equal(detail.states.pytorch, 'tolearn');

    // Mastering a concept the tool uses moves the tool to "learning".
    await json(await call(blobs, key, '/api/complete', 'POST', { projectId: demo.id, conceptId: 'backpropagation', skipped: true }));
    detail = await json(await call(blobs, key, `/api/careers/${career.id}`));
    assert.equal(detail.states.pytorch, 'learning');

    detail = await json(await call(blobs, key, `/api/careers/${career.id}`, 'PATCH', { known: { id: 'python', value: true } }));
    assert.equal(detail.states.python, 'known');

    const text = 'We are hiring a machine learning engineer. You will ship models with Python, Docker and Kubernetes every day.';
    detail = await json(await call(blobs, key, `/api/careers/${career.id}/jd`, 'POST', { text, name: 'Acme ML engineer' }));
    assert.deepEqual(detail.jds[0].skillIds, ['python', 'docker', 'kubernetes']);
    assert.deepEqual(detail.jds[0].match, { total: 3, known: 1, learning: 0, missing: ['docker', 'kubernetes'], pct: 33 });
    assert.equal(detail.skills.length, 7);

    const listing = await json(await call(blobs, key, '/api/careers'));
    assert.equal(listing.suggestions.suggestions[0].title, 'Machine Learning Engineer');
  } finally { gemini.restore(); }
});

test('summaries and cheatsheets are written once, reopened free, and ship prepared with the demo', async (t) => {
  process.env.PAPERQUEST_SHARED_GEMINI_KEYS = 'AQ.shared-one';
  t.after(() => { delete process.env.PAPERQUEST_SHARED_GEMINI_KEYS; });
  const blobs = new MemoryBlobs(), key = token();
  const demo = await json(await call(blobs, key, '/api/projects/demo', 'POST', {}));
  const paper = demo.papers[0];
  assert.equal(paper.pdfUrl, 'https://arxiv.org/pdf/1706.03762v7');
  const pdf = await call(blobs, key, `/api/projects/${demo.id}/papers/${paper.id}/pdf`);
  assert.equal(pdf.status, 302);
  assert.equal(pdf.headers.get('location'), paper.pdfUrl);
  assert.match((await json(await call(blobs, key, `/api/projects/${demo.id}/papers/${paper.id}/summary`))).markdown, /## TL;DR/);
  assert.match((await json(await call(blobs, key, `/api/projects/${demo.id}/cheatsheet`))).markdown, /## Core formulas/);

  const club = await json(await call(blobs, key, '/api/projects', 'POST', { name: 'Robotics club', kind: 'club' }));
  assert.equal(club.kind, 'club');
  assert.equal((await json(await call(blobs, key, '/api/projects'))).find((p) => p.id === club.id).kind, 'club');
  assert.equal((await json(await call(blobs, key, `/api/projects/${demo.id}`, 'PATCH', { kind: 'nonsense' }))).kind, 'paper');

  const summaryMd = '## TL;DR\nA short test summary of the paper that is long enough to keep.\n\n## Key ideas\n- **One.** Two.';
  const sheetMd = '## Core formulas\n| Idea | Formula |\n|---|---|\n| Softmax | $e^{z_i}/\\sum_j e^{z_j}$ |\n\n## Remember\n- Scale by the square root.';
  const gemini = stubGemini([['Summarise the', { title: 'Study', summary_md: summaryMd }], ['one-page cheatsheet', { cheatsheet_md: sheetMd }]]);
  try {
    const form = new FormData();
    form.append('file', new Blob(['# Study\n\n' + 'Notes about matrices and attention for the club. '.repeat(20)], { type: 'text/markdown' }), 'study.md');
    let res = await cloud.apiHandler(new Request(`https://paperquest.test/api/projects/${club.id}/papers`, { method: 'POST', headers: { cookie: cloud.cookie(key).split(';')[0] }, body: form }), blobs, async () => {});
    const { jobId } = await res.json();
    await cloud.backgroundHandler(request('/api/worker', key, 'POST', { jobId }), blobs);
    const { paper: upload } = await json(await cloud.apiHandler(request('/api/jobs/' + jobId, key), blobs, async () => {}));
    assert.equal((await call(blobs, key, `/api/projects/${club.id}/papers/${upload.id}/summary`)).status, 404);
    const made = await json(await call(blobs, key, `/api/projects/${club.id}/papers/${upload.id}/summary`, 'POST', {}));
    assert.equal(made.cached, false);
    assert.equal(made.markdown, summaryMd);
    const calls = gemini.seen.length;
    assert.equal((await json(await call(blobs, key, `/api/projects/${club.id}/papers/${upload.id}/summary`, 'POST', {}))).cached, true);
    assert.equal(gemini.seen.length, calls, 'a saved summary never calls the model');

    assert.equal((await call(blobs, key, `/api/projects/${club.id}/cheatsheet`, 'POST', {})).status, 400); // nothing mapped yet
    const sheet = await json(await call(blobs, key, `/api/projects/${demo.id}/cheatsheet`, 'POST', { regenerate: true }));
    assert.equal(sheet.markdown, sheetMd);
    assert.match(gemini.seen.at(-1).prompt, /Matrices & Matrix Multiplication/);
    assert.match(gemini.seen.at(-1).prompt, /SAVED LESSON EXCERPTS/);
  } finally { gemini.restore(); }
});
