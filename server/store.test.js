// Storage listing tests against a throwaway workspace directory. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const workspace = require('./workspace');
const store = require('./store');

test('project and career listings skip folders that are not ids (e.g. .obsidian)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-store-'));
  try {
    workspace.run(dir, () => {
      fs.mkdirSync(path.join(dir, 'projects', '.obsidian'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'careers', '.obsidian'), { recursive: true });
      const kept = store.createProject('Kept');
      assert.deepEqual(store.listProjects().map((p) => p.id), [kept.id]);
      assert.deepEqual(store.listCareers(), []);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
