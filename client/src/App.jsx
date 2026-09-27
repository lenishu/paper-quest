import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ProjectsView from './components/ProjectsView';
import ExploreView from './components/ExploreView';
import PathsView from './components/PathsView';
import CareerView from './components/CareerView';
import ProjectView from './components/ProjectView';
import SettingsModal from './components/SettingsModal';
import { BadgesModal, BookmarksModal, AboutModal, HelpModal } from './components/InfoModals';
import { ToastCtx, ToastHost } from './components/bits';
import { JobsProvider } from './jobs';

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return (<div className="crash"><h2>⚠️ Something went wrong</h2><pre>{String((this.state.err && this.state.err.stack) || this.state.err)}</pre><button className="btn-primary" onClick={() => window.location.reload()}>Reload</button></div>);
    return this.props.children;
  }
}

export default function App() {
  const [route, setRoute] = useState({ view: 'dashboard' });
  const [dash, setDash] = useState(null);
  const [projects, setProjects] = useState([]);
  const [modal, setModal] = useState(null); // 'settings' | 'badges' | 'bookmarks' | 'about' | 'help'
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((msg, kind = 'info', ttl = 4500) => { const id = Math.random().toString(36).slice(2); setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl); }, []);
  const loadDash = useCallback(() => api('/dashboard').then(setDash).catch(() => setDash({ galaxy: { concepts: [], edges: [] }, knowledge: { total: 0, mastered: 0, learning: 0, ready: 0, locked: 0 }, projects: [], heat: [], recent: [], branches: [], profile: {}, stats: {}, streak: 0, badges: [], quests: null, xpWeek: null })), []);
  const loadProjects = useCallback(() => api('/projects').then(setProjects).catch(() => {}), []);
  useEffect(() => { loadDash(); loadProjects(); }, [loadDash, loadProjects]);

  // deep-links (e.g. /?project=ID&tab=map&sel=CID, /?new=1, /?settings=1, /?view=projects)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('settings')) setModal('settings');
    if (q.get('project')) setRoute({ view: 'project', id: q.get('project'), tab: q.get('tab') || 'overview', sel: q.get('sel') || undefined });
    else if (q.get('view')) setRoute({ view: q.get('view') });
    else if (q.get('new')) { api('/projects', { method: 'POST', body: { name: 'Untitled project' } }).then((p) => { loadProjects(); setRoute({ view: 'project', id: p.id, tab: 'papers' }); }).catch(() => {}); }
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
    // eslint-disable-next-line
  }, []);

  const nav = useCallback((view) => { setRoute({ view }); loadDash(); }, [loadDash]);
  const openProject = useCallback((id) => setRoute({ view: 'project', id, tab: 'overview' }), []);
  const openConcept = useCallback((pid, cid) => setRoute({ view: 'project', id: pid, tab: 'map', sel: cid }), []);
  const setTab = useCallback((tab) => setRoute((r) => ({ ...r, tab, sel: undefined })), []);

  const newProject = useCallback(async () => { try { const p = await api('/projects', { method: 'POST', body: { name: 'Untitled project' } }); await loadProjects(); setRoute({ view: 'project', id: p.id, tab: 'papers' }); } catch (e) { pushToast(e.message, 'err'); } }, [loadProjects, pushToast]);
  const tryDemo = useCallback(async () => { try { const p = await api('/projects/demo', { method: 'POST' }); await loadProjects(); await loadDash(); setRoute({ view: 'project', id: p.id, tab: 'overview' }); pushToast('Demo project created — its first lesson needs no API key.', 'info', 6000); } catch (e) { pushToast(e.message, 'err'); } }, [loadProjects, loadDash, pushToast]);

  const dailyQuest = useCallback(() => {
    setRoute({ view: 'dashboard' });
    setTimeout(() => {
      const el = document.getElementById('quest-card');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    }, 120);
  }, []);
  const resumeLearning = useCallback(() => {
    const r = dash?.recommended;
    if (r) openConcept(r.projectId, r.id);
    else pushToast('Nothing ready to learn yet — add or analyze a paper first.', 'info');
  }, [dash, openConcept, pushToast]);

  const refreshAll = useCallback(() => { loadDash(); loadProjects(); }, [loadDash, loadProjects]);
  const cur = route.view === 'project' ? projects.find((p) => p.id === route.id) || { id: route.id, name: 'Project' } : null;

  const renameProject = useCallback(async (name) => {
    const clean = String(name || '').trim();
    if (!route.id || !clean) return;
    try {
      await api(`/projects/${route.id}`, { method: 'PATCH', body: { name: clean } });
      loadProjects(); loadDash();
      pushToast('Project renamed.', 'info');
    } catch (e) { pushToast(e.message, 'err'); }
  }, [route.id, loadProjects, loadDash, pushToast]);

  return (
    <ToastCtx.Provider value={pushToast}>
      <JobsProvider>
        <div className="app">
          <TopBar view={route.view} onNav={nav} project={cur} tab={route.tab} onTab={setTab} dash={dash} onRenameProject={renameProject}
            onOpenConcept={openConcept} onOpenProject={openProject}
            onSettings={() => setModal('settings')} onShowBadges={() => setModal('badges')}
            onShowBookmarks={() => setModal('bookmarks')} onShowAbout={() => setModal('about')} onShowHelp={() => setModal('help')} />
          <div className="body">
            <Sidebar dash={dash}
              onUpload={newProject} onNewProject={newProject} onExplore={() => nav('explore')}
              onDailyQuest={dailyQuest} onResume={resumeLearning}
              onSettings={() => setModal('settings')} onShowBadges={() => setModal('badges')}
              onShowBookmarks={() => setModal('bookmarks')} onShowAbout={() => setModal('about')} onShowHelp={() => setModal('help')} />
            <main className={`content ${route.view === 'project' && route.tab === 'map' ? 'content-map' : ''} ${route.view === 'explore' ? 'content-explore' : ''}`}>
              <ErrorBoundary key={route.view + (route.id || '') + (route.tab || '')}>
                {route.view === 'project' ? (
                  <ProjectView id={route.id} tab={route.tab || 'overview'} onTab={setTab} initialSel={route.sel}
                    onOpenConcept={openConcept}
                    refreshProfile={loadDash} refreshProjects={refreshAll} openSettings={() => setModal('settings')} />
                ) : route.view === 'projects' ? (
                  <ProjectsView projects={projects} onOpenProject={openProject} onNewProject={newProject} onTryDemo={tryDemo} onReload={refreshAll} />
                ) : route.view === 'explore' ? (
                  <ExploreView dash={dash} onOpenConcept={openConcept} onOpenProject={openProject} onRefresh={loadDash} onTryDemo={tryDemo} />
                ) : route.view === 'career' ? (
                  <CareerView />
                ) : route.view === 'paths' ? (
                  <PathsView dash={dash} onOpenConcept={openConcept} />
                ) : (
                  <Dashboard dash={dash} onOpenConcept={openConcept} onOpenProject={openProject} onNewProject={newProject}
                    onTryDemo={tryDemo} onViewProjects={() => nav('projects')} onViewPaths={() => nav('paths')} onRefresh={loadDash} onExplore={() => nav('explore')} />
                )}
              </ErrorBoundary>
            </main>
          </div>
        </div>
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
        {modal === 'badges' && <BadgesModal badges={dash?.badges} onClose={() => setModal(null)} />}
        {modal === 'bookmarks' && <BookmarksModal onClose={() => setModal(null)} onOpenConcept={openConcept} />}
        {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
        {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
        <ToastHost toasts={toasts} />
      </JobsProvider>
    </ToastCtx.Provider>
  );
}
