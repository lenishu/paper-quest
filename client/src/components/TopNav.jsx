import React, { useState } from 'react';

const TABS = [
  ['overview', 'Overview'],
  ['map', 'Map'],
  ['papers', 'Papers'],
  ['history', 'History']
];

export default function TopNav({ project, projects, tab, onTab, onHome, onOpenProject, onNew, onRename, onReadPaper, onSettings, profile }) {
  const [switcher, setSwitcher] = useState(false);
  const [editing, setEditing] = useState(null);

  function commit() {
    const v = (editing || '').trim();
    setEditing(null);
    if (v && project && v !== project.name) onRename(v);
  }

  return (
    <header className="topnav">
      <div className="tn-left">
        {project && <button className="tn-back" title="Back to your knowledge map" onClick={onHome}>←</button>}
        <div className="tn-brand" onClick={onHome} role="button" tabIndex={0}>
          <span className="tn-logo">🌳</span>
          <span className="tn-name">PaperQuest</span>
        </div>
        {project && (
          <div className="tn-switch">
            {editing === null ? (
              <button className="tn-switch-btn" onClick={() => setSwitcher((s) => !s)} title="Switch project">
                {project.name} <span className="tn-caret">▾</span>
              </button>
            ) : (
              <input className="tn-rename" autoFocus value={editing}
                onChange={(e) => setEditing(e.target.value)} onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }} />
            )}
            {editing === null && (
              <button className="tn-mini" title="Rename project" onClick={() => setEditing(project.name)}>✎</button>
            )}
            {switcher && (
              <>
                <div className="tn-switch-back" onClick={() => setSwitcher(false)} />
                <div className="tn-switch-menu">
                  {(projects || []).map((p) => (
                    <button key={p.id} className={`tn-switch-item ${p.id === project.id ? 'active' : ''}`}
                      onClick={() => { onOpenProject(p.id); setSwitcher(false); }}>
                      <span>{p.name}</span><span className="dim small">{p.conceptCount || 0}c</span>
                    </button>
                  ))}
                  <button className="tn-switch-item new" onClick={() => { onNew(); setSwitcher(false); }}>＋ New project</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {project && (
        <nav className="tn-tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tn-tab ${tab === k ? 'active' : ''}`} onClick={() => onTab(k)}>{label}</button>
          ))}
        </nav>
      )}

      <div className="tn-right">
        {project && <button className="tn-icon" title="Open a paper to read" onClick={onReadPaper}>📄 Read</button>}
        {profile && (
          <div className="tn-profile" title={`${profile.title} · ${profile.xp} XP`}>
            <span className="tn-level">L{profile.level}</span>
            <span className="tn-xp">{profile.title}</span>
          </div>
        )}
        <button className="tn-icon" title="Settings & API keys" onClick={onSettings}>⚙️</button>
      </div>
    </header>
  );
}
