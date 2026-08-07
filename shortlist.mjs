#!/usr/bin/env node
// shortlist.mjs — rank the newest scanned postings by fit and print the few
// worth acting on.
//
// The dashboard answers "what got scanned?" (6,700 rows). This answers the
// only question that actually starts work: "what should I apply to today?"
// Roughly 200 sales-titled roles land per week, but most are insurance,
// pharma, staffing, and media — this strips those out and ranks what's left.
//
// Usage:
//   node shortlist.mjs                 # last 3 days, top 15
//   node shortlist.mjs --days 7        # widen the window
//   node shortlist.mjs --top 30        # more results
//   node shortlist.mjs --urls          # bare URLs only (feed to a resume run)
//   node shortlist.mjs --all           # include non-tech companies too
//
// Reads data/scan-history.tsv (the same feed the dashboard uses) and skips
// anything already in data/applications.md so applied roles stop resurfacing.

import { readFileSync, existsSync } from 'fs';
import { classifyTech } from './lib/tech-tags.mjs';
import { scoreJob, VERTICAL_NOISE } from './lib/fit-score.mjs';

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? dflt : Number(process.argv[i + 1]);
};
const DAYS = arg('--days', 3);
const TOP = arg('--top', 15);
const URLS_ONLY = process.argv.includes('--urls');
const INCLUDE_NON_TECH = process.argv.includes('--all');

// ── load ────────────────────────────────────────────────────────────────────
const tsv = readFileSync('data/scan-history.tsv', 'utf-8');
const [header, ...lines] = tsv.split('\n');
const cols = header.split('\t');
const rows = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const f = line.split('\t');
  const r = {};
  cols.forEach((c, i) => { r[c] = f[i] || ''; });
  if (r.url) rows.push(r);
}

// Companies already applied to / tracked — don't surface them again.
const applied = new Set();
if (existsSync('data/applications.md')) {
  for (const line of readFileSync('data/applications.md', 'utf-8').split('\n')) {
    const cells = line.split('|').map(s => s.trim());
    if (cells.length > 3 && cells[3]) applied.add(cells[3].toLowerCase());
  }
}

const cutoff = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);

const scored = [];
for (const r of rows) {
  if ((r.first_seen || '') < cutoff) continue;

  const title = r.title || '';
  const tech = classifyTech(r.company);
  if (!tech && !INCLUDE_NON_TECH) continue;
  if (!tech && VERTICAL_NOISE.test(title)) continue;

  const fit = scoreJob({ title, location: r.location || '', company: r.company, tech, applied });
  if (!fit) continue;   // no role archetype matched — not a seat worth ranking

  scored.push({ ...r, tech, score: fit.score, blockers: fit.blockers });
}

scored.sort((a, b) => b.score - a.score || (b.first_seen || '').localeCompare(a.first_seen || ''));
const top = scored.slice(0, TOP);

if (URLS_ONLY) {
  for (const r of top) console.log(r.url);
} else {
  console.log(`\n  ${scored.length} ranked matches from the last ${DAYS} day(s) — showing top ${top.length}\n`);
  console.log('  FIT  SEEN        TECH            COMPANY               ROLE');
  console.log('  ' + '─'.repeat(104));
  for (const r of top) {
    const flag = r.blockers.length ? `  ⚠ ${r.blockers.join(', ')}` : '';
    console.log(
      `  ${String(r.score).padStart(3)}  ${(r.first_seen || '').padEnd(11)} ` +
      `${r.tech.padEnd(15)} ${(r.company || '').slice(0, 21).padEnd(21)} ${(r.title || '').slice(0, 44)}${flag}`
    );
    console.log(`       ${(r.location || '').slice(0, 60)}`);
    console.log(`       ${r.url}`);
  }
  console.log('');
}
