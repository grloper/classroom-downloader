import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const stageDir = path.join(distDir, '.standalone-stage');

const targets = {
  win32: {
    output: 'classroom-downloader-win.exe',
    nodeBin: '{{caxa}}/node_modules/.bin/node.exe'
  },
  linux: {
    output: 'classroom-downloader-linux',
    nodeBin: '{{caxa}}/node_modules/.bin/node'
  },
  darwin: {
    output: 'classroom-downloader-mac',
    nodeBin: '{{caxa}}/node_modules/.bin/node'
  }
};

const runtimeEntries = [
  'src',
  'package.json',
  'package-lock.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  '.env.example'
];

function run(command, args, cwd = rootDir) {
  console.log(`> ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function copyRuntimeFiles() {
  await fs.rm(stageDir, { recursive: true, force: true });
  await fs.mkdir(stageDir, { recursive: true });

  for (const entry of runtimeEntries) {
    await fs.cp(path.join(rootDir, entry), path.join(stageDir, entry), {
      recursive: true,
      force: true
    });
  }
}

async function main() {
  const target = targets[process.platform];
  if (!target) {
    throw new Error(`Standalone builds are not configured for ${process.platform}.`);
  }

  await fs.mkdir(distDir, { recursive: true });
  await copyRuntimeFiles();

  try {
    await run('npm', ['ci', '--omit=dev'], stageDir);
    await run('npm', ['install', '--no-save', 'node@20'], stageDir);

    const outputPath = path.join(distDir, target.output);
    await fs.rm(outputPath, { force: true });
    await run('npx', [
      'caxa@3.0.1',
      '--input',
      stageDir,
      '--output',
      outputPath,
      '--',
      target.nodeBin,
      '{{caxa}}/src/api/server.js'
    ]);

    console.log(`\nStandalone app created at ${path.relative(rootDir, outputPath)}`);
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
