import React, { useEffect, useRef, useState } from 'react';
import { api, openSession } from '../api';

let googleScript;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  googleScript ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timeout = setTimeout(() => { script.remove(); reject(new Error('Google sign-in could not load. Check your connection and try again.')); }, 15000);
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Google sign-in could not load. Check your connection and try again.')); };
    document.head.appendChild(script);
  }).catch(error => { googleScript = null; throw error; });
  return googleScript;
}

export default function AccountSettings() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const googleButton = useRef(null);
  useEffect(() => { openSession().then(setSession).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!session?.googleEnabled || session.account) return;
    let cancelled = false;
    setError('');
    Promise.all([loadGoogle(), api('/auth/google/start', { method: 'POST' })]).then(([, config]) => {
      if (cancelled) return;
      window.google.accounts.id.initialize({ client_id: config.clientId, nonce: config.nonce, auto_select: false,
        callback: async ({ credential }) => {
          if (cancelled) return;
          setBusy(true); setError('');
          try {
            await api('/auth/google', { method: 'POST', body: { credential } });
            window.location.assign('/?settings=1');
          } catch (e) { setError(e.message); setBusy(false); }
        }
      });
      googleButton.current.replaceChildren();
      window.google.accounts.id.renderButton(googleButton.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: 260 });
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [session, attempt]);
  async function signOut() {
    setBusy(true); setError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      window.google?.accounts?.id?.disableAutoSelect();
      window.location.assign('/');
    } catch (e) { setError(e.message); setBusy(false); }
  }
  async function recover(restore = false) {
    setBusy(true); setError('');
    try {
      const result = await api('/developer/projects', { method: restore ? 'POST' : 'GET' });
      if (restore) window.location.assign('/?view=projects');
      else setSummary(result);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="cloud-workspace">
    <h3>Your account</h3>
    {!session ? <p role="status">Loading account…</p> : session.account ? <>
      <p>Signed in as <strong>{session.account.name}</strong><br /><span className="dim small">{session.account.email}</span></p>
      <p className="dim small">Sign in with this Google account on another device to reopen your projects.</p>
      <button className="btn-ghost" disabled={busy} onClick={signOut}>Sign out</button>
      {session.account.developer && <>
        <h3>Developer access</h3>
        <p className="dim small">Recover your previous projects from the private backup without the old recovery key. Newer projects stay in place. Recovery preserves saved papers, lessons, notes and progress, and stops if any existing data conflicts.</p>
        <button className="btn-ghost" disabled={busy} onClick={() => recover()}>Check previous projects</button>
        {summary && <div>
          <p>{summary.projects} projects · {summary.papers} papers · {summary.lessons} saved lessons</p>
          <button className="btn-primary" disabled={busy} onClick={() => recover(true)}>Restore {summary.projects} previous projects</button>
        </div>}
      </>}
    </> : <>
      <p className="dim small">Sign up or sign in with Google to keep access to your projects without remembering a recovery key. Your first sign-up saves this workspace to your account. Returning accounts reopen their saved workspace; save this browser’s recovery key first if you want to return to it.</p>
      {session.googleEnabled ? <>
        <div ref={googleButton} aria-label="Sign up or sign in with Google" style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined} />
        {error && <button className="btn-ghost" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Retry Google sign-in</button>}
      </> : <p className="dim small">Google sign-in is awaiting site setup. Recovery keys and backup import are available below.</p>}
    </>}
    {busy && <p role="status" className="dim small">Please wait…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
