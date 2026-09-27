// Run explicitly by the site owner. Never package private data in client assets.
const fs = require('node:fs');
const path = require('node:path');
const { validateBackup } = require('../server/backup');
const { seal } = require('../server/cloud');
const { BACKUP_KEY } = require('../server/auth');

// Vercel + Neon uses DATABASE_URL; Netlify uses its Blobs store.
function openStore() {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    const { pool, store } = require('../server/pgStore').connect();
    return { store, close: () => pool.end() };
  }
  if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_AUTH_TOKEN) throw new Error('Set DATABASE_URL (Vercel) or NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN (Netlify) for your own deployment.');
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: 'paperquest-private-v1', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN, consistency: 'strong' });
  return { store, close: async () => {} };
}

async function main() {
  const secret = process.env.PAPERQUEST_AUTH_SECRET || '';
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Set PAPERQUEST_AUTH_SECRET to the same 64-character hex secret used by the deployed app.');
  const source = path.resolve(process.argv[2] || path.join(__dirname, '../.netlify/paperquest-projects-backup.json'));
  const backup = JSON.parse(fs.readFileSync(source, 'utf8'));
  const { projects, papers, lessons } = validateBackup(backup);
  const { store, close } = openStore();
  try {
    const result = await store.set(BACKUP_KEY, seal(backup, 'developer-backup:' + secret), { onlyIfNew: true });
    if (!result.modified) throw new Error('A developer backup is already staged. It was left unchanged.');
  } finally {
    await close();
  }
  console.log(`Staged private backup: ${projects} projects, ${papers} papers, ${lessons} saved lessons. Sign in as an approved developer and open Settings > Developer access.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
