// Google identity is separate from the bearer recovery key. Developer access
// always requires a recent, server-authenticated account session.
const crypto = require('node:crypto');
const { validateBackup, canImport } = require('./backup');
const AUTH = '__Host-paperquest-account';
const NONCE = '__Host-paperquest-google';
const BACKUP_KEY = 'developer/projects-backup-v1';
// OAuth client IDs are public identifiers; secrets stay in server environment variables.
const clientId = () => process.env.GOOGLE_CLIENT_ID || require('./auth-config.json').googleClientId;
const fail = (status, message) => Object.assign(new Error(message), { status });
const random = () => crypto.randomBytes(32).toString('hex');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const readCookie = (req, name) => (req.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
const makeCookie = (name, value, seconds) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
function secret() {
  const key = process.env.PAPERQUEST_AUTH_SECRET || '';
  if (!/^[a-f0-9]{64}$/.test(key)) throw fail(503, 'Google sign-in needs the site owner to finish account setup.');
  return key;
}
function configured() {
  return Boolean(clientId() && /^[a-f0-9]{64}$/.test(process.env.PAPERQUEST_AUTH_SECRET || ''));
}
function developer(user) {
  const list = name => (process.env[name] || '').split(',').map(s => s.trim()).filter(Boolean);
  return list('PAPERQUEST_DEVELOPER_GOOGLE_SUBS').includes(user.sub) ||
    (user.authoritativeEmail && list('PAPERQUEST_DEVELOPER_EMAILS').map(s => s.toLowerCase()).includes(user.email.toLowerCase()));
}
async function verifyGoogle(credential) {
  const { OAuth2Client } = require('google-auth-library');
  const ticket = await new OAuth2Client().verifyIdToken({ idToken: credential, audience: clientId() });
  return ticket.getPayload();
}
function createAuth(options = {}) {
  const verify = options.verifyGoogle || verifyGoogle;
  // Lazy import keeps cloud's existing encryption format in one place.
  const helpers = () => require('./cloud');
  function inspect(req, token) {
    if (!configured()) return null;
    try {
      const user = helpers().unseal(readCookie(req, AUTH) || '', 'account-session:' + secret());
      if (user.token !== token || user.expires <= Date.now() || !user.sub) return null;
      return { ...user, developer: Boolean(developer(user)) };
    } catch { return null; }
  }
  function info(req, token) {
    const user = inspect(req, token);
    return { googleEnabled: configured(), account: user ? { name: user.name, email: user.email, developer: user.developer } : null };
  }
  async function handle(req, blobs, token) {
    const { json, seal, unseal, cookie, namespace, saveChanges } = helpers();
    const route = new URL(req.url).pathname;
    if (!route.startsWith('/api/auth/') && !route.startsWith('/api/developer/')) return null;
    if (!token) throw fail(401, 'Reload the page before signing in.');
    const reply = (body, cookies) => {
      const response = json(body);
      for (const value of cookies) response.headers.append('Set-Cookie', value);
      return response;
    };
    if (route === '/api/auth/logout' && req.method === 'POST') {
      return reply({ ok: true }, [cookie(random()), makeCookie(AUTH, '', 0), makeCookie(NONCE, '', 0)]);
    }
    if (!configured()) throw fail(503, 'Google sign-in needs the site owner to finish account setup.');
    if (route === '/api/auth/google/start' && req.method === 'POST') {
      const nonce = random();
      await blobs.set(namespace(token) + '/auth-challenge', JSON.stringify({ nonceHash: hash(nonce), expires: Date.now() + 10 * 60 * 1000 }));
      return reply({ clientId: clientId(), nonce }, [makeCookie(NONCE, nonce, 600)]);
    }
    if (route === '/api/auth/google' && req.method === 'POST') {
      let body;
      const raw = await req.text();
      if (raw.length > 16000) throw fail(400, 'Invalid Google sign-in response.');
      try { body = JSON.parse(raw); } catch { throw fail(400, 'Invalid Google sign-in response.'); }
      const nonce = readCookie(req, NONCE);
      if (!/^[a-f0-9]{64}$/.test(nonce || '') || typeof body.credential !== 'string') throw fail(401, 'Start Google sign-in again.');
      let payload;
      try { payload = await verify(body.credential); } catch { throw fail(401, 'Google could not verify this sign-in. Please try again.'); }
      if (!payload || payload.nonce !== nonce || !payload.sub || payload.email_verified !== true || !payload.email) throw fail(401, 'Use a verified Google account and start sign-in again.');
      const challengeKey = namespace(token) + '/auth-challenge';
      const saved = await blobs.getWithMetadata(challengeKey, { type: 'text', consistency: 'strong' });
      const challenge = saved && JSON.parse(saved.data);
      if (!challenge || challenge.used || challenge.expires <= Date.now() || challenge.nonceHash !== hash(nonce)) throw fail(401, 'Google sign-in expired. Please try again.');
      const consumed = await blobs.set(challengeKey, JSON.stringify({ used: true }), { onlyIfMatch: saved.etag });
      if (!consumed.modified) throw fail(401, 'This sign-in was already used. Please try again.');
      const accountKey = 'auth/google/' + hash(payload.sub);
      const encryptionKey = 'google-account:' + secret();
      let account = await blobs.get(accountKey, { type: 'text', consistency: 'strong' });
      if (!account) {
        // A recovered/shared workspace key cannot link another person's account.
        const ownerKey = namespace(token) + '/owner';
        const owner = await blobs.set(ownerKey, hash(payload.sub), { onlyIfNew: true });
        if (!owner.modified && await blobs.get(ownerKey, { type: 'text', consistency: 'strong' }) !== hash(payload.sub)) token = random();
        await blobs.set(namespace(token) + '/owner', hash(payload.sub), { onlyIfNew: true });
        await blobs.set(accountKey, seal({ token }, encryptionKey), { onlyIfNew: true });
        account = await blobs.get(accountKey, { type: 'text', consistency: 'strong' });
      }
      token = unseal(account, encryptionKey).token;
      const user = { sub: payload.sub, email: payload.email, name: payload.name || payload.email,
        authoritativeEmail: payload.email.toLowerCase().endsWith('@gmail.com') || Boolean(payload.hd),
        token, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 };
      return reply({ ok: true }, [cookie(token), makeCookie(AUTH, seal(user, 'account-session:' + secret()), 7 * 86400), makeCookie(NONCE, '', 0)]);
    }
    if (route.startsWith('/api/developer/')) {
      const user = inspect(req, token);
      if (!user?.developer) throw fail(403, 'Sign in with an approved developer Google account to recover projects.');
      if (route !== '/api/developer/projects' || !['GET', 'POST'].includes(req.method)) throw fail(404, 'Not found.');
      const saved = await blobs.get(BACKUP_KEY, { type: 'text', consistency: 'strong' });
      if (!saved) throw fail(404, 'No developer backup has been staged yet. You can still use Import local projects below.');
      const { files, ...summary } = validateBackup(unseal(saved, 'developer-backup:' + secret()));
      if (req.method === 'GET') return json(summary);
      const key = namespace(token) + '/workspace';
      const existing = await blobs.get(key, { type: 'text', consistency: 'strong' });
      const current = existing ? unseal(existing, token) : {};
      const recoveryOptions = { preserveOtherProjects: true };
      if (!canImport(current, files, recoveryOptions)) throw fail(409, 'Recovery stopped because a saved project or your progress conflicts with the backup. Your current data is unchanged.');
      await saveChanges(blobs, key, token, current, { ...current, ...files }, latest => {
        if (!canImport(latest, files, recoveryOptions)) throw fail(409, 'Your workspace changed during recovery. Existing projects and progress were preserved.');
      });
      return json({ ...summary, restored: true });
    }
    throw fail(404, 'Not found.');
  }
  return { inspect, info, handle };
}
module.exports = { createAuth, BACKUP_KEY };
