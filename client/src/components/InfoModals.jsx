import React, { useEffect, useState } from 'react';
import { api, isCloud } from '../api';
import { Modal, useToast } from './bits';
import { branchColor } from '../graphLayout';

export function BadgesModal({ badges, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal-head"><h2>Badges</h2><button className="iconbtn" onClick={onClose}>✕</button></div>
      <div className="badges-grid">
        {(badges || []).map((b) => (
          <div key={b.id} className={`badge-card ${b.earned ? 'earned' : ''}`}>
            <span className="badge-icon">{b.icon}</span>
            <div>
              <div className="badge-name">{b.name}</div>
              <div className="badge-desc">{b.desc}</div>
            </div>
            <span className="badge-state">{b.earned ? '✓ Earned' : 'Locked'}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function BookmarksModal({ onClose, onOpenConcept }) {
  const [list, setList] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/bookmarks').then(setList).catch((e) => toast(e.message, 'err')); }, [toast]);
  return (
    <Modal onClose={onClose}>
      <div className="modal-head"><h2>To review</h2><button className="iconbtn" onClick={onClose}>✕</button></div>
      <p className="dim small">Advanced concepts you flagged with ♡ — worth a second pass.</p>
      {!list ? <div className="dim small">Loading…</div>
        : list.length === 0 ? <div className="dim small">Nothing flagged yet. Bookmark an advanced concept from its panel or the galaxy card.</div>
          : (
            <div className="bm-list">
              {list.map((b) => (
                <button key={b.projectId + b.conceptId} className="bm-row" onClick={() => { onClose(); onOpenConcept(b.projectId, b.conceptId); }}>
                  <span className="bm-dot" style={{ background: branchColor(b.branch) || '#98938B' }} />
                  <span className="bm-name">{b.name}</span>
                  <span className="bm-meta">{b.projectName}</span>
                </button>
              ))}
            </div>
          )}
    </Modal>
  );
}

export function AboutModal({ onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal-head"><h2>About PaperQuest</h2><button className="iconbtn" onClick={onClose}>✕</button></div>
      <div className="prose">
        <p>Drop any research paper into a project. PaperQuest converts it to Markdown, identifies the concepts it stands on, and grows a <b>prerequisite skill map</b> rooted in high-school math &amp; physics.</p>
        <p>You learn bottom-up: pass a short quiz on a concept to unlock the branches that build on it, until you reach the paper's core idea — explained using everything you just learned.</p>
        <p>{isCloud ? "Your papers, progress and API keys are saved in your private encrypted workspace on Netlify. Save the recovery key in Settings to keep access across devices. AI requests are sent to your chosen provider." : <>Everything is stored locally in the <code>data/</code> folder. Your API key never leaves your machine except to the provider you chose.</>}</p>
      </div>
    </Modal>
  );
}

export function HelpModal({ onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal-head"><h2>How PaperQuest works</h2><button className="iconbtn" onClick={onClose}>✕</button></div>
      <div className="prose">
        <ol className="help-steps">
          <li><b>Set a key.</b> Open ⚙ Settings, pick a provider (Gemini, Claude or OpenAI), paste an API key and test it.</li>
          <li><b>Create a project</b> and drop a PDF or Markdown paper onto the Papers tab — parsing and mapping run in the background.</li>
          <li><b>Climb the map.</b> Glowing nodes are ready. Each opens a generated refresher with a 4-question quiz — score 75%+ to master it and unlock what builds on it.</li>
          <li><b>Know it already?</b> "I already know this" marks it reviewed for half XP.</li>
          <li><b>Watch your galaxy grow.</b> Mastery is global: shared concepts unlock across projects, and the dashboard tracks streaks, quests, XP and badges.</li>
        </ol>
        <p className="dim small">Tips: press <code>Ctrl K</code> to search anything · the demo project's first lesson works with no API key.</p>
      </div>
    </Modal>
  );
}
