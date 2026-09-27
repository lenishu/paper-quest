// Settings supports two ways to configure a connection: the form, or a code
// snippet. This module converts between them.
//   parseSnippet(text, providers)  — paste a request (Python / JS / cURL) → fields
//   renderSnippet(conn, providers, lang) — fields → a runnable snippet
// Everything here is local: nothing is sent anywhere, keys never leave the page.

const PLACEHOLDER = /^(<.*>|\{\{.*\}\}|\$\{?[A-Z_]+\}?|[A-Z][A-Z0-9_]{5,}|.*YOUR[_ -].*)$/;
const isPlaceholder = (v) => !v || PLACEHOLDER.test(v.trim());

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && !isPlaceholder(m[1])) return m[1].trim();
  }
  return '';
}

// Guess which registered provider an API root belongs to (host comparison).
function providerForUrl(url, providers) {
  const host = (() => {
    try { return new URL(url).host.toLowerCase(); } catch { return ''; }
  })();
  if (!host) return '';
  for (const [id, meta] of Object.entries(providers || {})) {
    if (!meta.baseUrl) continue;
    try {
      if (new URL(meta.baseUrl).host.toLowerCase() === host) return id;
    } catch { /* ignore malformed registry entry */ }
  }
  if (/openrouter/.test(host)) return 'openrouter';
  if (/anthropic/.test(host)) return 'anthropic';
  if (/googleapis/.test(host)) return 'gemini';
  return '';
}

