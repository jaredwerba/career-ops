// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Apple provider — via The Muse's public, zero-auth syndication feed.
//
// Apple's own API (jobs.apple.com/api/role/search) returns 401 without a
// browser session token, and jobs.apple.com publishes no sitemap, so there is
// no direct zero-token route. Apple *does* syndicate its listings to The Muse,
// whose public API needs no key and supports a company filter — so that is the
// supported path here.
//
// Trade-off worth knowing: The Muse carries what Apple chooses to syndicate,
// not necessarily every req on jobs.apple.com. Treat this as good coverage of
// Apple's sales org rather than a guaranteed-complete mirror.
//
// Configure with:
//   - name: Apple
//     provider: apple
//     categories: ["Sales", "Account Management"]   # optional; defaults below

const FEED_BASE = 'https://www.themuse.com/api/public/jobs';
const TRUSTED_HOST = 'www.themuse.com';
const COMPANY = 'Apple';
// Unfiltered, Apple runs 270+ pages of mostly hardware/silicon engineering.
// These categories keep the pull to the GTM roles this system is for.
const DEFAULT_CATEGORIES = ['Sales', 'Account Management', 'Business & Strategy'];
const MAX_PAGES = 25; // per category; safety cap on pagination

function assertMuseUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`apple: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`apple: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) throw new Error(`apple: untrusted hostname "${parsed.hostname}"`);
  return url;
}

/** @param {any} j a Muse result */
export function normalizeAppleJob(j, companyName) {
  const title = typeof j?.name === 'string' ? j.name.trim() : '';
  const url = typeof j?.refs?.landing_page === 'string' ? j.refs.landing_page.trim() : '';
  if (!title || !url) return null;
  // Guard against the feed handing back a different company on a loose match.
  const co = j?.company?.name || '';
  if (co && !/apple/i.test(co)) return null;
  const posted = Date.parse(j?.publication_date || '');
  return {
    title,
    url,
    company: companyName || co || COMPANY,
    location: Array.isArray(j?.locations) && j.locations[0]?.name ? String(j.locations[0].name).trim() : '',
    // epoch ms, never a string — a string here silently classifies every job as
    // "keep" downstream (the bug already hit the SmartRecruiters provider).
    postedAt: Number.isFinite(posted) ? posted : undefined,
  };
}

export default {
  id: 'apple',

  detect(entry) {
    const raw = String(entry?.careers_url || entry?.api || '');
    if (!raw) return null;
    let host;
    try { host = new URL(raw).hostname.toLowerCase(); } catch { return null; }
    return host === 'jobs.apple.com' ? { url: FEED_BASE } : null;
  },

  /**
   * @param {{ name?: string, categories?: string[] }} entry
   * @param {{ fetchJson: (url: string, opts?: object) => Promise<any> }} ctx
   */
  async fetch(entry, ctx) {
    const categories = Array.isArray(entry.categories) && entry.categories.length ? entry.categories : DEFAULT_CATEGORIES;
    const seen = new Set();
    const out = [];

    for (const category of categories) {
      let pageCount = 1;
      for (let page = 0; page < Math.min(pageCount, MAX_PAGES); page++) {
        const url = `${FEED_BASE}?company=${encodeURIComponent(COMPANY)}&category=${encodeURIComponent(category)}&page=${page}&descending=true`;
        assertMuseUrl(url);
        let json;
        // One dead category shouldn't cost us the whole company.
        try { json = await ctx.fetchJson(url, { redirect: 'error' }); } catch { break; }
        if (!json || !Array.isArray(json.results)) break;
        if (page === 0 && Number.isInteger(json.page_count)) pageCount = json.page_count;
        for (const r of json.results) {
          const job = normalizeAppleJob(r, entry.name);
          if (!job || seen.has(job.url)) continue;   // a role can sit in two categories
          seen.add(job.url);
          out.push(job);
        }
      }
    }
    return out;
  },
};
