import fs from 'fs-extra';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { google } from 'googleapis';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from '../config.js';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

function normalizeCredentials(raw, activeConfig) {
  const source = raw?.installed || raw?.web || raw || {};
  const clientId = source.client_id || activeConfig.google.clientId;
  const clientSecret = source.client_secret || activeConfig.google.clientSecret;
  const redirectUri =
    activeConfig.google.redirectUri ||
    source.redirect_uris?.find((uri) => uri.startsWith('http://localhost')) ||
    source.redirect_uris?.[0] ||
    'http://localhost';

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Google OAuth client credentials. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.'
    );
  }

  return { clientId, clientSecret, redirectUri };
}

async function loadCredentials(activeConfig) {
  if (await fs.pathExists(activeConfig.google.applicationCredentials)) {
    const raw = await fs.readJson(activeConfig.google.applicationCredentials);
    return normalizeCredentials(raw, activeConfig);
  }

  return normalizeCredentials({}, activeConfig);
}

async function saveToken(tokenPath, token) {
  await fs.ensureDir(path.dirname(tokenPath));
  await fs.writeJson(tokenPath, token, { spaces: 2 });
}

function openInSystemBrowser(url) {
  const platform = process.platform;
  const command =
    platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];

  try {
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function startLoopbackReceiver() {
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      server.close();
    }
  };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<h1>Google authorization failed</h1><p>You can close this tab.</p>');
      rejectCode(new Error(`Google authorization failed: ${error}`));
      return;
    }

    if (!code) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<h1>Waiting for Google authorization</h1>');
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<h1>Authorization complete</h1><p>You can close this tab and return to the terminal.</p>');
    resolveCode(code);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  return {
    redirectUri: `http://127.0.0.1:${port}/oauth2callback`,
    close,
    async waitForCode() {
      try {
        return await codePromise;
      } finally {
        close();
      }
    }
  };
}

export async function getOAuthClient(options = {}) {
  const activeConfig = options.config || config;
  const interactive = options.interactive ?? true;
  const credentials = await loadCredentials(activeConfig);

  if (await fs.pathExists(activeConfig.google.tokenPath)) {
    const oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );
    const token = await fs.readJson(activeConfig.google.tokenPath);
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  if (!interactive) {
    throw new Error(`No Google OAuth token found at ${activeConfig.google.tokenPath}`);
  }

  const receiver = await startLoopbackReceiver();
  const oauth2Client = new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    receiver.redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES
  });

  console.log('\nAuthorize Google APIs in your normal browser.');
  console.log('\nIf the opened page errors, copy this full URL into your browser:\n');
  console.log(authUrl);
  console.log('');
  if (!openInSystemBrowser(authUrl)) {
    console.log('Could not open the browser automatically.');
  }

  const rl = readline.createInterface({ input, output });
  try {
    console.log('Waiting for the localhost OAuth callback...');
    const code = await Promise.race([
      receiver.waitForCode(),
      rl.question('If the browser cannot return automatically, paste the authorization code here: ')
    ]);
    receiver.close();
    const { tokens } = await oauth2Client.getToken(code.trim());
    oauth2Client.setCredentials(tokens);
    await saveToken(activeConfig.google.tokenPath, tokens);
    return oauth2Client;
  } finally {
    rl.close();
  }
}

export async function getGoogleClients(options = {}) {
  const auth = await getOAuthClient(options);
  return {
    auth,
    classroom: google.classroom({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth })
  };
}
