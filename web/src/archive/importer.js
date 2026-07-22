/**
 * Load an archive from a dropped/picked file, a hosted URL, or a share link.
 * Produces a LoadedArchive that the viewer renders; binary files (from a .zip)
 * are resolved to object URLs on demand and cleaned up on dispose().
 */
import { loadJsZip } from '../util/vendor.js';
import { normalizeArchive, decodeSharePayload } from './format.js';

export class LoadedArchive {
  constructor(archive, files = new Map()) {
    this.archive = archive;
    this.files = files; // Map(relativePath → Blob)
    this._urls = new Map();
  }

  get graph() {
    return this.archive.graph;
  }

  get meta() {
    return this.archive.meta;
  }

  get hasFiles() {
    return this.files.size > 0;
  }

  /** Resolve an attachment's local_path to a viewable object URL, or null. */
  resolve(localPath) {
    if (!localPath) return null;
    const key = normalizeKey(localPath);
    const blob = this.files.get(key);
    if (!blob) return null;
    if (this._urls.has(key)) return this._urls.get(key);
    const url = URL.createObjectURL(blob);
    this._urls.set(key, url);
    return url;
  }

  fileBlob(localPath) {
    return this.files.get(normalizeKey(localPath)) || null;
  }

  dispose() {
    for (const url of this._urls.values()) URL.revokeObjectURL(url);
    this._urls.clear();
  }
}

function normalizeKey(localPath) {
  return String(localPath).replace(/^\.?\/+/, '').replace(/^files\//, '');
}

export async function importFile(file) {
  const name = (file.name || '').toLowerCase();
  const isZip = name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  if (isZip) return importZipBlob(file);
  const text = await file.text();
  return importJsonText(text, name.endsWith('.json') ? 'json' : 'file');
}

export async function importFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load archive (${res.status} ${res.statusText}).`);
  const contentType = res.headers.get('content-type') || '';
  const isZip = url.toLowerCase().endsWith('.zip') || contentType.includes('zip');
  if (isZip) return importZipBlob(await res.blob());
  return importJsonText(await res.text(), 'url');
}

export async function importFromShareData(encoded) {
  const archive = await decodeSharePayload(encoded);
  return new LoadedArchive(archive, new Map());
}

function importJsonText(text, source) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON. Expected a Classroom Archiver export or master_index.json.');
  }
  const archive = normalizeArchive(obj, { source });
  return new LoadedArchive(archive, new Map());
}

async function importZipBlob(blob) {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(blob);

  let manifest = zip.file('manifest.json') || zip.file('master_index.json');
  if (!manifest) {
    const fileKeys = Object.keys(zip.files || {});
    const found = fileKeys.find((f) => f.endsWith('/manifest.json') || f.endsWith('/master_index.json') || f === 'manifest.json' || f === 'master_index.json');
    if (found) manifest = zip.file(found);
  }

  if (!manifest) {
    throw new Error('This .zip is missing manifest.json / master_index.json — is it a Classroom Archiver export?');
  }
  const obj = JSON.parse(await manifest.async('string'));
  const archive = normalizeArchive(obj, { source: 'zip' });

  const files = new Map();
  const entries = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir && relativePath.includes('files/')) {
      const cleanPath = relativePath.slice(relativePath.indexOf('files/') + 6);
      if (cleanPath) entries.push({ cleanPath, entry });
    }
  });
  await Promise.all(
    entries.map(async ({ cleanPath, entry }) => {
      const fileBlob = await entry.async('blob');
      files.set(cleanPath, fileBlob);
    })
  );

  return new LoadedArchive(archive, files);
}
