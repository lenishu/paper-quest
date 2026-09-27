// Pure layout: layered DAG ("skill tree"), baseline at the bottom, core at the top.

export const NODE_W = 172;
export const NODE_H = 62;
export const GAP_X = 30;
export const ROW_H = 150;
export const PAD = 70;

export function layoutGraph(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map(nodes.map((n) => [n.id, []]));
  for (const n of nodes) {
    for (const p of n.prereqs || []) {
      if (children.has(p)) children.get(p).push(n.id);
    }
  }

  const maxD = nodes.length ? Math.max(...nodes.map((n) => n.depth || 0)) : 0;
  const rows = Array.from({ length: maxD + 1 }, () => []);
  for (const n of nodes) rows[Math.min(n.depth || 0, maxD)].push(n.id);

  // relative x positions (centered per row), refined by barycenter passes
  const x = new Map();
  const setRowX = () => {
    for (const row of rows) row.forEach((nid, i) => x.set(nid, i - (row.length - 1) / 2));
  };
  setRowX();
  const avg = (ids) => {
    const vals = (ids || []).map((i) => x.get(i)).filter((v) => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const key = (nid, ids) => {
    const a = avg(ids);
    return a === null ? x.get(nid) : a;
  };

  for (let pass = 0; pass < 3; pass++) {
    for (let d = 1; d <= maxD; d++) {
      rows[d].sort((a, b) => key(a, byId.get(a).prereqs) - key(b, byId.get(b).prereqs));
      setRowX();
    }
    for (let d = maxD - 1; d >= 0; d--) {
      rows[d].sort((a, b) => key(a, children.get(a)) - key(b, children.get(b)));
      setRowX();
    }
  }

  const unit = NODE_W + GAP_X;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const v of x.values()) {
    minX = Math.min(minX, v);
    maxX = Math.max(maxX, v);
  }
  if (!isFinite(minX)) {
    minX = 0;
    maxX = 0;
  }

  const positions = {};
  for (const n of nodes) {
    positions[n.id] = {
      x: (x.get(n.id) - minX) * unit + PAD,
      y: (maxD - (n.depth || 0)) * ROW_H + PAD
    };
  }

  const edges = [];
  for (const n of nodes) {
    for (const p of n.prereqs || []) if (byId.has(p)) edges.push({ from: p, to: n.id });
  }

  return {
    positions,
    edges,
    maxDepth: maxD,
    width: (maxX - minX) * unit + NODE_W + PAD * 2,
    height: maxD * ROW_H + NODE_H + PAD * 2 + 46
  };
}

export function wrapLabel(name, max = 18) {
  const words = String(name || '').split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length <= max) lines[lines.length - 1] = (cur + ' ' + w).trim();
    else lines.push(w);
  }
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] = lines[1].slice(0, max - 1) + '…';
  }
  return lines.filter(Boolean);
}

export function tierOf(node) {
  if (node.core) return 'core';
  if (node.level === 0) return 'base';
  if (['novice', 'intermediate', 'advanced'].includes(node.tier)) return node.tier;
  const d = node.depth || 1;
  if (d <= 1) return 'novice';
  if (d === 2) return 'intermediate';
  return 'advanced';
}
export function isAdvancedTier(node) {
  return node.level !== 0 && (node.core || tierOf(node) === 'advanced' || tierOf(node) === 'core');
}

// Stable colour per math branch (stripe on the node).
const BRANCH_PALETTE = ['#34d399', '#38bdf8', '#a78bfa', '#e879f9', '#fbbf24', '#f87171', '#22d3ee', '#a3e635', '#fb923c', '#f472b6'];

export function branchColor(branch) {
  if (!branch) return null;
  let h = 0;
  const s = String(branch).toLowerCase().trim();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return BRANCH_PALETTE[h % BRANCH_PALETTE.length];
}

export const TIER_LABELS = {
  base: 'High-school baseline',
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  core: 'The paper itself'
};

// Rotating accent hues for project glyphs, project cards and earned badges —
// identity colour, unrelated to branch or learning state. Was copy-pasted into
// Dashboard/ProjectsView/Sidebar three times; one definition means a designer
// changes it once.
// NOTE: the first four are the design tokens (--primary, --secondary, --green,
// --amber-t). The violet is the last survivor of a retired dark theme and is
// off-palette — flagged as an open design question, not silently recoloured
// here because it changes the avatar colour of existing projects.
export const ACCENT_HUES = ['#E4572E', '#2E86AB', '#1F9D57', '#B45309', '#7C5CFF'];
