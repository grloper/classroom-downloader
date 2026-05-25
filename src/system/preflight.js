import fs from 'fs-extra';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { ensureProjectFolders } from '../utils/paths.js';

function hasEnvCredentials(activeConfig = config) {
  return Boolean(activeConfig.google.clientId && activeConfig.google.clientSecret);
}

async function readCredentialSummary(activeConfig = config) {
  if (!(await fs.pathExists(activeConfig.google.applicationCredentials))) {
    return {
      exists: false,
      path: activeConfig.google.applicationCredentials,
      type: hasEnvCredentials(activeConfig) ? 'env' : null
    };
  }

  const raw = await fs.readJson(activeConfig.google.applicationCredentials);
  const source = raw.installed || raw.web || raw;
  return {
    exists: true,
    path: activeConfig.google.applicationCredentials,
    type: raw.installed ? 'desktop' : raw.web ? 'web' : 'unknown',
    clientId: source.client_id || null,
    projectId: source.project_id || raw.project_id || null
  };
}

export async function getPreflightStatus(activeConfig = config) {
  await ensureProjectFolders(activeConfig);
  const credentials = await readCredentialSummary(activeConfig);
  const tokenExists = await fs.pathExists(activeConfig.google.tokenPath);
  const dbExists = await fs.pathExists(activeConfig.paths.dbPath);

  const blocking = [];
  const warnings = [];

  if (!credentials.exists && !hasEnvCredentials(activeConfig)) {
    blocking.push(`Missing OAuth client JSON at ${activeConfig.google.applicationCredentials}`);
  }

  if (credentials.type === 'web') {
    blocking.push('OAuth client appears to be a Web app. Create a Desktop app OAuth client for this local engine.');
  }

  if (!tokenExists) {
    warnings.push(
      'Before first login, add the Google account you will authorize as a Test user in Google Auth Platform > Audience.'
    );
  }

  return {
    credentials,
    tokenExists,
    dbExists,
    blocking,
    warnings
  };
}

export function printPreflightStatus(status) {
  console.log('\nGoogle Classroom Archive Engine preflight\n');

  console.log(`OAuth credentials: ${status.credentials.exists ? status.credentials.path : 'missing'}`);
  if (status.credentials.type) console.log(`OAuth client type: ${status.credentials.type}`);
  if (status.credentials.clientId) console.log(`OAuth client id: ${status.credentials.clientId}`);
  console.log(`OAuth token: ${status.tokenExists ? 'ready' : 'missing, login required'}`);
  console.log(`SQLite database: ${status.dbExists ? 'ready' : 'will be created'}`);

  if (status.warnings.length) {
    console.log('\nBefore first login:');
    for (const warning of status.warnings) console.log(`- ${warning}`);
    console.log('- Enable Google Classroom API and Google Drive API in this same Cloud project.');
    console.log('- If the OAuth app is in Testing mode, every signing-in account must be listed as a test user.');
  }

  if (status.blocking.length) {
    console.log('\nBlocking setup issues:');
    for (const issue of status.blocking) console.log(`- ${issue}`);
  }

  console.log('');
}

export async function runPreflight(activeConfig = config) {
  const status = await getPreflightStatus(activeConfig);
  printPreflightStatus(status);

  if (status.blocking.length) {
    throw new Error('Preflight failed. Fix the blocking setup issues above, then rerun the command.');
  }

  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPreflight().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
