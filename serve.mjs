/* Dependency-free static server for the app.
   Usage: node serve.mjs [root] [port]   (defaults: this folder, 8123) */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] || dirname(fileURLToPath(import.meta.url));
const port = +(process.argv[3] || 8123);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const file = normalize(join(root, path === '/' ? 'index.html' : path));
    if (!file.startsWith(normalize(root))) throw new Error('traversal');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',          // CSV edits show up on refresh
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${port} is already in use — the app is probably already running at http://localhost:${port}/`);
    process.exit(0);
  }
  throw err;
});

server.listen(port, () =>
  console.log(`The Shape of American Work → http://localhost:${port}/  (Ctrl+C to stop)`));
