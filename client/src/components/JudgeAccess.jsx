import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function JudgeAccess() {
  const [status, setStatus] = useState(null), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = () => api('/developer/judge-access').then(setStatus).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  async function change(method) {
    setBusy(true); setError('');
    try { const result = await api('/developer/judge-access', { method }); setKey(result.key || ''); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="judge-access">
    <h3>Judge access</h3>
    <p className="dim small">Share a read-only snapshot of your project and career graphs. Judges need no Google account. API keys, documents, notes, chats and resumes stay private.</p>
    {status?.active && <p>{status.projects} projects shared · expires {new Date(status.expires).toLocaleDateString()}</p>}
    <div className="account-actions"><button className="btn-primary" disabled={busy} onClick={() => change('POST')}>{status?.active ? 'Refresh snapshot & replace key' : 'Create judge access key'}</button>
      {status?.active && <button className="btn-ghost" disabled={busy} onClick={() => change('DELETE')}>Revoke judge access</button>}</div>
    <p className="dim small">Keys last 30 days. Creating a new key immediately invalidates the old one. Refresh the snapshot after uploading or mapping more papers.</p>
    {key && <div className="judge-key-box"><label className="field-label">Save this access key<input readOnly aria-label="Judge access key" value={key} onFocus={e => e.target.select()} /></label>
      <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(key).catch(() => setError('Select the key above and copy it.'))}>Copy key</button>
      <p>Share this link and the key separately: <a href="/?judge=1" target="_blank" rel="noreferrer">{window.location.origin}/?judge=1</a></p></div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
