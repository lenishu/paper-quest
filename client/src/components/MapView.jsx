import React from 'react';
import SkillTreeCanvas from './SkillTreeCanvas';
import NodePanel from './NodePanel';

export default function MapView({ id, project, states, mastery, sharedWith, selectedId, onSelect, onOpenLesson, onSkip, onOpenSettings, onAddPaper, bookmarks, onToggleBookmark, notes, onSaveNote, lessons }) {
  const selNode = selectedId ? project.nodes.find((n) => n.id === selectedId) : null;
  return (
    <div className="tree-wrap">
      {project.nodes.length > 0 ? (
        <SkillTreeCanvas nodes={project.nodes} states={states} selectedId={selectedId} onSelect={onSelect} />
      ) : (
        <div className="empty-tree">
          <div className="empty-emoji">🌱</div>
          <h2>No map yet</h2>
          <p className="dim">Add a paper and PaperQuest grows a prerequisite map here — in the background.</p>
          <button className="btn btn-primary" onClick={onAddPaper}>＋ Add a paper</button>
        </div>
      )}
      {selNode && (
        <NodePanel
          node={selNode}
          nodes={project.nodes}
          states={states}
          mastery={mastery}
          sharedWith={sharedWith}
          papers={project.papers}
          projectId={id}
          bookmarked={(bookmarks || []).includes(selectedId)}
          onToggleBookmark={onToggleBookmark}
          onSelect={onSelect}
          onOpenLesson={onOpenLesson}
          onSkip={onSkip}
          onOpenSettings={onOpenSettings}
          onClose={() => onSelect(null)}
          savedAt={(lessons || {})[selectedId] || 0}
          note={(notes && notes[selectedId] && notes[selectedId].text) || ''}
          onSaveNote={onSaveNote}
        />
      )}
    </div>
  );
}
