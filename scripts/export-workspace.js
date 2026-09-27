// Explicit local export; provider credentials and career/resume files are excluded.
const fs = require('node:fs');
const path = require('node:path');
const { snapshot } = require('../server/cloud');
const { allowed, validateBackup } = require('../server/backup');
const root = path.resolve(__dirname, '..');
const files = Object.fromEntries(Object.entries(snapshot(path.join(root, 'data'))).filter(([name]) => allowed(name)));
const backup = { format: 'paperquest-projects-v1', files };
const summary = validateBackup(backup);
const destination = path.join(root, '.netlify', 'paperquest-projects-backup.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination + '.tmp', JSON.stringify(backup));
fs.renameSync(destination + '.tmp', destination);
console.log(`Exported ${summary.projects} projects, ${summary.papers} papers, ${summary.lessons} saved lessons to ${destination}`);
console.log('Import this private file in the hosted app: Settings > Import local projects. API keys and careers are excluded.');
