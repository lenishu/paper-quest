import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Overview from './Overview';
import MapView from './MapView';
import PapersView from './PapersView';
import HistoryView from './HistoryView';
import LearnModal from './LearnModal';
import PaperReader from './PaperReader';
import { Confetti, Spinner, useToast } from './bits';
import { useJobs } from '../jobs';

export default function ProjectView({ id, tab, onTab, initialSel, onOpenConcept, openReaderSignal, refreshProfile, refreshProjects, openSettings }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(initialSel || null);
  const [learn, setLearn] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const [reader, setReader] = useState(null); // paper being read
  const [drawer, setDrawer] = useState(false);
  const toast = useToast();
  const { completions } = useJobs();

  const load = useCallback(() => api(`/projects/${id}`).then(setData).catch((e) => toast(e.message, 'err')), [id, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (initialSel) { setSel(initialSel); } }, [initialSel]);
  useEffect(() => { if (openReaderSignal) setDrawer(true); }, [openReaderSignal]);

  const doneCount = completions[id] || 0;
  useEffect(() => {
    if (doneCount > 0) { load(); refreshProjects && refreshProjects(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount]);

  const selectNode = useCallback((nid) => {
    setSel(nid);
    if (nid && data && data.project) {
      const n = data.project.nodes.find((x) => x.id === nid);
      if (n && n.level !== 0)
        api(`/projects/${id}/events`, { method: 'POST', body: { type: 'concept_viewed', concept: n.name, conceptId: n.id } }).catch(() => {});
    }
  }, [data, id]);

  // Route through App so the map tab remounts with the concept preselected
  // (the ErrorBoundary is keyed by tab, so an internal setSel wouldn't survive the switch).
  const openConcept = useCallback((nid) => { onOpenConcept ? onOpenConcept(id, nid) : (selectNode(nid), onTab('map')); }, [onOpenConcept, id, selectNode, onTab]);

  const toggleBookmark = useCallback(async (node) => {
    try {
      await api(`/projects/${id}/bookmarks/toggle`, { method: 'POST', body: { conceptId: node.id } });
      load();
    } catch (e) { toast(e.message, 'err'); }
  }, [id, load, toast]);

  const saveNote = useCallback(async (nodeId, text) => {
    // optimistic local update so Overview/NodePanel reflect it immediately
    setData((d) => (d ? { ...d, notes: { ...(d.notes || {}), ...(text.trim() ? { [nodeId]: { text, updatedAt: Date.now() } } : {}) } } : d));
    if (!text.trim()) setData((d) => { if (!d) return d; const n = { ...(d.notes || {}) }; delete n[nodeId]; return { ...d, notes: n }; });
    try {
      const r = await api(`/projects/${id}/nodes/${nodeId}/notes`, { method: 'PUT', body: { text } });
      setData((d) => (d ? { ...d, notes: r.notes } : d));
    } catch (e) { toast(e.message, 'err'); }
  }, [id, toast]);

  function onCompleted(result, node) {
    setData((d) => (d ? { ...d, states: result.states, mastery: result.mastery } : d));
    refreshProfile();
    refreshProjects && refreshProjects();
    if (result.xpGained > 0) toast(`+${result.xpGained} XP — "${node.name}" reviewed!`, 'xp');
    setConfetti(true);
    setTimeout(() => setConfetti(false), 2600);
  }
  function skipNode(node) {
    if (!window.confirm(`Mark "${node.name}" as already reviewed? (counts toward progress, half XP)`)) return;
    api('/complete', { method: 'POST', body: { projectId: id, conceptId: node.id, skipped: true } })
      .then((r) => onCompleted(r, node)).catch((e) => toast(e.message, 'err'));
  }

  if (!data) return <Spinner label="Loading project…" />;
  const { project, states, mastery, sharedWith } = data;
  const bookmarks = data.bookmarks || [];

  function openReader(paper) { setReader(paper); setDrawer(false); }

  return (
    <div className="project-shell">
      {tab === 'overview' && (
        <Overview id={id} project={project} states={states} mastery={mastery} notes={data.notes || {}} lessons={data.lessons || {}}
          onOpenConcept={openConcept} onOpenLesson={(n) => setLearn(n)} onOpenSettings={openSettings} onGotoMap={() => onTab('papers')} />
      )}
      {tab === 'map' && (
        <MapView id={id} project={project} states={states} mastery={mastery} sharedWith={sharedWith} lessons={data.lessons || {}}
          selectedId={sel} onSelect={selectNode} onOpenLesson={(n) => setLearn(n)} onSkip={skipNode}
          onOpenSettings={openSettings} onAddPaper={() => onTab('papers')}
          bookmarks={bookmarks} onToggleBookmark={toggleBookmark}
          notes={data.notes || {}} onSaveNote={saveNote} />
      )}
      {tab === 'papers' && <PapersView id={id} project={project} onReload={load} refreshProjects={refreshProjects} onRead={openReader} />}
      {tab === 'history' && <HistoryView id={id} canUndo={data.canUndo} onReload={load} />}

      {/* left-edge "take out a paper to read" */}
      {project.papers.length > 0 && (
        <button className="read-tab" title="Open a paper to read" onClick={() => setDrawer(true)}>📄<span>Read</span></button>
      )}
      {drawer && (
        <>
          <div className="drawer-back" onClick={() => setDrawer(false)} />
          <div className="paper-drawer">
            <div className="drawer-head"><span className="np-label">Open a paper</span><button className="iconbtn" onClick={() => setDrawer(false)}>✕</button></div>
            {project.papers.map((p) => (
              <button key={p.id} className="drawer-item" onClick={() => openReader(p)}>
                <span className="drawer-item-name">📄 {p.title || p.name}</span>
                <span className="dim small">{p.pages ? `${p.pages}p` : 'text'}{p.notes ? ' · notes' : ''}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {reader && <PaperReader id={id} paper={reader} onClose={() => { setReader(null); load(); }} />}

      {learn && (
        <LearnModal projectId={id} node={learn} isMastered={!!mastery[learn.id]}
          onClose={() => setLearn(null)} onCompleted={(r) => onCompleted(r, learn)} openSettings={openSettings} />
      )}
      {confetti && <Confetti />}
    </div>
  );
}
