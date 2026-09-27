// Postgres key-value store with the subset of the Netlify Blobs API that cloud.js
// and auth.js use: get, getWithMetadata, and set with onlyIfNew / onlyIfMatch.
// Hosts without Blobs (Vercel + Neon) pass this store to cloud.apiHandler instead.
const TABLE = 'paperquest_blobs';

// `query(text, params)` must resolve to `{ rows }` (node-postgres Pool or PGlite).
function createPgStore(query) {
  let ready;
  // Keep encrypted snapshots in a bounded process cache. Every read still checks
  // the database revision, but unchanged workspaces no longer cross the network.
  const cache = new Map(), pending = new Map();
  const maxCacheBytes = 48 * 1024 * 1024;
  let cacheBytes = 0;
  function remember(key, value) {
    const old = cache.get(key);
    if (old) { cacheBytes -= old.bytes; cache.delete(key); }
    if (!value) return;
    const bytes = Buffer.byteLength(value.data);
    if (bytes < 64 * 1024 || bytes > maxCacheBytes) return;
    while (cacheBytes + bytes > maxCacheBytes) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).bytes;
      cache.delete(oldest);
    }
    cache.set(key, { ...value, bytes }); cacheBytes += bytes;
  }
  const run = async (text, params) => {
    try { return await query(text, params); }
    catch (error) {
      // Log categories only: database messages can contain connection details or data.
      const message = String(error.message || '');
      const reason = /quota|limit.*exceed|exceed.*limit/i.test(message) ? 'quota-exceeded'
        : /disabled|suspended/i.test(message) ? 'database-disabled'
        : /password|authentication/i.test(message) ? 'authentication-failed'
        : /certificate|ssl|tls/i.test(message) ? 'tls-error'
        : /endpoint.*not found|does not exist/i.test(message) ? 'database-not-found'
        : /timed? ?out/i.test(message) ? 'connection-timeout' : 'database-error';
      console.error('PaperQuest storage unavailable', { reason, code: /^[A-Z0-9_]{1,40}$/.test(error.code || '') ? error.code : 'UNKNOWN' });
      throw Object.assign(new Error('Workspace storage is temporarily unavailable. Please try again shortly.'), { status: 503 });
    }
  };
  const init = () => (ready ||= run(`CREATE TABLE IF NOT EXISTS ${TABLE} (key text PRIMARY KEY, data text NOT NULL, etag bigint NOT NULL)`)
    .catch((error) => { ready = null; throw error; }));
  const rows = async (text, params) => { await init(); return (await run(text, params)).rows; };
  async function read(key) {
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const cached = cache.get(key);
      const found = await rows(`SELECT etag, CASE WHEN etag = $2::bigint THEN NULL ELSE data END AS data FROM ${TABLE} WHERE key = $1`, [key, cached?.etag ?? null]);
      const value = found.length ? { data: found[0].data ?? cached.data, etag: String(found[0].etag) } : null;
      remember(key, value);
      return value;
    })();
    pending.set(key, work);
    try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
  }
  // Each write is one atomic statement, so concurrent writers cannot both succeed.
  const written = (result, key, data) => {
    // Requests starting after a write must not reuse an earlier in-flight read.
    pending.delete(key);
    remember(key, result.length ? { data, etag: String(result[0].etag) } : null);
    return result.length ? { modified: true, etag: String(result[0].etag) } : { modified: false };
  };
  return {
    async get(key) {
      return (await read(key))?.data ?? null;
    },
    async getWithMetadata(key) {
      return read(key);
    },
    async set(key, data, options = {}) {
      if (typeof data !== 'string') throw new TypeError('Only text values can be stored.');
      if (options.onlyIfNew) {
        return written(await rows(`INSERT INTO ${TABLE} (key, data, etag) VALUES ($1, $2, 1) ON CONFLICT (key) DO NOTHING RETURNING etag`, [key, data]), key, data);
      }
      if (options.onlyIfMatch !== undefined) {
        if (!/^\d+$/.test(String(options.onlyIfMatch))) return { modified: false };
        return written(await rows(`UPDATE ${TABLE} SET data = $2, etag = etag + 1 WHERE key = $1 AND etag = $3 RETURNING etag`, [key, data, String(options.onlyIfMatch)]), key, data);
      }
      return written(await rows(`INSERT INTO ${TABLE} (key, data, etag) VALUES ($1, $2, 1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, etag = ${TABLE}.etag + 1 RETURNING etag`, [key, data]), key, data);
    }
  };
}

// Production connection for Vercel: DATABASE_URL (Neon's integration) or POSTGRES_URL.
function connect(url = process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  if (!url) throw Object.assign(new Error('Storage is not configured: set DATABASE_URL for this deployment.'), { status: 503 });
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
  // Neon closes idle connections when it scales to zero; without a listener the
  // pool's error event would crash the function instance.
  pool.on('error', (error) => console.error('Idle Postgres connection closed:', error.message));
  return { pool, store: createPgStore((text, params) => pool.query(text, params)) };
}

module.exports = { createPgStore, connect, TABLE };
