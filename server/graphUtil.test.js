// Zero-dependency unit tests for the core graph logic. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { sanitizeGraph, repairGraph, isDegenerate, effectiveTier, isAdvanced, computeStates } = require('./graphUtil');

test('sanitizeGraph normalizes model keys and drops bad prereqs', () => {
  const nodes = sanitizeGraph([
    { id: 'Vectors', name: 'Vectors', level: 0 },
    { id: 'matrix_multiplication', name: 'Matrix Multiplication', level: 1, tier: 'novice', branch: 'linear algebra', used_in_paper: 'Section 3', prereqs: ['vectors', 'nonexistent'] }
  ]);
  const mm = nodes.find((n) => n.id === 'matrix_multiplication');
  assert.equal(mm.tier, 'novice');
  assert.equal(mm.usedInPaper, 'Section 3');
  assert.deepEqual(mm.prereqs, ['vectors']); // unknown prereq dropped
});

test('repairGraph turns a flat/degenerate graph into a connected layered DAG', () => {
  const flat = sanitizeGraph([
    { id: 'a', name: 'A', level: 0 },
    ...['b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase(), level: 1 }))
  ]);
  assert.equal(isDegenerate(flat), true);
  repairGraph(flat);
  assert.equal(isDegenerate(flat), false);
  assert.equal(flat.filter((n) => n.level !== 0 && n.prereqs.length === 0).length, 0); // no orphans
  assert.ok(Math.max(...flat.map((n) => n.depth || 0)) >= 2); // real depth
});

test('effectiveTier / isAdvanced: matrix multiplication is novice, core is advanced', () => {
  assert.equal(effectiveTier({ level: 1, tier: 'novice' }), 'novice');
  assert.equal(effectiveTier({ level: 1, core: true }), 'advanced');
  assert.equal(effectiveTier({ level: 1, depth: 4 }), 'advanced'); // depth fallback
  assert.equal(isAdvanced({ level: 1, tier: 'advanced' }), true);
  assert.equal(isAdvanced({ level: 1, tier: 'novice' }), false);
  assert.equal(isAdvanced({ level: 0, tier: 'advanced' }), false); // baseline never advanced
});

test('computeStates: baseline known, frontier open, rest locked', () => {
  const nodes = [
    { id: 'base', level: 0, prereqs: [] },
    { id: 'x', level: 1, prereqs: ['base'] },
    { id: 'y', level: 1, prereqs: ['x'] }
  ];
  const st = computeStates(nodes, new Set());
  assert.equal(st.base, 'known');
  assert.equal(st.x, 'open');   // prereq (baseline) satisfied
  assert.equal(st.y, 'locked'); // needs x
  const st2 = computeStates(nodes, new Set(['x']));
  assert.equal(st2.x, 'done');
  assert.equal(st2.y, 'open');
});
