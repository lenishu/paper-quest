export const isCloud = import.meta.env.VITE_CLOUD === 'true';
let session;
export function openSession() {
  if (!isCloud) return Promise.resolve(null);
  session ||= fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' }).then(async (res) => {
    if (!res.ok) throw new Error('Could not open your private workspace. Reload to retry.');
    return res.json();
  }).catch((error) => { session = null; throw error; });
  return session;
}

export async function api(path, { method = 'GET', body, form } = {}) {
  await openSession();
  if (isCloud && form) {
    for (const value of form.values()) {
      if (value instanceof File && value.size > 4 * 1024 * 1024) throw new Error('Hosted uploads are limited to 4 MB each. Upload the paper as Markdown or use the local app for larger PDFs.');
    }
  }
  const opts = { method };
  if (form) {
    opts.body = form; // browser sets multipart headers
  } else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  let res = await fetch('/api' + path, opts);
  const deadline = Date.now() + 16 * 60 * 1000;
  let delay = 1500;
  while (res.status === 202) {
    const { jobId } = await res.json();
    if (!jobId) throw new Error('The server did not return a task ID.');
    if (Date.now() > deadline) throw new Error('This task is taking too long. Reload to check saved progress.');
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(8000, delay * 1.4);
    res = await fetch('/api/jobs/' + encodeURIComponent(jobId), { cache: 'no-store' });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error((data && data.error) || `${res.status} ${res.statusText}`);
  return data;
}

export function downloadUrl(path) {
  return '/api' + path;
}
