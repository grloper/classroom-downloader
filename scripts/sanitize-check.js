import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'credentials',
  'database',
  'logs',
  'output',
  'sessions'
]);

const ignoredFiles = new Set(['.env']);

const patterns = [
  {
    name: 'Google OAuth access token',
    regex: /ya29\.[0-9A-Za-z._-]+/g
  },
  {
    name: 'GitHub token',
    regex: /gh[opsu]_[0-9A-Za-z_]+/g
  },
  {
    name: 'Google OAuth client id',
    regex: /\b\d{12,}-[0-9a-z]+\.apps\.googleusercontent\.com\b/g
  },
  {
    name: 'OAuth client secret field',
    regex: /"client_secret"\s*:/g
  },
  {
    name: 'Private email address',
    regex: /\b[A-Z0-9._%+-]+@(?!example\.com\b|example\.org\b|example\.net\b|gmail\.com placeholder\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    allow: new Set(['user@gmail.com'])
  },
  {
    name: 'Generated Classroom URL',
    regex: /https:\/\/classroom\.google\.com\/c\/[0-9]+/g
  }
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    if (ignoredFiles.has(entry.name)) continue;

    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

const findings = [];

for (const file of await walk(root)) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch {
    continue;
  }

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern.regex)) {
      if (pattern.allow?.has(match[0])) continue;
      findings.push({
        file: relative,
        line: lineNumber(content, match.index || 0),
        type: pattern.name,
        value: match[0]
      });
    }
  }
}

if (findings.length) {
  console.error('Sanitize check failed. Potential private data found:\n');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type}: ${finding.value}`);
  }
  process.exitCode = 1;
} else {
  console.log('Sanitize check passed. No private data patterns found in public files.');
}
