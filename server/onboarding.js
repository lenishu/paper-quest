// Guided tour state. The client (GuidedTour.jsx) owns the steps and the spotlight;
// the server remembers progress and builds the tour's sample project and career
// without AI. Step numbers must match STEPS in GuidedTour.jsx.
const store = require('./store');
const { DEMO_CAREERS, DEMO_CAREER_FIELDS, demoCareerSkills, createDemoProject } = require('./demo');

const CAREERS = Object.keys(DEMO_CAREERS);
const TOUR = { total: 12, afterProject: 4, afterCareer: 9 }; // step === total means finished

function attach(app) {
  app.get('/api/onboarding', (req, res) => {
    res.json({ ...store.getOnboarding(), eligible: store.listProjects().length === 0, careers: CAREERS, total: TOUR.total });
  });

  app.post('/api/onboarding', (req, res) => {
    const state = store.getOnboarding(), action = req.body?.action;
    const save = (patch) => res.json({ ...store.saveOnboarding({ ...state, ...patch }), total: TOUR.total, careers: CAREERS });
    if (action === 'dismiss') return save({ dismissed: true });
    if (action === 'restart') return save({ step: 0, dismissed: false, completed: false });
    if (action === 'step') {
      const step = req.body.step;
      if (!Number.isInteger(step) || step < 0 || step > TOUR.total) return res.status(400).json({ error: 'Invalid tour step.' });
      return save({ step, completed: step === TOUR.total });
    }
    if (action === 'project') {
      // One sample project per workspace: reuse it when the tour restarts.
      const p = (state.projectId && store.getProject(state.projectId)) || createDemoProject();
      return save({ step: TOUR.afterProject, projectId: p.id, dismissed: false });
    }
    if (action === 'career') {
      const name = req.body.name;
      if (!CAREERS.includes(name)) return res.status(400).json({ error: 'Choose a tour career.' });
      const c = (state.careerId && store.getCareer(state.careerId)) || store.createCareer(name);
      Object.assign(c, { name, guidedDemo: true, field: DEMO_CAREER_FIELDS[name], skills: demoCareerSkills(name), generatedAt: Date.now() });
      store.saveCareer(c);
      return save({ careerId: c.id, careerName: name, step: TOUR.afterCareer });
    }
    return res.status(400).json({ error: 'Unknown tour action.' });
  });
}

module.exports = { attach, TOUR };
