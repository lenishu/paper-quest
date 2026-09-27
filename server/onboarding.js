const path = require('node:path');
const fs = require('node:fs');
const store = require('./store');
const { dataDir } = require('./workspace');
const { sanitizeGraph, computeDepths } = require('./graphUtil');
const { DEMO_NODES, DEMO_PAPER_MD, DEMO_LESSON_LINEAR_ALGEBRA } = require('./demo');
const file = () => path.join(dataDir(), 'onboarding.json');
function read() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return { step: 0, dismissed: false, completed: false }; } }
function write(value) { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(value)); return value; }
const CAREERS = ['AI / Machine Learning Engineer', 'Data Scientist', 'Research Scientist (ML)'];
function attach(app) {
  app.get('/api/onboarding', (req, res) => res.json({ ...read(), eligible: store.listProjects().length === 0, careers: CAREERS }));
  app.post('/api/onboarding', (req, res) => {
    const state = read(), action = req.body?.action;
    if (action === 'dismiss') return res.json(write({ ...state, dismissed: true }));
    if (action === 'restart') return res.json(write({ ...state, step: 0, dismissed: false, completed: false }));
    if (action === 'step') {
      const step = req.body.step;
      if (!Number.isInteger(step) || step < 0 || step > 5) return res.status(400).json({ error: 'Invalid tour step.' });
      return res.json(write({ ...state, step, completed: step === 5 }));
    }
    if (action === 'project') {
      let p = state.projectId && store.getProject(state.projectId);
      if (!p) {
        p = store.createProject('Attention Is All You Need — guided tour');
        const paperId = store.id();
        store.savePaperFiles(p.id, paperId, 'attention-demo.md', Buffer.from(DEMO_PAPER_MD), DEMO_PAPER_MD);
        p.papers.push({ id: paperId, name: 'Attention Is All You Need', pages: 0, addedAt: Date.now(), analyzed: true });
        p.nodes = sanitizeGraph(DEMO_NODES.map(n => ({ ...n, sources: [paperId] })));
        p.field = 'machine learning'; p.guidedDemo = true;
        store.saveProject(p); store.saveLesson(p.id, 'linear_algebra', DEMO_LESSON_LINEAR_ALGEBRA);
      }
      return res.json(write({ ...state, step: 1, projectId: p.id, dismissed: false }));
    }
    if (action === 'career') {
      const name = req.body.name;
      if (!CAREERS.includes(name)) return res.status(400).json({ error: 'Choose a tour career.' });
      let c = state.careerId && store.getCareer(state.careerId);
      if (!c) c = store.createCareer(name);
      c.name = name; c.guidedDemo = true;
      const omit = name === 'Data Scientist' ? new Set(['transformer_architecture','self_attention','positional_encoding','sequence_modeling','word_embeddings','attention_mechanism']) : new Set();
      c.skills = sanitizeGraph(DEMO_NODES.filter(n => !omit.has(n.id)).map(n => ({ ...n }))).map(n => ({ ...n, importance: n.level === 0 ? 'supporting' : 'critical', roleNote: `A foundation for ${name}.`, prereqs: n.prereqs.filter(id => !omit.has(id)) }));
      computeDepths(c.skills);
      store.saveCareer(c);
      return res.json(write({ ...state, careerId: c.id, careerName: name, step: 4 }));
    }
    return res.status(400).json({ error: 'Unknown tour action.' });
  });
}
module.exports = { attach };
