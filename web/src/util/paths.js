/**
 * Browser-safe filename/path helpers, ported from the Node engine's
 * src/utils/paths.js so archives lay out identically. No node:path dependency.
 */

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

export function safeSegment(input, fallback = 'untitled') {
  const cleaned = String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  const candidate = cleaned || fallback;
  const safe = WINDOWS_RESERVED.has(candidate.toLowerCase()) ? `${candidate}_` : candidate;
  return safe.slice(0, 120);
}

export function safeFilename(input, fallback = 'file') {
  return safeSegment(input, fallback);
}

export function joinPath(...parts) {
  return parts
    .filter((p) => p != null && p !== '')
    .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
    .join('/');
}

export function extname(name = '') {
  const base = String(name).split('/').pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

export function stripExt(name = '') {
  const ext = extname(name);
  return ext ? String(name).slice(0, -ext.length) : String(name);
}

/** Given a set of already-used paths, return a unique variant of `path`. */
export function uniquePath(path, used) {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const ext = extname(path);
  const base = ext ? path.slice(0, -ext.length) : path;
  for (let i = 2; i < 10000; i += 1) {
    const candidate = `${base} (${i})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  used.add(path);
  return path;
}
