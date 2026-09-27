import React, { useState } from 'react';
import { api } from '../api';
import { Modal } from './bits';
import { PROJECT_KINDS, kindOf } from '../projectKinds';

// Create a project: a name and what it holds (paper, class, course, club, hackathon,
// notes). The guided tour spotlights the fields (data-tour="new-project-form").
export default function NewProjectModal({ onClose, onCreated, onTryDemo }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('paper');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e && e.preventDefault();
    setBusy(true); setError('');
    try {
      const p = await api('/projects', { method: 'POST', body: { name: name.trim() || `Untitled ${kindOf(kind).label.toLowerCase()}`, kind } });
      onCreated(p);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} label="New project">
      <form onSubmit={create}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">New project</span>
            <h2>What are you learning?</h2>
          </div>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="np-form" data-tour="new-project-form">
          <label className="field-label" htmlFor="np-name">Name</label>
          <input id="np-name" className="input" autoFocus value={name} maxLength={80}
            placeholder={kind === 'paper' ? 'e.g. Attention Is All You Need' : kind === 'class' ? 'e.g. CS 229 Machine Learning' : kind === 'club' ? 'e.g. Robotics club' : kind === 'hackathon' ? 'e.g. HackMIT 2026' : 'e.g. Linear algebra notes'}
            onChange={(e) => setName(e.target.value)} />
          <span className="field-label">Type</span>
          <div className="np-kinds" role="radiogroup" aria-label="Project type">
            {PROJECT_KINDS.map((k) => (
              <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className={`np-kind ${kind === k.id ? 'active' : ''}`} onClick={() => setKind(k.id)}>
                <span className="np-kind-icon" aria-hidden="true">{k.icon}</span>
                <span className="np-kind-label">{k.label}</span>
                <span className="np-kind-hint">{k.hint}</span>
              </button>
            ))}
          </div>
          <p className="dim small np-note">Next, add {kindOf(kind).material.toLowerCase()}: PDFs, Markdown or text. AI maps every prerequisite concept, from high-school basics up.</p>
        </div>
        {error && <p className="doc-error" role="alert">{error}</p>}
        <div className="modal-actions">
          {onTryDemo && <button type="button" className="btn btn-ghost" onClick={onTryDemo}>✦ Try the demo instead</button>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  );
}
