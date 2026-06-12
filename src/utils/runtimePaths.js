import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getSourcePath(...segments) {
  return path.join(sourceRoot, ...segments);
}

export function quoteForCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
