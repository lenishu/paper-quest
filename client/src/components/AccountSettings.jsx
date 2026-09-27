import React, { useEffect, useRef, useState } from 'react';
import { api, openSession, switchAccount } from '../api';
import JudgeAccess from './JudgeAccess';
import { chooseGoogleAccount } from './GoogleReturn';

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
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [loadingSession, setLoadingSession] = useState(true);
  const googleButton = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setLoadingSession(true); setError('');
    openSession().then(value => { if (!cancelled) setSession(value); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoadingSession(false); });
    return () => { cancelled = true; };
  }, [sessionAttempt]);
  useEffect(() => {
    if (!session?.googleEnabled || session.account) return;
    let cancelled = false;
    setError('');
    Promise.all([loadGoogle(), api('/auth/google/start', { method: 'POST' })]).then(([, config]) => {
      if (cancelled) return;
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.initialize({ client_id: config.clientId, nonce: config.nonce, auto_select: false, button_auto_select: false, use_fedcm_for_button: true,
        callback: async ({ credential }) => {
          if (cancelled) return;
          setBusy(true); setError('');
          try {
            await api('/auth/google', { method: 'POST', body: { credential } });
            window.location.assign('/');
          } catch (e) { setError(e.message); setBusy(false); }
        }
      });
      if (!googleButton.current) return;
      googleButton.current.replaceChildren();
      window.google.accounts.id.renderButton(googleButton.current, { type: 'icon', theme: 'outline', size: 'large', shape: 'square' });
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
    {!session ? loadingSession ? <p role="status">Loading account…</p> : <button className="btn-primary" onClick={() => setSessionAttempt(n => n + 1)}>Retry loading account</button> : session.account ? <>
      <p>Signed in as <strong>{session.account.name}</strong><br /><span className="dim small">{session.account.email}</span></p>
      <p className="dim small">Sign in with this Google account on another device to reopen your projects.</p>
      <div className="account-actions"><button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await switchAccount(); } catch (e) { setError(e.message); setBusy(false); } }}>Switch Google account</button>
      <button className="btn-ghost" disabled={busy} onClick={signOut}>Sign out</button></div>
      {session.account.developer && <>
        <JudgeAccess />
        <h3>Developer access</h3>
        <p className="dim small">Recover your previous projects from the private backup without the old recovery key. Newer projects stay in place. Recovery preserves saved papers, lessons, notes and progress, and stops if any existing data conflicts.</p>
        <button className="btn-ghost" disabled={busy} onClick={() => recover()}>Check previous projects</button>
        {summary && <div>
          <p>{summary.projects} projects · {summary.papers} papers · {summary.lessons} saved lessons</p>
          <button className="btn-primary" disabled={busy} onClick={() => recover(true)}>Restore {summary.projects} previous projects</button>
        </div>}
      </>}
    </> : <>
      <p className="dim small">Choose a Google account below. In Google's account chooser, select another account or “Use another account” to add a new one. Each account keeps its own projects.</p>
      {session.googleEnabled ? <>
        <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await chooseGoogleAccount(); } catch(e) { setError(e.message); setBusy(false); } }}>Choose a different Google account</button>
        <p className="dim small">Opens Google's account chooser in this tab. You can select an existing account or add a new one.</p>
        <div className="google-account-choice"><div ref={googleButton} aria-label="Sign up or sign in with Google" style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined} /><span>Quick Google sign-in<br /><small>Uses a popup if supported by your browser</small></span></div>
        {error && <button className="btn-ghost" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Retry Google sign-in</button>}
      </> : <p className="dim small">Google sign-in is awaiting site setup. Recovery keys and backup import are available below.</p>}
    </>}
    {busy && <p role="status" className="dim small">Please wait…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
