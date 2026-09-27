const MAX_BYTES = 24 * 1024 * 1024;
const MAX_TEXT = 36 * 1024 * 1024;
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
const allowed = (name) => /^(mastery|profile|bookmarks)\.json$/.test(name) ||
  /^projects\/[a-zA-Z0-9_-]{1,160}\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(json|jsonl|md|pdf)$/.test(name);

function validateBackup(backup) {
  if (backup?.format !== 'paperquest-projects-v1' || !backup.files || typeof backup.files !== 'object' || Array.isArray(backup.files)) throw invalid('Choose a PaperQuest projects backup.');
  const entries = Object.entries(backup.files);
  if (!entries.length || entries.length > 2000) throw invalid('Invalid backup file count.');
  let bytes = 0, projects = 0, papers = 0, lessons = 0;
  const files = Object.create(null);
  for (const [name, value] of entries) {
    if (!allowed(name) || name.split('/').some((part) => part === '.' || part === '..') || !value || typeof value.data !== 'string') throw invalid('The backup contains an unsupported file.');
    const data = Buffer.from(value.data, 'base64');
    if (data.toString('base64') !== value.data) throw invalid('Invalid backup encoding.');
    bytes += data.length;
    if (bytes > MAX_BYTES) throw invalid('The backup exceeds the 24 MB workspace limit.');
    if (name.endsWith('.json')) {
      let item;
      try { item = JSON.parse(data.toString()); } catch { throw invalid('The backup contains invalid JSON.'); }
      if (/^projects\/[^/]+\/project.json$/.test(name)) {
        if (item.id !== name.split('/')[1] || !Array.isArray(item.papers) || !Array.isArray(item.nodes)) throw invalid('Invalid project in backup.');
        projects++; papers += item.papers.length;
      }
    }
    if (/\/lessons\/[^/]+\.json$/.test(name) && !name.endsWith('.chat.json')) lessons++;
    files[name] = { data: value.data, mtime: Number.isFinite(value.mtime) ? value.mtime : Date.now() };
  }
  for (const name of Object.keys(files).filter((name) => name.startsWith('projects/'))) {
    if (!files[`projects/${name.split('/')[1]}/project.json`]) throw invalid('A project is missing its metadata.');
  }
  if (!projects) throw invalid('The backup contains no projects.');
  return { files, projects, papers, lessons, bytes };
}

function canImport(current, files, { preserveOtherProjects = false } = {}) {
  // Import into an empty workspace, or safely repeat the same completed import.
  for (const [name, value] of Object.entries(current)) {
    if (value.data === files[name]?.data || name === 'settings.json') continue;
    // Developer recovery can add old projects alongside newer ones. Never
    // mix two versions of the same project or replace newer global progress.
    if (preserveOtherProjects && name.startsWith('projects/') && !files[`projects/${name.split('/')[1]}/project.json`]) continue;
    if (name.startsWith('projects/') || name.startsWith('careers/')) return false;
    if (['mastery.json', 'bookmarks.json', 'profile.json'].includes(name)) {
      const item = JSON.parse(Buffer.from(value.data, 'base64').toString());
      if (name === 'profile.json' ? Object.values(item).some((v) => v !== 0) : Object.keys(item).length > 0) return false;
    }
  }
  return true;
}

module.exports = { validateBackup, canImport, allowed, MAX_TEXT };
