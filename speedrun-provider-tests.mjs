#!/usr/bin/env node

/**
 * speedrun-provider-tests.mjs — offline tests for providers/speedrun.mjs.
 *
 * Kept as its own file so it can ship without rewriting test-all.mjs.
 * Run: node speedrun-provider-tests.mjs
 */

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(ROOT, 'providers/speedrun.mjs')).href);
const speedrun = mod.default;
const { parseSpeedrunPage, canonicalSpeedrunJobUrl, speedrunFeedUrl, speedrunSalary } = mod;

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ok ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('id', speedrun.id === 'speedrun', JSON.stringify(speedrun.id));

const hit = speedrun.detect({ name: 'Speedrun AE', provider: 'speedrun' });
check(
  'detect claims the pinned API',
  hit && hit.url === speedrunFeedUrl(0) && hit.url.startsWith('https://speedrun-talent-network.com/api/v1/jobs?'),
  JSON.stringify(hit),
);
check('detect ignores other providers', speedrun.detect({ name: 'Other', provider: 'jobicy' }) === null);

const page0 = new URL(speedrunFeedUrl(0));
check(
  'feed query is the AE search',
  page0.searchParams.get('q') === 'account executive' &&
    page0.searchParams.get('fn') === 'sales' &&
    page0.searchParams.get('scope') === 'everywhere' &&
    page0.searchParams.get('sort') === 'new' &&
    page0.searchParams.get('source') === 'jwerba-jobs' &&
    page0.searchParams.get('page') === '0',
  page0.search,
);

const tracked = 'https://speedrun-talent-network.com/jobs/account-executive-pylon-0aaf0a08?utm_source=jwerba-jobs&utm_medium=agent';
check(
  'canonical url strips tracking params',
  canonicalSpeedrunJobUrl(tracked) === 'https://speedrun-talent-network.com/jobs/account-executive-pylon-0aaf0a08',
  canonicalSpeedrunJobUrl(tracked),
);
check(
  'canonical url rejects off-host, http, and non-job paths',
  canonicalSpeedrunJobUrl('https://evil.example/jobs/x') === '' &&
    canonicalSpeedrunJobUrl('http://speedrun-talent-network.com/jobs/x') === '' &&
    canonicalSpeedrunJobUrl('https://speedrun-talent-network.com/companies/pylon') === '',
);
check(
  'www host collapses to the apex',
  canonicalSpeedrunJobUrl('https://www.speedrun-talent-network.com/jobs/x') === 'https://speedrun-talent-network.com/jobs/x',
);

const annual = speedrunSalary({ comp_min: 200000, comp_max: 300000, comp_currency: 'usd', comp_period: null });
check('annual salary is kept and uppercased', annual?.min === 200000 && annual?.max === 300000 && annual?.currency === 'USD', JSON.stringify(annual));
check('hourly salary is dropped', speedrunSalary({ comp_min: 40, comp_max: 60, comp_period: 'hour' }) === undefined);

const sample = {
  jobs: [
    {
      title: 'Enterprise Account Executive',
      company: 'Kong',
      url: 'https://speedrun-talent-network.com/jobs/enterprise-account-executive-kong-bd066ba0?utm_source=jwerba-jobs&utm_medium=agent',
      location: 'New York, United States',
      remote: true,
      comp_min: 320000,
      comp_max: 400000,
      comp_currency: 'USD',
      comp_period: null,
      published_at: '2026-09-30T22:35:28.265+00:00',
    },
    {
      title: '  Account Executive  ',
      company: '',
      url: 'https://www.speedrun-talent-network.com/jobs/account-executive-exa-e3e0cd05',
      location: 'New York City',
      workplace_type: 'OnSite',
      remote: false,
    },
    { title: '', company: 'Nope', url: 'https://speedrun-talent-network.com/jobs/empty' },
    { title: 'Off host', company: 'Nope', url: 'https://jobs.lever.co/acme/abc' },
    {
      title: 'Hourly',
      company: 'Hour Co',
      url: 'https://speedrun-talent-network.com/jobs/hourly-role',
      comp_min: 40,
      comp_max: 60,
      comp_period: 'hour',
      location: '',
      remote: true,
    },
  ],
};
const parsed = parseSpeedrunPage(sample, 'Speedrun AE');
check('parser keeps 3 jobs', parsed.length === 3, String(parsed.length));
check(
  'parser maps the first row and does not copy a description',
  parsed[0]?.title === 'Enterprise Account Executive' &&
    parsed[0]?.company === 'Kong' &&
    parsed[0]?.url === 'https://speedrun-talent-network.com/jobs/enterprise-account-executive-kong-bd066ba0' &&
    parsed[0]?.location === 'New York, United States, Remote' &&
    parsed[0]?.salary?.min === 320000 &&
    parsed[0]?.salary?.max === 400000 &&
    parsed[0]?.postedAt === Date.parse('2026-09-30T22:35:28.265+00:00') &&
    !('description' in parsed[0]),
  JSON.stringify(parsed[0]),
);
check(
  'parser falls back to the portal name',
  parsed[1]?.company === 'Speedrun AE' &&
    parsed[1]?.url === 'https://speedrun-talent-network.com/jobs/account-executive-exa-e3e0cd05' &&
    parsed[1]?.location === 'New York City' &&
    !parsed[1]?.salary,
  JSON.stringify(parsed[1]),
);
check(
  'remote with no city becomes Remote and hourly pay is omitted',
  parsed[2]?.location === 'Remote' && !parsed[2]?.salary,
  JSON.stringify(parsed[2]),
);
check('bad payloads yield []', parseSpeedrunPage(null).length === 0 && parseSpeedrunPage({ jobs: 'nope' }).length === 0);

const fullPage = {
  jobs: Array.from({ length: 50 }, (_, i) => ({
    title: `AE ${i}`,
    company: 'Co',
    url: `https://speedrun-talent-network.com/jobs/ae-${i}`,
    location: 'NYC',
  })),
  total_pages: 2,
};
const lastPage = {
  jobs: [{ title: 'Last AE', company: 'Co', url: 'https://speedrun-talent-network.com/jobs/ae-last', location: 'NYC' }],
  total_pages: 2,
};
const requested = [];
const fetched = await speedrun.fetch(
  { name: 'Speedrun AE', provider: 'speedrun' },
  { fetchJson: async (url, opts) => { requested.push({ url, opts }); return requested.length === 1 ? fullPage : lastPage; } },
);
check(
  'fetch pages 0 then 1 and stops at total_pages',
  requested.length === 2 && requested[0].url === speedrunFeedUrl(0) && requested[1].url === speedrunFeedUrl(1),
  JSON.stringify(requested.map(r => r.url)),
);
check('fetch passes redirect:error', requested.every(r => r.opts && r.opts.redirect === 'error'));
check('fetch returns both pages', fetched.length === 51 && fetched[0].company === 'Co' && fetched[50].title === 'Last AE', String(fetched.length));

const capped = [];
await speedrun.fetch(
  { name: 'Speedrun AE', provider: 'speedrun', max_pages: 1 },
  { fetchJson: async (url, opts) => { capped.push({ url, opts }); return fullPage; } },
);
check('fetch honours max_pages', capped.length === 1, String(capped.length));

let threw = false;
try {
  await speedrun.fetch({ name: 'Speedrun AE', provider: 'speedrun' }, { fetchJson: async () => ({ nope: true }) });
} catch (err) {
  threw = /unexpected API response/.test(err.message);
}
check('fetch throws on a bad payload', threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
