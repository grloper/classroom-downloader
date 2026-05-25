import path from 'node:path';
import fs from 'fs-extra';
import { config } from '../config.js';

const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
]);

export function safeSegment(input, fallback = 'untitled') {
  const cleaned = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  const candidate = cleaned || fallback;
  const safe = WINDOWS_RESERVED_NAMES.has(candidate.toLowerCase()) ? `${candidate}_` : candidate;
  return safe.slice(0, 120);
}

export function safeFilename(input, fallback = 'file') {
  return safeSegment(input, fallback);
}

export async function ensureProjectFolders(activeConfig = config) {
  await fs.ensureDir(activeConfig.paths.outputRoot);
  await fs.ensureDir(activeConfig.paths.coursesRoot);
  await fs.ensureDir(path.dirname(activeConfig.paths.dbPath));
  await fs.ensureDir(activeConfig.paths.logsDir);
  await fs.ensureDir(activeConfig.paths.sessionsDir);
  await fs.ensureDir(activeConfig.paths.credentialsDir);
}

export function outputRelativePath(absolutePath, activeConfig = config) {
  return path.relative(activeConfig.paths.outputRoot, absolutePath).replaceAll(path.sep, '/');
}

export function resolveOutputPath(relativePath, activeConfig = config) {
  return path.resolve(activeConfig.paths.outputRoot, relativePath);
}

export function materialOutputDir(row, activeConfig = config) {
  const course = safeSegment(row.course_name || row.course_id, 'course');
  const topic = safeSegment(row.topic_title || 'Uncategorized', 'topic');
  const material = safeSegment(row.material_title || row.material_id, 'material');
  return path.join(activeConfig.paths.coursesRoot, course, topic, material);
}

export async function nextAvailablePath(targetPath) {
  if (!(await fs.pathExists(targetPath))) return targetPath;

  const parsed = path.parse(targetPath);
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
    if (!(await fs.pathExists(candidate))) return candidate;
  }

  throw new Error(`Could not allocate a unique path for ${targetPath}`);
}
