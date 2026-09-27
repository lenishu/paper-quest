import React, { createContext, useContext, useEffect, useRef } from 'react';

export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function XpBar({ profile }) {
  return (
    <div className="xpbar" title={`${profile.xp} XP · ${profile.masteredCount} concepts mastered · next level at ${profile.nextLevelXp} XP`}>
      <span className="xp-level">
        Lv {profile.level} {profile.title}
      </span>
      <span className="xp-track">
        <span className="xp-fill" style={{ width: `${Math.round(profile.progress * 100)}%` }} />
      </span>
      <span className="xp-num">{profile.xp} XP</span>
    </div>
  );
}

export function ProgressRing({ value, size = 46, stroke = 5, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="ring" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fg"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-label">{Math.round(pct * 100)}%</span>
    </span>
  );
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label && <div className="spinner-label">{label}</div>}
    </div>
  );
}

const CONFETTI_COLORS = ['#fbbf24', '#34d399', '#38bdf8', '#a78bfa', '#f87171', '#e879f9', '#6c8cff'];

export function Confetti() {
  const pieces = Array.from({ length: 34 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    dur: 1.9 + Math.random() * 1.2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    rot: Math.random() * 360
  }));
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`
          }}
        />
      ))}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ children, onClose, wide, className = '', label }) {
  const panelRef = useRef(null);

  useEffect(() => {
    // Remember what opened the modal so focus can go back there on close —
    // otherwise a keyboard user is dumped at the top of the document.
    const opener = document.activeElement;
    const panel = panelRef.current;

    const first = panel && panel.querySelector(FOCUSABLE);
    (first || panel).focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panel) return;
      // Trap Tab inside the dialog: without this, tabbing walks out into the
      // page behind the backdrop, which is invisible but still focusable.
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || !panel.contains(document.activeElement))) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
