const { AsyncLocalStorage } = require('node:async_hooks');
const path = require('node:path');

const context = new AsyncLocalStorage();
function dataDir() {
  const active = context.getStore();
  if (active) return active.directory;
  if (process.env.NETLIFY) throw new Error('A private workspace is required.');
  return path.join(__dirname, '..', 'data');
}

// Identifiers must remain single path segments, including when supplied by a model.
function segment(value) {
  const text = String(value || '');
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(text)) {
    throw Object.assign(new Error('Invalid identifier'), { status: 400 });
  }
  return text;
}

module.exports = { dataDir, segment, run: (directory, fn) => context.run({ directory }, fn) };
