import React, { useEffect, useRef, useState } from 'react';
import { tierOf, TIER_LABELS, branchColor, isAdvancedTier } from '../graphLayout';
import { useJobs } from '../jobs';
import MathText from './MathText';

function NotesEditor({ nodeId, value, onSave }) {
  const [text, setText] = useState(value || '');
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(value || '');
  // reset when switching to a different concept
  useEffect(() => { setText(value || ''); savedRef.current = value || ''; setSaved(false); }, [nodeId, value]);

  const commit = () => {
    if (text === savedRef.current) return;
    savedRef.current = text;
    onSave(nodeId, text);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="np-section np-notes">
      <div className="np-label">📝 My notes {saved && <span className="np-note-saved">saved ✓</span>}</div>
      <textarea
        className="np-note-input"
        placeholder="Resources, reminders, links — anything you want to remember about this concept…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      <div className="np-note-hint dim small">Saved automatically when you click away. Shows up on the Overview tab.</div>
    </div>
  );
}

const STATE_LABEL = {
  known: 'Baseline — assumed known',
  done: 'Reviewed',
  open: 'Ready to review',
  locked: 'Builds on earlier topics'
};


// "Saved 3d ago" — a lesson already on disk reopens for free, no model call.
export function savedAgo(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 3600) return 'saved just now';
  if (s < 86400) return 'saved ' + Math.floor(s / 3600) + 'h ago';
  if (s < 2592000) return 'saved ' + Math.floor(s / 86400) + 'd ago';
  return 'saved ' + new Date(ms).toLocaleDateString();
}

