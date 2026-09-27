// Provider-agnostic LLM adapter. Kinds: openai (OpenAI, Groq, Zhipu GLM and any
// OpenAI-compatible endpoint), openrouter, anthropic, gemini. Node 18+ (global fetch).
const store = require('./store');

const TIMEOUT_MS = 240000;

async function timedFetch(url, opts) {
  if (process.env.PAPERQUEST_HOSTED) {
    const target = new URL(url);
    const allowed = new Set(Object.values(store.PROVIDERS).filter((p) => p.baseUrl).map((p) => new URL(p.baseUrl).origin));
    for (const origin of (process.env.PAPERQUEST_ALLOWED_AI_ORIGINS || '').split(',').filter(Boolean)) allowed.add(origin.trim());
    if (target.protocol !== 'https:' || !allowed.has(target.origin) || target.username || target.password) {
      throw httpError(400, 'This AI endpoint is not enabled on the hosted app. Choose a listed provider or ask the site owner to enable its HTTPS origin.');
    }
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, redirect: process.env.PAPERQUEST_HOSTED ? 'error' : 'follow', signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function readError(res) {
  let body = '';
  try {
    body = await res.text();
  } catch {}
  let msg = body.slice(0, 400);
  try {
    const j = JSON.parse(body);
    msg = j.error?.message || j.message || msg;
  } catch {}
  return `${res.status} ${res.statusText}: ${msg}`;
}

// messages: [{role:'system'|'user'|'assistant', content:string, reasoning_details?}]
// Returns { text, message } — `message` is the raw assistant message, so callers
// continuing a thread can hand `reasoning_details` back unmodified (OpenRouter).
async function callLLMRaw(settings, messages, { json = true, maxTokens = 8000 } = {}) {
  const conn = store.activeConnection(settings);
  if (conn && conn.shared) return sharedGemini(messages, json, maxTokens);
  if (!conn || !(conn.key || '').trim()) {
    throw httpError(400, 'No active API connection with a key. Open Settings (gear icon), add a key and mark it active.');
  }
  const meta = store.providerMeta(conn.provider);
  const key = conn.key.trim();
  const model = (conn.model && conn.model.trim()) || meta.defaultModel;
  const baseUrl = (conn.baseUrl && conn.baseUrl.trim()) || meta.baseUrl;
  if (meta.kind === 'openai' && !baseUrl) {
    throw httpError(400, 'This custom connection needs a Base URL (e.g. https://host/v1). Open Settings.');
  }
  if (!model) throw httpError(400, 'This connection needs a model name. Open Settings.');

  if (meta.kind === 'openai') return openai(key, model, messages, json, maxTokens, baseUrl, conn.provider === 'openai');
  if (meta.kind === 'openrouter') return openrouter(key, model, messages, json, maxTokens, baseUrl, conn);
  if (meta.kind === 'anthropic') return anthropic(key, model, messages, json, maxTokens);
  if (meta.kind === 'gemini') return gemini(key, model, messages, json, maxTokens, baseUrl);
  throw httpError(400, `Unknown provider kind "${meta.kind}"`);
}

async function callLLM(settings, messages, opts) {
  const { text } = await callLLMRaw(settings, messages, opts);
  return text;
}

// The server's shared free Gemini keys. Each call starts at the next key in the pool
// and moves on when a key is rate-limited, out of quota or rejected; any other error
// (bad request, blocked prompt) would fail on every key, so it surfaces at once.
let sharedCursor = Math.floor(Math.random() * 1024);
const keyProblem = (e) => [401, 403, 429].includes(e.providerStatus) || (e.providerStatus === 400 && /api[ _]?key/i.test(e.message));
async function sharedGemini(messages, json, maxTokens) {
  const keys = store.sharedGeminiKeys();
  if (!keys.length) throw httpError(400, 'The shared Gemini key is not set up on this server. Open API key and add your own key.');
  const start = sharedCursor++ % keys.length;
  let last;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await gemini(keys[(start + i) % keys.length], store.PROVIDERS.gemini.defaultModel, messages, json, maxTokens);
    } catch (e) {
      if (!keyProblem(e)) throw e;
      last = e;
    }
  }
  const busy = last && last.providerStatus === 429;
  throw httpError(busy ? 429 : 503, busy
    ? 'The shared free Gemini key is busy (rate limit). Wait a minute and try again, or add your own key under API key.'
    : 'The shared Gemini key is unavailable right now. Add your own key under API key, or try again later.');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Works for OpenAI and any OpenAI-compatible endpoint (Groq, Zhipu GLM, custom).
// baseUrl is the API root (…/v1 or vendor equivalent). useCompletionTokens picks
// the newer `max_completion_tokens` param (real OpenAI) vs `max_tokens` (others).
async function openai(key, model, messages, json, maxTokens, baseUrl, useCompletionTokens) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const body = { model, messages: messages.map((m) => ({ role: m.role, content: m.content })) };
  if (json) body.response_format = { type: 'json_object' };
  if (useCompletionTokens) body.max_completion_tokens = maxTokens; else body.max_tokens = maxTokens;

  const send = () => timedFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  let res = await send();

  // Recover from provider-specific param quirks (400 only): swap the token param,
  // or drop response_format if the model/endpoint doesn't support JSON mode.
  if (res.status === 400) {
    const errText = await res.clone().text();
    let retry = false;
    if (/max_completion_tokens/i.test(errText) && 'max_completion_tokens' in body) {
      delete body.max_completion_tokens; body.max_tokens = maxTokens; retry = true;
    } else if (/max_tokens/i.test(errText) && 'max_tokens' in body && useCompletionTokens === false) {
      // some endpoints reject max_tokens too — last resort, let the server default it
      delete body.max_tokens; retry = true;
    }
    if (/response_format|json/i.test(errText) && body.response_format) {
      delete body.response_format; retry = true;
    }
    if (retry) res = await send();
  }

  if (!res.ok) throw httpError(502, `Provider error — ${await readError(res)}`);
  const data = await res.json();
  const message = data.choices?.[0]?.message;
  const text = message?.content;
  if (!text) throw httpError(502, 'The provider returned an empty response');
  return { text, message };
}

