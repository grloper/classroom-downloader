/**
 * Export/serialize an archive to shareable outputs:
 *   - a .zip (manifest + master_index.json + files/ + README) via JSZip,
 *   - a metadata-only .json,
 *   - an inline share link (small archives) or a ?src= share link.
 */
import { loadJsZip } from '../util/vendor.js';
import { safeSegment } from '../util/paths.js';
import { encodeSharePayload, makeShareable } from './format.js';
import { config } from '../../config.js';

const noop = () => {};

export function suggestFilename(archive, ext) {
  const title = safeSegment(archive?.meta?.title || 'classroom-archive').replace(/\s+/g, '-').toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  return `${title || 'classroom-archive'}-${date}.${ext}`;
}

/**
 * Build a .zip Blob. `files` is a Map(path → { blob }) of downloaded binaries
 * (may be empty for a metadata-only scrape or an imported JSON archive).
 */
export async function exportZip(archive, files = new Map(), { onProgress = noop } = {}) {
  const JSZip = await loadJsZip();
  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify(archive, null, 2));
  // Also write the bare graph under the Node engine's filename for compatibility.
  zip.file('master_index.json', JSON.stringify(archive.graph, null, 2));
  zip.file('README.txt', readmeText(archive));

  for (const [path, entry] of files.entries()) {
    if (entry?.blob) zip.file(`files/${path}`, entry.blob);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (meta) => {
    onProgress({ phase: 'zip', message: `Packaging… ${Math.round(meta.percent)}%`, percent: meta.percent });
  });
}

/** Metadata-only JSON export (references, no binaries). */
export function exportJson(archive) {
  return new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Try to build a self-contained inline share link (archive encoded in the URL).
 * Returns { ok, url } or { ok:false, reason } when the archive is too large.
 */
export async function buildInlineShareLink(archive, baseUrl = location.origin + location.pathname) {
  const shareable = makeShareable(archive);
  const encoded = await encodeSharePayload(shareable);
  const approxBytes = encoded.length;
  if (approxBytes > config.maxInlineShareBytes) {
    return {
      ok: false,
      reason: `This archive is too large for a compressed inline link (${Math.round(approxBytes / 1024)} KB). ` +
        `Download the .zip and host it on Drive, Dropbox, or GitHub, then share a “?src=” link to the file.`
    };
  }
  return { ok: true, url: `${stripHash(baseUrl)}#/view?data=${encoded}` };
}

/** Build a viewer link that loads an archive hosted at `srcUrl`. */
export function buildSrcShareLink(srcUrl, baseUrl = location.origin + location.pathname) {
  return `${stripHash(baseUrl)}#/view?src=${encodeURIComponent(srcUrl)}`;
}

function stripHash(url) {
  const i = url.indexOf('#');
  return i === -1 ? url : url.slice(0, i);
}

function readmeText(archive) {
  const c = archive?.meta?.counts || {};
  return [
    `${archive?.meta?.app || 'Classroom Archiver'} — exported archive`,
    ``,
    `Title:      ${archive?.meta?.title || '(untitled)'}`,
    `Generated:  ${archive?.meta?.generatedAt || ''}`,
    `Courses:    ${c.courses ?? 0}`,
    `Items:      ${c.materials ?? 0}`,
    `Files:      ${c.files ?? 0}`,
    ``,
    `HOW TO VIEW`,
    `-----------`,
    `1. Open the Classroom Archiver web app.`,
    `2. Choose "Open an archive" and drop this .zip file in.`,
    `   Everything (courses, topics, assignments, and the files in /files) loads`,
    `   locally in your browser. Nothing is uploaded.`,
    ``,
    `CONTENTS`,
    `--------`,
    `manifest.json      Full archive (metadata + structure).`,
    `master_index.json  The course graph (compatible with the CLI engine).`,
    `files/             Downloaded Drive files, organized by course/topic/item.`,
    ``
  ].join('\n');
}
