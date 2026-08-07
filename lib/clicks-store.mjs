// clicks-store.mjs — durable record of which job postings you've opened.
//
// The dashboard is a static page, so the browser's localStorage was the only
// store; it dies with a cache clear and nothing else in the pipeline can read
// it. This module makes data/clicks.csv the source of truth instead: plain,
// greppable, diffable, and openable in a spreadsheet.
//
// Shared by dashboard-server.mjs (writes on each click) and
// build-web-dashboard.mjs (seeds the page so marks survive a rebuild).

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { dirname } from 'path';

export const CLICKS_CSV = process.env.CAREER_OPS_CLICKS || 'data/clicks.csv';
export const COLUMNS = ['url', 'first_opened', 'last_opened', 'count', 'company', 'title'];

// clicks.csv keeps one row per posting (the current state). Per-week/per-month
// analytics need every individual open, so those append here instead — one line
// per click, never rewritten. Append-only means a crash can lose at most the
// last line, and the file doubles as a plain browsing history you can grep.
export const EVENTS_CSV = process.env.CAREER_OPS_CLICK_EVENTS || 'data/click-events.csv';
export const EVENT_COLUMNS = ['opened_at', 'url', 'company', 'title'];

// RFC4180-ish: fields may be quoted, "" is an escaped quote. Job titles and
// locations routinely contain commas, so a naive split() corrupts rows.
function parseCsvLine(line) {
  const out = [];
  let field = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Read the click log. Returns a Map keyed by posting URL. Missing file = empty. */
export function readClicks(file = CLICKS_CSV) {
  const map = new Map();
  if (!existsSync(file)) return map;
  const text = readFileSync(file, 'utf-8');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return map;
  const header = parseCsvLine(lines[0]).map(h => h.trim());
  const idx = Object.fromEntries(COLUMNS.map(c => [c, header.indexOf(c)]));
  // A file without our header is not ours — refuse rather than silently mangle.
  if (idx.url === -1) return map;
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const url = (f[idx.url] || '').trim();
    if (!url) continue;
    const n = parseInt(f[idx.count] ?? '', 10);
    map.set(url, {
      url,
      first_opened: idx.first_opened === -1 ? '' : (f[idx.first_opened] || ''),
      last_opened: idx.last_opened === -1 ? '' : (f[idx.last_opened] || ''),
      count: Number.isFinite(n) && n > 0 ? n : 1,
      company: idx.company === -1 ? '' : (f[idx.company] || ''),
      title: idx.title === -1 ? '' : (f[idx.title] || ''),
    });
  }
  return map;
}

/** Write atomically (tmp + rename) so an interrupted write can't truncate the log. */
export function writeClicks(map, file = CLICKS_CSV) {
  const dir = dirname(file);
  if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const rows = [...map.values()].sort((a, b) => String(b.last_opened).localeCompare(String(a.last_opened)));
  const body = [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
  const tmp = file + '.tmp';
  writeFileSync(tmp, body, 'utf-8');
  renameSync(tmp, file);
  return rows.length;
}

/**
 * Record one open. First open sets first_opened; repeats bump count and
 * last_opened. company/title backfill if they were unknown before.
 */
export function recordClick(map, { url, company = '', title = '', at = new Date().toISOString() }) {
  if (!url) return null;
  const prev = map.get(url);
  const rec = prev
    ? { ...prev, count: prev.count + 1, last_opened: at, company: prev.company || company, title: prev.title || title }
    : { url, first_opened: at, last_opened: at, count: 1, company, title };
  map.set(url, rec);
  return rec;
}

export function deleteClick(map, url) {
  return map.delete(url);
}

/** Append one open to the event log. Creates the file with a header if needed. */
export function appendEvent({ url, company = '', title = '', at = new Date().toISOString() }, file = EVENTS_CSV) {
  if (!url) return false;
  const dir = dirname(file);
  if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const line = [at, url, company, title].map(csvCell).join(',') + '\n';
  if (!existsSync(file)) writeFileSync(file, EVENT_COLUMNS.join(',') + '\n' + line, 'utf-8');
  else appendFileSync(file, line, 'utf-8');
  return true;
}

/** Read the event log as [{opened_at, url, company, title}], oldest first. */
export function readEvents(file = EVENTS_CSV) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf-8').split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map(h => h.trim());
  const idx = Object.fromEntries(EVENT_COLUMNS.map(c => [c, header.indexOf(c)]));
  if (idx.opened_at === -1 || idx.url === -1) return [];
  const out = [];
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const at = (f[idx.opened_at] || '').trim();
    if (!at) continue;
    out.push({ opened_at: at, url: f[idx.url] || '', company: idx.company === -1 ? '' : (f[idx.company] || ''), title: idx.title === -1 ? '' : (f[idx.title] || '') });
  }
  return out;
}

/**
 * Backfill an event log from aggregate rows — used when clicks.csv predates the
 * event log, so analytics aren't blank for history already recorded. Only the
 * last_opened instant is known per posting, so that is what gets synthesised.
 */
export function eventsFromClicks(map) {
  return [...map.values()]
    .filter(r => r.last_opened)
    .map(r => ({ opened_at: r.last_opened, url: r.url, company: r.company || '', title: r.title || '' }));
}

/** Merge browser-held clicks into the CSV (union; keeps earliest first / latest last / max count). */
export function mergeClicks(map, incoming = {}) {
  let added = 0, updated = 0;
  for (const [url, v] of Object.entries(incoming || {})) {
    if (!url || !v) continue;
    const first = v.first || v.first_opened || '';
    const last = v.last || v.last_opened || first;
    const count = Number.isFinite(+v.count) && +v.count > 0 ? +v.count : 1;
    const prev = map.get(url);
    if (!prev) {
      map.set(url, { url, first_opened: first, last_opened: last, count, company: v.company || '', title: v.title || '' });
      added++;
    } else {
      map.set(url, {
        ...prev,
        first_opened: [prev.first_opened, first].filter(Boolean).sort()[0] || '',
        last_opened: [prev.last_opened, last].filter(Boolean).sort().pop() || '',
        count: Math.max(prev.count, count),
        company: prev.company || v.company || '',
        title: prev.title || v.title || '',
      });
      updated++;
    }
  }
  return { added, updated };
}
