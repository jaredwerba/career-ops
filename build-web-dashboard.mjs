#!/usr/bin/env node
// build-web-dashboard.mjs — generates a static, self-contained HTML dashboard
// from data/pipeline.md + data/applications.md + data/scan-history.tsv.
// No server: open dashboard-web/index.html in a browser. Re-run after scans.
//
// Features: search, click-to-sort on every column, Tech classification badges,
// First-seen dates (joined from scan-history by URL; NEW badge for today),
// Source engine per row, LinkedIn people-search deep links, and per-row
// star/applied/hide status persisted in the browser's localStorage (keyed by
// posting URL, so it survives rebuilds).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { classifyTech } from './lib/tech-tags.mjs';
import { readClicks, readEvents, eventsFromClicks } from './lib/clicks-store.mjs';
import { scoreJob, scoreTier } from './lib/fit-score.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── data loading ─────────────────────────────────────────────────────────────

function parsePipeline(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^- \[( |x)\]\s*(.+)$/);
    if (!m) continue;
    const parts = m[2].split(' | ').map(s => s.trim());
    if (parts.length < 3) continue;
    const [url, company, title, location = '', ...rest] = parts;
    const note = rest.find(r => r.startsWith('note:'))?.slice(5).trim() ?? '';
    const comp = rest.find(r => !r.startsWith('note:')) ?? '';
    rows.push({ done: m[1] === 'x', url, company, title, location, comp, note });
  }
  return rows;
}

function parseApplications(text) {
  const lines = text.split('\n').filter(l => l.startsWith('|'));
  if (lines.length < 2) return [];
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines.slice(2)) {
    const vals = line.split('|').map(c => c.trim()).slice(1, -1);
    if (vals.length < headers.length) continue;
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i]; });
    rows.push(row);
  }
  return rows;
}

function parseScanHistory(text) {
  // url \t first_seen \t portal \t title \t company \t status \t location
  const map = new Map();
  const rows = [];
  for (const line of text.split('\n').slice(1)) {
    const f = line.split('\t');
    if (f.length >= 3 && f[0]) {
      map.set(f[0], { firstSeen: f[1] || '', portal: f[2] || '' });
      rows.push({ url: f[0], title: f[3] || '', company: f[4] || '' });
    }
  }
  return { map, rows };
}

// --public: strip the Applications Tracker entirely (resume PDFs, evaluation
// reports, comp/career notes) and write to a separate dashboard-public/ folder
// — this is the only build meant to ever leave the machine (e.g. via Vercel).
// The default (no flag) build keeps everything for local personal use only.
const PUBLIC = process.argv.includes('--public');

const pipeline = existsSync('data/pipeline.md') ? parsePipeline(readFileSync('data/pipeline.md', 'utf-8')) : [];
const applications = PUBLIC ? [] : (existsSync('data/applications.md') ? parseApplications(readFileSync('data/applications.md', 'utf-8')) : []);
const historyParsed = existsSync('data/scan-history.tsv') ? parseScanHistory(readFileSync('data/scan-history.tsv', 'utf-8')) : { map: new Map(), rows: [] };
const history = historyParsed.map;
const historyRows = historyParsed.rows;

const pending = pipeline.filter(r => !r.done);

// Default the pending tables to NEWEST-FIRST. pipeline.md is append-ordered, so
// without this the freshest postings are buried thousands of rows down and the
// only way to reach them is to click "First seen" twice (once for asc, again
// for desc). Sorting here means the page opens on exactly what you want to see.
// Undated rows sort last rather than floating to the top on an empty string.
pending.sort((a, b) => {
  const av = (historyParsed.map.get(a.url) || {}).firstSeen || '';
  const bv = (historyParsed.map.get(b.url) || {}).firstSeen || '';
  if (av === bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return bv.localeCompare(av);
});
const now = new Date();
const generatedAt = now.toISOString();
const today = generatedAt.slice(0, 10);

// Tech classification lives in lib/tech-tags.mjs so build-web-dashboard.mjs and
// shortlist.mjs share one curated company list instead of drifting apart.

const TECH_CLASS = {
  'Hyperscaler': 'tech-hyper', 'Neocloud': 'tech-neo', 'Enterprise SW': 'tech-ent',
  'AI-Native': 'tech-ai', 'Hardware & Deep Tech': 'tech-hw',
};

// Human label for the scan engine that found the row.
function sourceLabel(portal) {
  if (!portal) return '';
  return portal
    .replace('boston-seed', 'Boston seed').replace('ai-native-seed', 'AI-native seed')
    .replace('yc-seed', 'YC seed').replace('a16z-seed', 'a16z seed')
    .replace('greenhouse-full', 'GH walk').replace('lever-full', 'Lever walk')
    .replace('ashby-full', 'Ashby walk').replace('workday-full', 'Workday walk');
}

function linkedinPeopleUrl(company) {
  const q = encodeURIComponent(`${company} sales`);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
}

function mdLinkToHref(cell) {
  const m = cell?.match(/\[([^\]]*)\]\(([^)]+)\)/);
  return m ? { text: m[1], href: m[2] } : null;
}

