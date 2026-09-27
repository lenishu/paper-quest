import React, { useEffect, useMemo, useState } from 'react';
import { api, isCloud } from '../api';
import WorkspaceSettings from './WorkspaceSettings';
import { Modal, Spinner, useToast } from './bits';
import { parseSnippet, renderSnippet, SNIPPET_LANGS } from '../snippet';

// Build a client-side connection id for newly added rows (server preserves it on save).
const newId = () => 'c_' + Math.random().toString(16).slice(2, 12);

// section="api" is the API key menu (profile menu / sidebar button): connections only.
export default function SettingsModal({ onClose, section }) {
  const [s, setS] = useState(null);            // { connections, activeId, s2Key }
  const [providers, setProviders] = useState({});
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState({}); // { [connId]: {ok,msg} }
  const [showKey, setShowKey] = useState({});        // { [connId]: bool }
  const toast = useToast();

  useEffect(() => {
    api('/settings')
      .then((d) => {
        setProviders(d.providers || {});
        setS({ connections: d.connections || [], activeId: d.activeId || null, s2Key: d.s2Key || '' });
      })
      .catch((e) => toast(e.message, 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveRaw(next, quiet) {
    const saved = await api('/settings', { method: 'PUT', body: next });
    setProviders(saved.providers || providers);
    setS({ connections: saved.connections || [], activeId: saved.activeId || null, s2Key: saved.s2Key || '' });
    if (!quiet) toast('Settings saved', 'info');
    return saved;
  }

  const updateConn = (id, patch) =>
    setS((cur) => ({ ...cur, connections: cur.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const addConn = () => {
    const provId = providers.openai ? 'openai' : Object.keys(providers)[0] || 'openai';
    const c = { id: newId(), provider: provId, label: (providers[provId] || {}).name || provId, key: '', model: '', baseUrl: '' };
    setS((cur) => ({ ...cur, connections: [...cur.connections, c], activeId: cur.activeId || c.id }));
  };

  const removeConn = (id) =>
    setS((cur) => {
      const connections = cur.connections.filter((c) => c.id !== id);
      const activeId = cur.activeId === id ? (connections[0] ? connections[0].id : null) : cur.activeId;
      return { ...cur, connections, activeId };
    });

  async function testConn(id) {
    setTestingId(id);
    setTestResult((r) => ({ ...r, [id]: null }));
    try {
      await saveRaw(s, true); // persist ids so the server can resolve connectionId
      const r = await api('/settings/test', { method: 'POST', body: { connectionId: id } });
      setTestResult((rr) => ({ ...rr, [id]: { ok: true, msg: r.message } }));
    } catch (e) {
      setTestResult((rr) => ({ ...rr, [id]: { ok: false, msg: e.message } }));
    } finally {
      setTestingId(null);
    }
  }

  if (!s) {
    return (
      <Modal onClose={onClose}>
        <Spinner label="Loading settings…" />
      </Modal>
    );
  }

  const provList = Object.entries(providers); // [ [id, meta], … ]

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <h2>{section === 'api' ? '🔑 API key' : `⚙️ ${isCloud ? 'Account & settings' : 'Model & API keys'}`}</h2>
        <button className="iconbtn" onClick={onClose}>✕</button>
      </div>

      <div className="settings-body">
        {isCloud && section !== 'api' && <WorkspaceSettings />}
        <label className="field-label">AI connections</label>
        <p className="dim small" style={{ marginTop: 0 }}>
          Add one or more providers (OpenAI, Anthropic, Gemini, OpenRouter, Groq, Zhipu GLM, or any OpenAI-compatible
          endpoint). Keep several — even from the same provider — and pick which one is <b>active</b> for
          analysis &amp; lessons. {isCloud ? 'Keys are encrypted in your private workspace and sent to the provider when you use AI.' : <>Keys live only in <code>data/settings.json</code> on this machine.</>}
          {s.connections.some((c) => c.shared) && ' Nothing to set up: the shared free Gemini key below works for everyone.'}
        </p>

        {s.connections.length === 0 && (
          <div className="dim small">No connections yet — add one to enable analysis and lessons.</div>
        )}

        {s.connections.map((c) => {
          const meta = providers[c.provider] || {};
          const active = s.activeId === c.id;
          const tr = testResult[c.id];
          if (c.shared) {
            // Held on the server and never sent here; the server cycles the key pool.
            return (
              <div key={c.id} className={`conn-card conn-shared ${active ? 'active' : ''}`}>
                <div className="conn-top">
                  <label className="conn-active">
                    <input type="radio" name="active-conn" checked={active} onChange={() => setS((cur) => ({ ...cur, activeId: c.id }))} />
                    {active ? 'Active' : 'Set active'}
                  </label>
                  <span className="shared-badge">Shared API · free</span>
                </div>
                <div className="conn-grid">
                  <label className="conn-field"><span>Provider</span><input value={meta.name || 'Google Gemini'} disabled /></label>
                  <label className="conn-field"><span>Model</span><input value={meta.defaultModel || ''} disabled /></label>
                </div>
                <label className="conn-field">
                  <span>API key</span>
                  <input value="Shared API — will cycle it" disabled aria-describedby="shared-key-note" />
                </label>
                <p id="shared-key-note" className="dim small conn-shared-note">
                  PaperQuest's free Gemini key, shared by every account so you never have to hunt for one. It stays on the
                  server, we cycle it regularly, and requests move to the next key when one hits its rate limit. For heavy
                  use, add your own key below and set it active.
                </p>
                <div className="conn-actions">
                  <button className="btn small-btn" onClick={() => testConn(c.id)} disabled={testingId === c.id}>
                    {testingId === c.id ? 'Testing…' : 'Test'}
                  </button>
                  {tr && <span className={`conn-test ${tr.ok ? 'ok' : 'bad'}`}>{tr.ok ? '✓ ' : '✗ '}{tr.msg}</span>}
                </div>
              </div>
            );
          }
          return (
            <div key={c.id} className={`conn-card ${active ? 'active' : ''}`}>
              <div className="conn-top">
                <label className="conn-active">
                  <input
                    type="radio"
                    name="active-conn"
                    checked={active}
                    onChange={() => setS((cur) => ({ ...cur, activeId: c.id }))}
                  />
                  {active ? 'Active' : 'Set active'}
                </label>
                <button className="linkbtn danger" onClick={() => removeConn(c.id)}>Remove</button>
              </div>

              <div className="conn-grid">
                <label className="conn-field">
                  <span>Provider</span>
                  <select
                    value={c.provider}
                    onChange={(e) => {
                      const prov = e.target.value;
                      const relabel = !c.label || provList.some(([, m]) => m.name === c.label);
                      updateConn(c.id, { provider: prov, ...(relabel ? { label: (providers[prov] || {}).name || prov } : {}) });
                    }}
                  >
                    {provList.map(([id, m]) => (
                      <option key={id} value={id}>{m.name}</option>
                    ))}
                  </select>
                </label>

                <label className="conn-field">
                  <span>Label</span>
                  <input value={c.label} placeholder={meta.name || 'e.g. Work key'} onChange={(e) => updateConn(c.id, { label: e.target.value })} />
                </label>
              </div>

              <label className="conn-field">
                <span>
                  API key{' '}
                  {meta.getKey && (
                    <a href={meta.getKey} target="_blank" rel="noreferrer" className="linkbtn">(get one)</a>
                  )}
                </span>
                <div className="keyrow">
                  <input
                    type={showKey[c.id] ? 'text' : 'password'}
                    placeholder={meta.keyHint || 'API key'}
                    value={c.key}
                    onChange={(e) => updateConn(c.id, { key: e.target.value })}
                  />
                  <button className="iconbtn" title={showKey[c.id] ? 'Hide' : 'Show'} onClick={() => setShowKey((k) => ({ ...k, [c.id]: !k[c.id] }))}>
                    {showKey[c.id] ? '🙈' : '👁️'}
                  </button>
                </div>
              </label>

              <div className="conn-grid">
                <label className="conn-field">
                  <span>Model</span>
                  <input
                    placeholder={meta.defaultModel ? `default: ${meta.defaultModel}` : 'e.g. my-model'}
                    value={c.model}
                    onChange={(e) => updateConn(c.id, { model: e.target.value })}
                  />
                  <span className="conn-hint">
                    {(c.model || '').trim()
                      ? `Using ${c.model.trim()}`
                      : meta.defaultModel
                        ? `Using the default, ${meta.defaultModel}`
                        : 'Required: your provider’s model code'}
                  </span>
                </label>
                {meta.custom && (
                  <label className="conn-field">
                    <span>Base URL</span>
                    <input
                      placeholder="https://host/v1"
                      value={c.baseUrl}
                      onChange={(e) => updateConn(c.id, { baseUrl: e.target.value })}
                    />
                  </label>
                )}
              </div>

              {meta.reasoning && (
                <div className="conn-reason">
                  <label className="conn-active">
                    <input
                      type="checkbox"
                      checked={!!c.reasoning}
                      onChange={(e) => updateConn(c.id, { reasoning: e.target.checked })}
                    />
                    Reasoning tokens
                  </label>
                  {c.reasoning && (
                    <select
                      value={c.reasoningEffort || ''}
                      onChange={(e) => updateConn(c.id, { reasoningEffort: e.target.value })}
                    >
                      <option value="">effort: provider default</option>
                      <option value="low">effort: low</option>
                      <option value="medium">effort: medium</option>
                      <option value="high">effort: high</option>
                    </select>
                  )}
                  <span className="dim small">The model thinks before it answers, and carries that thinking into follow-up questions.</span>
                </div>
              )}

              <div className="conn-actions">
                <button className="btn small-btn" onClick={() => testConn(c.id)} disabled={testingId === c.id}>
                  {testingId === c.id ? 'Testing…' : 'Test'}
                </button>
                {tr && <span className={`conn-test ${tr.ok ? 'ok' : 'bad'}`}>{tr.ok ? '✓ ' : '✗ '}{tr.msg}</span>}
              </div>

              <ConnCodePanel
                conn={c}
                providers={providers}
                onApply={(patch) => {
                  // A snippet that changes the provider also renames the row, unless the user named it.
                  const relabel = patch.provider && (!c.label || provList.some(([, m]) => m.name === c.label));
                  updateConn(c.id, {
                    ...patch,
                    ...(relabel ? { label: (providers[patch.provider] || {}).name || patch.provider } : {})
                  });
                }}
              />
            </div>
          );
        })}

        <button className="btn btn-ghost btn-add-conn" onClick={addConn}>＋ Add connection</button>

        <label className="field-label">Semantic Scholar API key (optional)</label>
        <p className="dim small" style={{ marginTop: 0 }}>
          Used for the paper reference/citation network. Without a key the free shared tier is heavily
          rate-limited.{' '}
          <a href="https://www.semanticscholar.org/product/api#api-key-form" target="_blank" rel="noreferrer" className="linkbtn">(request one)</a>
        </p>
        <div className="keyrow">
          <input
            type={showKey.s2 ? 'text' : 'password'}
            placeholder="Semantic Scholar key"
            value={s.s2Key}
            onChange={(e) => setS((cur) => ({ ...cur, s2Key: e.target.value }))}
          />
          <button className="iconbtn" title={showKey.s2 ? 'Hide' : 'Show'} onClick={() => setShowKey((k) => ({ ...k, s2: !k.s2 }))}>
            {showKey.s2 ? '🙈' : '👁️'}
          </button>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                await saveRaw(s);
                onClose();
              } catch (e) {
                toast(e.message, 'err');
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

const SNIPPET_PLACEHOLDER = [
  'requests.post(',
  '  url="https://openrouter.ai/api/v1/chat/completions",',
  '  headers={"Authorization": "Bearer sk-or-v1-…"},',
  '  data=json.dumps({"model": "google/gemma-4-31b-it:free", "reasoning": {"enabled": True}})',
  ')'
].join('\n');

// The second way to set a connection up: paste the vendor's snippet and let it
// fill the form, or read back the exact request PaperQuest will send.
function ConnCodePanel({ conn, providers, onApply }) {
  const [open, setOpen] = useState(false);
  const [snippet, setSnippet] = useState('');
  const [status, setStatus] = useState(null); // { ok, msg }
  const [lang, setLang] = useState('python');
  const toast = useToast();

  const generated = useMemo(() => {
    try {
      return renderSnippet(conn, providers, lang);
    } catch (e) {
      return '// ' + e.message;
    }
  }, [conn, providers, lang]);

  function apply() {
    const r = parseSnippet(snippet, providers);
    if (r.error) {
      setStatus({ ok: false, msg: r.error });
      return;
    }
    onApply(r.patch);
    const model = (r.patch.model || conn.model || '').trim() || ((providers || {})[r.patch.provider || conn.provider] || {}).defaultModel;
    const noKey = !r.patch.key && !(conn.key || '').trim();
    setStatus({
      ok: true,
      msg: 'Filled in: ' + r.found.join(', ') + '.' +
        (model ? ` Model in use: ${model}.` : '') +
        (noKey ? ' The snippet has no key, so paste yours into the API key field.' : '') +
        ' Review the fields, then Save.'
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(generated);
      toast('Code copied', 'info');
    } catch {
      setStatus({ ok: false, msg: 'Clipboard blocked — select the code and copy it manually.' });
    }
  }

  return (
    <div className="conn-code">
      <button className="linkbtn" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} Set up with code
      </button>

      {open && (
        <div className="conn-code-body">
          <label className="conn-field">
            <span>Paste a request — Python, JavaScript or cURL</span>
            <textarea
              className="conn-snippet"
              rows={7}
              spellCheck={false}
              placeholder={SNIPPET_PLACEHOLDER}
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
            />
          </label>
          <div className="conn-actions">
            <button className="btn small-btn" onClick={apply} disabled={!snippet.trim()}>
              Read snippet → fill fields
            </button>
            {status && (
              <span className={`conn-test ${status.ok ? 'ok' : 'bad'}`}>
                {status.ok ? '✓ ' : '✗ '}{status.msg}
              </span>
            )}
          </div>

          <div className="conn-code-head">
            <span className="field-sub">The request PaperQuest sends for this connection</span>
            <span className="seg">
              {SNIPPET_LANGS.map(([id, label]) => (
                <button key={id} className={`seg-btn ${lang === id ? 'active' : ''}`} onClick={() => setLang(id)}>
                  {label}
                </button>
              ))}
              <button className="btn small-btn" onClick={copy}>Copy</button>
            </span>
          </div>
          <pre className="conn-snippet-out"><code>{generated}</code></pre>
          <p className="dim small">
            The key is inlined so the snippet runs as-is — keep it off screen shares.
          </p>
        </div>
      )}
    </div>
  );
}
