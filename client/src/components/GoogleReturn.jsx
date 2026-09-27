import React, { useEffect, useState } from 'react';
import { api } from '../api';

const params = new URLSearchParams(window.location.hash.slice(1));
export const hasGoogleReturn = params.has('id_token') || (params.has('error') && params.has('state'));
// Clear identity tokens from browser history before rendering the app.
if (hasGoogleReturn) window.history.replaceState({}, '', window.location.pathname);
const STATE_KEY = 'paperquest-google-chooser';

export async function chooseGoogleAccount() {
  const { clientId, nonce } = await api('/auth/google/start', { method: 'POST' });
  sessionStorage.setItem(STATE_KEY, nonce);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: window.location.origin + '/',
    response_type: 'id_token', response_mode: 'fragment', scope: 'openid email profile',
    prompt: 'select_account', nonce, state: nonce }).toString();
  window.location.assign(url.toString());
}

export default function GoogleReturn() {
  const [error, setError] = useState('');
  useEffect(() => {
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    if (!expected || params.get('state') !== expected) { setError('This sign-in could not be matched to your browser. Start again.'); return; }
    if (params.has('error')) { setError('Google sign-in was cancelled. You can try again or return to your workspace.'); return; }
    // Existing server checks signature, audience, issuer, expiry and one-use
    // nonce bound to this browser before linking or reopening an account.
    api('/auth/google', { method: 'POST', body: { credential: params.get('id_token') } })
      .then(() => window.location.replace('/')).catch(e => setError(e.message));
  }, []);
  return <main className="judge-entry card"><h1>{error ? 'Sign-in needs another try' : 'Opening your account…'}</h1>
    {error ? <><p role="alert">{error}</p><a className="btn-primary" href="/?account=1">Choose a Google account</a></> : <p role="status">Restoring your saved workspace.</p>}</main>;
}
