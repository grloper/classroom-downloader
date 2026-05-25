import { spawn } from 'node:child_process';
import path from 'node:path';
import { getOAuthClient } from '../auth/googleApi.js';
import { config } from '../config.js';
import { runPreflight } from './preflight.js';
import { hasFlag } from '../utils/args.js';

function runNodeScript(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: 'inherit',
      shell: false
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function main() {
  const noDownload = hasFlag('--no-download');
  const exportOnly = hasFlag('--export-only');
  const apiOnly = hasFlag('--api-only');
  const uiOnly = hasFlag('--ui-only');

  const status = await runPreflight(config);

  if (!status.tokenExists && !exportOnly && !uiOnly) {
    console.log('Starting one-time Google OAuth login...');
    await getOAuthClient({ config, interactive: true });
    console.log('OAuth token saved. Continuing to archive...\n');
  }

  const crawlArgs = [];
  if (noDownload) crawlArgs.push('--no-download');
  if (exportOnly) crawlArgs.push('--export-only');
  if (apiOnly) crawlArgs.push('--api-only');
  if (uiOnly) crawlArgs.push('--ui-only');

  await runNodeScript('src/crawler/run.js', crawlArgs);
  console.log('\nArchive engine finished.');
  console.log(`Master index: ${path.join(config.paths.outputRoot, 'master_index.json')}`);
  console.log(`SQLite DB: ${config.paths.dbPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
