// Request-shape tests for the provider adapter. No network: fetch is stubbed. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { callLLMRaw } = require('./llm');

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