export default function NodePanel({ node, nodes, states, mastery, sharedWith, papers, projectId, bookmarked, onToggleBookmark, onSelect, onOpenLesson, onSkip, onOpenSettings, onClose, note, onSaveNote, savedAt }) {
  const st = states[node.id] || 'locked';
  const tier = tierOf(node);
  const m = mastery[node.id];
  const isBaseline = node.level === 0;
  const { lessonState, startLesson } = useJobs();
  const ls = lessonState(projectId, node.id);

  const prereqs = (node.prereqs || []).map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
  const children = nodes.filter((n) => (n.prereqs || []).includes(node.id));
  const notReady = prereqs.filter((p) => states[p.id] !== 'known' && states[p.id] !== 'done');
  const sourcePapers = (node.sources || []).map((sid) => papers.find((p) => p.id === sid)).filter(Boolean);
  const shared = sharedWith[node.id] || [];
  const usageEntries = Object.entries(node.usage || {}).map(([pid, text]) => ({ paper: papers.find((p) => p.id === pid), text }));

  function renderActions() {
    if (isBaseline) return <div className="dim small">Part of the high-school baseline this tree grows from — assumed known.</div>;
    if (st === 'done')
      return <button className="btn" onClick={() => onOpenLesson(node)}>📖 Review lesson / retake quiz</button>;
    if (ls && ls.status === 'preparing')
      return (
        <div className="np-preparing">
          <span className="mini-spinner" /> Preparing your refresher…
          <div className="dim small">Running in the background — keep exploring, you'll get a ping.</div>
        </div>
      );
    if (ls && ls.status === 'error')
      return (
        <div className="np-stepup">
          <div className="np-error">⚠ {ls.error}</div>
          <div className="np-stepup-actions">
            <button className="btn btn-primary" onClick={() => startLesson(projectId, node)}>↻ Retry</button>
            <button className="btn btn-ghost" onClick={onOpenSettings}>Open settings</button>
          </div>
        </div>
      );
    if (savedAt && !(ls && ls.status === 'preparing'))
      return (
        <>
          <button className="btn btn-primary" onClick={() => onOpenLesson(node)}>📖 Open saved refresher</button>
          <button className="btn btn-ghost" onClick={() => onSkip(node)}>I already know this</button>
          <div className="dim small np-saved">Written once and kept on disk ({savedAgo(savedAt)}) — reopening costs nothing. Regenerate inside if you want a fresh one.</div>
        </>
      );
    if (ls && ls.status === 'ready')
      return (
        <>
          <button className="btn btn-primary" onClick={() => onOpenLesson(node)}>▶ Open refresher</button>
          <button className="btn btn-ghost" onClick={() => onSkip(node)}>I already know this</button>
        </>
      );
    return (
      <>
        <button className="btn btn-primary" onClick={() => startLesson(projectId, node)}>▶ Start refresher</button>
        <button className="btn btn-ghost" onClick={() => onSkip(node)}>I already know this</button>
      </>
    );
  }

  return (
    <aside className="node-panel">
      <div className="np-head">
        <span className={`chip tierchip tier-${tier}`}>{node.core ? '★ ' : ''}{TIER_LABELS[tier]}</span>
        <div className="np-head-actions">
          {isAdvancedTier(node) && (
            <button className={`iconbtn bookmark ${bookmarked ? 'on' : ''}`} title={bookmarked ? 'Remove from “to review”' : 'Bookmark — add to “to review”'} onClick={() => onToggleBookmark(node)}>
              {bookmarked ? '★' : '☆'}
            </button>
          )}
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
      </div>

      <h2 className="np-title">{node.name}</h2>
      {node.branch && (
        <div className="np-branch">
          <span className="branch-dot" style={{ background: branchColor(node.branch) }} />
          {node.branch}
        </div>
      )}
      <div className={`np-state np-${st}`}>{STATE_LABEL[st]}{m && m.skipped ? ' (marked as known)' : ''}</div>

      {node.blurb && (
        <div className="np-section">
          <div className="np-label">What it is</div>
          <MathText className="np-blurb">{node.blurb}</MathText>
        </div>
      )}

      {usageEntries.length > 0 ? (
        <div className="np-section np-usage">
          <div className="np-label">📌 How this paper uses it</div>
          {usageEntries.map((u, i) => (
            <div key={i} className="np-usage-item">
              {usageEntries.length > 1 && u.paper && <div className="np-usage-paper">{u.paper.title || u.paper.name}</div>}
              <MathText>{u.text}</MathText>
            </div>
          ))}
        </div>
      ) : (
        !isBaseline && (
          <div className="np-section np-usage np-usage-empty">
            <div className="np-label">📌 How this paper uses it</div>
            <div className="dim small">The paper relies on this concept. Open the refresher to see how it fits.</div>
          </div>
        )
      )}

      {prereqs.length > 0 && (
        <div className="np-section">
          <div className="np-label">Review these first</div>
          <div className="np-links">
            {prereqs.map((p) => (
              <button key={p.id} className="linkchip" onClick={() => onSelect(p.id)}>
                {states[p.id] === 'done' ? '✓ ' : states[p.id] === 'known' ? '◆ ' : '▶ '}
                {p.name}
              </button>
            ))}
          </div>
          {notReady.length > 0 && (
            <div className="dim small np-hint">
              You haven't reviewed {notReady.map((p) => p.name).join(', ')} yet — doing those first helps, but you can dive in any time.
            </div>
          )}
        </div>
      )}

      {children.length > 0 && (
        <div className="np-section">
          <div className="np-label">Leads to</div>
          <div className="np-links">
            {children.map((c) => (
              <button key={c.id} className="linkchip" onClick={() => onSelect(c.id)}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {sourcePapers.length > 0 && (
        <div className="np-section">
          <div className="np-label">Needed for</div>
          <div className="dim small">{sourcePapers.map((p) => p.title || p.name).join(' · ')}</div>
        </div>
      )}

      {shared.length > 0 && (
        <div className="np-section">
          <div className="np-label">↔ Also appears in</div>
          <div className="dim small">{shared.join(' · ')} — reviewing it here counts there too.</div>
        </div>
      )}

      {onSaveNote && <NotesEditor nodeId={node.id} value={note} onSave={onSaveNote} />}

      <div className="np-actions">{renderActions()}</div>
    </aside>
  );
}
