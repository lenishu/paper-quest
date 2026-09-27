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
import AccountSettings from './components/AccountSettings';
import GoogleReturn, { hasGoogleReturn } from './components/GoogleReturn';
import GuidedTour from './components/GuidedTour';
import NewProjectModal from './components/NewProjectModal';
import JudgeView from './components/JudgeView';
import { BadgesModal, BookmarksModal, AboutModal, HelpModal } from './components/InfoModals';
import { ToastCtx, ToastHost, Modal } from './components/bits';
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
  if (hasGoogleReturn) return <GoogleReturn />;
  return new URLSearchParams(window.location.search).has('judge') ? <JudgeView /> : <WorkspaceApp />;
}

function WorkspaceApp() {
  const [route, setRoute] = useState({ view: 'dashboard' });
  const [dash, setDash] = useState(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [projects, setProjects] = useState([]);
  const [modal, setModal] = useState(null); // 'settings' | 'api' | 'account' | 'new-project' | 'badges' | 'bookmarks' | 'about' | 'help'
  const [toasts, setToasts] = useState([]);
  const [tourRestart, setTourRestart] = useState(0);

  const pushToast = useCallback((msg, kind = 'info', ttl = 4500) => { const id = Math.random().toString(36).slice(2); setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl); }, []);
  const loadDash = useCallback(() => api('/dashboard').then(value => { setDash(value); setWorkspaceError(''); }).catch(e => setWorkspaceError(e.message)), []);
  const loadProjects = useCallback(() => api('/projects').then(setProjects).catch(() => {}), []);
  useEffect(() => { loadDash(); loadProjects(); }, [loadDash, loadProjects]);

  // deep-links (e.g. /?project=ID&tab=map&sel=CID, /?new=1, /?settings=1, /?view=projects)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('settings')) setModal('settings');
    if (q.get('account')) setModal('account');
    if (q.get('project')) setRoute({ view: 'project', id: q.get('project'), tab: q.get('tab') || 'overview', sel: q.get('sel') || undefined });
    else if (q.get('view')) setRoute({ view: q.get('view') });
    else if (q.get('new')) setModal('new-project');
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
    // eslint-disable-next-line
  }, []);

  const nav = useCallback((view) => { setRoute({ view }); loadDash(); }, [loadDash]);
  const openProject = useCallback((id) => setRoute({ view: 'project', id, tab: 'overview' }), []);
  const openConcept = useCallback((pid, cid) => setRoute({ view: 'project', id: pid, tab: 'map', sel: cid }), []);
  const setTab = useCallback((tab) => setRoute((r) => ({ ...r, tab, sel: undefined })), []);

  // New Project asks for a name and a type (paper, class, course, club, hackathon, notes).
  const newProject = useCallback(() => setModal('new-project'), []);
  const projectCreated = useCallback(async (p) => { setModal(null); await loadProjects(); loadDash(); setRoute({ view: 'project', id: p.id, tab: 'papers' }); }, [loadProjects, loadDash]);
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

  // The guided tour drives the app: each step names the screen it needs.
  const tourGo = useCallback((where, s) => {
    const pid = s && s.projectId, cid = s && s.careerId;
    setModal((m) => (where === 'new-project' ? 'new-project' : m === 'new-project' ? null : m));
    if (where === 'dashboard' || where === 'new-project') { setRoute({ view: 'dashboard' }); loadDash(); }
    else if (where === 'project:papers' && pid) setRoute({ view: 'project', id: pid, tab: 'papers' });
    else if (where === 'project:map' && pid) setRoute({ view: 'project', id: pid, tab: 'map' });
    else if (where === 'project:refresher' && pid) setRoute({ view: 'project', id: pid, tab: 'map', sel: 'linear_algebra', refresher: true });
    else if (where === 'project:overview' && pid) setRoute({ view: 'project', id: pid, tab: 'overview' });
    else if (where === 'career') setRoute({ view: 'career' });
    else if (where === 'career:map') setRoute({ view: 'career', careerId: cid });
    else if (where === 'explore') setRoute({ view: 'explore' });
  }, [loadDash]);
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
            onAccount={() => setModal('account')} onApiKey={() => setModal('api')} onTour={() => { setModal(null); setTourRestart(n => n + 1); }}
            onOpenConcept={openConcept} onOpenProject={openProject}
            onSettings={() => setModal('settings')} onShowBadges={() => setModal('badges')}
            onShowBookmarks={() => setModal('bookmarks')} onShowAbout={() => setModal('about')} onShowHelp={() => setModal('help')} />
          <div className="body">
            <Sidebar dash={dash}
              onUpload={newProject} onNewProject={newProject} onExplore={() => nav('explore')}
              onDailyQuest={dailyQuest} onResume={resumeLearning}
              onSettings={() => setModal('settings')} onApiKey={() => setModal('api')} onShowBadges={() => setModal('badges')}
              onShowBookmarks={() => setModal('bookmarks')} onShowAbout={() => setModal('about')} onShowHelp={() => setModal('help')} />
            <main className={`content ${route.view === 'project' && route.tab === 'map' ? 'content-map' : ''} ${route.view === 'explore' ? 'content-explore' : ''}`}>
              <ErrorBoundary key={route.view + (route.id || route.careerId || '') + (route.tab || '')}>
                {workspaceError ? <section role="alert"><h2>Unable to load your workspace</h2><p>{workspaceError}</p><button className="btn-primary" onClick={refreshAll}>Retry loading workspace</button></section> : route.view === 'project' ? (
                  <ProjectView id={route.id} tab={route.tab || 'overview'} onTab={setTab} initialSel={route.sel}
                    tourRefresher={route.refresher} onTourRefresherClose={() => setRoute(r => ({ ...r, refresher: false }))}
                    onOpenConcept={openConcept}
                    refreshProfile={loadDash} refreshProjects={refreshAll} openSettings={() => setModal('api')} />
                ) : route.view === 'projects' ? (
                  <ProjectsView projects={projects} onOpenProject={openProject} onNewProject={newProject} onTryDemo={tryDemo} onReload={refreshAll} />
                ) : route.view === 'explore' ? (
                  <ExploreView dash={dash} onOpenConcept={openConcept} onOpenProject={openProject} onRefresh={loadDash} onTryDemo={tryDemo} />
                ) : route.view === 'career' ? (
                  <CareerView initialId={route.careerId} openApiKey={() => setModal('api')} />
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
        {modal === 'settings' && <SettingsModal onClose={() => { setModal(null); loadDash(); }} />}
        {modal === 'api' && <SettingsModal section="api" onClose={() => { setModal(null); loadDash(); }} />}
        {modal === 'new-project' && <NewProjectModal onClose={() => setModal(null)} onCreated={projectCreated} onTryDemo={() => { setModal(null); tryDemo(); }} />}
        {modal === 'account' && <Modal onClose={() => setModal(null)}><div className="modal-head"><h2>Your account</h2><button className="iconbtn" aria-label="Close account" onClick={() => setModal(null)}>✕</button></div><div className="settings-body"><AccountSettings /><button className="btn-ghost" onClick={() => setModal('settings')}>Project recovery & settings</button></div></Modal>}
        <GuidedTour restart={tourRestart} hidden={!!modal && modal !== 'new-project'} onGo={tourGo} onRefresh={refreshAll}
          onDone={() => pushToast('Tour complete. Add your own paper, class or notes whenever you are ready.', 'info', 6000)} />
        {modal === 'badges' && <BadgesModal badges={dash?.badges} onClose={() => setModal(null)} />}
        {modal === 'bookmarks' && <BookmarksModal onClose={() => setModal(null)} onOpenConcept={openConcept} />}
        {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
        {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
        <ToastHost toasts={toasts} />
      </JobsProvider>
    </ToastCtx.Provider>
  );
}
