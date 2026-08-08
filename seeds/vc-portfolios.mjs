// @ts-check
/**
 * seeds/vc-portfolios.mjs — VC portfolio seed fetchers for career-ops.
 *
 * Pulls public VC portfolio company lists (Y Combinator, Andreessen Horowitz)
 * and emits company entries compatible with the existing ATS scan/discovery
 * path (same shape as tracked_companies entries in portals.yml).
 *
 * Design constraints:
 *  - Zero auth — public sources only, no login, no API keys.
 *  - Zero LLM tokens — pure HTTP + JSON / HTML.
 *  - Same SLUG_RE guard used by scan-ats-full.mjs for every slug that reaches
 *    URL interpolation — a tampered or malformed payload can never inject
 *    unexpected characters into a URL.
 *  - `parseSeedEntries()` is a pure, synchronous function (no network) so it
 *    can be unit-tested with inline fixtures without any mocking.
 *
 * Typical usage (via scan-ats-full.mjs --seeds flag):
 *   node scan-ats-full.mjs --seeds yc
 *   node scan-ats-full.mjs --seeds yc,a16z --since 7 --dry-run
 *
 * Direct usage:
 *   import { fetchYCCompanies, fetchA16zCompanies } from './seeds/vc-portfolios.mjs';
 *   const companies = await fetchYCCompanies();
 */

// ── Constants ────────────────────────────────────────────────────────

/**
 * Safe charset for slug values that will be interpolated into ATS URLs.
 * Consistent with the SLUG_RE guard in scan-ats-full.mjs.
 */
export const SLUG_RE = /^[A-Za-z0-9._-]+$/;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; career-ops-seeds/1.0)';

/**
 * YC public company API.
 * Returns paginated JSON with company objects including name, slug, website.
 * Documentation: https://www.ycombinator.com/companies (public, no auth needed).
 */
const YC_API_URL = 'https://api.ycombinator.com/v0.1/companies?page=1&per_page=1000';

/**
 * a16z public portfolio page.
 * The portfolio is a publicly accessible HTML page listing all portfolio companies.
 */
const A16Z_PORTFOLIO_URL = 'https://a16z.com/portfolio/';

// ── HTTP helper (local — avoids importing providers/_http.mjs to keep seeds/ self-contained) ──

/**
 * Minimal fetch wrapper with timeout + user-agent header.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': DEFAULT_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      const snippet = await res.text().catch(() => '').then(t => t.slice(0, 200));
      throw new Error(`HTTP ${res.status}${snippet ? ': ' + snippet.replace(/\s+/g, ' ').trim() : ''}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Shared types (JSDoc only — no runtime cost) ──────────────────────

/**
 * A single VC-portfolio company entry — the output unit of both seed fetchers.
 *
 * @typedef {object} SeedCompany
 * @property {string}   name            Display name, e.g. "Stripe".
 * @property {string}   slug            URL-safe slug, validated against SLUG_RE.
 * @property {string}   url             Company website URL.
 * @property {string}   [ats]           ATS platform if detectable: 'greenhouse' | 'lever' | 'ashby'.
 * @property {string}   [ats_id]        ATS board/org slug for URL construction.
 * @property {string}   [source]        Which VC list this came from: 'yc' | 'a16z'.
 * @property {string}   [batch]         YC batch label, e.g. "W21" (YC only).
 */

/**
 * A PortalEntry-compatible object ready to be passed to ATS provider.detect().
 * Shape matches the PortalEntry typedef in providers/_types.js.
 *
 * @typedef {object} SeedPortalEntry
 * @property {string} name
 * @property {string} careers_url   Best-effort ATS or website URL.
 * @property {string} [source]      Seed origin ('yc' | 'a16z').
 */

// ── Pure parser: YC ──────────────────────────────────────────────────

/**
 * Parse a raw YC API response payload into SeedCompany entries.
 *
 * This is the testable unit — pure, no network, no side effects.
 * The YC API returns a paginated JSON object:
 *   { companies: [{ id, name, slug, website, batch, ... }], ... }
 *
 * @param {unknown} payload   Parsed JSON from the YC API (or a fixture in tests).
 * @returns {SeedCompany[]}
 */
