// Request-shape tests for the provider adapter, and parsing of model JSON. No network:
// fetch is stubbed. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { callLLMRaw, parseModelJSON } = require('./llm');

function stubFetch(reply) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), headers: opts.headers });
    return { ok: true, json: async () => reply };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

const geminiReply = { candidates: [{ content: { parts: [{ text: 'OK' }] } }] };
const settingsFor = (conn) => ({ connections: [{ id: 'c1', provider: 'gemini', key: 'AQ.test-key', model: '', baseUrl: '', ...conn }], activeId: 'c1' });

test('gemini sends the key in the x-goog-api-key header, never in the URL', async () => {
  const f = stubFetch(geminiReply);
  try {
    const { text } = await callLLMRaw(settingsFor({}), [{ role: 'user', content: 'hi' }], { json: false });
    assert.equal(text, 'OK');
    assert.equal(f.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal(f.calls[0].headers['x-goog-api-key'], 'AQ.test-key');
    assert.ok(!f.calls[0].url.includes('key='));
  } finally { f.restore(); }
});

test('gemini tolerates a saved root that already ends in /v1beta and a models/ prefix', async () => {
  const f = stubFetch(geminiReply);
  try {
    await callLLMRaw(
      settingsFor({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'models/gemini-flash-latest' }),
      [{ role: 'user', content: 'hi' }],
      { json: false }
    );
    assert.equal(f.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
  } finally { f.restore(); }
});

// Model output as Gemini's JSON mode writes it: one backslash per LaTeX command.
const raw = String.raw;

test('parseModelJSON reads LaTeX written with single backslashes', () => {
  const parsed = parseModelJSON(raw`{"lesson": "Its adjoint $A^\dagger$ (read as \"A dagger\"), $\langle \psi | H | \psi \rangle$, $\underbrace{x}_{n}$"}`);
  assert.strictEqual(parsed.lesson, raw`Its adjoint $A^\dagger$ (read as "A dagger"), $\langle \psi | H | \psi \rangle$, $\underbrace{x}_{n}$`);
});

test('parseModelJSON reads commands that start like JSON escapes as LaTeX inside math', () => {
  const parsed = parseModelJSON(raw`{"lesson": "$\frac{1}{2}$, $\theta$, $$\nabla f$$, \(\rho\), $\beta$, $a \ne b$, $\tau \to 0$"}`);
  assert.strictEqual(parsed.lesson, raw`$\frac{1}{2}$, $\theta$, $$\nabla f$$, \(\rho\), $\beta$, $a \ne b$, $\tau \to 0$`);
});

test('parseModelJSON keeps real newlines and tabs, even before words like "e.g."', () => {
  const parsed = parseModelJSON('{"lesson": "## Title\\n\\ne.g. one\\ni.e. two\\tcol\\n$$\\nx^2\\n$$"}');
  assert.strictEqual(parsed.lesson, '## Title\n\ne.g. one\ni.e. two\tcol\n$$\nx^2\n$$');
});

test('parseModelJSON does not open math at an escaped dollar sign', () => {
  const parsed = parseModelJSON(raw`{"lesson": "costs \$5.\nnot math, then $\alpha$"}`);
  assert.strictEqual(parsed.lesson, 'costs \\$5.\nnot math, then $\\alpha$');
});

test('parseModelJSON leaves correctly escaped JSON unchanged', () => {
  const text = JSON.stringify({
    lesson: raw`$\frac{a}{b}$, "quotes", a \ backslash`,
    quiz: [{ q: raw`Is $\theta \ne \nu$?`, options: ['a/b', 'tab\there'], answer: 1 }]
  });
  assert.deepStrictEqual(parseModelJSON(text), JSON.parse(text));
  assert.strictEqual(parseModelJSON('{"lesson": "caf\\u00e9 \\/ \\"q\\""}').lesson, 'café / "q"');
});

test('parseModelJSON still strips code fences and trailing commas', () => {
  assert.deepStrictEqual(parseModelJSON('```json\n{"quiz": [1, 2,],}\n```'), { quiz: [1, 2] });
});

test('parseModelJSON still rejects output that is not JSON', () => {
  assert.throws(() => parseModelJSON('{"lesson": "cut off'), (e) => e.status === 502 && /malformed JSON/.test(e.message));
});
