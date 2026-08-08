// fit-score.mjs — one fit-scoring model, shared by shortlist.mjs (ranked CLI
// output) and build-web-dashboard.mjs (Score column + super-signal highlight).
//
// Extracted from shortlist.mjs so the dashboard can't drift from the shortlist:
// a role that ranks #1 in the terminal must glow on the board too. Weights
// reflect the candidate's record — enterprise cloud/infra AE and the combined
// AE + solutions-engineer motion — and live here, not in either caller.

// ── role archetypes ──────────────────────────────────────────────────────────
export const ROLE_SCORES = [
  // exec(utive)? — ATS titles routinely abbreviate ("Enterprise Account Exec"
  // at ServiceNow, 46 rows). Without the optional group those score null and
  // vanish from every ranked view.
  [/\b(strategic|enterprise|major|named)\s+account\s+(exec(utive)?|director)\b/i, 10],
  [/\baccount\s+exec(utive)?\b/i, 8],
  [/\b(solutions?|sales)\s+engineer/i, 8],
  [/\bsolutions?\s+architect/i, 8],
  // "Sales Executive"/"Sales Director" family (Datadog "Enterprise Sales
  // Executive" — Boston) — a distinct naming convention, same seat.
  [/\b(enterprise|solution|field|strategic|territory)\s+sales\s+(executive|director)\b/i, 8],
  [/\btechnical\s+account\s+manager/i, 7],
  // GTM wave at AI companies: GTM Engineer / Head of GTM / AI GTM Lead.
  [/\b(gtm|go[- ]to[- ]market)\b/i, 7],
  [/\b(regional|district)\s+sales\s+(director|manager)/i, 6],
  [/\bclient\s+executive/i, 6],
  [/\baccount\s+manager/i, 5],
  [/\b(partner|alliance|channel)\s+(manager|account)/i, 5],
  [/\bbusiness\s+development\s+(manager|director|executive)/i, 4],
];

// Seniority reads as a better match for a Senior Field AE with six years at
// 150%+ than a mid-market or entry seat does.
export const SENIORITY = [[/\b(senior|sr\.?|principal|strategic|lead)\b/i, 3], [/\b(vp|vice president|head of)\b/i, 2]];

// Hard disqualifiers — real blockers, not preferences.
export const BLOCKERS = [
  [/\bfederal\b|\bfed\b|\bgovcon\b|clearance|\bsled\b|state\s*&?\s*local|public sector/i, 'federal/public-sector'],
  [/\b(latam|emea|apac|brazil|india|uk|netherlands|europe)\b/i, 'non-US region'],
  [/\bintern\b|\bsdr\b|\bbdr\b|development representative/i, 'junior/SDR'],
];

// Vertical-sales noise: sales titles at companies that are not tech vendors.
export const VERTICAL_NOISE = /insurance|underwrit|pharma|oncology|nutrition|medical device|spatial biology|foodservice|merchant services|media|advertising|paid advertis|multi-media|career colleges|wound care|dental|residential/i;

// Geography — Boston-based, so local and US-remote seats rank above ones that
// require living in another territory.
export function geoScore(loc = '') {
  const l = loc.toLowerCase();
  if (/boston|massachusetts|\bma\b|cambridge|somerville|framingham/.test(l)) return 6;
  if (/remote/.test(l) && /(united states|usa|\bus\b|u\.s)/.test(l)) return 4;
  if (/anywhere in the world/.test(l)) return 2;
  if (/new york|northeast|east coast|\beast\b/.test(l)) return 3;
  if (/remote/.test(l)) return 2;
  return 0;
}

/**
 * Score one posting. Returns null when the title matches no role archetype —
 * i.e. it isn't a seat worth ranking at all (callers skip those).
 *
 * Ceiling is 23: role 10 + seniority 3 + geo 6 + tech 4.
 */
export function scoreJob({ title = '', location = '', company = '', tech = null, applied = null } = {}) {
  let score = 0, matchedRole = false;
  for (const [re, pts] of ROLE_SCORES) if (re.test(title)) { score += pts; matchedRole = true; break; }
  if (!matchedRole) return null;

  for (const [re, pts] of SENIORITY) if (re.test(title)) { score += pts; break; }

  const blockers = [];
  for (const [re, label] of BLOCKERS) if (re.test(title) || re.test(location)) blockers.push(label);
  score -= blockers.length * 6;

  score += geoScore(location);
  if (tech === 'Neocloud' || tech === 'AI-Native') score += 4;   // closest to the AI-infra story
  else if (tech === 'Hyperscaler') score += 3;
  else if (tech === 'Enterprise SW') score += 2;
  if (applied && applied.has((company || '').toLowerCase())) score -= 5;

  return { score, blockers };
}

// Display tiers. "Super signal" is deliberately narrow — if a third of the
// board glows, nothing does. Calibrated against the live pipeline so the top
// band stays a shortlist you could work through in one sitting.
export const TIERS = [
  { min: 18, key: 'super', label: 'Super signal' },
  { min: 14, key: 'strong', label: 'Strong' },
  { min: 10, key: 'ok', label: 'Worth a look' },
];

export function scoreTier(score) {
  if (score == null) return null;
  for (const t of TIERS) if (score >= t.min) return t.key;
  return null;
}