export function parseYCPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const raw = /** @type {any} */ (payload);
  const list = Array.isArray(raw.companies) ? raw.companies : (Array.isArray(raw) ? raw : []);
  /** @type {Map<string, SeedCompany>} */
  const seen = new Map();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;

    // Prefer explicit slug; derive from name as fallback.
    const rawSlug = typeof item.slug === 'string' ? item.slug.trim()
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!rawSlug || !SLUG_RE.test(rawSlug)) continue;

    // Deduplicate by slug.
    if (seen.has(rawSlug)) continue;

    const url = typeof item.website === 'string' && item.website.startsWith('http')
      ? item.website.trim()
      : (typeof item.url === 'string' && item.url.startsWith('http') ? item.url.trim() : '');

    /** @type {SeedCompany} */
    const entry = {
      name,
      slug: rawSlug,
      url,
      source: 'yc',
    };

    if (typeof item.batch === 'string' && item.batch.trim()) {
      entry.batch = item.batch.trim();
    }

    seen.set(rawSlug, entry);
  }

  return [...seen.values()];
}

// ── Pure parser: a16z ────────────────────────────────────────────────

/**
 * Parse raw a16z portfolio HTML into SeedCompany entries.
 *
 * This is the testable unit — pure, no network, no side effects.
 * The a16z portfolio page lists companies in anchor tags with data attributes.
 * We extract company names and URLs from the HTML without a full DOM parser —
 * matching patterns like:
 *   <a ... href="https://company.com" ... data-company-name="Stripe" ...>
 *   or <h3 class="...">Stripe</h3> adjacent to a link
 *
 * Strategy: look for JSON-LD structured data first (most reliable), then
 * fall back to pattern-matching anchor/heading text.
 *
 * @param {string} html    Raw HTML from the a16z portfolio page (or a fixture in tests).
 * @returns {SeedCompany[]}
 */
export function parseA16zPayload(html) {
  if (typeof html !== 'string' || !html.trim()) return [];

  /** @type {Map<string, SeedCompany>} */
  const seen = new Map();

  // Strategy 1: JSON-LD embedded in the page (structured data block).
  // a16z sometimes embeds schema.org/Organization blocks — extract if present.
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.['@type'] === 'Organization' || item?.['@type'] === 'Corporation') {
          const name = typeof item.name === 'string' ? item.name.trim() : '';
          const url = typeof item.url === 'string' ? item.url.trim() : '';
          if (!name) continue;
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          if (!slug || !SLUG_RE.test(slug) || seen.has(slug)) continue;
          seen.set(slug, { name, slug, url, source: 'a16z' });
        }
      }
    } catch {
      // Malformed JSON-LD — skip silently.
    }
  }

  // Strategy 2: data-company-name attributes (a16z uses React-rendered data attrs).
  // Pattern: data-company-name="Stripe" (optionally with data-company-url)
  const dataAttrRe = /data-company-name=["']([^"']+)["'](?:[^>]*data-company-url=["']([^"']+)["'])?/gi;
  for (const match of html.matchAll(dataAttrRe)) {
    const name = match[1]?.trim();
    const url = match[2]?.trim() || '';
    if (!name) continue;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || !SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.set(slug, { name, slug, url, source: 'a16z' });
  }

  // Strategy 3: Portfolio card anchors / heading text fallback.
  // Matches patterns like: <a href="https://stripe.com" class="...portfolio...">Stripe</a>
  // or company names in h3/h4 elements within portfolio sections.
  const portfolioAnchorRe = /<a\s+[^>]*href=["'](https?:\/\/[^"'?\s]+)["'][^>]*class=["'][^"']*(?:portfolio|company|card)[^"']*["'][^>]*>\s*([A-Z][^<]{1,60}?)\s*<\/a>/gi;
  for (const match of html.matchAll(portfolioAnchorRe)) {
    const url = match[1]?.trim();
    const name = match[2]?.trim().replace(/\s+/g, ' ');
    if (!name || !url) continue;
    // Filter out nav/generic link text.
    if (/^(read more|learn more|visit|see all|view|more|news|blog|press|contact)/i.test(name)) continue;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || !SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.set(slug, { name, slug, url, source: 'a16z' });
  }

  return [...seen.values()];
}

