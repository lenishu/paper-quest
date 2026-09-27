import React, { useState } from 'react';
import { api } from '../api';
import { useToast } from './bits';
import AccountSettings from './AccountSettings';

export default function WorkspaceSettings() {
  const [recovery, setRecovery] = useState('');
  const [restore, setRestore] = useState('');
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const toast = useToast();
  async function showRecovery() {
    try { setRecovery((await api('/session/recovery', { method: 'POST' })).key); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function restoreWorkspace() {
    if (!window.confirm('Switch to the saved workspace? Save this workspace’s recovery key first if you want to return.')) return;
    setBusy(true);
    try {
      await api('/session/restore', { method: 'POST', body: { key: restore.trim() } });
      window.location.reload();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }
  async function chooseBackup(event) {
    setBackup(null); setImportStatus('');
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 36 * 1024 * 1024) throw new Error('This backup exceeds the workspace limit.');
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.format !== 'paperquest-projects-v1' || !data.files) throw new Error('Choose a PaperQuest projects backup.');
      const projects = Object.entries(data.files).filter(([name]) => /^projects\/[^/]+\/project.json$/.test(name)).length;
      if (!projects) throw new Error('The backup contains no projects.');
      setBackup({ text, projects });
    } catch (e) { toast(e.message, 'err'); }
  }
  async function importProjects() {
    setBusy(true);
    try {
      const bytes = new TextEncoder().encode(backup.text);
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((n) => n.toString(16).padStart(2, '0')).join('');
      const id = crypto.randomUUID().replaceAll('-', '');
      const send = (body) => api('/session/import', { method: 'POST', body: { id, ...body } });
      await send({ action: 'start', size: bytes.length, digest });
      // Exported file contents are base64, so chunk boundaries are plain ASCII.
      for (let offset = 0, index = 0; offset < backup.text.length; offset += 1024 * 1024, index++) {
        setImportStatus(`Uploading backup… ${Math.round(offset / backup.text.length * 100)}%`);
        await send({ action: 'part', index, chunk: backup.text.slice(offset, offset + 1024 * 1024) });
      }
      setImportStatus('Saving projects…');
      await send({ action: 'finish' });
      window.location.reload();
    } catch (e) { setImportStatus(e.message); setBusy(false); }
  }
  return <><AccountSettings /><section className="cloud-workspace">
    <h3>Your private workspace</h3>
    <p className="dim small">Papers, progress and API keys are saved in your own encrypted workspace on Netlify. This browser remembers it. Save your recovery key to reopen it on another device or after clearing cookies. Anyone with that key can access your workspace.</p>
    <button className="btn-ghost" onClick={showRecovery}>Show recovery key</button>
    {recovery && <label className="field-label">Store this somewhere private<input aria-label="Workspace recovery key" readOnly value={recovery} onFocus={(e) => e.target.select()} /></label>}
    <label className="field-label">Open a saved workspace<input type="password" autoComplete="off" placeholder="Paste your recovery key" value={restore} onChange={(e) => setRestore(e.target.value)} /></label>
    <button className="btn-ghost" disabled={busy || !restore.trim()} onClick={restoreWorkspace}>{busy ? 'Opening…' : 'Open workspace'}</button>
    <h3>Import local projects</h3>
    <p className="dim small">In your local PaperQuest folder, run <code>npm run workspace:export</code>, then choose the backup here. Import into an empty workspace to bring across papers, lessons, notes and progress. API keys and career documents are excluded.</p>
    <label className="field-label">Projects backup<input type="file" accept=".json" aria-label="Projects backup" disabled={busy} onChange={chooseBackup} /></label>
    {backup && <button className="btn-ghost" disabled={busy} onClick={importProjects}>Import {backup.projects} projects</button>}
    {importStatus && <p className="dim small" role="status">{importStatus}</p>}
    <p className="dim small">Free hosting has usage limits. Each workspace holds up to 24 MB; each upload up to 4 MB. AI usage is billed by your chosen provider. Custom AI endpoints must be enabled by the site owner.</p>
  </section></>;
}
