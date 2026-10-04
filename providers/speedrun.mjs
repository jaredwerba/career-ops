// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Speedrun talent network — a16z's public jobs index
// (https://speedrun-talent-network.com/api/v1/jobs). Read-only, no key.
// This provider asks for account-executive sales roles across the portfolio
// and the wider market (`scope=everywhere`), newest first.
//
// Listings stay on their site: the stored URL is the canonical /jobs/ path
// with query strings stripped. Descriptions are not copied.
//
// Wire in via a `job_boards:` entry with `provider: speedrun`.
// Paginated 50/page. `max_pages` defaults to 6 (300 roles) and caps at 20.

const API_ORIGIN = 'https://speedrun-talent-network.com';
const TRUSTED_HOSTS = new Set(['speedrun-talent-network.com', 'www.speedrun-talent-network.com']);
const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 6;
const MAX_PAGES_CAP = 20;
const SOURCE = 'jwerba-jobs';

/** @param {string} url */
function assertSpeedrunUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`speedrun: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`speedrun: URL must use HTTPS: ${url}`);
  if (!TRUSTED_HOSTS.has(parsed.hostname)) {
    throw new Error(`speedrun: untrusted hostname "${parsed.hostname}" — must be speedrun-talent-network.com`);
  }
  return url;
}

/** @param {number} page 0-based */
export function speedrunFeedUrl(page) {
  const url = new URL('/api/v1/jobs', API_ORIGIN);
  url.searchParams.set('q', 'account executive');
  url.searchParams.set('fn', 'sales');
  url.searchParams.set('scope', 'everywhere');
  url.searchParams.set('sort', 'new');
  url.searchParams.set('source', SOURCE);
  url.searchParams.set('page', String(page));
  return url.href;
}

/** Resolve the page cap: a positive integer `max_pages` on the entry, capped. */
function resolveMaxPages(entry) {
  const v = entry?.max_pages;
  if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP);
  return DEFAULT_MAX_PAGES;
}

/**
 * Canonical job URL. Drops tracking query params so the dedup key stays stable.
 * Anything that is not an https listing on their host is rejected.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalSpeedrunJobUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:') return '';
  if (!TRUSTED_HOSTS.has(parsed.hostname.toLowerCase())) return '';
  if (!parsed.pathname.startsWith('/jobs/')) return '';
  parsed.hostname = 'speedrun-talent-network.com';
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

/**
 * Annual posted band only. Hourly/monthly bands are display-only on their
 * side and are omitted here so the scanner's salary filter stays annual.
 * @param {any} job
 * @returns {{ min: number, max: number, currency: string } | undefined}
 */
export function speedrunSalary(job) {
  if (!job || typeof job !== 'object') return undefined;
  if (job.comp_period != null && job.comp_period !== 'year') return undefined;
  const num = (v) => {
    const n = typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const min = num(job.comp_min);
  const max = num(job.comp_max);
  if (min == null && max == null) return undefined;
  const lo = /** @type {number} */ (min ?? max);
  const hi = /** @type {number} */ (max ?? min);
  const currency = typeof job.comp_currency === 'string' && job.comp_currency.trim()
    ? job.comp_currency.trim().toUpperCase()
    : 'USD';
  return { min: Math.min(lo, hi), max: Math.max(lo, hi), currency };
}

/**
 * @param {any} job
 * @returns {string}
 */
function locationOf(job) {
  const loc = typeof job.location === 'string' ? job.location.trim() : '';
  const workplace = typeof job.workplace_type === 'string' ? job.workplace_type.toLowerCase() : '';
  const remote = job.remote === true || workplace === 'remote';
  if (remote && loc && !/remote/i.test(loc)) return `${loc}, Remote`;
  if (remote && !loc) return 'Remote';
  return loc;
}

/**
 * Normalize one page of the speedrun jobs search. Exported for unit tests.
 *
 * @param {any} json
 * @param {string} [fallbackCompany]
 * @returns {Array<{ title: string, url: string, company: string, location: string, postedAt?: number, salary?: { min: number, max: number, currency: string } }>}
 */
export function parseSpeedrunPage(json, fallbackCompany = 'Speedrun') {
  if (!json || !Array.isArray(json.jobs)) return [];
  const out = [];
  for (const job of json.jobs) {
    if (!job || typeof job !== 'object') continue;
    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const url = canonicalSpeedrunJobUrl(job.url);
    if (!title || !url) continue;
    const company = typeof job.company === 'string' && job.company.trim()
      ? job.company.trim()
      : fallbackCompany;
    /** @type {{ title: string, url: string, company: string, location: string, postedAt?: number, salary?: { min: number, max: number, currency: string } }} */
    const row = { title, url, company, location: locationOf(job) };
    if (typeof job.published_at === 'string' && job.published_at.trim()) {
      const postedAt = Date.parse(job.published_at);
      if (!Number.isNaN(postedAt)) row.postedAt = postedAt;
    }
    const salary = speedrunSalary(job);
    if (salary) row.salary = salary;
    out.push(row);
  }
  return out;
}

/** @type {Provider} */
export default {
  id: 'speedrun',

  detect(entry) {
    return entry?.provider === 'speedrun' ? { url: speedrunFeedUrl(0) } : null;
  },

  /**
   * @param {{ name?: string, max_pages?: number }} entry
   * @param {{ fetchJson: (url: string, opts?: { redirect?: 'error'|'follow'|'manual' }) => Promise<any> }} ctx
   */
  async fetch(entry, ctx) {
    const maxPages = resolveMaxPages(entry);
    const fallback = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Speedrun';
    /** @type {ReturnType<typeof parseSpeedrunPage>} */
    const out = [];
    const seen = new Set();

    for (let page = 0; page < maxPages; page++) {
      const url = assertSpeedrunUrl(speedrunFeedUrl(page));
      const json = await ctx.fetchJson(url, { redirect: 'error' });
      if (!json || !Array.isArray(json.jobs)) {
        throw new Error(
          `speedrun: unexpected API response on page ${page} — expected { jobs: [...] }, got keys: [${json ? Object.keys(json).join(', ') : 'null'}]`,
        );
      }
      for (const row of parseSpeedrunPage(json, fallback)) {
        if (seen.has(row.url)) continue;
        seen.add(row.url);
        out.push(row);
      }
      const totalPages = Number(json.total_pages);
      if (Number.isInteger(totalPages) && totalPages >= 0 && page + 1 >= totalPages) break;
      if (json.jobs.length < PAGE_SIZE) break;
    }
    return out;
  },
};
