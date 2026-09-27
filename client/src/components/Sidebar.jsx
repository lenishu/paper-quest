import { isCloud } from '../api';
import React from 'react';
import { ACCENT_HUES } from '../graphLayout';

const QUOTE = { text: 'The beautiful thing about learning is that no one can take it away from you.', by: 'B.B. King' };
const BADGE_HUES = ACCENT_HUES;

export default function Sidebar({ dash, onUpload, onNewProject, onExplore, onDailyQuest, onResume, onSettings, onShowBadges, onShowBookmarks, onShowAbout, onShowHelp }) {
  const p = dash?.profile || {};
  const stats = dash?.stats || {};
  const badges = dash?.badges || [];
  const earned = badges.filter((b) => b.earned);
  const shown = [...earned, ...badges.filter((b) => !b.earned)].slice(0, 5);

  return (
    <aside className="side">
      <div className="side-prof">
        <div className="side-avatar">L</div>
        <div className="side-prof-text">
          <div className="side-name">{isCloud ? 'Learner' : 'Lenish'}</div>
          <div className="side-role">{p.title || 'Novice'}</div>
          <div className="side-level">Level {p.level || 0}</div>
        </div>
      </div>

      <div className="side-xp">
        <div className="side-xp-nums">{(p.xp || 0).toLocaleString()} <span>/ {(p.nextLevelXp || 0).toLocaleString()} XP</span></div>
        <div className="side-xp-bar"><div style={{ width: `${Math.round((p.progress || 0) * 100)}%` }} /></div>
      </div>

      <div className="side-stats">
        <div><b className="c-orange">{stats.concepts ?? 0}</b><span>Concepts</span></div>
        <div><b className="c-blue">{stats.lessons ?? 0}</b><span>Lessons</span></div>
        <div><b className="c-green">{stats.projects ?? 0}</b><span>Projects</span></div>
      </div>

      <div className="side-streak">
        <span className="side-streak-fire">🔥</span>
        <div><b>{dash?.streak || 0}</b><span>Day Streak</span></div>
      </div>

      <div className="side-badges">
        <div className="side-row-head">
          <span className="eyebrow">Badges</span>
          <button className="side-link" onClick={onShowBadges}>View all</button>
        </div>
        <div className="side-badge-row">
          {shown.map((b, i) => (
            <button key={b.id} className={`side-badge ${b.earned ? '' : 'off'}`} title={`${b.name} — ${b.desc}${b.earned ? '' : ' (not earned yet)'}`}
              style={b.earned ? { color: BADGE_HUES[i % BADGE_HUES.length], borderColor: BADGE_HUES[i % BADGE_HUES.length] + '4d', background: BADGE_HUES[i % BADGE_HUES.length] + '1f' } : undefined}
              onClick={onShowBadges}>
              {b.icon || '✦'}
            </button>
          ))}
        </div>
      </div>

      <div className="side-actions">
        <div className="eyebrow">Quick Actions</div>
        <button onClick={onUpload}><span>⬆</span> Upload Paper</button>
        <button onClick={onNewProject}><span>＋</span> Create Project</button>
        <button onClick={onExplore}><span>◎</span> Explore Concepts</button>
        <button onClick={onDailyQuest}><span>◆</span> Daily Quest</button>
        <button onClick={onResume}><span>▶</span> Resume Learning</button>
      </div>

      <div className="side-quote">
        <div className="side-quote-mark">“</div>
        <p>{QUOTE.text}</p>
        <div className="side-quote-by">— {QUOTE.by}</div>
      </div>

      <div className="side-foot">
        <button title="Settings" onClick={onSettings}>⚙</button>
        <button title="About" onClick={onShowAbout}>ⓘ</button>
        <button title="To review" onClick={onShowBookmarks}>♡</button>
        <button title="Help" onClick={onShowHelp}>?</button>
      </div>
    </aside>
  );
}