// ── Generic pure parser (entry point for test-all.mjs) ───────────────

/**
 * Parse a raw seed payload (either YC JSON or a16z HTML) into validated
 * SeedCompany entries. This is the universal testable unit cited in the
 * issue acceptance criteria.
 *
 * @param {unknown} payload     JSON object (YC) or HTML string (a16z).
 * @param {'yc'|'a16z'} source  Which VC portfolio this payload came from.
 * @returns {SeedCompany[]}
 */
export function parseSeedEntries(payload, source) {
  if (source === 'a16z') {
    return parseA16zPayload(typeof payload === 'string' ? payload : '');
  }
  // Default: YC (also used for unknown sources — parse defensively).
  return parseYCPayload(payload);
}

// ── toPortalEntry converter ──────────────────────────────────────────

/**
 * Convert a SeedCompany into a PortalEntry-shaped object that ATS provider
 * detect() can consume directly.
 *
 * Resolution order for careers_url:
 *  1. If `company.ats === 'greenhouse'` and `company.ats_id` is set → Greenhouse board URL.
 *  2. If `company.ats === 'lever'` and `company.ats_id` is set → Lever URL.
 *  3. If `company.ats === 'ashby'` and `company.ats_id` is set → Ashby URL.
 *  4. Derive from slug: try Greenhouse, Lever, Ashby URLs (provider.detect() will
 *     validate at scan time; if none match, the entry is skipped with a warning).
 *  5. Fallback: company website URL (the ATS may be on a custom subdomain).
 *
 * @param {SeedCompany} company
 * @returns {SeedPortalEntry}
 */
export function toPortalEntry(company) {
  let careers_url = '';

  // Explicit ATS hint from the YC dataset.
  const atsId = company.ats_id && SLUG_RE.test(company.ats_id) ? company.ats_id : null;
  if (atsId) {
    if (company.ats === 'greenhouse') {
      careers_url = `https://job-boards.greenhouse.io/${atsId}`;
    } else if (company.ats === 'lever') {
      careers_url = `https://jobs.lever.co/${atsId}`;
    } else if (company.ats === 'ashby') {
      careers_url = `https://jobs.ashbyhq.com/${atsId}`;
    } else if (company.ats === 'smartrecruiters') {
      // Region seeds (seeds/regions.mjs) may pin a SmartRecruiters board; the
      // smartrecruiters provider detects this careers-host URL directly.
      careers_url = `https://careers.smartrecruiters.com/${atsId}`;
    }
  }

  // No explicit ATS: try Greenhouse by slug (most common for YC companies), then
  // Lever, then Ashby — provider.detect() will confirm or skip at scan time.
  if (!careers_url && company.slug && SLUG_RE.test(company.slug)) {
    // Use a format that greenhouse.mjs detect() can match.
    careers_url = `https://job-boards.greenhouse.io/${company.slug}`;
  }

  // Last resort: company website (ATS may auto-detect from the domain).
  if (!careers_url) {
    careers_url = company.url || '';
  }

  return {
    name: company.name,
    careers_url,
    source: company.source,
  };
}

/**
 * Like toPortalEntry(), but returns EVERY plausible PortalEntry candidate for
 * a company, in probe order. toPortalEntry()'s single greenhouse-by-slug guess
 * systematically misses companies on Ashby or Lever (most early-stage YC
 * companies use Ashby) — callers that can afford a fetch-probe per candidate
 * (scan-ats-full runSeedScan) should try these in order and keep the first
 * board that actually serves jobs.
 *
 * Explicit ats/ats_id hints still short-circuit to a single candidate.
 *
 * @param {SeedCompany} company
 * @returns {SeedPortalEntry[]}
 */