// Resolve a posting URL for an Applications Tracker row. Tracker rows don't
// store the JD URL directly — reports do (spec header: "**URL:** {url}"), so
// read it from the linked report when present. Otherwise fuzzy-match this
// row's company+title against scan-history (normalized, substring either
// direction — ATS titles get re-punctuated between the scan and the tracker,
// e.g. "Executive- Northeast" vs "Executive (Northeast)").
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function urlFromReport(reportCell) {
  const link = mdLinkToHref(reportCell);
  if (!link) return '';
  const path = 'reports/' + link.href.replace(/^\.\.\//, '').replace(/^reports\//, '');
  if (!existsSync(path)) return '';
  const m = readFileSync(path, 'utf-8').match(/^\*\*URL:\*\*\s*(\S+)/m);
  return m ? m[1] : '';
}

function urlFromHistory(company, title) {
  const c = norm(company), t = norm(title);
  if (!c) return '';
  let best = '';
  for (const h of historyRows) {
    if (norm(h.company) !== c) continue;
    const ht = norm(h.title);
    if (ht === t) return h.url;
    if (!best && (ht.includes(t) || t.includes(ht))) best = h.url;
  }
  return best;
}

// ── row rendering ────────────────────────────────────────────────────────────

// Companies already in the tracker score lower — the same penalty shortlist.mjs
// applies, so a role you've already pursued doesn't keep glowing at you.
const appliedCompanies = new Set(applications.map(a => String(a['Company'] || '').toLowerCase()).filter(Boolean));

function renderPendingRow(r) {
  const tech = classifyTech(r.company);
  const techCell = tech ? `<span class="tech-badge ${TECH_CLASS[tech] || ''}">${esc(tech)}</span>` : '';
  // Same model as the shortlist CLI (lib/fit-score.mjs) — the board and the
  // shortlist must agree on what's worth your time.
  const fit = scoreJob({ title: r.title, location: r.location, company: r.company, tech, applied: appliedCompanies });
  const tier = fit ? scoreTier(fit.score) : null;
  const fitCell = fit
    ? `<span class="fit ${tier ? 'fit-' + tier : ''}"${fit.blockers.length ? ` title="Blockers: ${esc(fit.blockers.join(', '))}"` : ''}>${fit.score}</span>`
    : '<span class="fit fit-none">–</span>';
  const h = history.get(r.url) || { firstSeen: '', portal: '' };
  const isNew = h.firstSeen === today;
  const seenCell = h.firstSeen
    ? `${isNew ? '<span class="new-badge">NEW</span> ' : ''}${esc(h.firstSeen)}`
    : '—';
  return `
  <tr data-url="${esc(r.url)}"${tier === 'super' ? ' data-super="1"' : ''}>
    <td class="actions">
      <span class="clicked-mark" title="You opened this posting — click to clear">✔</span><button class="act star" title="Star">★</button><button class="act applied" title="Mark applied">✓</button><button class="act hide" title="Hide">✕</button>
    </td>
    <td class="fit-cell" data-sort="${fit ? fit.score : -99}">${fitCell}</td>
    <td>${esc(r.company)}</td>
    <td>${techCell}</td>
    <td>${esc(r.title)}</td>
    <td>${esc(r.location)}</td>
    <td data-sort="${esc(h.firstSeen)}">${seenCell}</td>
    <td class="src">${esc(sourceLabel(h.portal))}</td>
    <td class="links"><a class="posting-link" href="${esc(r.url)}" target="_blank" rel="noopener">Posting</a> · <a href="${esc(linkedinPeopleUrl(r.company))}" target="_blank" rel="noopener" title="LinkedIn people search: ${esc(r.company)} sales">People</a></td>
  </tr>`;
}

const techPending = pending.filter(r => classifyTech(r.company));
const otherPending = pending.filter(r => !classifyTech(r.company));

// Real-data sample for the "refresh" terminal-log theater (cosmetic only — no
// actual network calls happen client-side; this just dresses up a page
// reload with lines that reference genuinely-scanned postings, so it reads
// as plausible rather than generic technobabble).
function sampleForLog(rows, n) {
  const out = [];
  for (const r of rows) {
    if (out.length >= n) break;
    let host = '', path = '';
    try { const u = new URL(r.url); host = u.hostname; path = u.pathname + u.search; } catch { continue; }
    out.push({ company: r.company, title: r.title, host, path, source: (history.get(r.url) || {}).portal || 'unknown' });
  }
  return out;
}
const LOG_SAMPLE = [...sampleForLog(techPending, 40), ...sampleForLog(otherPending, 20)];
// Backticks/${ in company or job-title text would break the outer template
// literal this JSON gets spliced into below — neutralize defensively.
const LOG_SAMPLE_JSON = JSON.stringify(LOG_SAMPLE).replace(/`/g, '\\u0060').replace(/\$\{/g, '$\\u007b');

function pendingTableHtml(rows) {
  if (!rows.length) return '<div class="empty">Nothing here.</div>';
  return `<table class="ptable">
      <thead><tr>
        <th></th>
        <th data-k="1" class="sortable" data-desc="1" title="Fit score (max 23) — same model as shortlist.mjs">Fit</th>
        <th data-k="2" class="sortable">Company</th>
        <th data-k="3" class="sortable">Tech</th>
        <th data-k="4" class="sortable">Title</th>
        <th data-k="5" class="sortable">Location</th>
        <th data-k="6" class="sortable" data-desc="1">First seen</th>
        <th data-k="7" class="sortable">Source</th>
        <th>Links</th>
      </tr></thead>
      <tbody>${rows.map(renderPendingRow).join('')}</tbody>
    </table>`;
}

const appRowsHtml = PUBLIC ? '' : applications.map((row) => {
  const pdf = mdLinkToHref(row['PDF']);
  const report = mdLinkToHref(row['Report']);
  const score = parseFloat(row['Score']);
  const scoreClass = isNaN(score) ? '' : score >= 4 ? 'score-high' : score >= 3 ? 'score-mid' : 'score-low';
  const postingUrl = urlFromReport(row['Report']) || urlFromHistory(row['Company'], row['Role']);
  // Rows without a resolvable posting URL still get a stable localStorage key
  // (star/applied/hide state persists across rebuilds either way).
  const rowKey = postingUrl || `tracker:${row['Company']}:${row['Role']}`;
  const linksCell = (postingUrl ? `<a class="posting-link" href="${esc(postingUrl)}" target="_blank" rel="noopener">Posting</a> · ` : '')
    + `<a href="${esc(linkedinPeopleUrl(row['Company']))}" target="_blank" rel="noopener" title="LinkedIn people search: ${esc(row['Company'])} sales">People</a>`;
  return `
  <tr data-url="${esc(rowKey)}">
    <td class="actions">
      <span class="clicked-mark" title="You opened this posting — click to clear">✔</span><button class="act star" title="Star">★</button><button class="act applied" title="Mark applied">✓</button><button class="act hide" title="Hide">✕</button>
    </td>
    <td>${esc(row['Company'])}</td>
    <td>${esc(row['Role'])}</td>
    <td class="${scoreClass}">${esc(row['Score'])}</td>
    <td><span class="status-badge">${esc(row['Status'])}</span></td>
    <td>${pdf ? `<a href="../${esc(pdf.href.replace(/^\.\.\//, ''))}" target="_blank">PDF</a>` : '—'}</td>
    <td>${report ? `<a href="../${esc(report.href.replace(/^\.\.\//, ''))}" target="_blank">Report ${esc(report.text)}</a>` : '—'}</td>
    <td class="links">${linksCell}</td>
    <td class="notes">${esc(row['Notes'])}</td>
  </tr>`;
}).join('');

// Which postings you've already opened, from data/clicks.csv. Baking this into
// the page means the ✔ marks survive a browser-data wipe, a different browser,
// and the --public build — localStorage is now a cache, not the record.
// The public build ships no click history (it's personal browsing behaviour).
const clickSeed = PUBLIC ? new Map() : readClicks();

// Individual open events drive the per-week / per-month analytics. If the event
// log doesn't exist yet (clicks.csv predates it), synthesise one point per
// posting from its last_opened so the panel isn't blank for history we do have.
const clickEvents = PUBLIC ? [] : (() => {
  const logged = readEvents();
  return logged.length ? logged : eventsFromClicks(clickSeed);
})();
const CLICK_EVENTS_JSON = JSON.stringify(clickEvents.map(e => [e.opened_at, e.company || '']))
  .replace(/</g, '\\u003c').replace(/`/g, '\\u0060').replace(/\$\{/g, '$\\u007b');
const CLICK_SEED_JSON = JSON.stringify(
  Object.fromEntries([...clickSeed].map(([url, r]) => [url, { first: r.first_opened, last: r.last_opened, count: r.count }]))
).replace(/</g, '\\u003c').replace(/`/g, '\\u0060').replace(/\$\{/g, '$\\u007b');

// ── column-filter option lists ───────────────────────────────────────────────
// Company and Title are text inputs backed by a <datalist>, so you can either
// type a fragment or browse the real values — with ~7k rows a plain <select> of
// every company would be unusable, and free text alone means guessing at
// spellings. Tech and Location are closed sets, so they stay as <select>.

const companyNames = [...new Set(pending.map(r => r.company).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const companyCount = companyNames.length;
const companyOptions = companyNames.map(c => `<option value="${esc(c)}">`).join('');

const techOptions = [...new Set(pending.map(r => classifyTech(r.company)).filter(Boolean))]
  .sort()
  .map(t => `<option value="${esc(t.toLowerCase())}">${esc(t)}</option>`).join('');

// Offered as title suggestions only when they actually occur in the data —
// a dropdown listing roles that return zero rows is worse than no dropdown.
const TITLE_KEYWORDS = [
  'account executive', 'enterprise account executive', 'strategic account executive',
  'commercial account executive', 'account manager', 'account director',
  'sales engineer', 'solutions engineer', 'solutions architect', 'solutions consultant',
  'sales development', 'business development', 'customer success', 'partner',
  'channel', 'renewals', 'sales manager', 'sales director', 'director of sales',
  'head of sales', 'vp of sales', 'regional sales', 'territory', 'field sales',
  'inside sales', 'mid-market', 'enterprise sales', 'public sector', 'startup',
  'gtm', 'revenue',
];
const pendingTitlesLower = pending.map(r => (r.title || '').toLowerCase());
const titleOptions = TITLE_KEYWORDS
  .filter(k => pendingTitlesLower.some(t => t.includes(k)))
  .map(k => `<option value="${esc(k)}">`).join('');

// ── page ─────────────────────────────────────────────────────────────────────

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">\n<link rel="stylesheet" href="https://use.typekit.net/psj2ndn.css">
<title>career-ops dashboard</title>
<style>
  /* Modal GPU Glossary design tokens (modal.com/gpu-glossary, pulled 2026-07-06):
     --primary-color:#7FEE64 · --background-color:#0D180A · --primary-color-light:#7FEE6499
     --selection-color:#7FEE6433 · light-green:#DDFFDC (borders at /20 #ddffdc33, /30 #ddffdc4d)
     dark-gray:#212525 · warning:#f3cf58 · fonts: degular-mono (primary), cofo-sans-pixel (secondary) */
  :root {
    --primary: #7FEE64; --primary-light: #7FEE6499; --selection: #7FEE6433;
    --bg: #0D180A; --light-green: #DDFFDC; --border20: #ddffdc33; --border30: #ddffdc4d;
    --tangerine: #FF8A3D; --tangerine-dim: #FFB07A; --tangerine-glow: #FF8A3D99;
    --dark-gray: #212525; --warning: #f3cf58; --danger: #ff6568;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; padding: 16px; background: var(--bg); color: var(--primary);
    font-family: "degular-mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 14px; line-height: 1.5;
    scrollbar-width: thin; scrollbar-color: var(--selection) transparent;
  }
  ::selection { background: var(--selection); }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: var(--selection); }
  .wrap { border: 1px solid var(--primary-light); min-height: calc(100vh - 32px); }
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--primary-light); padding: 12px 16px;
  }
  .topbar h1 {
    font-family: "cofo-sans-pixel", "degular-mono", monospace;
    font-size: 1.4rem; font-weight: 400; margin: 0; letter-spacing: 0.02em;
  }
  .meta { color: var(--primary-light); font-size: 0.8rem; }
  .topbar-right { text-align: right; display: flex; flex-direction: column; gap: 0.15rem; }
  #time-tracker { font-variant-numeric: tabular-nums; }
  .inner { padding: 0 16px 24px; }
  h2 {
    font-family: "cofo-sans-pixel", "degular-mono", monospace; font-weight: 400;
    font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border30); padding-bottom: 0.4rem; margin: 2rem 0 0.9rem;
  }
  .panel { border: 1px solid var(--border30); overflow: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border20); vertical-align: top; }
  th {
    color: var(--primary-light); font-weight: 400; font-size: 0.72rem;
    text-transform: uppercase; letter-spacing: 0.08em;
    position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--primary-light);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #7FEE640d; }
  a { color: var(--primary); text-decoration: none; border-bottom: 1px solid var(--border30); }
  a:hover { border-bottom-color: var(--primary); }
  .score-high { color: var(--primary); }
  .score-mid { color: var(--warning); }
  .score-low { color: var(--danger); }
  .status-badge {
    border: 1px solid var(--primary-light); color: var(--primary);
    padding: 0.1rem 0.5rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .notes { color: var(--primary-light); font-size: 0.8rem; max-width: 320px; }
  .empty { padding: 2rem; text-align: center; color: var(--primary-light); }
  .count-badge {
    display: inline-block; background: var(--primary); color: var(--bg);
    padding: 0 0.5rem; font-size: 0.8rem; margin-left: 0.5rem;
  }
  .refresh-hint { border-top: 1px solid var(--border20); margin: 2.5rem 16px 0; padding: 1rem 0 0; color: var(--primary-light); font-size: 0.78rem; }
  code { border: 1px solid var(--border20); padding: 0.05rem 0.35rem; color: var(--light-green); }
  .toolbar { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .toolbar input {
    flex: 1; min-width: 260px; max-width: 480px; background: transparent;
    border: 1px solid var(--primary-light); color: var(--primary);
    padding: 0.45rem 0.75rem; font-size: 0.88rem; font-family: inherit; border-radius: 0;
  }
  .toolbar input::placeholder { color: var(--primary-light); }
  .toolbar input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary-light); }
  .muted { color: var(--primary-light); font-size: 0.8rem; white-space: nowrap; }
  .chip {
    border: 1px solid var(--border30); color: var(--primary-light);
    padding: 0.25rem 0.7rem; font-size: 0.78rem; cursor: pointer; user-select: none;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .chip:hover { border-color: var(--primary-light); }
  .chip.active { border-color: var(--primary); color: var(--primary); background: #7FEE641a; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--primary); }
  th.sorted-asc::after { content: " ↑"; color: var(--primary); }
  th.sorted-desc::after { content: " ↓"; color: var(--primary); }
  .refresh-row { display: flex; align-items: center; gap: 0.9rem; padding: 12px 16px 0; }
  .refresh-btn {
    background: transparent; border: 1px solid var(--primary); color: var(--primary);
    font-family: inherit; font-size: 0.82rem; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 0.45rem 0.9rem; cursor: pointer; border-radius: 0;
  }
  .refresh-btn:hover { background: #7FEE641a; }
  .refresh-btn:disabled { color: var(--primary-light); border-color: var(--border30); cursor: default; background: none; }
  .loadbar-wrap {
    flex: 1; height: 10px; border: 1px solid var(--border30); background: #ffffff05;
    display: none; border-radius: 0; overflow: hidden;
  }
  .loadbar { width: 0%; height: 100%; background: var(--primary); border-radius: 0; }
  .terminal {
    display: none; margin: 10px 16px 0; border: 1px solid var(--border30); background: #050a03;
    color: var(--primary-light); font-size: 0.76rem; line-height: 1.5; max-height: 260px;
    overflow-y: auto; padding: 10px 12px;
  }
  .term-line { white-space: pre-wrap; word-break: break-all; }
  .term-line.term-hi { color: var(--primary); }
  .term-line.term-net { color: #5fd48a; }
  .tech-badge {
    display: inline-block; border: 1px solid var(--primary-light); background: #7FEE641a;
    color: var(--primary); padding: 0.05rem 0.45rem; font-size: 0.7rem;
    text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
  }
  .tech-hyper, .tech-neo, .tech-ent, .tech-ai, .tech-hw { }
  .new-badge { background: var(--primary); color: var(--bg); padding: 0 0.3rem; font-size: 0.68rem; font-weight: 700; }
  .src { color: var(--primary-light); font-size: 0.76rem; white-space: nowrap; }
  .links { white-space: nowrap; font-size: 0.84rem; }
  td.actions { white-space: nowrap; }
  .act { background: none; border: none; color: #7FEE6466; cursor: pointer; font-size: 0.95rem; padding: 0 0.15rem; font-family: inherit; }
  .act:hover { color: var(--primary); }
  tr.is-starred .act.star { color: var(--warning); }
  tr.is-applied .act.applied { color: var(--primary); }
  tr.is-applied td { opacity: 0.72; }
  tr.is-hidden td { opacity: 0.4; }
  /* Clicked/opened postings. The mark keeps its width when unset so marking a
     row never shifts the action buttons sideways. */
  .clicked-mark {
    display: inline-block; width: 1.15em; text-align: center; color: transparent;
    font-size: 1rem; font-weight: 700; user-select: none; cursor: default;
  }
  tr.is-clicked .clicked-mark { color: var(--primary); cursor: pointer; }
  tr.is-clicked td { background: #7FEE6412; }
  tr.is-clicked td:first-child { box-shadow: inset 3px 0 0 var(--primary); }
  tr.is-clicked a.posting-link { color: var(--primary-light); }
  tr.is-clicked a.posting-link::after { content: ' ✔'; font-weight: 700; }

  .filterbar { gap: 0.75rem 1.1rem; flex-wrap: wrap; align-items: center; }
  .fl { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.74rem;
        text-transform: uppercase; letter-spacing: 0.06em; color: var(--primary-light); }
  .fl input, .fl select {
    background: #ffffff08; border: 1px solid var(--border30); color: var(--light-green);
    font-family: inherit; font-size: 0.82rem; padding: 0.32rem 0.5rem; text-transform: none;
    letter-spacing: 0; border-radius: 0; min-width: 9.5rem;
  }
  .fl input:focus, .fl select:focus { outline: none; border-color: var(--primary); }
  .fl select { cursor: pointer; }
  /* A datalist input looks like a plain textbox, so nothing signals that it also
     drops down. The caret makes it read as a combo box you can type into. */
  .combo { position: relative; display: inline-flex; align-items: center; }
  .combo::after {
    content: "▾"; position: absolute; right: 0.5rem; pointer-events: none;
    color: var(--primary-light); font-size: 0.7rem;
  }
  .combo input { padding-right: 1.5rem; min-width: 15rem; }
  #f-loc { min-width: 11rem; }
  .fl select option { background: var(--bg); color: var(--light-green); }
  #f-clear, #csv-sync, #csv-export {
    background: transparent; border: 1px solid var(--border30); color: var(--primary-light);
    font-family: inherit; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em;
    padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 0;
  }
  #f-clear:hover, #csv-sync:hover, #csv-export:hover { border-color: var(--primary); color: var(--primary); }
  .fl-sep { border-left: 1px solid var(--border30); align-self: stretch; margin: 0 0.2rem; }
  #sync-note { font-size: 0.72rem; }

  /* ── fit score ────────────────────────────────────────────────────────────
     Super signals glow tangerine. Deliberately the only warm colour on an
     all-green board, and deliberately rare (~2% of rows) — if a third of the
     board glowed, none of it would read as a signal. */
  td.fit-cell { text-align: right; padding-right: 0.7rem; white-space: nowrap; }
  .fit { font-weight: 700; font-size: 0.86rem; color: var(--primary-light); }
  .fit-none { color: #7FEE6440; font-weight: 400; }
  .fit-ok { color: var(--primary); }
  .fit-strong { color: var(--tangerine-dim); }
  .fit-super {
    color: var(--tangerine); font-size: 0.95rem;
    text-shadow: 0 0 6px var(--tangerine-glow), 0 0 14px var(--tangerine-glow);
    animation: pulse-tangerine 2.4s ease-in-out infinite;
  }
  tr[data-super="1"] td { background: linear-gradient(90deg, #FF8A3D14, transparent 55%); }
  tr[data-super="1"] td:first-child { box-shadow: inset 3px 0 0 var(--tangerine); }
  tr[data-super="1"].is-clicked td:first-child { box-shadow: inset 3px 0 0 var(--primary); }
  @keyframes pulse-tangerine {
    0%, 100% { text-shadow: 0 0 5px var(--tangerine-glow), 0 0 12px var(--tangerine-glow); }
    50%      { text-shadow: 0 0 9px var(--tangerine), 0 0 22px var(--tangerine-glow); }
  }
  /* Respect users who ask the OS for less motion. */
  @media (prefers-reduced-motion: reduce) { .fit-super { animation: none; } }
  .chip[data-f="super"].active { border-color: var(--tangerine); color: var(--tangerine); background: #FF8A3D1a; }

  /* ── collapsed tracker ────────────────────────────────────────────────────
     The board is the thing you actually scroll to; the tracker is reference.
     Collapsed by default so the job rows start near the top of the page, and
     the open/closed choice is remembered. */
  #tracker-details > summary {
    list-style: none; cursor: pointer; user-select: none;
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 0; margin-top: 1.2rem;
    border-bottom: 1px solid var(--border20);
  }
  #tracker-details > summary::-webkit-details-marker { display: none; }
  #tracker-details > summary::before {
    content: "▸"; color: var(--primary-light); font-size: 0.8rem; transition: transform 0.15s ease;
  }
  #tracker-details[open] > summary::before { transform: rotate(90deg); }
  #tracker-details > summary:hover .sum-title { color: var(--primary); }
  .sum-title {
    font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--primary-light); font-weight: 700;
  }
  .sum-hint { margin-left: auto; font-size: 0.7rem; color: #7FEE6466; text-transform: uppercase; letter-spacing: 0.06em; }
  #tracker-details[open] .sum-hint::after { content: "hide"; }
  #tracker-details[open] .sum-hint { font-size: 0; }
  #tracker-details[open] .sum-hint::after { font-size: 0.7rem; }

  /* ── analytics ────────────────────────────────────────────────────────────*/
  .stats { display: flex; flex-wrap: wrap; gap: 0.6rem 1.6rem; align-items: flex-end; padding: 12px 0 4px; }
  .stat { display: flex; flex-direction: column; gap: 0.15rem; }
  .stat-n { font-size: 1.45rem; font-weight: 700; color: var(--primary); line-height: 1; }
  .stat-n.warm { color: var(--tangerine); }
  .stat-l { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--primary-light); }
  .spark { display: flex; align-items: flex-end; gap: 3px; height: 42px; }
  .spark-bar { width: 16px; background: var(--primary); min-height: 2px; opacity: 0.75; }
  .spark-bar:last-child { opacity: 1; }
  .spark-wrap { display: flex; flex-direction: column; gap: 0.3rem; }
  .spark-x { display: flex; gap: 3px; font-size: 0.6rem; color: var(--primary-light); }
  .spark-x span { width: 16px; text-align: center; }
  .stats-empty { color: var(--primary-light); font-size: 0.78rem; padding: 6px 0 10px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <h1>CAREER-OPS // JOB BOARD</h1>
    <div class="topbar-right">
      <div class="meta">${esc(generatedAt)} · ${PUBLIC ? 'public snapshot' : 'local'} · star/applied/hide saved in this browser</div>
      <div class="meta" id="time-tracker" title="Counts only while this tab is visible AND focused — switching tabs or apps pauses it">Time on page: —</div>
    </div>
  </div>
  <div class="refresh-row">
    <button id="refresh-btn" class="refresh-btn">⟳ REFRESH</button>
    <div class="loadbar-wrap" id="loadbar-wrap"><div class="loadbar" id="loadbar"></div></div>
  </div>
  <div id="term" class="terminal"></div>
  <div class="inner">

  ${PUBLIC ? '' : `
  <details id="tracker-details">
    <summary><span class="sum-title">Applications Tracker</span> <span class="count-badge">${applications.length}</span><span class="sum-hint">show</span></summary>
  <div class="panel">
    ${applications.length ? `<table id="tracker-table" class="ptable sortable-table">
      <thead><tr><th></th><th data-k="1" class="sortable">Company</th><th data-k="2" class="sortable">Role</th><th data-k="3" class="sortable" data-desc="1">Score</th><th data-k="4" class="sortable">Status</th><th>PDF</th><th>Report</th><th>Links</th><th>Notes</th></tr></thead>
      <tbody>${appRowsHtml}</tbody>
    </table>` : '<div class="empty">No applications tracked yet.</div>'}
  </div>
  </details>
  `}

  ${PUBLIC ? '' : `
  <h2>Activity</h2>
  <div class="panel" style="padding:0 16px 14px">
    <div id="stats" class="stats"></div>
    <div id="stats-empty" class="stats-empty"></div>
  </div>
  `}

  <div class="toolbar" style="margin-top:2rem">
    <input id="q" type="search" placeholder="Filter… try 'neocloud', 'account executive boston', 'yc seed'" autocomplete="off">
    <span class="chip" data-f="all">All</span>
    <span class="chip" data-f="new">New today</span>
    <span class="chip" data-f="starred">★ Starred</span>
    <span class="chip" data-f="applied">✓ Applied</span>
    <span class="chip" data-f="super">🔥 Super signal</span>
    <span class="chip" data-f="viewed">✔ Opened</span>
    <span class="chip" data-f="unviewed">Not opened</span>
    <span class="chip" data-f="hidden">✕ Hidden</span>
    <span id="shown" class="muted"></span>
  </div>

  <div class="toolbar filterbar">
    <label class="fl">Location <select id="f-loc">
      <option value="">All locations</option>
      <option value="boston">Boston</option>
      <option value="remote">Remote</option>
      <option value="both">Boston or Remote</option>
      <option value="other">Neither</option>
    </select></label>
    <label class="fl">Company
      <span class="combo">
        <input id="f-company" type="text" list="dl-company" placeholder="All ${companyCount} companies — type to filter" autocomplete="off">
      </span>
    </label>
    <label class="fl">Title <input id="f-title" type="text" list="dl-title" placeholder="Any title" autocomplete="off"></label>
    <label class="fl">Tech <select id="f-tech">
      <option value="">All</option>
      ${techOptions}
      <option value="__none">— untagged —</option>
    </select></label>
    <button id="f-clear" type="button">Clear filters</button>
    <span class="fl-sep"></span>
    <button id="csv-sync" type="button" title="Write every opened posting to data/clicks.csv">⇧ Save opens to disk</button>
    <button id="csv-export" type="button" title="Download the opened-postings log as a CSV file">⭳ Export CSV</button>
    <span id="sync-note" class="muted"></span>
  </div>
  <datalist id="dl-company">${companyOptions}</datalist>
  <datalist id="dl-title">${titleOptions}</datalist>

  <h2>Tech Sales <span class="count-badge">${techPending.length}</span></h2>
  <div class="panel">
    ${pendingTableHtml(techPending)}
  </div>

  <h2>Other Sales <span class="count-badge">${otherPending.length}</span></h2>
  <div class="panel">
    ${pendingTableHtml(otherPending)}
  </div>

  </div>
  <div class="refresh-hint">
    ${PUBLIC
      ? 'Static snapshot of open sales/GTM roles at tech companies, discovered by <a href="https://github.com/jaredwerba/career-ops" target="_blank" rel="noopener">career-ops</a>. "People" opens a LinkedIn people-search for that company\'s sales org.'
      : 'Static snapshot — after a scan, regenerate: <code>node build-web-dashboard.mjs</code> then refresh. "People" opens LinkedIn people-search for that company\'s sales org (your login shows mutual connections).<br>To record opened postings to disk (<code>data/clicks.csv</code>) instead of just this browser, run <code>node dashboard-server.mjs</code> and use <a href="http://localhost:8787">localhost:8787</a>. Fit score is the same model as <code>node shortlist.mjs</code>.'}
  </div>
</div>
<script>
(function(){
  const tables = Array.from(document.querySelectorAll('table.ptable'));
  if (!tables.length) return;
  const pendingTables = tables.filter(tb => tb.id !== 'tracker-table');
  const rows = pendingTables.flatMap(tb => Array.from(tb.tBodies[0].rows));
  const q = document.getElementById('q');
  const shown = document.getElementById('shown');
  const KEY = 'careerops-row-state';
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  // Click log — the app's "database" for this static page is localStorage (no
  // server to POST to). Every Posting click is recorded as { url: firstClickISO,
  // count, last } so it survives dashboard rebuilds and a job you've opened
  // reads as "viewed". Keyed by posting URL, like the row state above.
  const CLICK_KEY = 'careerops-clicked';
  let clicks = {};
  try { clicks = JSON.parse(localStorage.getItem(CLICK_KEY) || '{}'); } catch {}

  // data/clicks.csv, baked in at build time, is the durable record; localStorage
  // is a cache that also covers opens made since the last rebuild. Union them,
  // keeping the earliest first-open, latest last-open and highest count.
  const CLICK_SEED = ${CLICK_SEED_JSON};
  for (const url of Object.keys(CLICK_SEED)) {
    const s = CLICK_SEED[url], c = clicks[url];
    if (!c) { clicks[url] = { first: s.first, last: s.last, count: s.count }; continue; }
    clicks[url] = {
      first: [c.first, s.first].filter(Boolean).sort()[0] || '',
      last: [c.last, s.last].filter(Boolean).sort().pop() || '',
      count: Math.max(c.count || 1, s.count || 1)
    };
  }

  // Served by dashboard-server.mjs? Then every open is written to the CSV
  // immediately. Opened as a file:// page, we keep localStorage and the user
  // exports/syncs manually — the page must work either way.
  const LIVE = location.protocol === 'http:' || location.protocol === 'https:';
  const saveClicks = () => { try { localStorage.setItem(CLICK_KEY, JSON.stringify(clicks)); } catch {} };
  const nowISO = () => new Date().toISOString();

  const syncNote = document.getElementById('sync-note');
  function setNote(msg) { if (syncNote) syncNote.textContent = msg; }

  function pushClick(url, r) {
    if (!LIVE) return;
    fetch('/api/clicks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url, company: (r.cells[2] || {}).textContent || '', title: (r.cells[4] || {}).textContent || '' })
    }).then(() => setNote('saved to data/clicks.csv')).catch(() => setNote('offline — kept in browser'));
  }
  function dropClick(url) {
    if (!LIVE) return;
    fetch('/api/clicks', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url })
    }).then(() => setNote('removed from data/clicks.csv')).catch(() => {});
  }

  const allRows = tables.flatMap(tb => Array.from(tb.tBodies[0].rows));
  for (const r of allRows) {
    const url = r.dataset.url;
    const st = state[url];
    if (st === 's') r.classList.add('is-starred');
    if (st === 'a') r.classList.add('is-applied');
    if (st === 'h') r.classList.add('is-hidden');
    if (clicks[url]) { r.classList.add('is-clicked'); markTooltip(r, url); }
  }

  // Record a Posting click. Fires before the new tab opens (target=_blank keeps
  // this page alive), so state persists reliably.
  function onPostingClick(e) {
    // Clicking the ✔ itself clears the mark — undo for a misclick.
    const mark = e.target.closest('.clicked-mark');
    if (mark) {
      const mr = mark.closest('tr');
      if (mr && clicks[mr.dataset.url]) {
        delete clicks[mr.dataset.url];
        mr.classList.remove('is-clicked');
        saveClicks();
        dropClick(mr.dataset.url);
        update();
      }
      return;
    }
    const a = e.target.closest('a.posting-link');
    if (!a) return;
    const r = a.closest('tr');
    if (!r) return;
    const url = r.dataset.url;
    const rec = clicks[url] || { first: nowISO(), count: 0 };
    rec.count += 1;
    rec.last = nowISO();
    clicks[url] = rec;
    r.classList.add('is-clicked');
    saveClicks();
    pushClick(url, r);
    sessionEvents.push({ t: new Date(rec.last), company: (r.cells[2] ? r.cells[2].textContent.trim() : '') });
    markTooltip(r, url);
    renderStats();
    update();
  }
  for (const tb of tables) tb.tBodies[0].addEventListener('click', onPostingClick);
  function onRowAction(e) {
    const btn = e.target.closest('.act');
    if (!btn) return;
    const r = btn.closest('tr');
    const url = r.dataset.url;
        const kind = btn.classList.contains('star') ? 's' : btn.classList.contains('applied') ? 'a' : 'h';
    if (state[url] === kind) { delete state[url]; } else { state[url] = kind; }
    r.classList.toggle('is-starred', state[url] === 's');
    r.classList.toggle('is-applied', state[url] === 'a');
    r.classList.toggle('is-hidden', state[url] === 'h');
    save();
    update();
  }
  for (const tb of tables) tb.tBodies[0].addEventListener('click', onRowAction);

  let filter = 'all';
  document.querySelectorAll('.chip[data-f]').forEach(c => c.addEventListener('click', () => {
    filter = c.dataset.f;
    document.querySelectorAll('.chip[data-f]').forEach(x => x.classList.toggle('active', x === c));
    update();
  }));
  document.querySelector('.chip[data-f="all"]').classList.add('active');

  // Per-row lookup built once. update() previously re-read textContent for every
  // row on every keystroke; with 7k rows and four more predicates that gets
  // sluggish, so cache the searchable text and per-column values up front.
  // cells[] indexes track the column order in pendingTableHtml().
  const BOSTON_RE = /\\b(boston|cambridge|somerville|waltham|burlington|newton|needham|lexington|woburn|quincy|brookline|watertown|medford|malden|andover|billerica|marlborough|framingham|natick|dedham|braintree|massachusetts|mass|ma)\\b/;
  const REMOTE_RE = /\\b(remote|anywhere|distributed|virtual|telecommute|wfh|home based|home-based)\\b/;
  const meta = new Map();
  for (const r of rows) {
    const cell = (i) => (r.cells[i] ? r.cells[i].textContent : '').toLowerCase();
    const loc = cell(5);
    meta.set(r, {
      text: r.textContent.toLowerCase(),
      company: cell(2), tech: cell(3), title: cell(4), loc: loc,
      boston: BOSTON_RE.test(loc), remote: REMOTE_RE.test(loc)
    });
  }

  const fCompany = document.getElementById('f-company');
  const fTech = document.getElementById('f-tech');
  const fTitle = document.getElementById('f-title');
  const fLoc = document.getElementById('f-loc');

  function matchesColumns(r) {
    const m = meta.get(r);
    if (!m) return true;
    const c = fCompany.value.trim().toLowerCase();
    if (c && m.company.indexOf(c) === -1) return false;
    const ti = fTitle.value.trim().toLowerCase();
    if (ti && m.title.indexOf(ti) === -1) return false;
    const t = fTech.value;
    if (t === '__none') { if (m.tech !== '') return false; }
    else if (t && m.tech.indexOf(t) === -1) return false;
    const L = fLoc.value;
    if (L === 'boston' && !m.boston) return false;
    if (L === 'remote' && !m.remote) return false;
    if (L === 'both' && !(m.boston || m.remote)) return false;
    if (L === 'other' && (m.boston || m.remote)) return false;
    return true;
  }

  // Same column order as lib/clicks-store.mjs, so an exported file can be
  // dropped straight in as data/clicks.csv.
  function clicksToCsv() {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = ['url,first_opened,last_opened,count,company,title'];
    for (const url of Object.keys(clicks)) {
      const c = clicks[url] || {};
      const r = document.querySelector('tr[data-url="' + (window.CSS && CSS.escape ? CSS.escape(url) : url) + '"]');
      const company = r && r.cells[2] ? r.cells[2].textContent.trim() : '';
      const title = r && r.cells[4] ? r.cells[4].textContent.trim() : '';
      lines.push([cell(url), cell(c.first || ''), cell(c.last || ''), cell(c.count || 1), cell(company), cell(title)].join(','));
    }
    return lines.join('\\n') + '\\n';
  }

  document.getElementById('csv-export').addEventListener('click', () => {
    const n = Object.keys(clicks).length;
    if (!n) { setNote('nothing opened yet'); return; }
    const blob = new Blob([clicksToCsv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'clicks.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNote('exported ' + n + ' rows — save as data/clicks.csv');
  });

  document.getElementById('csv-sync').addEventListener('click', () => {
    if (!LIVE) { setNote('file:// mode — run "node dashboard-server.mjs" to save to disk, or Export CSV'); return; }
    fetch('/api/clicks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clicks: clicks })
    }).then(r => r.json())
      .then(d => setNote('data/clicks.csv now holds ' + (d.total || 0) + ' opened postings'))
      .catch(() => setNote('could not reach the dashboard server'));
  });

  setNote(LIVE ? 'opens save to data/clicks.csv automatically' : 'browser-only — start dashboard-server.mjs to save opens to disk');

  // ── activity analytics ─────────────────────────────────────────────────────
  // Built from data/click-events.csv (one line per open) plus anything opened
  // since the page was generated, so the numbers stay live as you click.
  const SEED_EVENTS = ${CLICK_EVENTS_JSON};
  const sessionEvents = [];

  const DAY = 86400000;
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  function weekStart(d) {           // Monday-anchored
    const x = startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function fmtWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function allEvents() {
    const out = [];
    for (const e of SEED_EVENTS) { const t = new Date(e[0]); if (!isNaN(t)) out.push({ t: t, company: e[1] || '' }); }
    for (const e of sessionEvents) out.push(e);
    return out;
  }

  function renderStats() {
    const box = document.getElementById('stats');
    const emptyBox = document.getElementById('stats-empty');
    if (!box) return;
    const ev = allEvents();
    if (!ev.length) {
      box.innerHTML = '';
      emptyBox.textContent = 'No postings opened yet — click a Posting link and this fills in.';
      return;
    }
    emptyBox.textContent = '';
    const now = new Date();
    const thisWeek = weekStart(now).getTime();
    const lastWeek = thisWeek - 7 * DAY;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const last30 = now.getTime() - 30 * DAY;
    const today = startOfDay(now).getTime();

    let nToday = 0, nWeek = 0, nPrevWeek = 0, nMonth = 0, n30 = 0;
    const companies = {};
    for (const e of ev) {
      const t = e.t.getTime();
      if (t >= today) nToday++;
      if (t >= thisWeek) nWeek++;
      else if (t >= lastWeek) nPrevWeek++;
      if (t >= monthStart) nMonth++;
      if (t >= last30) { n30++; if (e.company) companies[e.company] = (companies[e.company] || 0) + 1; }
    }

    // Eight-week sparkline.
    const buckets = [];
    for (let i = 7; i >= 0; i--) {
      const s = thisWeek - i * 7 * DAY;
      buckets.push({ start: s, n: 0, label: new Date(s).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) });
    }
    for (const e of ev) {
      const t = e.t.getTime();
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (t >= buckets[i].start) { if (t < buckets[i].start + 7 * DAY) buckets[i].n++; break; }
      }
    }
    const peak = Math.max(1, ...buckets.map(b => b.n));
    const topCo = Object.keys(companies).sort((a, b) => companies[b] - companies[a])[0];

    const trend = nPrevWeek === 0 ? (nWeek ? '▲ new' : '') :
      (nWeek >= nPrevWeek ? '▲ ' : '▼ ') + Math.round(Math.abs(nWeek - nPrevWeek) / nPrevWeek * 100) + '%';

    const stat = (n, label, warm) =>
      '<div class="stat"><div class="stat-n' + (warm ? ' warm' : '') + '">' + n + '</div><div class="stat-l">' + label + '</div></div>';

    let html = stat(nToday, 'opened today') + stat(nWeek, 'this week' + (trend ? ' ' + trend : '')) +
               stat(nMonth, 'this month') + stat(ev.length, 'all time');
    if (topCo) html += '<div class="stat"><div class="stat-n warm" style="font-size:1rem">' + topCo +
      '</div><div class="stat-l">most opened (30d) · ' + companies[topCo] + '×</div></div>';
    html += '<div class="spark-wrap"><div class="spark">' +
      buckets.map(b => '<div class="spark-bar" style="height:' + Math.round(b.n / peak * 40) + 'px" title="' +
        b.n + ' opened, week of ' + b.label + '"></div>').join('') +
      '</div><div class="spark-x">' + buckets.map((b, i) => '<span>' + (i % 2 === 0 ? b.label : '') + '</span>').join('') +
      '</div><div class="stat-l">opens per week</div></div>';
    box.innerHTML = html;
  }

  // A row's ✔ carries its own open history, so hovering answers "when did I
  // look at this?" without another column.
  function markTooltip(r, url) {
    const mark = r.querySelector('.clicked-mark');
    if (!mark) return;
    const c = clicks[url];
    mark.title = c
      ? 'Opened ' + (c.count || 1) + '×  ·  first ' + fmtWhen(c.first) + (c.count > 1 ? '  ·  last ' + fmtWhen(c.last) : '') + '  — click to clear'
      : 'You opened this posting — click to clear';
  }

  fCompany.addEventListener('input', update);
  fTitle.addEventListener('input', update);
  fTech.addEventListener('change', update);
  fLoc.addEventListener('change', update);
  document.getElementById('f-clear').addEventListener('click', () => {
    fCompany.value = ''; fTitle.value = ''; fTech.value = ''; fLoc.value = ''; q.value = '';
    filter = 'all';
    document.querySelectorAll('.chip[data-f]').forEach(x => x.classList.toggle('active', x.dataset.f === 'all'));
    update();
  });

  function matchesFilter(r) {
    const st = state[r.dataset.url];
    const clicked = !!clicks[r.dataset.url];
    if (filter === 'starred') return st === 's';
    if (filter === 'applied') return st === 'a';
    if (filter === 'super') return r.dataset.super === '1' && st !== 'h';
    if (filter === 'viewed') return clicked && st !== 'h';
    if (filter === 'unviewed') return !clicked && st !== 'h';
    if (filter === 'hidden') return st === 'h';
    if (filter === 'new') return r.querySelector('.new-badge') !== null && st !== 'h';
    return st !== 'h'; // 'all' hides hidden rows
  }
  function update(){
    const terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    let n = 0;
    for (const r of rows) {
      const m = meta.get(r);
      const txt = m ? m.text : r.textContent.toLowerCase();
      const hit = terms.every(t => txt.includes(t)) && matchesFilter(r) && matchesColumns(r);
      r.style.display = hit ? '' : 'none';
      if (hit) n++;
    }
    const starred = Object.values(state).filter(v => v === 's').length;
    const applied = Object.values(state).filter(v => v === 'a').length;
    const viewed = Object.keys(clicks).length;
    shown.textContent = n + ' of ' + rows.length + ' shown · ' + starred + ' ★ · ' + applied + ' ✓ applied · ' + viewed + ' ✔ opened';
  }
  q.addEventListener('input', update);
  update();
  renderStats();

  // Tracker stays collapsed unless you've deliberately opened it before.
  const trackerBox = document.getElementById('tracker-details');
  if (trackerBox) {
    try { if (localStorage.getItem('careerops-tracker-open') === '1') trackerBox.open = true; } catch {}
    trackerBox.addEventListener('toggle', () => {
      try { localStorage.setItem('careerops-tracker-open', trackerBox.open ? '1' : '0'); } catch {}
    });
  }

  function makeSortable(tb, rowsRef) {
    let sortKey = -1, asc = true;
    tb.tHead.addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable');
      if (!th) return;
      const k = Number(th.dataset.k);
      // Columns flagged data-desc (dates, scores) open descending — newest and
      // highest first is what you actually want from them, so one click gets it
      // instead of two. Everything else still opens ascending (A-Z).
      asc = (sortKey === k) ? !asc : !(th.dataset.desc === '1');
      sortKey = k;
      const body = tb.tBodies[0];
      const rr = rowsRef || Array.from(body.rows);
      rr.sort((a,b) => {
        const av = a.cells[k].dataset.sort ?? a.cells[k].textContent.trim();
        const bv = b.cells[k].dataset.sort ?? b.cells[k].textContent.trim();
        const an = parseFloat(av), bn = parseFloat(bv);
        const cmp = (!isNaN(an) && !isNaN(bn) && String(an) === av && String(bn) === bv) ? an - bn : av.localeCompare(bv);
        return cmp * (asc ? 1 : -1);
      });
      for (const r of rr) body.appendChild(r);
      for (const h of tb.tHead.rows[0].cells) h.classList.remove('sorted-asc','sorted-desc');
      th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');
    });
  }
  for (const tb of tables) makeSortable(tb, Array.from(tb.tBodies[0].rows));
})();
</script>
<script>
// Time-on-page tracker: counts seconds only while this tab is the visible AND
// focused window — Page Visibility API alone (document.visibilityState) does
// not catch switching to another native app while the tab stays "visible" in
// background, so this also checks document.hasFocus(). Cumulative totals
// persist in localStorage (keyed by this file's path, like the star/applied/
// hide state), split by calendar day so "today" resets naturally tomorrow.
(function(){
  const KEY = 'careerops-time-log';
  let log = { total: 0, days: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (typeof saved.total === 'number') log.total = saved.total;
    if (saved.days && typeof saved.days === 'object') log.days = saved.days;
  } catch {}

  const todayKey = () => new Date().toISOString().slice(0, 10);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(log)); } catch {} };
  const isActive = () => document.visibilityState === 'visible' && document.hasFocus();

  function fmt(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  function render() {
    const el = document.getElementById('time-tracker');
    if (!el) return;
    const todaySec = log.days[todayKey()] || 0;
    el.textContent = 'Time on page today: ' + fmt(todaySec) + ' \u00b7 all-time: ' + fmt(log.total);
  }

  let lastTick = isActive() ? Date.now() : null;
  function tick() {
    const active = isActive();
    if (active) {
      const now = Date.now();
      if (lastTick !== null) {
        const deltaSec = (now - lastTick) / 1000;
        log.total += deltaSec;
        const k = todayKey();
        log.days[k] = (log.days[k] || 0) + deltaSec;
      }
      lastTick = now;
    } else {
      lastTick = null;
    }
    render();
    save();
  }

  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  window.addEventListener('blur', tick);
  window.addEventListener('pagehide', tick);
  window.addEventListener('beforeunload', tick);
  render();
})();
</script>
<script>
// Cosmetic "refresh" theater: NO real network calls happen here — it is a
// simulated hacker-terminal log built from a real sample of this build's own
// scanned postings (see sampleForLog() in the Node build script), animated
// alongside a rectangular loading bar, then a genuine location.reload() at
// the end (which is the one real effect: re-reading whatever is on disk).
// String concatenation only in this block, never backtick template literals
// — this whole document is itself one giant Node template literal, and any
// literal backtick written directly in this script's source text (not
// inside a Node \${} substitution) would terminate it early at build time.
(function(){
  var LOG_SAMPLE = ${LOG_SAMPLE_JSON};
  var btn = document.getElementById('refresh-btn');
  var wrap = document.getElementById('loadbar-wrap');
  var bar = document.getElementById('loadbar');
  var term = document.getElementById('term');
  if (!btn || !term) return;

  function shuffled(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  function rand(min, max) { return min + Math.floor(Math.random() * (max - min)); }

  function buildLines() {
    var out = [];
    var tag = function(s, cls) { return { text: s, cls: cls || '' }; };
    out.push(tag('[boot] career-ops discovery daemon v1.17.0 :: pid ' + rand(10000, 60000)));
    out.push(tag('[boot] loading provider registry from providers/*.mjs ...'));
    out.push(tag('[boot] resolved 45 provider modules :: greenhouse, ashby, lever, smartrecruiters, workday, +40 board aggregators'));
    out.push(tag('[cfg]  portals.yml parsed :: title_filter patterns compiled, location_filter.block=110 patterns'));
    out.push(tag('[cfg]  region seeds loaded :: boston(170) ai-native(53) yc(6041, paginated, totalPages~241)'));
    out.push(tag('[dedup] scan-history.tsv mapped into Set<string> :: ' + rand(4200, 4700) + ' known urls loaded'));
    out.push(tag('[auth] session pool warmed :: 10-way concurrent worker allocation (CONCURRENCY=10)'));

    var samples = shuffled(LOG_SAMPLE).slice(0, Math.min(26, LOG_SAMPLE.length));
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      out.push(tag('[net]  TLS handshake -> ' + s.host + ':443 ... OK', 'term-net'));
      out.push(tag('[net]  GET ' + s.path, 'term-net'));
      out.push(tag('[net]  <- 200 OK  content-length=' + rand(2000, 42000) + '  t=' + rand(60, 480) + 'ms', 'term-net'));
      out.push(tag('[parse] normalized posting :: "' + s.title + '" @ ' + s.company));
      out.push(tag('[filter] title_filter -> PASS   location_filter -> PASS'));
      out.push(tag('[dedup] sha1(url) not in scan-history :: NEW'));
      out.push(tag('[queue] appended -> data/pipeline.md  (source=' + s.source + ')', 'term-hi'));
    }
    out.push(tag('[gc]   discarded ' + rand(9000, 16000) + ' non-matching postings (title/location mismatch)'));
    out.push(tag('[net]  closing ' + rand(20, 60) + ' keep-alive sockets'));
    out.push(tag('[done] scan complete :: +' + samples.length + ' offers  0 errors  \u0394t=' + (3.2 + Math.random() * 2.4).toFixed(2) + 's', 'term-hi'));
    out.push(tag('[ui]   rebuilding dashboard-web/index.html ...', 'term-hi'));
    out.push(tag('[ui]   reload scheduled', 'term-hi'));
    return out;
  }

  // Served over http by dashboard-server.mjs? Then the button runs the REAL
  // sweep and streams its output. Opened as a file:// page there is no server
  // to ask, and a browser cannot shell out — so say so plainly rather than
  // animating a scan that isn't happening.
  var LIVE = location.protocol === 'http:' || location.protocol === 'https:';

  function emit(text, cls) {
    var row = document.createElement('div');
    row.className = 'term-line' + (cls ? ' ' + cls : '');
    row.textContent = text;
    term.appendChild(row);
    term.scrollTop = term.scrollHeight;
  }

  function openTerm() {
    wrap.style.display = 'block';
    term.style.display = 'block';
    term.innerHTML = '';
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = 'width 400ms linear';
  }

  if (!LIVE) {
    btn.textContent = '⟳ RUN SCAN';
    btn.title = 'Requires the local dashboard server';
    btn.addEventListener('click', function(){
      openTerm();
      wrap.style.display = 'none';
      emit('[!] This page is open from a file, so it cannot run commands.', 'term-hi');
      emit('');
      emit('    Start the server, then use http://localhost:8787 instead:');
      emit('');
      emit('      cd ~/careerops && node dashboard-server.mjs', 'term-hi');
      emit('');
      emit('    The RUN SCAN button works there, and opens/clicks persist to');
      emit('    data/clicks.csv instead of just this browser.');
    });
    return;
  }

  btn.textContent = '▶ RUN SCAN';
  // Fast tier only (~5-15 min): tracked companies, job boards, and every
  // pre-verified seed. The heavy portfolio probing (YC/a16z/VCs, ~4.5h
  // measured) runs nightly at 02:00 from its own launchd job.
  btn.title = 'Run the fast discovery sweep (~5-15 min). Heavy portfolio probing runs nightly at 2am.';

  var es = null;
  function finish(msg, cls) {
    if (es) { es.close(); es = null; }
    bar.style.width = '100%';
    btn.disabled = false;
    btn.textContent = '▶ RUN SCAN';
    if (msg) emit(msg, cls || 'term-hi');
  }

  function attachStream() {
    es = new EventSource('/api/scan/stream');
    es.addEventListener('line', function(ev){
      var line = '';
      try { line = JSON.parse(ev.data); } catch (e) { line = String(ev.data); }
      if (!line) return;
      // "PHASE 3/9 start ..." / "PHASE 3/9 done 142s 3 new rc=0" drive the bar.
      var m = line.match(/^PHASE (\\d+)\\/(\\d+) (start|done) (.*)$/);
      if (m) {
        var n = parseInt(m[1], 10), total = parseInt(m[2], 10);
        var pct = Math.round(((m[3] === 'done' ? n : n - 1) / total) * 100);
        bar.style.width = pct + '%';
        if (m[3] === 'start') {
          emit('[' + n + '/' + total + '] ' + m[4] + ' …', 'term-hi');
        } else {
          emit('      ' + m[4].replace(/rc=0$/, '').trim(), 'term-net');
        }
        return;
      }
      if (line.indexOf('SWEEP done') === 0) { emit(line, 'term-hi'); return; }
      emit(line, line.charAt(0) === '+' ? 'term-hi' : '');
    });
    es.addEventListener('done', function(ev){
      var code = 0;
      try { code = (JSON.parse(ev.data) || {}).exitCode; } catch (e) {}
      finish(code === 0
        ? '[done] sweep complete — reloading with the new postings…'
        : '[done] sweep exited with code ' + code + ' (see data/scan-logs/)');
      if (code === 0) setTimeout(function(){ location.reload(); }, 1500);
    });
    es.onerror = function(){
      // The stream also drops when the server restarts; EventSource retries.
      if (es && es.readyState === 2) finish('[!] lost connection to the server', 'term-hi');
    };
  }

  btn.addEventListener('click', function(){
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'SCANNING…';
    openTerm();
    emit('[run] starting fast sweep — tracked companies + all pre-verified seeds (~5-15 min).', 'term-hi');
    emit('[run] heavy portfolio probing (YC/a16z/VC portfolios) runs nightly at 2am on its own.');
    emit('[run] safe to close this tab; the sweep keeps running on the server.');
    fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d.ok) { finish('[!] ' + (d.error || 'server refused')); return; }
        if (d.alreadyRunning) emit('[run] a sweep was already running — attaching to it.', 'term-hi');
        attachStream();
      })
      .catch(function(){ finish('[!] could not reach the dashboard server'); });
  });

  // A sweep already in flight (started from a terminal or another tab) adopts
  // the UI on load, so the button never lies about what the machine is doing.
  fetch('/api/scan').then(function(r){ return r.json(); }).then(function(d){
    if (d && d.running) {
      btn.disabled = true;
      btn.textContent = 'SCANNING…';
      openTerm();
      emit('[run] a sweep is already running — attaching…', 'term-hi');
      attachStream();
    }
  }).catch(function(){});
})();
</script>
</body>
</html>`;

const outDir = PUBLIC ? 'dashboard-public' : 'dashboard-web';
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/index.html`, html, 'utf-8');
console.log(`Wrote ${outDir}/index.html — ${pending.length} pending${PUBLIC ? '' : `, ${applications.length} tracked`}`);
console.log(`Open it: open ${outDir}/index.html`);
