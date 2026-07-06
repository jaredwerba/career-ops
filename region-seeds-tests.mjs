#!/usr/bin/env node

/**
 * region-seeds-tests.mjs — regression tests for metro-region seeds.
 *
 * Region seeds (seeds/regions.mjs) promise that EVERY emitted entry is
 * scannable: a known ATS platform, an SLUG_RE-safe board id, and a
 * careers_url that one of the SEED_PROVIDERS actually detects. These tests
 * pin that contract offline (no network):
 *   1. parseRegionEntries() drops malformed input — unknown ATS, unsafe
 *      slugs, duplicate boards/names — and normalizes the rest.
 *   2. Every shipped region entry round-trips through toPortalEntry() to a
 *      URL its provider detect()s (greenhouse/lever/ashby/smartrecruiters).
 *   3. Every region has metro location keywords for the --region flag.
 *   4. The seed registry contract matches vc-portfolios (fetch + label).
 */

import { REGION_SEED_SOURCES, REGION_LOCATION_KEYWORDS, parseRegionEntries, REGION_ATS, SLUG_RE } from './seeds/regions.mjs';
import { toPortalEntry } from './seeds/vc-portfolios.mjs';
import greenhouse from './providers/greenhouse.mjs';
import lever from './providers/lever.mjs';
import ashby from './providers/ashby.mjs';
import smartrecruiters from './providers/smartrecruiters.mjs';

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── 1. parseRegionEntries validation ─────────────────────────────────

const parsed = parseRegionEntries([
  { name: 'Good Co', ats: 'greenhouse', ats_id: 'goodco' },
  { name: 'Case ATS', ats: 'GREENHOUSE', ats_id: 'caseats' },        // ats normalized to lowercase
  { name: 'Bad ATS', ats: 'workday', ats_id: 'badats' },             // unsupported platform → dropped
  { name: 'Bad Slug', ats: 'lever', ats_id: 'nope slug!' },          // fails SLUG_RE → dropped
  { name: 'No Board', ats: 'ashby' },                                // missing ats_id → dropped
  { name: 'Good Co', ats: 'ashby', ats_id: 'goodco2' },              // duplicate name → dropped
  { name: 'Dup Board', ats: 'greenhouse', ats_id: 'GoodCo' },        // duplicate board (case-insensitive) → dropped
  { name: '', ats: 'greenhouse', ats_id: 'anon' },                   // empty name → dropped
  'not-an-object',                                                   // junk → dropped
], 'testregion');

check('parse: keeps only valid, deduped entries', parsed.length === 2,
  `got ${parsed.length}: ${parsed.map(e => e.name).join(', ')}`);
check('parse: normalizes ats case', parsed[1]?.ats === 'greenhouse');
check('parse: stamps region as source', parsed.every(e => e.source === 'testregion'));
check('parse: emits SLUG_RE-safe slugs', parsed.every(e => SLUG_RE.test(e.slug)));
check('parse: non-array input yields empty', parseRegionEntries('junk', 'x').length === 0);

// ── 2. Shipped regions route to a provider ───────────────────────────

const PROVIDER_BY_ATS = { greenhouse, lever, ashby, smartrecruiters };

for (const [regionId, source] of Object.entries(REGION_SEED_SOURCES)) {
  const companies = await source.fetch();
  check(`${regionId}: fetch() returns a non-empty list`, companies.length > 0);
  check(`${regionId}: every entry has a supported ats`, companies.every(c => REGION_ATS.has(c.ats)));
  check(`${regionId}: every ats_id is SLUG_RE-safe`, companies.every(c => SLUG_RE.test(c.ats_id)));

  const undetected = [];
  for (const company of companies) {
    const entry = toPortalEntry(company);
    const provider = PROVIDER_BY_ATS[company.ats];
    let hit = false;
    try {
      hit = Boolean(provider.detect(entry));
    } catch { /* counts as undetected */ }
    if (!hit) undetected.push(`${company.name} (${company.ats}/${company.ats_id})`);
  }
  check(`${regionId}: every entry detect()s with its provider`, undetected.length === 0,
    undetected.slice(0, 5).join('; '));

  check(`${regionId}: has metro location keywords`,
    Array.isArray(REGION_LOCATION_KEYWORDS[regionId]) && REGION_LOCATION_KEYWORDS[regionId].length > 0);
}

// ── 3. SmartRecruiters freshness contract (region seeds depend on it) ─
// classifyPostingDate compares postedAt NUMERICALLY against an epoch-ms
// cutoff. A string postedAt silently classifies every posting 'keep'
// (string < number is always false), defeating --since for SR seed
// companies — this pins the numeric contract.

import { parseSmartRecruitersResponse } from './providers/smartrecruiters.mjs';
import { classifyPostingDate } from './scan-ats-full.mjs';

const srJobs = parseSmartRecruitersResponse({
  content: [
    { name: 'Old AE', id: '1', releasedDate: '2019-08-08T14:00:00.000Z' },
    { name: 'Undated AE', id: '2' },
  ],
}, 'TestCo');

check('sr: postedAt is epoch ms (number)', typeof srJobs[0].postedAt === 'number');
check('sr: missing releasedDate leaves postedAt unset', srJobs[1].postedAt === undefined);
const cutoff = Date.parse('2026-01-01T00:00:00Z');
check('sr: old posting classifies stale against a numeric cutoff',
  classifyPostingDate(srJobs[0], cutoff) === 'stale');
check('sr: undated posting classifies undated', classifyPostingDate(srJobs[1], cutoff) === 'undated');

// ── 4. Registry contract parity with vc-portfolios ───────────────────

for (const [id, source] of Object.entries(REGION_SEED_SOURCES)) {
  check(`${id}: registry entry has fetch() and label`,
    typeof source.fetch === 'function' && typeof source.label === 'string' && source.label.length > 0);
}

// ── Result ───────────────────────────────────────────────────────────

console.log(`\nregion-seeds-tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
