// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Garmin careers provider — Garmin runs a Phenom-style search API in front of
// iCIMS at careers.garmin.com/api/jobs. It is not one of the standard ATS
// shapes, so it needs its own provider.
//
// Two quirks drive the design:
//   * `limit` caps at 100 and `offset`/`from` are ignored, so the full 300+ job
//     board cannot be paged through. Keyword queries CAN be filtered
//     server-side, so we issue one query per term and merge.
//   * `keywords=` is the working parameter (`q`, `search`, `keyword` are all
//     silently ignored and return the unfiltered board).
//
// Configure with:
//   - name: Garmin
//     provider: garmin
//     keywords: ["sales", "account executive"]   # optional; defaults below
//
// Titles are still filtered downstream by portals.yml title_filter — these
// keywords only decide what gets pulled from Garmin in the first place.

const API_URL = 'https://careers.garmin.com/api/jobs';
const PAGE_LIMIT = 100;                       // server caps here
const DEFAULT_KEYWORDS = ['sales', 'account executive', 'business development', 'partner', 'channel'];

/** Garmin returns "2026-07-29T15:45:00+0000" — normalize to epoch ms. */
export function toEpochMs(value) {
  if (!value) return undefined;
  // "+0000" without a colon is not valid ISO-8601 for every JS engine.
  const iso = String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

/** @param {any} d Garmin job `data` object */
export function normalizeJob(d, companyName) {
  const location = [d.city, d.state, d.country].filter(Boolean).join(', ') || d.location_name || '';
  return {
    title: d.title || '',
    // apply_url points at iCIMS; it's the only stable per-job link Garmin exposes.
    url: d.apply_url || (d.slug ? `https://careers.garmin.com/en-US/job/${d.slug}/` : ''),
    company: companyName || 'Garmin',
    location,
    postedAt: toEpochMs(d.posted_date),
  };
}

export default {
  id: 'garmin',

  detect(entry) {
    const raw = String(entry?.careers_url || entry?.api || '');
    if (!raw) return null;
    let host;
    try { host = new URL(raw).hostname.toLowerCase(); } catch { return null; }
    return host === 'careers.garmin.com' || host.endsWith('.garmin.com') ? { url: API_URL } : null;
  },

  /**
   * @param {{ name?: string, keywords?: string[] }} entry
   * @param {{ fetchJson: (url: string, opts?: object) => Promise<any> }} ctx
   */
  async fetch(entry, ctx) {
    const keywords = Array.isArray(entry.keywords) && entry.keywords.length ? entry.keywords : DEFAULT_KEYWORDS;
    const seen = new Set();
    const out = [];

    for (const kw of keywords) {
      const url = `${API_URL}?limit=${PAGE_LIMIT}&keywords=${encodeURIComponent(kw)}`;
      let json;
      // One dead keyword shouldn't lose the whole company.
      try {
        json = await ctx.fetchJson(url, { redirect: 'error' });
      } catch {
        continue;
      }
      for (const item of (json?.jobs || [])) {
        const d = item?.data;
        if (!d) continue;
        const key = d.slug || d.req_id || d.apply_url;
        if (!key || seen.has(key)) continue;   // same job matches several keywords
        seen.add(key);
        const job = normalizeJob(d, entry.name);
        if (job.url) out.push(job);
      }
    }
    return out;
  },
};
