// Pure graph helpers: sanitize LLM output into a clean DAG, compute depths and states.

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

// Takes raw nodes from the model, returns a clean acyclic graph with depths.
function sanitizeGraph(rawNodes) {
  if (!Array.isArray(rawNodes)) throw new Error('Model output missing "nodes" array');
  const seen = new Set();
  const nodes = [];
  for (const raw of rawNodes) {
    if (!raw || typeof raw !== 'object') continue;
    let nid = slugify(raw.id || raw.name);
    if (!nid || seen.has(nid)) {
      if (!nid) continue;
      let i = 2;
      while (seen.has(nid + '_' + i)) i++;
      nid = nid + '_' + i;
    }
    seen.add(nid);
    nodes.push({
      id: nid,
      name: String(raw.name || nid).slice(0, 90),
      level: raw.level === 0 ? 0 : 1,
      core: !!raw.core,
      branch: String(raw.branch || '').slice(0, 50),
      tier: ['novice', 'intermediate', 'advanced'].includes(raw.tier) ? raw.tier : '',
      blurb: String(raw.blurb || '').slice(0, 500),
      prereqs: Array.isArray(raw.prereqs) ? raw.prereqs.map(slugify) : [],
      sources: Array.isArray(raw.sources) ? raw.sources : [],
      usedInPaper: String(raw.used_in_paper || '').slice(0, 800),
      forNewPaper: !!raw.for_new_paper
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Drop unknown prereqs, self-references, and prereqs on baseline nodes.
  for (const n of nodes) {
    n.prereqs = [...new Set(n.prereqs)].filter((p) => p !== n.id && byId.has(p));
    if (n.level === 0) n.prereqs = [];
  }

  // Break cycles with DFS (drop the edge that closes a cycle).
  const color = new Map(); // 0 white, 1 gray, 2 black
  function dfs(n) {
    color.set(n.id, 1);
    n.prereqs = n.prereqs.filter((pid) => {
      const c = color.get(pid) || 0;
      if (c === 1) return false; // back edge -> drop
      if (c === 0) dfs(byId.get(pid));
      return true;
    });
    color.set(n.id, 2);
  }
  for (const n of nodes) if ((color.get(n.id) || 0) === 0) dfs(n);

  computeDepths(nodes);
  return nodes;
}

// ---------------- graph repair backstop ----------------
// The model sometimes returns a flat list: learnable nodes with no prereqs, no
// branch, all at depth 1. That renders as a useless wall of disconnected boxes.
// These helpers detect that and rebuild a connected, layered DAG so the tree
// always tells the "review these foundations, in order, up to the paper" story.

const BRANCH_KEYWORDS = [
  ['quantum mechanics', ['quantum', 'qubit', 'hilbert', 'unitary', 'hermitian', 'pauli', 'bra', 'ket', 'dirac', 'hamiltonian', 'observable', 'wavefunction', 'eigenstate', 'ansatz', 'variational quantum']],
  ['optimization', ['optimization', 'optimisation', 'gradient descent', 'convex', 'lagrang', 'minimiz', 'maximiz', 'descent', 'step size', 'learning rate', 'lipschitz', 'sgd', 'loss function', 'polyak', 'stationary point']],
  ['probability & statistics', ['probability', 'statistic', 'distribution', 'random', 'expectation', 'variance', 'bayes', 'stochastic', 'likelihood', 'sampling', 'markov', 'softmax', 'estimator', 'gaussian']],
  ['information theory', ['information theory', 'mutual information', 'kl divergence', 'shannon', 'entropy', 'coding']],
  ['calculus', ['derivative', 'gradient', 'integral', 'differential', 'calculus', 'taylor', 'partial', 'jacobian', 'hessian', 'chain rule', 'limit', 'smoothness']],
  ['linear algebra', ['matrix', 'matrices', 'vector', 'eigen', 'tensor', 'norm', 'spectral', 'linear', 'dot product', 'orthogonal', 'basis', 'rank', 'determinant', 'svd', 'decomposition', 'gershgorin', 'complex number']],
  ['discrete math', ['graph theory', 'combinator', 'discrete', 'set theory', 'logic', 'boolean', 'permutation', 'automat']],
  ['computer science', ['algorithm', 'complexity', 'circuit', 'neural network', 'machine learning', 'backprop', 'training', 'data structure', 'parametriz']]
];

function inferBranch(node) {
  const hay = (String(node.name || '') + ' ' + String(node.id || '')).toLowerCase();
  for (const [branch, kws] of BRANCH_KEYWORDS) {
    if (kws.some((k) => hay.includes(k))) return branch;
  }
  return 'mathematics';
}

// A graph is degenerate if it has no real prerequisite structure to speak of.
function isDegenerate(nodes) {
  const learnable = nodes.filter((n) => n.level !== 0);
  if (learnable.length < 3) return false;
  const withPrereq = learnable.filter((n) => (n.prereqs || []).length > 0);
  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth || 0));
  return withPrereq.length / learnable.length < 0.4 || maxDepth <= 1;
}

// Fill branches, then guarantee a connected, layered DAG. Mutates & returns nodes.
function repairGraph(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) if (!n.branch) n.branch = inferBranch(n);

  const baseline = nodes.filter((n) => n.level === 0);
  const learnable = nodes.filter((n) => n.level !== 0 && !n.core);
  const cores = nodes.filter((n) => n.level !== 0 && n.core);

  const baselineFor = (node) => {
    const b = baseline.find((x) => (x.branch || '') === (node.branch || ''));
    return (b || baseline[0]) ? (b || baseline[0]).id : undefined;
  };

  if (isDegenerate(nodes) && baseline.length > 0) {
    // Rebuild prerequisites as per-branch strands rising from the baseline,
    // with the core node(s) sitting on top of each strand's summit.
    const byBranch = new Map();
    for (const n of learnable) {
      const key = n.branch || 'mathematics';
      if (!byBranch.has(key)) byBranch.set(key, []);
      byBranch.get(key).push(n);
    }
    const summits = [];
    for (const [, strand] of byBranch) {
      strand.forEach((n, i) => {
        n.prereqs = i === 0 ? [baselineFor(n)].filter(Boolean) : [strand[i - 1].id];
      });
      summits.push(strand[strand.length - 1].id);
    }
    const coreParents = summits.slice(0, 5);
    for (const c of cores) {
      c.prereqs = coreParents.length ? coreParents.slice(0, 4) : learnable.slice(-4).map((n) => n.id);
    }
  } else {
    // Model gave usable structure: just fix orphans so nothing floats free.
    for (const n of learnable) {
      const valid = (n.prereqs || []).filter((p) => byId.has(p) && p !== n.id);
      n.prereqs = valid.length ? valid : (baseline.length ? [baselineFor(n)].filter(Boolean) : []);
    }
    for (const c of cores) {
      const valid = (c.prereqs || []).filter((p) => byId.has(p) && p !== c.id);
      if (valid.length) c.prereqs = valid;
      else c.prereqs = (learnable.length ? learnable : baseline).slice(-4).map((n) => n.id);
    }
  }

  // Clean up: dedupe, drop unknown/self, break cycles, recompute depths.
  for (const n of nodes) {
    n.prereqs = [...new Set(n.prereqs || [])].filter((p) => p !== n.id && byId.has(p));
    if (n.level === 0) n.prereqs = [];
  }
  const color = new Map();
  function dfs(n) {
    color.set(n.id, 1);
    n.prereqs = n.prereqs.filter((pid) => {
      const c = color.get(pid) || 0;
      if (c === 1) return false;
      if (c === 0) dfs(byId.get(pid));
      return true;
    });
    color.set(n.id, 2);
  }
  for (const n of nodes) if ((color.get(n.id) || 0) === 0) dfs(n);
  computeDepths(nodes);
  return nodes;
}

