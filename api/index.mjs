import { createRequire } from 'node:module';
import { attachDatabasePool, waitUntil } from '@vercel/functions';
// Keep the CommonJS server intact so Vercel's file tracer follows its requires.
const require = createRequire(import.meta.url);
const cloud = require('../server/cloud.js');
const { connect } = require('../server/pgStore.js');

let storage;
function store() {
  if (!storage) {
    storage = connect();
    // Release idle Postgres connections before Vercel suspends this instance.
    attachDatabasePool(storage.pool);
  }
  return storage.store;
}

export default {
  async fetch(request) {
    process.env.PAPERQUEST_HOSTED = 'true';
    let blobs;
    try { blobs = store(); } catch (error) { return cloud.json({ error: error.message }, error.status || 500); }
    return cloud.apiHandler(request, blobs, async (token, jobId) => {
      // Slow tasks run after the 202 response, within this invocation's maxDuration.
      const worker = new Request(new URL('/api/worker', request.url), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cloud.cookie(token).split(';')[0] },
        body: JSON.stringify({ jobId })
      });
      waitUntil(cloud.backgroundHandler(worker, blobs).catch((error) => console.error('Background task failed:', error.message)));
    });
  }
};