// OpenRouter — OpenAI-shaped, plus the `reasoning` block and `reasoning_details`.
// Assistant messages are forwarded with their `reasoning_details` UNMODIFIED so a
// reasoning model continues thinking from where it left off across turns.
async function openrouter(key, model, messages, json, maxTokens, baseUrl, conn) {
  const url = `${String(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'HTTP-Referer': 'http://localhost:3001',
    'X-Title': 'PaperQuest'
  };
  const body = {
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.reasoning_details ? { reasoning_details: m.reasoning_details } : {})
    })),
    max_tokens: maxTokens
  };
  if (json) body.response_format = { type: 'json_object' };
  if (conn && conn.reasoning) {
    body.reasoning = { enabled: true, ...(conn.reasoningEffort ? { effort: conn.reasoningEffort } : {}) };
  }

  const send = () => timedFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  let res = await send();

  // Free/older models on OpenRouter may reject JSON mode or the reasoning block.
  if (res.status === 400 || res.status === 404) {
    const errText = await res.clone().text();
    let retry = false;
    if (/response_format|json/i.test(errText) && body.response_format) { delete body.response_format; retry = true; }
    if (/reasoning/i.test(errText) && body.reasoning) { delete body.reasoning; retry = true; }
    if (retry) res = await send();
  }

  if (!res.ok) throw httpError(502, `OpenRouter error — ${await readError(res)}`);
  const data = await res.json();
  if (data.error) throw httpError(502, `OpenRouter error — ${data.error.message || 'unknown'}`);
  const message = data.choices?.[0]?.message;
  const text = message?.content;
  if (!text) {
    const reason = data.choices?.[0]?.finish_reason || 'empty response';
    throw httpError(502, `OpenRouter returned no text (${reason})`);
  }
  return { text, message };
}

async function anthropic(key, model, messages, json, maxTokens) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await timedFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: rest
    })
  });

  if (!res.ok) throw httpError(502, `Anthropic error — ${await readError(res)}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text) throw httpError(502, 'Anthropic returned an empty response');
  return { text, message: { role: 'assistant', content: text } };
}

