import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { api } from './api';

const JobsCtx = createContext(null);
export const useJobs = () => useContext(JobsCtx);

const STATUS = {
  queued: 'Queued',
  converting: 'Converting PDF…',
  analyzing: 'Mapping concepts…',
  preparing: 'Preparing lesson…',
  extracting: 'Reading resume…',
  mapping: 'Mapping skills…',
  done: 'Done',
  error: 'Failed'
};

let seq = 0;
const lkey = (pid, cid) => `${pid}:${cid}`;

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [completions, setCompletions] = useState({}); // projectId -> counter
  const [lessons, setLessons] = useState({}); // 'pid:cid' -> {status, error}
  const [careersVersion, setCareersVersion] = useState(0); // bumped when any career job settles
  const queueRef = useRef([]);
  const runningRef = useRef(false);

  const patch = useCallback((jid, upd) => setJobs((js) => js.map((j) => (j.id === jid ? { ...j, ...upd } : j))), []);
  const bump = useCallback((pid) => setCompletions((c) => ({ ...c, [pid]: (c[pid] || 0) + 1 })), []);
  const bumpCareers = useCallback(() => setCareersVersion((v) => v + 1), []);
  const setLesson = useCallback((pid, cid, v) => setLessons((m) => ({ ...m, [lkey(pid, cid)]: v })), []);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    while (queueRef.current.length) {
      const job = queueRef.current.shift();
      try {
        if (job.kind === 'upload') {
          patch(job.id, { status: 'converting' });
          const form = new FormData();
          form.append('file', job.file);
          const up = await api(`/projects/${job.projectId}/papers`, { method: 'POST', form });
          bump(job.projectId);
          patch(job.id, { status: 'analyzing' });
          await api(`/projects/${job.projectId}/papers/${up.paper.id}/analyze`, { method: 'POST', body: {} });
          patch(job.id, { status: 'done' });
          bump(job.projectId);
          setTimeout(() => setJobs((js) => js.filter((j) => j.id !== job.id)), 2500);
        } else if (job.kind === 'lesson') {
          patch(job.id, { status: 'preparing' });
          setLesson(job.projectId, job.conceptId, { status: 'preparing' });
          await api(`/projects/${job.projectId}/lesson`, { method: 'POST', body: { conceptId: job.conceptId } });
          patch(job.id, { status: 'done' });
          setLesson(job.projectId, job.conceptId, { status: 'ready' });
          bump(job.projectId); // refetch so the concept shows as saved right away
          setTimeout(() => setJobs((js) => js.filter((j) => j.id !== job.id)), 2500);
        } else if (job.kind === 'career-generate') {
          patch(job.id, { status: 'mapping' });
          await api(`/careers/${job.careerId}/generate`, { method: 'POST', body: {} });
          patch(job.id, { status: 'done' });
          bumpCareers();
          setTimeout(() => setJobs((js) => js.filter((j) => j.id !== job.id)), 2500);
        } else if (job.kind === 'career-resume') {
          patch(job.id, { status: 'extracting' });
          const form = new FormData();
          form.append('file', job.file);
          await api(`/careers/${job.careerId}/resume`, { method: 'POST', form });
          patch(job.id, { status: 'done' });
          bumpCareers();
          setTimeout(() => setJobs((js) => js.filter((j) => j.id !== job.id)), 2500);
        } else if (job.kind === 'career-jd') {
          patch(job.id, { status: 'mapping' });
          if (job.file) {
            const form = new FormData();
            form.append('file', job.file);
            await api(`/careers/${job.careerId}/jd`, { method: 'POST', form });
          } else {
            await api(`/careers/${job.careerId}/jd`, { method: 'POST', body: { text: job.text, name: job.name } });
          }
          patch(job.id, { status: 'done' });
          bumpCareers();
          setTimeout(() => setJobs((js) => js.filter((j) => j.id !== job.id)), 2500);
        }      } catch (e) {
        patch(job.id, { status: 'error', error: e.message });
        if (job.kind === 'lesson') setLesson(job.projectId, job.conceptId, { status: 'error', error: e.message });
        if (job.kind === 'upload') bump(job.projectId);
        if (String(job.kind).startsWith('career')) bumpCareers();
      }
    }
    runningRef.current = false;
  }, [patch, bump, bumpCareers, setLesson]);

  const enqueue = useCallback(
    (projectId, files) => {
      const list = [...files].filter((f) => /\.(pdf|md|markdown|txt)$/i.test(f.name));
      if (!list.length) return 0;
      const nj = list.map((f) => ({ id: ++seq, kind: 'upload', projectId, name: f.name, file: f, status: 'queued' }));
      setJobs((js) => [...js, ...nj]);
      queueRef.current.push(...nj);
      pump();
      return list.length;
    },
    [pump]
  );

  const startLesson = useCallback(
    (projectId, node) => {
      const nj = { id: ++seq, kind: 'lesson', projectId, conceptId: node.id, name: `Refresher — ${node.name}`, status: 'queued' };
      setJobs((js) => [...js.filter((j) => !(j.kind === 'lesson' && j.conceptId === node.id && j.status === 'error')), nj]);
      setLesson(projectId, node.id, { status: 'preparing' });
      queueRef.current.push(nj);
      pump();
    },
    [pump, setLesson]
  );

  const startCareerJob = useCallback(
    (kind, payload) => {
      const nj = { id: ++seq, kind, status: 'queued', ...payload };
      setJobs((js) => [...js, nj]);
      queueRef.current.push(nj);
      pump();
    },
    [pump]
  );

  const lessonState = useCallback((pid, cid) => lessons[lkey(pid, cid)] || null, [lessons]);
  const clearLesson = useCallback((pid, cid) => setLessons((m) => { const n = { ...m }; delete n[lkey(pid, cid)]; return n; }), []);
  const dismiss = useCallback((jid) => setJobs((js) => js.filter((j) => j.id !== jid)), []);

  return (
    <JobsCtx.Provider value={{ jobs, enqueue, startLesson, lessonState, clearLesson, completions, dismiss, careersVersion, startCareerJob }}>
      {children}
      <JobsIndicator jobs={jobs} onDismiss={dismiss} />
    </JobsCtx.Provider>
  );
}

function JobsIndicator({ jobs, onDismiss }) {
  if (!jobs.length) return null;
  return (
    <div className="jobs-dock">
      {jobs.map((j) => (
        <div key={j.id} className={`job-card ${j.status}`}>
          <div className="job-spinner">
            {j.status === 'done' ? '✓' : j.status === 'error' ? '⚠' : <span className="mini-spinner" />}
          </div>
          <div className="job-body">
            <div className="job-name">{j.name}</div>
            <div className="job-status">{j.error || STATUS[j.status]}</div>
          </div>
          {(j.status === 'error' || j.status === 'done') && (
            <button className="job-x" onClick={() => onDismiss(j.id)}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}
