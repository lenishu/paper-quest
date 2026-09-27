import React from 'react';

// PaperQuest "quest compass" mark — 8-ray star in the primary gradient.
export default function Logo({ size = 26, wordmark = true }) {
  const gid = 'pqg';
  return (
    <span className="pq-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="PaperQuest">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E4572E" /><stop offset="1" stopColor="#2E86AB" />
          </linearGradient>
        </defs>
        <path d="M16 1 L18.4 13.6 L31 16 L18.4 18.4 L16 31 L13.6 18.4 L1 16 L13.6 13.6 Z" fill={`url(#${gid})`} />
        <path d="M16 6 L24.5 7.5 L26 16 L24.5 24.5 L16 26 L7.5 24.5 L6 16 L7.5 7.5 Z" fill={`url(#${gid})`} opacity="0.28" />
        <circle cx="16" cy="16" r="3.2" fill="#fff" />
      </svg>
      {wordmark && <span className="pq-word">PaperQuest</span>}
    </span>
  );
}
