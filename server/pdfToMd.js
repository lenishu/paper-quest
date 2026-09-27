// PDF -> Markdown. Default converter: docling (Python, high quality: tables,
// equations, reading order). Falls back to a pdf.js text extractor if docling
// isn't installed, so the app still works out of the box.
const loadPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function execFileP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve({ stdout, stderr });
    });
  });
}

let doclingChecked = null;
async function hasDocling() {
  if (process.env.NETLIFY) return false;
  if (doclingChecked !== null) return doclingChecked;
  try { await execFileP('docling', ['--version'], { timeout: 15000 }); doclingChecked = true; }
  catch { doclingChecked = false; }
  return doclingChecked;
}

async function doclingConvert(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-'));
  const inPath = path.join(dir, 'input.pdf');
  const outDir = path.join(dir, 'out');
  fs.writeFileSync(inPath, buffer);
  fs.mkdirSync(outDir);
  try {
    await execFileP('docling', [inPath, '--to', 'md', '--output', outDir], { timeout: 300000, maxBuffer: 128 * 1024 * 1024 });
    const mdFile = fs.readdirSync(outDir).find((f) => f.toLowerCase().endsWith('.md'));
    if (!mdFile) throw new Error('docling produced no markdown file');
    const text = fs.readFileSync(path.join(outDir, mdFile), 'utf8');
    if (text.replace(/\s/g, '').length < 100) throw new Error('docling output looked empty');
    return text;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

async function pageCount(buffer) {
  let loading;
  try {
    const pdfjs = await loadPdfjs();
    loading = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, isEvalSupported: false });
    const doc = await loading.promise;
    const n = doc.numPages;
    return n;
  } catch { return 0; }
  finally { if (loading) await loading.destroy(); }
}

// ---------------- pdf.js fallback extractor ----------------

async function extractText(buffer) {
  const pdfjs = await loadPdfjs();
  const loading = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, isEvalSupported: false });
  try {
    const doc = await loading.promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const lines = [];
      let cur = '';
      let lastY = null;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const y = it.transform ? it.transform[5] : 0;
        if (lastY !== null && Math.abs(y - lastY) > 2.5) {
          if (cur.trim()) lines.push(cur);
          cur = it.str;
        } else {
          const needSpace = cur && !cur.endsWith(' ') && it.str && !it.str.startsWith(' ');
          cur += (needSpace ? ' ' : '') + it.str;
        }
        lastY = y;
      }
      if (cur.trim()) lines.push(cur);
      pages.push(lines.join('\n'));
      page.cleanup();
    }
    let info = null;
    try { info = (await doc.getMetadata()).info || null; } catch {}
    const numPages = doc.numPages;
    return { text: pages.join('\n\n'), numPages, info };
  } finally { await loading.destroy(); }
}

const SECTION_WORDS = /^(abstract|introduction|background|related work|methods?|methodology|results?|discussion|conclusions?|references|acknowledg(e)?ments|appendix|preliminaries|experiments?|evaluation|limitations|future work)\b/i;

function looksLikeHeading(line) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (/^(\d+\.)+\d*\s+\S/.test(t)) return true;
  if (/^[IVXLC]+\.\s+\S/.test(t)) return true;
  if (SECTION_WORDS.test(t) && t.length < 45) return true;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && t.split(/\s+/).length <= 8) return true;
  return false;
}

function rawTextToMarkdown(text, title) {
  let t = text.replace(/([a-z])-\n([a-z])/g, '$1$2');
  const lines = t.split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(para.join(' ').replace(/\s+/g, ' ').trim()); para = []; } };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    if (looksLikeHeading(trimmed)) { flush(); out.push('## ' + trimmed.replace(/^#+\s*/, '')); continue; }
    para.push(trimmed);
    if (/[.!?]$/.test(trimmed) && trimmed.length < 60) flush();
  }
  flush();
  let md = out.join('\n\n').replace(/\n{3,}/g, '\n\n');
  if (title) md = '# ' + title.trim() + '\n\n' + md;
  return md.trim() + '\n';
}

async function pdfToMarkdown(buffer, originalName) {
  const fallbackTitle = (originalName || '').replace(/\.pdf$/i, '');

  // Primary path: docling.
  if (await hasDocling()) {
    try {
      const markdown = await doclingConvert(buffer);
      const pages = await pageCount(buffer);
      return { markdown, pages, title: fallbackTitle, via: 'docling' };
    } catch (e) {
      // fall through to pdf.js
      console.error('docling failed, falling back to pdf.js:', e.message);
    }
  }

  // Fallback path: pdf.js text extraction.
  const data = await extractText(buffer);
  const text = data.text || '';
  if (text.replace(/\s/g, '').length < 200) {
    throw new Error(
      'Could not extract text from this PDF (it may be scanned/image-only). For best results install the default converter: Python 3.10+ then `pip install docling`. Otherwise use an OCRed copy or paste text into a .md file.'
    );
  }
  const infoTitle = data.info && typeof data.info.Title === 'string' ? data.info.Title.trim() : '';
  const title = infoTitle && infoTitle.length > 5 ? infoTitle : fallbackTitle;
  const markdown = rawTextToMarkdown(text, title);
  return { markdown, pages: data.numPages || 0, title, via: 'pdfjs-fallback' };
}

module.exports = { pdfToMarkdown, rawTextToMarkdown, looksLikeHeading, hasDocling };
