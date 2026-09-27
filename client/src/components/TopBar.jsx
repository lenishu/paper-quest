import { isCloud, openSession } from '../api';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Logo from './Logo';
import { branchColor } from '../graphLayout';

const PTABS = [['overview', 'Overview'], ['map', 'Map'], ['papers', 'Papers'], ['history', 'History']];
const NAV = [
  ['dashboard', '⌂', 'Dashboard'],
  ['projects', '❐', 'Projects'],
  ['explore', '◎', 'Explore'],
  ['career', '✧', 'Career Path'],
  ['paths', '⋔', 'Branches']
];
const EV = {
  paper_added: ['📄', 'Uploaded paper'], paper_removed: ['🗑', 'Removed paper'], paper_analyzed: ['🧠', 'Mapped paper'],
  lesson_generated: ['📖', 'Opened lesson'], concept_mastered: ['✅', 'Mastered'], concept_skipped: ['⏭', 'Marked known'],
  concept_viewed: ['👁', 'Reviewed'], concept_bookmarked: ['♥', 'Bookmarked'], project_created: ['🌱', 'New project'],
  analysis_undone: ['↩', 'Undid analysis'], memory_edited: ['🧠', 'Edited memory'], lesson_question: ['💬', 'Asked a question']
};
const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onClose]);
}

