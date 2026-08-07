#!/usr/bin/env node
// dashboard-server.mjs — serves the dashboard over localhost so posting-opens
// persist to data/clicks.csv instead of only the browser's localStorage.
//
//   node dashboard-server.mjs            → http://localhost:8787
//   node dashboard-server.mjs --port 9000
//   node dashboard-server.mjs --public   → serve dashboard-public/ instead
//
// Binds to 127.0.0.1 only: this is a personal job log, it must not be reachable
// from the network. Opening dashboard-web/index.html as a plain file still
// works — the page just falls back to localStorage + the CSV export button.

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, normalize, extname } from 'path';
import { readClicks, writeClicks, recordClick, deleteClick, mergeClicks, appendEvent, CLICKS_CSV } from './lib/clicks-store.mjs';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg !== -1 ? parseInt(args[portArg + 1], 10) : 8787;
const ROOT = args.includes('--public') ? 'dashboard-public' : 'dashboard-web';

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`No ${ROOT}/index.html — run: node build-web-dashboard.mjs${ROOT === 'dashboard-public' ? ' --public' : ''}`);
  process.exit(1);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return json(res, 400, { error: 'bad url' }); }
  const path = url.pathname;

  // ── click log API ──────────────────────────────────────────────────────────
  if (path === '/api/clicks') {
    try {
      if (req.method === 'GET') {
        const map = readClicks();
        return json(res, 200, { ok: true, clicks: Object.fromEntries(map) });
      }
      if (req.method === 'POST') {
        const payload = JSON.parse((await readBody(req)) || '{}');
        const map = readClicks();
        // {clicks:{...}} merges a whole browser store; a bare {url} records one open.
        if (payload.clicks) {
          const r = mergeClicks(map, payload.clicks);
          const total = writeClicks(map);
          console.log(`merged ${r.added} new / ${r.updated} existing → ${CLICKS_CSV} (${total} rows)`);
          return json(res, 200, { ok: true, ...r, total });
        }
        if (!payload.url) return json(res, 400, { ok: false, error: 'url required' });
        const rec = recordClick(map, payload);
        const total = writeClicks(map);
        // Every open is also appended to the event log, which is what the
        // per-week/per-month analytics are computed from.
        appendEvent({ url: payload.url, company: payload.company, title: payload.title, at: rec.last_opened });
        console.log(`opened ${rec.count}x  ${payload.company || ''} — ${(payload.title || '').slice(0, 60)}`);
        return json(res, 200, { ok: true, record: rec, total });
      }
      if (req.method === 'DELETE') {
        const payload = JSON.parse((await readBody(req)) || '{}');
        const map = readClicks();
        const removed = deleteClick(map, payload.url);
        const total = writeClicks(map);
        return json(res, 200, { ok: true, removed, total });
      }
      return json(res, 405, { ok: false, error: 'method not allowed' });
    } catch (err) {
      console.error('api/clicks:', err.message);
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });

  // ── static files ───────────────────────────────────────────────────────────
  // Reports and PDFs are linked from the tracker with ../ paths, so allow those
  // two directories explicitly; everything else is confined to the web root.
  let file;
  const rel = decodeURIComponent(path === '/' ? '/index.html' : path).replace(/^\/+/, '');
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
  if (safe.startsWith('reports/') || safe.startsWith('output/')) file = safe;
  else file = join(ROOT, safe);

  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
  const n = readClicks().size;
  console.log(`career-ops dashboard → http://localhost:${PORT}`);
  console.log(`serving ${ROOT}/ · click log: ${CLICKS_CSV} (${n} posting${n === 1 ? '' : 's'} opened so far)`);
  console.log('Opens are saved to disk as you click. Ctrl-C to stop.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is busy — already running? Try: node dashboard-server.mjs --port ${PORT + 1}`);
    process.exit(1);
  }
  throw err;
});