// depth: baseline = 0; otherwise 1 + max(depth of prereqs). Mutates nodes.
function computeDepths(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map();
  function depth(nid, stack) {
    if (memo.has(nid)) return memo.get(nid);
    const n = byId.get(nid);
    if (!n) return 0;
    if (n.level === 0) {
      memo.set(nid, 0);
      return 0;
    }
    if (stack.has(nid)) return 1; // safety (should be acyclic already)
    stack.add(nid);
    let d = 1;
    for (const p of n.prereqs) d = Math.max(d, depth(p, stack) + 1);
    stack.delete(nid);
    memo.set(nid, d);
    return d;
  }
  for (const n of nodes) n.depth = depth(n.id, new Set());
  return nodes;
}

// State per node given the set of mastered concept ids (global, cross-project).
// baseline -> 'known', mastered -> 'done', all prereqs satisfied -> 'open', else 'locked'
function computeStates(nodes, masteredIds) {
  const states = {};
  const satisfied = (nid) => {
    const n = nodes.find((x) => x.id === nid);
    if (!n) return true;
    return n.level === 0 || masteredIds.has(n.id);
  };
  for (const n of nodes) {
    if (n.level === 0) states[n.id] = 'known';
    else if (masteredIds.has(n.id)) states[n.id] = 'done';
    else if (n.prereqs.every(satisfied)) states[n.id] = 'open';
    else states[n.id] = 'locked';
  }
  return states;
}

function xpForNode(node, skipped) {
  const base = 10 + 10 * Math.min(node.depth || 1, 5) + (node.core ? 40 : 0);
  return skipped ? Math.floor(base / 2) : base;
}

const TITLES = ['Novice', 'Apprentice', 'Scholar', 'Adept', 'Researcher', 'Expert', 'Professor', 'Sage', 'Luminary'];

function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 40));
  const cur = 40 * level * level;
  const next = 40 * (level + 1) * (level + 1);
  return {
    xp,
    level,
    title: TITLES[Math.min(level, TITLES.length - 1)],
    progress: Math.min(1, (xp - cur) / (next - cur)),
    nextLevelXp: next
  };
}

// Difficulty tier of a node: the model's "tier" if present, else derived from depth.
function effectiveTier(node) {
  if (node.core) return 'advanced';
  if (['novice', 'intermediate', 'advanced'].includes(node.tier)) return node.tier;
  const d = node.depth || 1;
  if (node.level === 0) return 'base';
  if (d <= 1) return 'novice';
  if (d === 2) return 'intermediate';
  return 'advanced';
}
function isAdvanced(node) {
  return node.level !== 0 && (node.core || effectiveTier(node) === 'advanced');
}

module.exports = { slugify, sanitizeGraph, computeDepths, computeStates, xpForNode, levelInfo, repairGraph, isDegenerate, inferBranch, effectiveTier, isAdvanced };