export function parseSnippet(text, providers) {
  const src = String(text || '');
  if (!src.trim()) return { error: 'Paste a request snippet first.' };

  // --- endpoint → base URL -------------------------------------------------
  const urls = src.match(/https?:\/\/[^\s"'`)]+/g) || [];
  const apiUrl =
    urls.find((u) => /chat\/completions|\/v1\/messages|generateContent/i.test(u)) ||
    urls.find((u) => /\/v\d|\/api\//.test(u)) ||
    '';
  let baseUrl = apiUrl
    .replace(/\?.*$/, '')
    .replace(/\/(chat\/completions|messages|models\/[^/]+:(?:stream)?generateContent)\/?$/i, '')
    .replace(/\/$/, '');

  // --- credential ----------------------------------------------------------
  const key = firstMatch(src, [
    /Bearer\s+([^\s"'`]+)/,
    /["']?x-(?:goog-)?api-key["']?\s*[:=]\s*["']([^"']+)["']/i,
    // cURL header form: -H 'x-goog-api-key: KEY' (Google AI Studio) or -H "x-api-key: KEY"
    /(?:-H|--header)\s+["']x-(?:goog-)?api-key\s*:\s*([^\s"'`]+)/i,
    /["']?(?:api_?key|apiKey|OPENROUTER_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY)["']?\s*[:=]\s*["']([^"']+)["']/i,
    /[?&]key=([^\s"'&`]+)/
  ]);

  const model = firstMatch(src, [
    /["']?\bmodel["']?\s*:\s*["']([^"']+)["']/,
    /\bmodel\s*=\s*["']([^"']+)["']/,
    /--model\s+([^\s"']+)/,
    // Gemini REST puts the model in the path: …/models/gemini-flash-latest:generateContent
    /\/models\/([^/:\s"'`?]+):(?:stream)?generateContent/i
  ]);

  // --- reasoning block -----------------------------------------------------
  const reasoningBlock = src.match(/["']?reasoning["']?\s*[:=]\s*\{[^}]*\}/i);
  const rb = reasoningBlock ? reasoningBlock[0] : '';
  const reasoning = !!rb && !/["']?enabled["']?\s*[:=]\s*(false|False)/.test(rb);
  const effortMatch = rb.match(/["']?effort["']?\s*[:=]\s*["'](low|medium|high)["']/i);
  const reasoningEffort = effortMatch ? effortMatch[1].toLowerCase() : '';

  let provider = providerForUrl(apiUrl, providers);
  if (!provider && /x-api-key/i.test(src) && /anthropic/i.test(src)) provider = 'anthropic';
  // Google's SDK snippets (google-genai for Python / JS) carry no URL.
  if (!provider && /from google import genai|google\.genai|@google\/genai|GoogleGenAI|google\.generativeai/.test(src)) provider = 'gemini';
  if (!provider && baseUrl) provider = 'openai_compatible';
  // PaperQuest adds the API version itself for these providers, so keep only the host root.
  if (provider === 'gemini') baseUrl = baseUrl.replace(/\/v1(?:beta|alpha)?$/, '');
  if (provider === 'anthropic') baseUrl = baseUrl.replace(/\/v1$/, '');

  if (!provider && !key && !model) {
    return { error: "Couldn't read that snippet — it needs at least a URL, a model or a key." };
  }

  const patch = {};
  if (provider) patch.provider = provider;
  if (key) patch.key = key;
  if (model) patch.model = model;
  // Only carry a base URL when it isn't the provider's own default.
  const meta = (providers || {})[provider] || {};
  if (baseUrl && baseUrl !== (meta.baseUrl || '').replace(/\/$/, '')) patch.baseUrl = baseUrl;
  else if (provider) patch.baseUrl = '';
  if (rb) { patch.reasoning = reasoning; patch.reasoningEffort = reasoningEffort; }

  const found = [
    provider && `provider ${(meta.name || provider)}`,
    model && `model ${model}`,
    key && 'API key',
    rb && `reasoning ${reasoning ? 'on' : 'off'}`,
    patch.baseUrl && `base URL ${patch.baseUrl}`
  ].filter(Boolean);

  return { patch, found };
}

// ---------------------------------------------------------------- generate --

const KEY_MASK = (key) => (key ? key : '<API_KEY>');

function requestShape(conn, providers) {
  const meta = (providers || {})[conn.provider] || {};
  const kind = meta.kind || 'openai';
  const base = (conn.baseUrl || meta.baseUrl || '').replace(/\/$/, '');
  const model = conn.model || meta.defaultModel || 'model-name';
  const reasoning = !!(meta.reasoning && conn.reasoning);
  if (kind === 'gemini') {
    const root = base.replace(/\/v1(?:beta|alpha)?$/, '');
    return { kind, model, reasoning, url: `${root}/v1beta/models/${model}:generateContent`, auth: 'x-goog-api-key' };
  }
  if (kind === 'anthropic') return { kind, model, reasoning, url: `${base}/v1/messages`, auth: 'x-api-key' };
  return { kind, model, reasoning, url: `${base}/chat/completions`, auth: 'bearer' };
}

// A body object matching what server/llm.js actually sends for this connection.
function bodyFor(conn, providers) {
  const r = requestShape(conn, providers);
  if (r.kind === 'gemini') {
    return { contents: [{ role: 'user', parts: [{ text: "How many r characters are in the word strawberry?" }] }] };
  }
  const body = {
    model: r.model,
    messages: [{ role: 'user', content: "How many r characters are in the word strawberry?" }]
  };
  if (r.kind === 'anthropic') body.max_tokens = 1024;
  if (r.reasoning) {
    body.reasoning = { enabled: true, ...(conn.reasoningEffort ? { effort: conn.reasoningEffort } : {}) };
  }
  return body;
}

function headerLines(conn, providers) {
  const r = requestShape(conn, providers);
  if (r.auth === 'x-api-key') {
    return { 'x-api-key': KEY_MASK(conn.key), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
  }
  if (r.auth === 'x-goog-api-key') return { 'x-goog-api-key': KEY_MASK(conn.key), 'Content-Type': 'application/json' };
  const h = { Authorization: `Bearer ${KEY_MASK(conn.key)}`, 'Content-Type': 'application/json' };
  if (r.kind === 'openrouter') { h['HTTP-Referer'] = 'http://localhost:3001'; h['X-Title'] = 'PaperQuest'; }
  return h;
}

function urlFor(conn, providers) {
  return requestShape(conn, providers).url;
}

const indent = (t, pad) => String(t).split(String.fromCharCode(10)).join(String.fromCharCode(10) + pad);
const py = (v, pad = "  ") => indent(JSON.stringify(v, null, 2), pad).replace(/: true/g, ": True").replace(/: false/g, ": False");

export function renderSnippet(conn, providers, lang) {
  const url = urlFor(conn, providers);
  const headers = headerLines(conn, providers);
  const body = bodyFor(conn, providers);
  const r = requestShape(conn, providers);

  if (lang === 'curl') {
    const BS = String.fromCharCode(92); // avoids escaping noise in this template
    const hs = Object.entries(headers).map(([k, v]) => `  -H "${k}: ${v}" ${BS}`).join(String.fromCharCode(10));
    return [`curl ${url} ${BS}`, hs, `  -d '${JSON.stringify(body)}'`].join(String.fromCharCode(10));
  }

  if (lang === 'javascript') {
    return `const res = await fetch(${JSON.stringify(url)}, {
  method: 'POST',
  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},
  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')})
});
const data = await res.json();
const message = data.choices?.[0]?.message;
console.log(message?.content);${
      r.reasoning
        ? `

// Continue the thread: pass \`reasoning_details\` back UNMODIFIED so the model
// resumes reasoning where it left off.
const messages = [
  ...${JSON.stringify(body.messages)},
  { role: 'assistant', content: message.content, reasoning_details: message.reasoning_details },
  { role: 'user', content: 'Are you sure? Think carefully.' }
];`
        : ''
    }`;
  }

  // python (default)
  return `import requests, json

response = requests.post(
  url=${JSON.stringify(url)},
  headers=${py(headers)},
  data=json.dumps(${py(body)})
)

message = response.json()['choices'][0]['message'] if 'choices' in response.json() else response.json()
print(message)${
    r.reasoning
      ? `

# Continue the thread: pass reasoning_details back UNMODIFIED so the model
# resumes reasoning from where it left off.
messages = [
  ${py(body.messages[0])},
  {
    "role": "assistant",
    "content": message.get('content'),
    "reasoning_details": message.get('reasoning_details')
  },
  {"role": "user", "content": "Are you sure? Think carefully."}
]`
      : ''
  }`;
}

export const SNIPPET_LANGS = [
  ['python', 'Python'],
  ['javascript', 'JavaScript'],
  ['curl', 'cURL']
];
