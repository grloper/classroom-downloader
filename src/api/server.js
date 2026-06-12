import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArchiveDatabase } from '../storage/database.js';
import { config } from '../config.js';
import { ensureProjectFolders } from '../utils/paths.js';
import { createLogger } from '../utils/logger.js';
import { exportArchive, exportDownloadPlan } from '../storage/exporter.js';
import { getSourcePath, quoteForCmd } from '../utils/runtimePaths.js';
import { getPreflightStatus } from '../system/preflight.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function openBrowser(url) {
  const { default: open } = await import('open');
  await open(url);
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS'
  });
  response.end(body);
}

function runEngineDetached(args) {
  const engineScript = getSourcePath('system', 'engine.js');

  if (process.platform === 'win32') {
    // Open a visible CMD window so the user sees the download progress
    const command = [process.execPath, engineScript, ...args].map(quoteForCmd).join(' ');
    const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '"Classroom Downloader Engine"', 'cmd.exe', '/k', command], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } else {
    const child = spawn(process.execPath, [engineScript, ...args], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  }
}

let activeDownloadProcess = null;

async function jsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => {
      try { resolve(JSON.parse(body)); } 
      catch (e) { resolve(null); }
    });
    request.on('error', reject);
  });
}

function validateOAuthClientJson(raw) {
  const source = raw?.installed || raw?.web || raw || {};

  if (!source.client_id || !source.client_secret) {
    throw new Error('The selected file is not a Google OAuth client JSON file.');
  }

  if (raw?.web) {
    throw new Error('This is a Web app OAuth client. Create and upload a Desktop app OAuth client.');
  }
}

async function main() {
  await ensureProjectFolders(config);
  const logger = await createLogger(config);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const method = request.method;

    if (method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      response.end();
      return;
    }

    let db = null;

    try {
      if (method === 'GET') {
        let reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
        const filePath = path.join(__dirname, 'ui', reqPath);
        
        // Prevent directory traversal
        const normalizedBase = path.normalize(path.join(__dirname, 'ui'));
        const normalizedPath = path.normalize(filePath);
        
        if (normalizedPath.startsWith(normalizedBase) && fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isFile()) {
          const ext = path.extname(normalizedPath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.wav': 'audio/wav',
            '.mp4': 'video/mp4',
            '.woff': 'application/font-woff',
            '.ttf': 'application/font-ttf',
            '.eot': 'application/vnd.ms-fontobject',
            '.otf': 'application/font-otf',
            '.wasm': 'application/wasm'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          response.writeHead(200, { 'content-type': contentType + '; charset=utf-8' });
          fs.createReadStream(normalizedPath).pipe(response);
          return;
        }
      }

      if (url.pathname === '/setup/status' && method === 'GET') {
        sendJson(response, 200, await getPreflightStatus(config));
        return;
      }

      if (url.pathname === '/setup/credentials' && method === 'POST') {
        const body = await jsonBody(request);
        validateOAuthClientJson(body);
        await fs.promises.mkdir(path.dirname(config.google.applicationCredentials), { recursive: true });
        await fs.promises.writeFile(config.google.applicationCredentials, JSON.stringify(body, null, 2));
        sendJson(response, 200, await getPreflightStatus(config));
        return;
      }

      db = new ArchiveDatabase(config.paths.dbPath);

      if (url.pathname === '/health' && method === 'GET') {
        sendJson(response, 200, { ok: true, counts: db.getCounts() });
        return;
      }

      if (url.pathname === '/courses' && method === 'GET') {
        sendJson(response, 200, db.getCoursesGraph());
        return;
      }

      if (url.pathname === '/plan' && method === 'GET') {
        let plan = db.getDownloadPlan();
        if (!plan) {
          const res = await exportDownloadPlan(db, config);
          plan = res.plan;
        }
        sendJson(response, 200, plan);
        return;
      }

      if (url.pathname === '/plan/refresh' && method === 'POST') {
        runEngineDetached(['--plan-only']);
        sendJson(response, 202, { status: 'refresh_started' });
        return;
      }

      if (url.pathname === '/selection' && method === 'GET') {
        const selection = db.getDownloadSelection() || { selection_mode: 'explicit' };
        sendJson(response, 200, selection);
        return;
      }

      if (url.pathname === '/selection' && method === 'PUT') {
        const selection = await jsonBody(request);
        if (selection) {
          db.saveDownloadSelection(selection);
          sendJson(response, 200, { ok: true });
        } else {
          sendJson(response, 400, { error: 'invalid_json' });
        }
        return;
      }

      if (url.pathname === '/downloads/selected' && method === 'POST') {
        runEngineDetached(['--download-selected']);
        sendJson(response, 202, { status: 'download_started' });
        return;
      }

      if (url.pathname === '/downloads/status' && method === 'GET') {
        // Mock status for now
        sendJson(response, 200, { active: false, current: null });
        return;
      }

      if (url.pathname === '/open' && method === 'POST') {
        const body = await jsonBody(request);
        if (body && body.id) {
          const row = db.db.prepare('SELECT local_path FROM attachments WHERE id = ?').get(body.id);
          if (row && row.local_path) {
            const absolutePath = path.resolve(config.paths.outputRoot, row.local_path);
            if (fs.existsSync(absolutePath)) {
              const { default: openSys } = await import('open');
              await openSys(absolutePath);
              sendJson(response, 200, { ok: true });
            } else {
              sendJson(response, 404, { error: 'File not found locally' });
            }
          } else {
            sendJson(response, 404, { error: 'File not found locally' });
          }
        } else {
          sendJson(response, 400, { error: 'Missing attachment id' });
        }
        return;
      }

      if (url.pathname === '/db/reset' && method === 'DELETE') {
        db.transaction(() => {
          const tables = ['courses', 'topics', 'materials', 'attachments', 'download_plan', 'download_selection', 'crawl_state'];
          for (const table of tables) {
            db.db.exec(`DELETE FROM ${table}`);
          }
        });
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === '/db/files' && method === 'GET') {
        const stmt = db.db.prepare(`
          SELECT 
            attachments.id, attachments.filename, attachments.mime_type, 
            attachments.status, attachments.local_path, attachments.error, attachments.bytes as size_bytes,
            materials.title as material_title,
            topics.title as topic_title,
            courses.name as course_name
          FROM attachments 
          LEFT JOIN materials ON attachments.material_id = materials.id
          LEFT JOIN topics ON materials.topic_id = topics.id
          LEFT JOIN courses ON materials.course_id = courses.id
          ORDER BY courses.name, topics.title, materials.title, attachments.filename
        `);
        sendJson(response, 200, stmt.all());
        return;
      }

      if (url.pathname === '/export' && method === 'POST') {
        await exportArchive(db, config);
        sendJson(response, 200, { ok: true });
        return;
      }

      sendJson(response, 404, {
        error: 'not_found',
        routes: ['/health', '/plan', '/selection', '/downloads/selected', '/export']
      });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    } finally {
      if (db) db.close();
    }
  });

  server.listen(config.apiPort, config.apiHost, () => {
    const url = `http://${config.apiHost}:${config.apiPort}`;
    logger.info(`Archive API listening at ${url}`);
    
    // Automatically open the browser if running as UI
    if (process.argv[1]?.endsWith('server.js') && process.stdout.isTTY) {
      openBrowser(url).catch(() => {});
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