export default function TopBar({ view, onNav, project, tab, onTab, dash, onOpenConcept, onOpenProject, onRenameProject, onSettings, onShowBadges, onShowBookmarks, onShowAbout, onShowHelp }) {
  const [q, setQ] = useState('');
  const [account, setAccount] = useState(null);
  useEffect(() => { if (isCloud) openSession().then(s => setAccount(s.account)).catch(() => {}); }, []);
  const [editName, setEditName] = useState(null); // null = not editing
  const cancelRename = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef(null);
  const searchBoxRef = useRef(null);
  const notifRef = useRef(null);
  const menuRef = useRef(null);
  useOutsideClose(searchBoxRef, () => setSearchOpen(false));
  useOutsideClose(notifRef, () => setNotifOpen(false));
  useOutsideClose(menuRef, () => setMenuOpen(false));

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current && searchRef.current.focus(); setSearchOpen(true); }
      if (e.key === 'Escape') { setSearchOpen(false); setNotifOpen(false); setMenuOpen(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return { concepts: [], projects: [] };
    const concepts = (dash?.galaxy?.concepts || []).filter((c) => c.name.toLowerCase().includes(needle) || (c.branch || '').toLowerCase().includes(needle)).slice(0, 6);
    const projects = (dash?.projects || []).filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 3);
    return { concepts, projects };
  }, [q, dash]);

  function pick(kind, item) {
    setSearchOpen(false); setQ('');
    if (kind === 'concept' && item.projects && item.projects[0]) onOpenConcept(item.projects[0].id, item.id);
    else if (kind === 'project') onOpenProject(item.id);
  }

  const p = dash?.profile || {};
  const recent = dash?.recent || [];
  const notifCount = dash?.today || 0;

  return (
    <header className="topbar">
      <button className="tb-brand" onClick={() => onNav('dashboard')}><Logo size={26} /></button>

      {view === 'project' ? (
        <div className="tb-project">
          <button className="tb-back" title="Back to dashboard" onClick={() => onNav('dashboard')}>←</button>
          {editName !== null ? (
            <input className="tb-crumb-edit" autoFocus value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { cancelRename.current = true; setEditName(null); }
              }}
              onBlur={() => {
                if (!cancelRename.current && editName.trim() && editName.trim() !== project?.name) onRenameProject(editName);
                cancelRename.current = false;
                setEditName(null);
              }} />
          ) : (
            <button className="tb-crumb" title="Click to rename this project" onClick={() => setEditName(project?.name || '')}>
              {project?.name || 'Project'}<span className="tb-crumb-pen">✎</span>
            </button>
          )}
          <nav className="tb-tabs">
            {PTABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => onTab(k)}>{l}</button>)}
          </nav>
        </div>
      ) : (
        <nav className="tb-nav">
          {NAV.map(([k, icon, label]) => (
            <button key={k} title={label} className={view === k ? 'active' : ''} onClick={() => onNav(k)}>
              {icon}<span className="tb-nav-label"> {label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="tb-right">
        <div className="tb-search" ref={searchBoxRef}>
          <span className="tb-search-icon">⌕</span>
          <input ref={searchRef} placeholder="Search concepts…" value={q}
            onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (results.concepts[0]) pick('concept', results.concepts[0]);
                else if (results.projects[0]) pick('project', results.projects[0]);
              }
            }} />
          <span className="tb-kbd">Ctrl K</span>
          {searchOpen && q.trim() && (
            <div className="tb-search-menu">
              {results.concepts.length === 0 && results.projects.length === 0 && <div className="tb-search-none">No matches.</div>}
              {results.concepts.map((c) => (
                <button key={c.id} onClick={() => pick('concept', c)}>
                  <i style={{ background: branchColor(c.branch) || '#98938B' }} />
                  <span className="tb-sr-name">{c.core ? '★ ' : ''}{c.name}</span>
                  <span className="tb-sr-meta">{c.branch} · {c.state === 'mastered' ? 'mastered' : c.state === 'ready' ? 'ready' : 'locked'}</span>
                </button>
              ))}
              {results.projects.map((pr) => (
                <button key={pr.id} onClick={() => pick('project', pr)}>
                  <i className="tb-sr-proj">❐</i>
                  <span className="tb-sr-name">{pr.name}</span>
                  <span className="tb-sr-meta">project · {pr.done}/{pr.total}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="tb-notif" ref={notifRef}>
          <button className="tb-iconbtn" title="Activity" onClick={() => setNotifOpen((v) => !v)}>
            ◷{notifCount > 0 && <span className="tb-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
          </button>
          {notifOpen && (
            <div className="tb-menu tb-notif-menu">
              <div className="tb-menu-head">Recent activity</div>
              {recent.length === 0 && <div className="tb-search-none">Nothing yet — add a paper to get going.</div>}
              {recent.slice(0, 8).map((e, i) => {
                const [icon, label] = EV[e.type] || ['•', e.type];
                return (
                  <button key={i} onClick={() => {
                    setNotifOpen(false);
                    if (e.projectId && e.conceptId) onOpenConcept(e.projectId, e.conceptId);
                    else if (e.projectId) onOpenProject(e.projectId);
                  }}>
                    <span className="tb-ev-icon">{icon}</span>
                    <span className="tb-sr-name">{label}{e.name ? ` — ${e.name}` : ''}</span>
                    <span className="tb-sr-meta">{ago(e.t)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tb-profile" ref={menuRef}>
          <button className="tb-prof-btn" onClick={() => setMenuOpen((v) => !v)}>
            <span className="tb-avatar">L</span>
            <span className="tb-prof-text">
              <span className="tb-prof-name">{isCloud ? account?.name || 'Sign in' : 'Lenish'}</span>
              <span className="tb-prof-role">{p.title || 'Novice'} · Level {p.level || 0}</span>
            </span>
            <span className="tb-caret">▾</span>
          </button>
          {menuOpen && (
            <div className="tb-menu tb-prof-menu">
              {isCloud && <button onClick={() => { setMenuOpen(false); onSettings(); }}>{account ? (account.developer ? 'Developer access & account' : 'Your account') : 'Sign up / sign in with Google'}</button>}
              <button onClick={() => { setMenuOpen(false); onSettings(); }}>⚙ Settings</button>
              <button onClick={() => { setMenuOpen(false); onShowBadges(); }}>✦ Badges</button>
              <button onClick={() => { setMenuOpen(false); onShowBookmarks(); }}>♡ To review</button>
              <button onClick={() => { setMenuOpen(false); onShowHelp(); }}>? Help</button>
              <button onClick={() => { setMenuOpen(false); onShowAbout(); }}>ⓘ About PaperQuest</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