async function gemini(key, model, messages, json, maxTokens, baseUrl) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  // Older snippet imports saved the root with the API version (…/v1beta); strip it.
  const root = String(baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '').replace(/\/v1(?:beta|alpha)?$/, '');
  const modelId = String(model).replace(/^models\//, '');
  const url = `${root}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;
  const res = await timedFetch(url, {
    method: 'POST',
    // Google's documented auth; works for AQ.… auth keys and AIza… standard keys,
    // and keeps the key out of URLs.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(json ? { responseMimeType: 'application/json' } : {})
      }
    })
  });

  if (!res.ok) {
    const e = httpError(502, `Gemini error — ${await readError(res)}`);
    e.providerStatus = res.status;
    throw e;
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) {
    const reason = cand?.finishReason || data.promptFeedback?.blockReason || 'empty response';
    throw httpError(502, `Gemini returned no text (${reason})`);
  }
  return { text, message: { role: 'assistant', content: text } };
}

// LaTeX commands whose first letter JSON reads as an escape (\b \f \n \r \t).
// Written with one backslash, "$\frac{1}{2}$" parses as a form feed + "rac{1}{2}".
const LATEX_ESCAPE_CLASH = new Set([
  'backslash', 'bar', 'because', 'begin', 'beta', 'beth', 'between', 'bf', 'big', 'bigcap', 'bigcirc',
  'bigcup', 'bigg', 'biggl', 'biggr', 'bigl', 'bigodot', 'bigoplus', 'bigotimes', 'bigr', 'bigsqcup',
  'bigstar', 'bigtriangledown', 'bigtriangleup', 'biguplus', 'bigvee', 'bigwedge', 'binom', 'blacksquare',
  'bmod', 'boldsymbol', 'bot', 'bowtie', 'box', 'boxdot', 'boxed', 'boxminus', 'boxplus', 'boxtimes',
  'bra', 'braket', 'breve', 'bullet',
  'fbox', 'flat', 'footnotesize', 'forall', 'frac', 'frak', 'frown',
  'nabla', 'natural', 'ncong', 'ne', 'nearrow', 'neg', 'neq', 'newline', 'nexists', 'ngeq', 'ngtr', 'ni',
  'nleftarrow', 'nleftrightarrow', 'nleq', 'nless', 'nmid', 'nolimits', 'nonumber', 'norm', 'not', 'notin',
  'nparallel', 'nprec', 'nrightarrow', 'nsim', 'nsubseteq', 'nsucc', 'nsupseteq', 'nu', 'nvdash', 'nwarrow',
  'rangle', 'rbrace', 'rbrack', 'rceil', 'restriction', 'rfloor', 'rgroup', 'rho', 'right', 'rightarrow',
  'rightarrowtail', 'rightharpoondown', 'rightharpoonup', 'rightleftarrows', 'rightleftharpoons',
  'rightrightarrows', 'rightsquigarrow', 'rightthreetimes', 'risingdotseq', 'rm', 'rmoustache', 'root',
  'rtimes', 'rVert', 'rvert',
  'tag', 'tan', 'tanh', 'tau', 'tbinom', 'text', 'textbf', 'textcolor', 'textit', 'textnormal', 'textrm',
  'textsf', 'textstyle', 'texttt', 'tfrac', 'therefore', 'theta', 'thickapprox', 'thicksim', 'thinspace',
  'tilde', 'times', 'tiny', 'to', 'top', 'triangle', 'triangledown', 'triangleleft', 'trianglelefteq',
  'triangleq', 'triangleright', 'trianglerighteq', 'twoheadrightarrow'
]);
const LETTERS = /[A-Za-z]+/y;

// Models in JSON mode (Gemini especially) write LaTeX with ONE backslash inside
// strings: "$A^\dagger$" is invalid JSON and "$\theta$" silently becomes a tab.
// Double every backslash that can't be a JSON escape, and read \b or \f anywhere,
// or \n \r \t inside $…$, $$…$$, \(…\) or \[…\] math, as LaTeX when a command
// name follows. Real newlines and tabs stay; correct JSON passes through unchanged.
function escapeLatexBackslashes(t) {
  let out = '';
  let inString = false;
  let math = null; // the open math delimiter in the current string
  let slash = false; // the previous decoded character was a literal backslash
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (!inString) {
      out += c;
      if (c === '"') { inString = true; math = null; slash = false; }
      continue;
    }
    if (c === '"') { out += c; inString = false; continue; }
    if (c !== '\\') {
      if (slash) {
        if ((c === '(' || c === '[') && !math) math = c;
        else if ((c === ')' && math === '(') || (c === ']' && math === '[')) math = null;
      } else if (c === '$') {
        const d = t[i + 1] === '$' ? '$$' : '$';
        if (!math) math = d; else if (math === d) math = null;
        if (d === '$$') { out += '$'; i++; }
      }
      out += c;
      slash = false;
      continue;
    }
    const n = t[i + 1];
    if (n === '\\') { out += '\\\\'; i++; slash = true; continue; }
    if (n === '"' || n === '/') { out += c + n; i++; slash = false; continue; }
    if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(t.slice(i + 2, i + 6))) { out += t.slice(i, i + 6); i += 5; slash = false; continue; }
    if (n && 'bfnrt'.includes(n)) {
      LETTERS.lastIndex = i + 1;
      const latex = LATEX_ESCAPE_CLASH.has(LETTERS.exec(t)[0]) && (n === 'b' || n === 'f' || math);
      if (!latex) { out += c + n; i++; slash = false; continue; }
    }
    out += '\\\\'; // a literal backslash; the next character is read on its own
    slash = true;
  }
  return out;
}

// Robust JSON extraction from model output.
function parseModelJSON(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  const fixed = escapeLatexBackslashes(t);
  const noTrailingCommas = (s) => s.replace(/,\s*([}\]])/g, '$1');
  for (const candidate of [fixed, t, noTrailingCommas(fixed), noTrailingCommas(t)]) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  throw httpError(502, 'The model returned malformed JSON. Try again (or a different model). Raw start: ' + t.slice(0, 200));
}

module.exports = { callLLM, callLLMRaw, parseModelJSON, httpError };
