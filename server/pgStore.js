// Postgres key-value store with the subset of the Netlify Blobs API that cloud.js
// and auth.js use: get, getWithMetadata, and set with onlyIfNew / onlyIfMatch.
// Hosts without Blobs (Vercel + Neon) pass this store to cloud.apiHandler instead.
const TABLE = 'paperquest_blobs';

// `query(text, params)` must resolve to `{ rows }` (node-postgres Pool or PGlite).
function createPgStore(query) {
  let ready;
  const init = () => (ready ||= query(`CREATE TABLE IF NOT EXISTS ${TABLE} (key text PRIMARY KEY, data text NOT NULL, etag bigint NOT NULL)`)
    .catch((error) => { ready = null; throw error; }));
  const rows = async (text, params) => { await init(); return (await query(text, params)).rows; };
  // Each write is one atomic statement, so concurrent writers cannot both succeed.
  const written = (result) => (result.length ? { modified: true, etag: String(result[0].etag) } : { modified: false });
  return {
    async get(key) {
      const found = await rows(`SELECT data FROM ${TABLE} WHERE key = $1`, [key]);
      return found.length ? found[0].data : null;
    },
    async getWithMetadata(key) {
      const found = await rows(`SELECT data, etag FROM ${TABLE} WHERE key = $1`, [key]);
      return found.length ? { data: found[0].data, etag: String(found[0].etag) } : null;
    },
    async set(key, data, options = {}) {
      if (typeof data !== 'string') throw new TypeError('Only text values can be stored.');
      if (options.onlyIfNew) {
        return written(await rows(`INSERT INTO ${TABLE} (key, data, etag) VALUES ($1, $2, 1) ON CONFLICT (key) DO NOTHING RETURNING etag`, [key, data]));
      }
      if (options.onlyIfMatch !== undefined) {
        if (!/^\d+$/.test(String(options.onlyIfMatch))) return { modified: false };
        return written(await rows(`UPDATE ${TABLE} SET data = $2, etag = etag + 1 WHERE key = $1 AND etag = $3 RETURNING etag`, [key, data, String(options.onlyIfMatch)]));
      }
      return written(await rows(`INSERT INTO ${TABLE} (key, data, etag) VALUES ($1, $2, 1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, etag = ${TABLE}.etag + 1 RETURNING etag`, [key, data]));
    }
  };
}

// Production connection for Vercel: DATABASE_URL (Neon's integration) or POSTGRES_URL.
function connect(url = process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  if (!url) throw Object.assign(new Error('Storage is not configured: set DATABASE_URL for this deployment.'), { status: 503 });
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000 });
  // Neon closes idle connections when it scales to zero; without a listener the
  // pool's error event would crash the function instance.
  pool.on('error', (error) => console.error('Idle Postgres connection closed:', error.message));
  return { pool, store: createPgStore((text, params) => pool.query(text, params)) };
}

module.exports = { createPgStore, connect, TABLE };
