// Deterministic exporter: PaperQuest user data -> graphify extraction JSON.
// No LLM involved — the data is already a graph. Concepts (papers) and skills
// (careers) share canonical snake_case ids, so both networks merge into ONE
// knowledge graph where careers connect to the galaxy through shared nodes.
// Output: graphify-out/knowledge/extract.json (+ x_branches sidecar mapping
// for semantic community coloring). Build/viz: scripts/build_knowledge_graph.py.
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const store = require('../server/store');

store.init();
const mastered = new Set(Object.keys(store.getMastery()));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const normBranch = (b) => String(b || 'other').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

// vis.js honors newline chars in labels — wrap long names so nodes stay compact
function wrap(t) {
  if (t.length <= 24) return t;
  const out = [];
  let line = '';
  for (const w of t.split(' ')) {
    if ((line + ' ' + w).trim().length > 24) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  out.push(line.trim());
  return out.slice(0, 3).join('\n');
}

const nodes = new Map();
const edges = [];
const branches = {}; // nodeId -> community label for the visualizer

function addNode(id, label, fileType, sourceFile, branch) {
  if (!nodes.has(id)) {
    nodes.set(id, { id, label, file_type: fileType, source_file: sourceFile, source_location: null, source_url: null, captured_at: null, author: null, contributor: null });
    if (branch) branches[id] = branch;
  }
  return nodes.get(id);
}
function addEdge(source, target, relation, sourceFile) {
  edges.push({ source, target, relation, confidence: 'EXTRACTED', confidence_score: 1.0, source_file: sourceFile, source_location: null, weight: 1.0 });
}

// knowledge node: same canonical id across projects AND careers
function knowledgeNode(n, sourceFile) {
  const id = 'k_' + n.id;
  const label = wrap((mastered.has(n.id) ? '✓ ' : '') + n.name + (n.core ? ' ★' : ''));
  addNode(id, label, 'concept', sourceFile, normBranch(n.branch));
  return id;
}

// ---- projects: concept DAGs ----
for (const p of store.listProjects()) {
  const src = `data/projects/${p.id}/project.json`;
  const pid = 'project_' + slug(p.name);
  addNode(pid, wrap('◈ ' + p.name), 'document', src, 'projects & careers');
  for (const n of p.nodes || []) {
    const kid = knowledgeNode(n, src);
    for (const pr of n.prereqs || []) addEdge('k_' + pr, kid, 'prerequisite_of', src);
    if (n.core) addEdge(pid, kid, 'references', src);
  }
}

// ---- careers: skills graphs ----
for (const c of store.listCareers()) {
  const src = `data/careers/${c.id}/career.json`;
  const cid = 'career_' + slug(c.name);
  addNode(cid, wrap('✧ ' + c.name + (c.primary ? ' (primary)' : '')), 'document', src, 'projects & careers');
  for (const s of c.skills || []) {
    const kid = knowledgeNode(s, src);
    for (const pr of s.prereqs || []) addEdge('k_' + pr, kid, 'prerequisite_of', src);
    if (s.core || s.importance === 'critical') addEdge(cid, kid, 'references', src);
  }
}

// drop edges whose endpoints don't exist (prereq ids repaired away)
const ids = new Set(nodes.keys());
const clean = edges.filter((e) => ids.has(e.source) && ids.has(e.target));

const outDir = path.join(__dirname, '..', 'graphify-out', 'knowledge');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'extract.json'), JSON.stringify({ nodes: [...nodes.values()], edges: clean, hyperedges: [], input_tokens: 0, output_tokens: 0, x_branches: branches }, null, 2));
console.log(`Exported ${nodes.size} nodes, ${clean.length} edges (${edges.length - clean.length} dangling dropped)`);

// build + visualize with graphify's own machinery
const pyPath = path.join(__dirname, '..', 'graphify-out', '.graphify_python');
if (fs.existsSync(pyPath)) {
  const python = fs.readFileSync(pyPath, 'utf8').trim();
  const r = spawnSync(python, [path.join(__dirname, 'build_knowledge_graph.py')], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  process.exit(r.status || 0);
} else {
  console.log('graphify python not found — run /graphify once first, then re-run this script.');
}