export function toPortalEntryCandidates(company) {
  const hinted = toPortalEntry(company);
  const atsId = company.ats_id && SLUG_RE.test(company.ats_id) ? company.ats_id : null;
  if (atsId && company.ats) return [hinted];

  const slug = company.slug && SLUG_RE.test(company.slug) ? company.slug : null;
  if (!slug) return hinted.careers_url ? [hinted] : [];

  const candidates = [
    `https://job-boards.greenhouse.io/${slug}`,
    `https://jobs.ashbyhq.com/${slug}`,
    `https://jobs.lever.co/${slug}`,
  ].map(careers_url => ({ name: company.name, careers_url, source: company.source }));
  // Slugs are usually hyphenated ("code-metal"); greenhouse/ashby tokens are
  // often the compact form — add compact variants when they differ.
  const compact = slug.replace(/-/g, '');
  if (compact !== slug && SLUG_RE.test(compact)) {
    candidates.push(
      { name: company.name, careers_url: `https://job-boards.greenhouse.io/${compact}`, source: company.source },
      { name: company.name, careers_url: `https://jobs.ashbyhq.com/${compact}`, source: company.source },
    );
  }
  if (company.url) candidates.push({ name: company.name, careers_url: company.url, source: company.source });
  return candidates;
}

// ── Network fetchers ─────────────────────────────────────────────────

/**
 * Fetch the Y Combinator public company list and return parsed SeedCompany entries.
 *
 * Uses the public YC API (no auth, no API key). The API IGNORES `per_page` and
 * always returns 25 companies per page with `totalPages` (~241) and `nextPage`
 * fields — the old "stop when a page has <1000" heuristic therefore terminated
 * after page 1 and silently returned 25 of ~6,000 companies. Pagination now
 * follows `totalPages`, newest batches first, up to `maxPages`.
 *
 * @param {{ timeoutMs?: number, maxPages?: number }} [opts]
 * @returns {Promise<SeedCompany[]>}
 */
export async function fetchYCCompanies({ timeoutMs = DEFAULT_TIMEOUT_MS, maxPages = 250 } = {}) {
  /** @type {SeedCompany[]} */
  const all = [];
  const seen = new Set();
  let totalPages = maxPages;

  for (let page = 1; page <= Math.min(maxPages, totalPages); page++) {
    const url = `https://api.ycombinator.com/v0.1/companies?page=${page}`;
    let payload;
    try {
      const res = await fetchWithTimeout(url, { timeoutMs });
      payload = await res.json();
    } catch (err) {
      if (page === 1) throw new Error(`vc-portfolios: YC API fetch failed — ${err.message}`);
      break; // Partial data is fine after page 1.
    }

    const raw = /** @type {any} */ (payload);
    if (Number.isFinite(raw?.totalPages) && raw.totalPages > 0) {
      totalPages = raw.totalPages;
    }

    const entries = parseYCPayload(payload);
    if (entries.length === 0) break; // No more pages.

    for (const e of entries) {
      if (!seen.has(e.slug)) {
        seen.add(e.slug);
        all.push(e);
      }
    }
  }

  return all;
}

/**
 * Fetch the a16z public portfolio page and return parsed SeedCompany entries.
 *
 * a16z does not expose a public JSON API, so we fetch the HTML portfolio page
 * and parse it with `parseA16zPayload()`.
 *
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<SeedCompany[]>}
 */
export async function fetchA16zCompanies({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let html;
  try {
    const res = await fetchWithTimeout(A16Z_PORTFOLIO_URL, { timeoutMs });
    html = await res.text();
  } catch (err) {
    throw new Error(`vc-portfolios: a16z portfolio fetch failed — ${err.message}`);
  }
  return parseA16zPayload(html);
}

// ── Enterprise/Boston VC portfolios (added 2026-08-07) ───────────────
//
// Five more portfolios whose companies skew enterprise-SaaS/infra — the
// selling profile this system targets. Every endpoint below was verified
// fetchable with plain HTTP (no JS rendering, no auth beyond public
// search-only keys) on 2026-08-07; each fetcher throws on failure so
// runSeedScan logs the miss instead of silently scanning nothing.
// Parsers are pure functions (string/JSON in, SeedCompany[] out) so they
// can be fixture-tested without network, like parseA16zPayload above.

/** Shared: derive a probe slug from a display name (same rule as a16z). */
function nameToSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Shared: minimal HTML entity decode for the entities these pages emit. */
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, '–')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

