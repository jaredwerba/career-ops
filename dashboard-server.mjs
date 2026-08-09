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
import { spawn } from 'child_process';
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

// ── sweep runner ───────────────────────────────────────────────────────────
// The dashboard's RUN SCAN button posts here. This endpoint EXECUTES A SHELL
// SCRIPT, so it is deliberately narrow:
//   * the command is a fixed constant — no part of any request reaches it, and
//     spawn() is called with an argv array (never a shell string), so there is
//     nothing to inject into;
//   * requireLocal() rejects anything whose Host header isn't this loopback
//     port (DNS-rebinding defense) or whose Origin is a different site (CSRF —
//     without it, any page you visit could POST here and kick off a sweep);
//   * one sweep at a time.
// Fast tier: pre-verified sources, minutes. The heavy portfolio probing has
// its own 02:00 launchd job — a button that takes 4.5h helps nobody.
const SWEEP_CMD = ['/bin/zsh', ['run-daily-scans.sh', '--tier', 'fast', '--force']];
const MAX_BUFFERED_LINES = 4000;

const sweep = {
  running: false, proc: null, startedAt: null, exitCode: null,
  lines: [], clients: new Set(),
};

function requireLocal(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches may omit it
  return origin === `http://127.0.0.1:${PORT}` || origin === `http://localhost:${PORT}`;
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sweep.clients) {
    try { res.write(payload); } catch { sweep.clients.delete(res); }
  }
}

function pushLine(line) {
  sweep.lines.push(line);
  if (sweep.lines.length > MAX_BUFFERED_LINES) sweep.lines.shift();
  broadcast('line', line);
}

function startSweep() {
  if (sweep.running) return { started: false, alreadyRunning: true };
  sweep.running = true;
  sweep.startedAt = new Date().toISOString();
  sweep.exitCode = null;
  sweep.lines = [];

  const [cmd, cmdArgs] = SWEEP_CMD;
  // CAREEROPS_STREAM makes the script emit plain, line-oriented progress
  // (no spinner escapes / carriage returns) — readable in a browser pane.
  const proc = spawn(cmd, cmdArgs, {
    cwd: process.cwd(),
    env: { ...process.env, CAREEROPS_STREAM: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  sweep.proc = proc;

  let buf = '';
  const onData = (chunk) => {
    buf += chunk.toString();
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const line of parts) pushLine(line);
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('error', (err) => {
    pushLine(`! failed to start sweep: ${err.message}`);
    sweep.running = false; sweep.proc = null; sweep.exitCode = -1;
    broadcast('done', { exitCode: -1 });
  });
  proc.on('close', (code) => {
    if (buf.trim()) pushLine(buf);
    sweep.running = false; sweep.proc = null; sweep.exitCode = code;
    console.log(`sweep finished (exit ${code})`);
    broadcast('done', { exitCode: code });
  });

  console.log('sweep started via dashboard button');
  return { started: true, alreadyRunning: false };
}

const server = createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return json(res, 400, { error: 'bad url' }); }
  const path = url.pathname;

  // ── sweep API ──────────────────────────────────────────────────────────────
  if (path === '/api/scan') {
    if (req.method === 'POST') {
      if (!requireLocal(req)) return json(res, 403, { ok: false, error: 'local origin required' });
      const r = startSweep();
      return json(res, 200, { ok: true, ...r, startedAt: sweep.startedAt });
    }
    if (req.method === 'GET') {
      return json(res, 200, {
        ok: true, running: sweep.running, startedAt: sweep.startedAt,
        exitCode: sweep.exitCode, lines: sweep.lines.slice(-200),
      });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  }

  // Server-sent events: replay what the sweep has emitted so far, then stream.
  // Reconnecting mid-sweep therefore shows full history, not just the tail.
  if (path === '/api/scan/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    for (const line of sweep.lines) res.write(`event: line\ndata: ${JSON.stringify(line)}\n\n`);
    if (!sweep.running && sweep.exitCode !== null) {
      res.write(`event: done\ndata: ${JSON.stringify({ exitCode: sweep.exitCode })}\n\n`);
    }
    sweep.clients.add(res);
    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20000);
    req.on('close', () => { clearInterval(keepAlive); sweep.clients.delete(res); });
    return;
  }

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
