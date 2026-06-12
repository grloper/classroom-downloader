import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const requiredFiles = [
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  '.gitignore',
  '.env.example',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  'docs/user-guide.md',
  'docs/release-checklist.md',
  'docs/ui-roadmap.md',
  'docs/environments.md',
  'docs/prompts/selective-download-ui.prompt.json'
];

const requiredIgnorePatterns = [
  '.env',
  'credentials/*.json',
  'sessions/**',
  'database/*.db',
  'database/*.db-*',
  'logs/**',
  'output/master_index.json',
  'output/courses/**'
];

const forbiddenTrackedPatterns = [
  /^\.env$/,
  /^credentials\/.*\.json$/,
  /^sessions\/(?!\.gitkeep$)/,
  /^database\/.*\.db/,
  /^logs\/(?!\.gitkeep$)/,
  /^output\/master_index\.json$/,
  /^output\/courses\/(?!\.gitkeep$).+/
];

const readOnlyScopes = [
  'classroom.courses.readonly',
  'classroom.coursework.me.readonly',
  'classroom.coursework.students.readonly',
  'classroom.courseworkmaterials.readonly',
  'classroom.announcements.readonly',
  'classroom.topics.readonly',
  'classroom.rosters.readonly',
  'drive.readonly'
];

const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing required release file: ${file}`);
}

try {
  JSON.parse(fs.readFileSync('docs/prompts/selective-download-ui.prompt.json', 'utf8'));
} catch (error) {
  failures.push(`Selective-download UI prompt JSON is invalid: ${error.message}`);
}

const gitignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
for (const pattern of requiredIgnorePatterns) {
  if (!gitignore.includes(pattern)) failures.push(`.gitignore is missing private artifact pattern: ${pattern}`);
}

const config = fs.existsSync('src/config.js') ? fs.readFileSync('src/config.js', 'utf8') : '';
if (!config.includes("apiHost: process.env.API_HOST || '127.0.0.1'")) {
  failures.push('API host must default to 127.0.0.1 in src/config.js');
}

const apiServer = fs.existsSync('src/api/server.js') ? fs.readFileSync('src/api/server.js', 'utf8') : '';
if (!apiServer.includes('server.listen(config.apiPort, config.apiHost')) {
  failures.push('API server must bind to config.apiHost, not all interfaces');
}

const googleApi = fs.existsSync('src/auth/googleApi.js') ? fs.readFileSync('src/auth/googleApi.js', 'utf8') : '';
for (const scope of readOnlyScopes) {
  if (!googleApi.includes(scope)) failures.push(`Missing expected read-only OAuth scope: ${scope}`);
}
if (/https:\/\/www\.googleapis\.com\/auth\/drive(?!\.readonly)/.test(googleApi)) {
  failures.push('Drive scope must remain read-only');
}

try {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);

  for (const file of tracked) {
    if (forbiddenTrackedPatterns.some((pattern) => pattern.test(file))) {
      failures.push(`Private/generated artifact is tracked by git: ${file}`);
    }
  }
} catch {
  failures.push('Could not inspect tracked files with git ls-files');
}

if (failures.length) {
  console.error('Compliance check failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Compliance check passed.');
}