/** Shared: names → deduped SeedCompany[] (skips unslugables). */
function namesToSeedCompanies(names, source) {
  /** @type {Map<string, SeedCompany>} */
  const seen = new Map();
  for (const raw of names) {
    const name = decodeEntities(raw);
    if (!name || name.length < 2) continue;
    const slug = nameToSlug(name);
    if (!slug || !SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.set(slug, { name, slug, source });
  }
  return [...seen.values()];
}

/**
 * General Catalyst — Algolia search index (public search-only key, hardcoded
 * in their site bundle; if rotated, the current constants live in
 * assets.slater.app/slater/20127/60751.js).
 */
const GC_ALGOLIA_URL = 'https://ID4635ZLKJ-dsn.algolia.net/1/indexes/gc_primary/query';
const GC_ALGOLIA_HEADERS = {
  'X-Algolia-Application-Id': 'ID4635ZLKJ',
  'X-Algolia-API-Key': '871677f0423646c1278b67120f5adcc0',
  'content-type': 'application/json',
};

/** @param {any} json Algolia response */
export function parseGeneralCatalystPayload(json) {
  const hits = Array.isArray(json?.hits) ? json.hits : [];
  // Booleans on each hit allow status filtering — keep active holdings only.
  const names = hits
    .filter(h => h && typeof h.name === 'string' && !h.alumni && !h.acquired)
    .map(h => h.name);
  return namesToSeedCompanies(names, 'general-catalyst');
}

export async function fetchGeneralCatalystCompanies({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(GC_ALGOLIA_URL, {
      method: 'POST',
      headers: GC_ALGOLIA_HEADERS,
      body: JSON.stringify({ params: 'query=&hitsPerPage=1000&facetFilters=%5B%22type%3APortfolio%22%5D' }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseGeneralCatalystPayload(await res.json());
  } catch (err) {
    throw new Error(`vc-portfolios: general-catalyst fetch failed — ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Insight Partners — WP JSON endpoint, 12 rows/page. The response body is
 * DOUBLE-encoded JSON (a JSON string containing JSON) — decode twice.
 */
const INSIGHT_API = 'https://www.insightpartners.com/wp-json/insight/v1/get-companies';

/** @param {any} payload one decoded page ({max, rows}) */
export function parseInsightPage(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows.filter(r => r && typeof r.name === 'string').map(r => r.name);
}

export async function fetchInsightCompanies({ timeoutMs = DEFAULT_TIMEOUT_MS, maxPages = 80 } = {}) {
  const names = [];
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, maxPages); page++) {
    let payload;
    try {
      const res = await fetchWithTimeout(`${INSIGHT_API}?page=${page}`, { timeoutMs });
      let body = await res.text();
      payload = JSON.parse(body);
      if (typeof payload === 'string') payload = JSON.parse(payload); // double-encoded
    } catch (err) {
      if (page === 1) throw new Error(`vc-portfolios: insight fetch failed — ${err.message}`);
      break; // partial list beats none once we have pages
    }
    if (page === 1) {
      const max = Number(payload?.max);
      if (Number.isFinite(max) && max > 0) totalPages = Math.ceil(max / 12);
    }
    const pageNames = parseInsightPage(payload);
    if (!pageNames.length) break;
    names.push(...pageNames);
  }
  return namesToSeedCompanies(names, 'insight');
}

/**
 * Battery Ventures — server-rendered all-companies page. Entries ending in
 * " *" are exited investments (page footnote) and are dropped.
 */
const BATTERY_URL = 'https://www.battery.com/list-of-all-companies/';

/** @param {string} html */
export function parseBatteryHtml(html) {
  const names = [];
  for (const m of String(html).matchAll(/<p><span style="font-weight: 400;">([^<]+)<\/span><\/p>/g)) {
    let name = decodeEntities(m[1]);
    if (/\*\s*$/.test(name)) continue; // exited investment
    // Prefer the operating name; strip tickers and legal suffixes.
    const dba = name.match(/\(dba ([^)]+)\)/i);
    if (dba) name = dba[1].trim();
    name = name.replace(/\((?:NASDAQ|NYSE|LSE|TSX|ASX)[^)]*\)/gi, '')
      .replace(/,?\s+(Inc\.?|LLC|Ltd\.?|GmbH|AB|B\.V\.|LP|Corp\.?|Co\.)$/i, '')
      .trim();
    if (name) names.push(name);
  }
  return namesToSeedCompanies(names, 'battery');
}

export async function fetchBatteryCompanies({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const res = await fetchWithTimeout(BATTERY_URL, { timeoutMs });
    return parseBatteryHtml(await res.text());
  } catch (err) {
    throw new Error(`vc-portfolios: battery fetch failed — ${err.message}`);
  }
}

/** Bessemer Venture Partners — server-rendered companies page (~1.5MB). */
const BVP_URL = 'https://www.bvp.com/companies';

/** @param {string} html */
export function parseBessemerHtml(html) {
  const names = [];
  for (const m of String(html).matchAll(/<a href="https:\/\/www\.bvp\.com\/companies\/[^"]+" class="name click-to-open">([^<]+)<\/a>/g)) {
    names.push(m[1]);
  }
  return namesToSeedCompanies(names, 'bessemer');
}

export async function fetchBessemerCompanies({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const res = await fetchWithTimeout(BVP_URL, { timeoutMs });
    return parseBessemerHtml(await res.text());
  } catch (err) {
    throw new Error(`vc-portfolios: bessemer fetch failed — ${err.message}`);
  }
}

/**
 * Sequoia Capital — server-rendered FacetWP pagination (?_paged=N, 52/page).
 * total_pages is read from the embedded FWP_JSON in page 1.
 */
const SEQUOIA_URL = 'https://www.sequoiacap.com/our-companies/';

/** @param {string} html one page */
export function parseSequoiaHtml(html) {
  const names = [];
  for (const m of String(html).matchAll(/company-listing__head"[^>]*>(.*?)<\//g)) {
    const name = decodeEntities(m[1].replace(/<[^>]+>/g, ''));
    if (name) names.push(name);
  }
  return names;
}

export async function fetchSequoiaCompanies({ timeoutMs = DEFAULT_TIMEOUT_MS, maxPages = 20 } = {}) {
  const names = [];
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, maxPages); page++) {
    let html;
    try {
      const res = await fetchWithTimeout(`${SEQUOIA_URL}?_paged=${page}`, { timeoutMs });
      html = await res.text();
    } catch (err) {
      if (page === 1) throw new Error(`vc-portfolios: sequoia fetch failed — ${err.message}`);
      break;
    }
    if (page === 1) {
      const tp = html.match(/"total_pages"\s*:\s*(\d+)/);
      if (tp) totalPages = Number(tp[1]);
    }
    const pageNames = parseSequoiaHtml(html);
    if (!pageNames.length) break;
    names.push(...pageNames);
  }
  return namesToSeedCompanies(names, 'sequoia');
}

// ── SEED_SOURCES registry ────────────────────────────────────────────

/**
 * Registry mapping seed source names to their fetch functions.
 * Consumed by scan-ats-full.mjs --seeds flag and CLI tooling.
 *
 * To add a new VC portfolio:
 *  1. Add a fetchXyzCompanies() function above.
 *  2. Add an entry here: { fetch: fetchXyzCompanies, label: 'XYZ Portfolio' }
 *
 * @type {Record<string, { fetch: (opts?: object) => Promise<SeedCompany[]>, label: string }>}
 */
export const SEED_SOURCES = {
  yc: {
    fetch: fetchYCCompanies,
    label: 'Y Combinator Portfolio',
  },
  a16z: {
    fetch: fetchA16zCompanies,
    label: 'Andreessen Horowitz (a16z) Portfolio',
  },
  gc: {
    fetch: fetchGeneralCatalystCompanies,
    label: 'General Catalyst Portfolio',
  },
  insight: {
    fetch: fetchInsightCompanies,
    label: 'Insight Partners Portfolio',
  },
  battery: {
    fetch: fetchBatteryCompanies,
    label: 'Battery Ventures Portfolio',
  },
  bessemer: {
    fetch: fetchBessemerCompanies,
    label: 'Bessemer Venture Partners Portfolio',
  },
  sequoia: {
    fetch: fetchSequoiaCompanies,
    label: 'Sequoia Capital Portfolio',
  },
};
