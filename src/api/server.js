import http from 'node:http';
import { ArchiveDatabase } from '../storage/database.js';
import { config } from '../config.js';
import { ensureProjectFolders } from '../utils/paths.js';
import { createLogger } from '../utils/logger.js';

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  response.end(body);
}

async function main() {
  await ensureProjectFolders(config);
  const logger = await createLogger(config);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const db = new ArchiveDatabase(config.paths.dbPath);

    try {
      if (url.pathname === '/health') {
        sendJson(response, 200, { ok: true, counts: db.getCounts() });
        return;
      }

      if (url.pathname === '/courses' || url.pathname === '/master_index.json') {
        sendJson(response, 200, db.getCoursesGraph());
        return;
      }

      sendJson(response, 404, {
        error: 'not_found',
        routes: ['/health', '/courses', '/master_index.json']
      });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    } finally {
      db.close();
    }
  });

  server.listen(config.apiPort, () => {
    logger.info(`Archive API listening at http://localhost:${config.apiPort}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
