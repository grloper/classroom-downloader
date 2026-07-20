#!/usr/bin/env node
// Tiny zero-dependency static server for local preview of the web app.
// Usage: npm run web   (then open the printed URL)
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import process from 'node:process';

const webRoot = new URL('../web', import.meta.url).pathname;
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = normalize(join(webRoot, rel));

  if (!filePath.startsWith(webRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'content-type': (MIME[extname(filePath).toLowerCase()] || 'application/octet-stream') + '; charset=utf-8' });
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Classroom Archiver web app: http://${host}:${port}`);
  console.log('Press Ctrl+C to stop.');
});
