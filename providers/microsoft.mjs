// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Microsoft provider — Microsoft's careers site is Eightfold-backed and its
// real search endpoint is apply.careers.microsoft.com/api/pcsx/search.
//
// Two earlier dead ends, recorded so nobody re-walks them:
//   * gcsservices.careers.microsoft.com — resolves, but the TLS cert only covers
//     *.azureedge.net and the WAF resets non-browser clients. Unusable.
//   * jobs.careers.microsoft.com/api/apply/v2/... — the standard Eightfold path
//     returns the SPA's HTML, not JSON.
// The pcsx endpoint was found by watching the real page's own XHRs, and it
// serves plain JSON to an ordinary fetch. No token, no browser required.
//
// Response: { status, error, data: { positions: [...], count } }
//
// Configure with:
//   - name: Microsoft
//     provider: microsoft
//     queries: ["account executive", "solution area specialist"]  # optional
//     location: "Boston"                                          # optional

const API = 'https://apply.careers.microsoft.com/api/pcsx/search';
const TRUSTED_HOST = 'apply.careers.microsoft.com';
const JOB_BASE = 'https://jobs.careers.microsoft.com';
const PAGE = 10;         // server returns 10 max regardless of `num`
const MAX_PAGES = 12;    // per query — 120 results is plenty per term
// Microsoft does not use "AE" as a title convention across the board; these are
// the terms its sales org actually posts under.
const DEFAULT_QUERIES = [
  'account executive', 'solution area specialist', 'account manager',
  'technical specialist', 'sales', 'customer success account manager',
];

function assertMsUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`microsoft: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`microsoft: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) throw new Error(`microsoft: untrusted hostname "${parsed.hostname}"`);
  return url;
}

/** @param {any} p a pcsx position */
export function normalizeMsJob(p, companyName) {
  const title = typeof p?.name === 'string' ? p.name.trim() : '';
  if (!title) return null;
  const id = p.id ?? p.displayJobId;
  const rel = typeof p?.positionUrl === 'string' ? p.positionUrl : '';
  const url = rel
    ? (rel.startsWith('http') ? rel : JOB_BASE + (rel.startsWith('/') ? rel : '/' + rel))
    : (id ? `${JOB_BASE}/careers/job/${id}` : '');
  if (!url) return null;
  // postedTs is epoch SECONDS. Passing it through unscaled dates every job to
  // 1970 and silently breaks the freshness filter — scale it here.
  const ts = Number(p?.postedTs);
  const postedAt = Number.isFinite(ts) && ts > 0
    ? (ts < 1e12 ? ts * 1000 : ts)
    : undefined;
  return {
    title,
    url,
    company: companyName || 'Microsoft',
    location: Array.isArray(p?.locations) ? p.locations.join('; ') : (p?.locations || ''),
    postedAt,
  };
}

export default {
  id: 'microsoft',

  detect(entry) {
    const raw = String(entry?.careers_url || entry?.api || '');
    if (!raw) return null;
    let host;
    try { host = new URL(raw).hostname.toLowerCase(); } catch { return null; }
    return host === 'careers.microsoft.com' || host.endsWith('.careers.microsoft.com')
      ? { url: API } : null;
  },

  /**
   * @param {{ name?: string, queries?: string[], location?: string }} entry
   * @param {{ fetchJson: (url: string, opts?: object) => Promise<any> }} ctx
   */
  async fetch(entry, ctx) {
    const queries = Array.isArray(entry.queries) && entry.queries.length ? entry.queries : DEFAULT_QUERIES;
    const location = entry.location || '';
    const seen = new Set();
    const out = [];

    for (const query of queries) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${API}?domain=microsoft.com&query=${encodeURIComponent(query)}`
          + `&location=${encodeURIComponent(location)}&start=${page * PAGE}&num=${PAGE}&sort_by=relevance`;
        assertMsUrl(url);
        let json;
        // A single failed term must not cost the whole company.
        try { json = await ctx.fetchJson(url, { redirect: 'error' }); } catch { break; }
        const positions = json?.data?.positions;
        if (!Array.isArray(positions) || positions.length === 0) break;
        for (const p of positions) {
          const job = normalizeMsJob(p, entry.name);
          if (!job || seen.has(job.url)) continue;   // terms overlap heavily
          seen.add(job.url);
          out.push(job);
        }
        if (positions.length < PAGE) break;
      }
    }
    return out;
  },
};
