// @ts-check
/**
 * seeds/regions.mjs — metro-region company seeds for career-ops.
 *
 * Where seeds/vc-portfolios.mjs seeds the reverse ATS scan with VC portfolio
 * companies, this module seeds it with curated METRO-REGION company lists —
 * "scan every tech company in <city>" instead of "every company in <fund>".
 *
 * Each region ships as a static, probe-verified list: every entry's ATS board
 * was confirmed live against the provider's public JSON API (board exists AND
 * the board's own company name matches the entry) before inclusion. Static
 * data beats runtime directory scraping here — region membership changes
 * slowly, and a verified list produces zero false-positive boards.
 *
 * Design constraints (same as vc-portfolios.mjs):
 *  - Zero auth, zero LLM tokens.
 *  - SLUG_RE guard on every slug that reaches URL interpolation.
 *  - `parseRegionEntries()` is pure and synchronous for fixture-based tests.
 *
 * Typical usage (via scan-ats-full.mjs):
 *   node scan-ats-full.mjs --region boston                # region seed + metro location filter
 *   node scan-ats-full.mjs --seeds boston --since 7       # seed only, portals.yml location filter
 *
 * Extending a region without editing code: drop extra entries into
 * seeds/regions.local.json (gitignored), keyed by region id:
 *   { "boston": [{ "name": "Acme", "ats": "greenhouse", "ats_id": "acme" }] }
 *
 * Verifying the list stays fresh:
 *   node seeds/regions.mjs boston --probe
 */

import { existsSync, readFileSync, realpathSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Safe charset for slugs interpolated into ATS URLs (mirrors scan-ats-full.mjs). */
export const SLUG_RE = /^[A-Za-z0-9._-]+$/;

/** ATS platforms a region entry may declare. Must stay in sync with the
 *  `ats` branches in seeds/vc-portfolios.mjs `toPortalEntry()`. */
export const REGION_ATS = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);

const LOCAL_EXTRAS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'regions.local.json');

// ── Region data ──────────────────────────────────────────────────────

/**
 * Boston metro tech companies with live, identity-verified ATS boards (~170).
 * Last probe-verified: 2026-07-06 (board exists + board name matches company).
 * Sources: initial curated set + the mgmtboston.com "Boston Tech Big Board"
 * directory, each entry re-probed live against its ATS provider.
 *
 * Note for maintainers: companies on Workday or custom portals (e.g.
 * athenahealth, Rapid7, CyberArk, DraftKings, Wayfair's main board, PTC,
 * Pegasystems, Symbotic, iRobot, SharkNinja) are intentionally absent —
 * the scan-ats-full Workday directory walk already covers the ones with
 * public Workday sites, and unverifiable boards would only produce noise.
 * Big Board companies with no discoverable public JSON board, or whose only
 * candidate board failed the name-identity check (impostor-board guard), were
 * likewise left out rather than added blind.
 */
const BOSTON_COMPANIES = [
  { name: '7AI', ats: 'ashby', ats_id: 'sevenai' },
  { name: 'Acquia', ats: 'greenhouse', ats_id: 'acquia' },
  { name: 'AcuityMD', ats: 'greenhouse', ats_id: 'acuitymd' },
  { name: 'Agero', ats: 'greenhouse', ats_id: 'agero' },
  { name: 'AgZen', ats: 'ashby', ats_id: 'agzen' },
  { name: 'airSlate', ats: 'lever', ats_id: 'airslate' },
  { name: 'Akoya', ats: 'greenhouse', ats_id: 'akoya' },
  { name: 'Anthropic', ats: 'greenhouse', ats_id: 'anthropic' },
  { name: 'Arcadia', ats: 'lever', ats_id: 'arcadia' },
  { name: 'Arcee', ats: 'greenhouse', ats_id: 'arceeai' },
  { name: 'Assured Allies', ats: 'ashby', ats_id: 'assured' },
  { name: 'Aura', ats: 'greenhouse', ats_id: 'aura' },
  { name: 'Ayble Health', ats: 'ashby', ats_id: 'ayblehealth' },
  { name: 'Beacon Biosignals', ats: 'greenhouse', ats_id: 'beaconbiosignals' },
  { name: 'Beam Therapeutics', ats: 'greenhouse', ats_id: 'beamtherapeutics' },
  { name: 'Benchling', ats: 'ashby', ats_id: 'benchling' },
  { name: 'Bevi', ats: 'greenhouse', ats_id: 'bevicareers' },
  { name: 'Biofourmis', ats: 'greenhouse', ats_id: 'biofourmis' },
  { name: 'Black Duck Software', ats: 'greenhouse', ats_id: 'blackduck' },
  { name: 'Blitzy', ats: 'ashby', ats_id: 'blitzy' },
  { name: 'Bluebird Kids Health', ats: 'greenhouse', ats_id: 'bluebirdkidshealth' },
  { name: 'Bynder', ats: 'ashby', ats_id: 'bynder' },
  { name: 'Cambridge Mobile Telematics', ats: 'greenhouse', ats_id: 'cambridgemobiletelematics' },
  { name: 'CarGurus', ats: 'greenhouse', ats_id: 'cargurus' },
  { name: 'Cascala Health', ats: 'greenhouse', ats_id: 'cascalahealth' },
  { name: 'Catena Labs', ats: 'ashby', ats_id: 'catena' },
  { name: 'Cellarity', ats: 'greenhouse', ats_id: 'cellarity' },
  { name: 'CircuitHub', ats: 'ashby', ats_id: 'circuithub' },
  { name: 'Clasp', ats: 'ashby', ats_id: 'clasp' },
  { name: 'Cloaked', ats: 'ashby', ats_id: 'cloaked' },
  { name: 'Cloudflare', ats: 'greenhouse', ats_id: 'cloudflare' },
  { name: 'CloudZero', ats: 'ashby', ats_id: 'CloudZero' },
  { name: 'CodaMetrix', ats: 'ashby', ats_id: 'CodaMetrix' },
  { name: 'Code Metal', ats: 'ashby', ats_id: 'code-metal' },
  { name: 'Cohere Health', ats: 'greenhouse', ats_id: 'coherehealth' },
  { name: 'Conduit', ats: 'ashby', ats_id: 'conduit' },
  { name: 'Constant Contact', ats: 'greenhouse', ats_id: 'constantcontact' },
  { name: 'Corvus Robotics', ats: 'ashby', ats_id: 'corvus-robotics' },
  { name: 'Counsel Health', ats: 'ashby', ats_id: 'counsel' },
  { name: 'Cybereason', ats: 'greenhouse', ats_id: 'cybereason' },
  { name: 'CYVL', ats: 'ashby', ats_id: 'cyvl' },
  { name: 'Databricks', ats: 'greenhouse', ats_id: 'databricks' },
  { name: 'Datadog', ats: 'greenhouse', ats_id: 'datadog' },
  { name: 'Definitive Healthcare', ats: 'greenhouse', ats_id: 'definitivehc' },
  { name: 'Devoted Health', ats: 'smartrecruiters', ats_id: 'DevotedHealth' },
  { name: 'Duckbill', ats: 'ashby', ats_id: 'duckbill' },
  { name: 'Elastic', ats: 'greenhouse', ats_id: 'elastic' },
  { name: 'Electric Hydrogen', ats: 'greenhouse', ats_id: 'eh2' },
  { name: 'Eleos Health', ats: 'greenhouse', ats_id: 'eleoshealth' },
  { name: 'ElevateBio', ats: 'greenhouse', ats_id: 'elevatebio' },
  { name: 'Eliza', ats: 'ashby', ats_id: 'eliza' },
  { name: 'Ellevation Education', ats: 'lever', ats_id: 'ellevationeducation' },
  { name: 'Everbridge', ats: 'ashby', ats_id: 'everbridge' },
  { name: 'EverQuote', ats: 'greenhouse', ats_id: 'everquote' },
  { name: 'Eyebot', ats: 'ashby', ats_id: 'eyebot' },
  { name: 'ezCater', ats: 'greenhouse', ats_id: 'ezcaterinc' },
  { name: 'Factorial Energy', ats: 'greenhouse', ats_id: 'factorialenergy' },
  { name: 'Fairmarkit', ats: 'greenhouse', ats_id: 'fairmarkit' },
  { name: 'Folia Health', ats: 'greenhouse', ats_id: 'foliahealth' },
  { name: 'Form Energy', ats: 'ashby', ats_id: 'formenergy' },
  { name: 'Form Health', ats: 'greenhouse', ats_id: 'formhealth' },
  { name: 'Formlabs', ats: 'greenhouse', ats_id: 'formlabs' },
  { name: 'Generate:Biomedicines', ats: 'greenhouse', ats_id: 'generatebiomedicines' },
  { name: 'Ginkgo Bioworks', ats: 'greenhouse', ats_id: 'ginkgobioworks' },
  { name: 'Glimpse', ats: 'ashby', ats_id: 'glimpse' },
  { name: 'Gradient AI', ats: 'greenhouse', ats_id: 'gradientai' },
  { name: 'Hi Marley', ats: 'greenhouse', ats_id: 'himarley' },
  { name: 'Hometap', ats: 'greenhouse', ats_id: 'hometap' },
  { name: 'Hopper', ats: 'ashby', ats_id: 'hopper' },
  { name: 'HubSpot', ats: 'greenhouse', ats_id: 'hubspot' },
  { name: 'Immuta', ats: 'lever', ats_id: 'immuta' },
  { name: 'Insurify', ats: 'greenhouse', ats_id: 'insurify' },
  { name: 'InterSystems', ats: 'greenhouse', ats_id: 'intersystems' },
  { name: 'Jellyfish', ats: 'ashby', ats_id: 'jellyfish' },
  { name: 'Kayak', ats: 'greenhouse', ats_id: 'kayak' },
  { name: 'Ketryx', ats: 'greenhouse', ats_id: 'ketryx' },
  { name: 'Klaviyo', ats: 'greenhouse', ats_id: 'klaviyo' },
  { name: 'knownwell', ats: 'ashby', ats_id: 'knownwell' },
  { name: 'Labviva', ats: 'greenhouse', ats_id: 'labviva' },
  { name: 'Layer Health', ats: 'greenhouse', ats_id: 'layerhealth' },
  { name: 'Lendbuzz', ats: 'lever', ats_id: 'lendbuzz' },
  { name: 'Lightmatter', ats: 'greenhouse', ats_id: 'lightmatter' },
  { name: 'Lila Sciences', ats: 'greenhouse', ats_id: 'lilasciences' },
  { name: 'LinkSquares', ats: 'greenhouse', ats_id: 'linksquaresinc' },
  { name: 'Liquid AI', ats: 'ashby', ats_id: 'liquid-ai' },
  { name: 'Litmus', ats: 'ashby', ats_id: 'litmus' },
  { name: 'Locus Robotics', ats: 'greenhouse', ats_id: 'locusrobotics' },
  { name: 'LogRocket', ats: 'lever', ats_id: 'logrocket' },
  { name: 'Lovable', ats: 'greenhouse', ats_id: 'lovable' },
  { name: 'Lumafield', ats: 'lever', ats_id: 'lumafield' },
  { name: 'mabl', ats: 'greenhouse', ats_id: 'mabl' },
  { name: 'Mable', ats: 'lever', ats_id: 'mable' },
  { name: 'Mandrel', ats: 'ashby', ats_id: 'mandrel' },
  { name: 'Markforged', ats: 'greenhouse', ats_id: 'markforged' },
  { name: 'Maven AGI', ats: 'ashby', ats_id: 'maven-agi' },
  { name: 'Mirakl', ats: 'greenhouse', ats_id: 'mirakl' },
  { name: 'Modulate', ats: 'lever', ats_id: 'modulate' },
  { name: 'MongoDB', ats: 'greenhouse', ats_id: 'mongodb' },
  { name: 'Motional', ats: 'greenhouse', ats_id: 'motional' },
  { name: 'n8n', ats: 'ashby', ats_id: 'n8n' },
  { name: 'Nasuni', ats: 'greenhouse', ats_id: 'nasuni' },
  { name: 'Nebulock', ats: 'ashby', ats_id: 'nebulock' },
  { name: 'NetBrain', ats: 'greenhouse', ats_id: 'netbrain' },
  { name: 'Neumora Therapeutics', ats: 'greenhouse', ats_id: 'neumora' },
  { name: 'Nexthink', ats: 'smartrecruiters', ats_id: 'Nexthink' },
  { name: 'Nuvalent', ats: 'greenhouse', ats_id: 'nuvalent' },
  { name: 'Okta', ats: 'greenhouse', ats_id: 'okta' },
  { name: 'Onapsis', ats: 'greenhouse', ats_id: 'onapsis' },
  { name: 'OncoveryCare', ats: 'greenhouse', ats_id: 'oncoverycare' },
  { name: 'OnRamp', ats: 'ashby', ats_id: 'onramp' },
  { name: 'OpenEvidence', ats: 'ashby', ats_id: 'openevidence' },
  { name: 'OpenHands', ats: 'ashby', ats_id: 'openhands' },
  { name: 'Openly', ats: 'greenhouse', ats_id: 'openly' },
  { name: 'Osmo', ats: 'ashby', ats_id: 'osmo' },
  { name: 'OutcomesAI', ats: 'lever', ats_id: 'outcomesai' },
  { name: 'Overjet', ats: 'ashby', ats_id: 'overjet' },
  { name: 'Owl Labs', ats: 'greenhouse', ats_id: 'owllabs' },
  { name: 'Paperless Parts', ats: 'greenhouse', ats_id: 'paperlessparts' },
  { name: 'PathAI', ats: 'greenhouse', ats_id: 'pathai' },
  { name: 'Piaggio Fast Forward', ats: 'greenhouse', ats_id: 'piaggiofastforward' },
  { name: 'Pickle Robot', ats: 'lever', ats_id: 'picklerobot' },
  { name: 'Posh AI', ats: 'ashby', ats_id: 'posh-ai' },
  { name: 'Posit', ats: 'greenhouse', ats_id: 'rstudio' },
  { name: 'Postman', ats: 'greenhouse', ats_id: 'postman' },
  { name: 'Procurement Sciences AI', ats: 'ashby', ats_id: 'procurementsciences' },
  { name: 'Proton.ai', ats: 'greenhouse', ats_id: 'protonai' },
  { name: 'Pryzm', ats: 'ashby', ats_id: 'pryzm' },
  { name: 'QuEra Computing', ats: 'greenhouse', ats_id: 'queracomputinginc' },
  { name: 'Recorded Future', ats: 'greenhouse', ats_id: 'recordedfuture' },
  { name: 'Reframe Systems', ats: 'ashby', ats_id: 'reframesystems' },
  { name: 'Reprise', ats: 'ashby', ats_id: 'reprise' },
  { name: 'ReversingLabs', ats: 'smartrecruiters', ats_id: 'ReversingLabs' },
  { name: 'Rhino Federated Computing', ats: 'greenhouse', ats_id: 'rhinofederatedcomputing' },
  { name: 'Salsify', ats: 'greenhouse', ats_id: 'salsify' },
  { name: 'Scaled Cognition', ats: 'ashby', ats_id: 'scaled-cognition' },
  { name: 'Serif Biomedicines', ats: 'greenhouse', ats_id: 'serif' },
  { name: 'Seurat Technologies', ats: 'greenhouse', ats_id: 'seurat' },
  { name: 'Skillsoft', ats: 'greenhouse', ats_id: 'skillsoft' },
  { name: 'SmartBear', ats: 'greenhouse', ats_id: 'smartbear' },
  { name: 'Snowflake', ats: 'ashby', ats_id: 'snowflake' },
  { name: 'Snyk', ats: 'ashby', ats_id: 'snyk' },
  { name: 'Solo.io', ats: 'greenhouse', ats_id: 'soloioinc' },
  { name: 'Soroco', ats: 'greenhouse', ats_id: 'soroco' },
  { name: 'Starburst Data', ats: 'greenhouse', ats_id: 'starburst' },
  { name: 'Sublime Security', ats: 'ashby', ats_id: 'sublime-security' },
  { name: 'Suno', ats: 'ashby', ats_id: 'suno' },
  { name: 'Tamr', ats: 'ashby', ats_id: 'tamr' },
  { name: 'Tessera Therapeutics', ats: 'greenhouse', ats_id: 'tesseratherapeutics' },
  { name: 'Tines', ats: 'greenhouse', ats_id: 'tines' },
  { name: 'Toast', ats: 'greenhouse', ats_id: 'toast' },
  { name: 'Tomorrow.io', ats: 'greenhouse', ats_id: 'tomorrow' },
  { name: 'Topline Pro', ats: 'ashby', ats_id: 'topline-pro' },
  { name: 'Transmit Security', ats: 'greenhouse', ats_id: 'transmitsecurity' },
  { name: 'TripAdvisor', ats: 'greenhouse', ats_id: 'tripadvisor' },
  { name: 'Tulip Interfaces', ats: 'greenhouse', ats_id: 'tulip' },
  { name: 'Tutor Intelligence', ats: 'lever', ats_id: 'tutorintelligence' },
  { name: 'Twilio', ats: 'greenhouse', ats_id: 'twilio' },
  { name: 'Tycho AI', ats: 'ashby', ats_id: 'tycho-ai' },
  { name: 'Veeam', ats: 'greenhouse', ats_id: 'veeamsoftware' },
  { name: 'Veracode', ats: 'greenhouse', ats_id: 'veracode' },
  { name: 'Vestmark', ats: 'greenhouse', ats_id: 'vestmark' },
  { name: 'Via Separations', ats: 'lever', ats_id: 'viaseparations' },
  { name: 'VideaHealth', ats: 'ashby', ats_id: 'videa.ai' },
  { name: 'VulnCheck', ats: 'greenhouse', ats_id: 'vulncheck' },
  { name: 'Wasabi Technologies', ats: 'greenhouse', ats_id: 'wasabi' },
  { name: 'Wayfair', ats: 'smartrecruiters', ats_id: 'Wayfair' },
  { name: 'WHOOP', ats: 'ashby', ats_id: 'whoop' },
  { name: 'Wistia', ats: 'ashby', ats_id: 'wistia' },
  { name: 'xAI', ats: 'greenhouse', ats_id: 'xai' },
  { name: 'ZeroRISC', ats: 'lever', ats_id: 'zerorisc' },
];

/**
 * AI-native ISVs — a THEMATIC seed using the same verified-board contract as
 * the metro regions (the registry machinery is location-agnostic; only the
 * --region flag's metro-keyword fallback is geographic, and this seed simply
 * has no REGION_LOCATION_KEYWORDS entry, so the portals.yml location_filter
 * applies unchanged). Curated from AI-50-caliber lists + national-sweep
 * retries; every board live-probed with the board-name identity check.
 * Last probe-verified: 2026-07-06.
 */
const AI_NATIVE_COMPANIES = [
  { name: 'Airtable', ats: 'greenhouse', ats_id: 'airtable' },
  { name: 'Apollo.io', ats: 'greenhouse', ats_id: 'apolloio' },
  { name: 'Artisan', ats: 'ashby', ats_id: 'artisan' },
  { name: 'Attio', ats: 'ashby', ats_id: 'attio' },
  { name: 'Black Forest Labs', ats: 'greenhouse', ats_id: 'blackforestlabs' },
  { name: 'Browserbase', ats: 'ashby', ats_id: 'browserbase' },
  { name: 'Cartesia', ats: 'ashby', ats_id: 'cartesia' },
  { name: 'Cognition', ats: 'ashby', ats_id: 'cognition' },
  { name: 'Common Room', ats: 'ashby', ats_id: 'commonroom' },
  { name: 'Dust', ats: 'ashby', ats_id: 'dust' },
  { name: 'E2B', ats: 'ashby', ats_id: 'e2b' },
  { name: 'Exa', ats: 'ashby', ats_id: 'exa' },
  { name: 'Factory', ats: 'ashby', ats_id: 'factory' },
  { name: 'Fal', ats: 'greenhouse', ats_id: 'fal' },
  { name: 'Fathom', ats: 'ashby', ats_id: 'fathom' },
  { name: 'Figure AI', ats: 'greenhouse', ats_id: 'figureai' },
  { name: 'Firecrawl', ats: 'ashby', ats_id: 'firecrawl' },
  { name: 'Gamma', ats: 'ashby', ats_id: 'gamma' },
  { name: 'Gong', ats: 'greenhouse', ats_id: 'gongio' },
  { name: 'Granola', ats: 'ashby', ats_id: 'granola' },
  { name: 'HeyGen', ats: 'greenhouse', ats_id: 'heygen' },
  { name: 'Hume AI', ats: 'greenhouse', ats_id: 'humeai' },
  { name: 'Ideogram', ats: 'ashby', ats_id: 'ideogram' },
  { name: 'Imbue', ats: 'greenhouse', ats_id: 'imbue' },
  { name: 'Krea', ats: 'ashby', ats_id: 'krea' },
  { name: 'LangChain', ats: 'ashby', ats_id: 'langchain' },
  { name: 'Letta', ats: 'ashby', ats_id: 'letta' },
  { name: 'Linear', ats: 'ashby', ats_id: 'linear' },
  { name: 'Nooks', ats: 'greenhouse', ats_id: 'nooks' },
  { name: 'Nous Research', ats: 'ashby', ats_id: 'nous' },
  { name: 'Orum', ats: 'ashby', ats_id: 'orum' },
  { name: 'Otter.ai', ats: 'greenhouse', ats_id: 'otterai' },
  { name: 'Outreach', ats: 'lever', ats_id: 'outreach' },
  { name: 'Physical Intelligence', ats: 'ashby', ats_id: 'physicalintelligence' },
  { name: 'Pika', ats: 'ashby', ats_id: 'pika' },
  { name: 'Prime Intellect', ats: 'ashby', ats_id: 'primeintellect' },
  { name: 'Raycast', ats: 'ashby', ats_id: 'raycast' },
  { name: 'Read AI', ats: 'ashby', ats_id: 'read-ai' },
  { name: 'Reflection AI', ats: 'ashby', ats_id: 'reflectionai' },
  { name: 'Replit', ats: 'ashby', ats_id: 'replit' },
  { name: 'Rilla', ats: 'ashby', ats_id: 'rilla' },
  { name: 'Rime', ats: 'ashby', ats_id: 'rime' },
  { name: 'Runway ML', ats: 'ashby', ats_id: 'runway-ml' },
  { name: 'Salesloft', ats: 'greenhouse', ats_id: 'salesloft' },
  { name: 'SF Compute', ats: 'ashby', ats_id: 'sfcompute' },
  { name: 'Stability AI', ats: 'greenhouse', ats_id: 'stabilityai' },
  { name: 'Tenstorrent', ats: 'greenhouse', ats_id: 'tenstorrent' },
  { name: 'Typeface', ats: 'greenhouse', ats_id: 'typeface' },
  { name: 'Udio', ats: 'greenhouse', ats_id: 'udio' },
  { name: 'Unify', ats: 'ashby', ats_id: 'unify' },
  { name: 'World Labs', ats: 'greenhouse', ats_id: 'worldlabs' },
  { name: 'You.com', ats: 'greenhouse', ats_id: 'youcom' },
  { name: 'Zed Industries', ats: 'ashby', ats_id: 'zed' },
];

/**
 * Metro-area location keywords per region, used by `--region` as the default
 * `--location-allow` override. Matching is case-insensitive substring (same
 * semantics as portals.yml location_filter `allow`), so "remote" postings at
 * these companies are excluded unless the posting names the metro — pass an
 * explicit --location-allow including "remote" to widen.
 */
export const REGION_LOCATION_KEYWORDS = {
  // Two tiers, chosen against real false positives:
  //  - Bare names only for towns that are unambiguous nationally.
  //  - "town, ma" compounds for towns that exist in other states (Lexington KY,
  //    Burlington VT, Wilmington DE, Cambridge UK, …). The compound matches
  //    both "Lexington, MA" and "Lexington, Massachusetts" via substring.
  //  - Deliberately NOT the bare substring ', ma' — it also matches
  //    ', Maryland', ', Maine', ', Madrid', ', Manila', …
  boston: [
    'boston', 'somerville', 'watertown', 'waltham', 'needham', 'natick',
    'billerica', 'marlborough', 'westborough', 'woburn', 'devens',
    'massachusetts',
    'cambridge, ma', 'burlington, ma', 'lexington, ma', 'newton, ma',
    'quincy, ma', 'medford, ma', 'bedford, ma', 'wilmington, ma',
    'framingham, ma', 'andover, ma',
  ],
};

// ── Pure parser (the testable unit) ──────────────────────────────────

/**
 * Validate raw region entries into SeedCompany objects (the same shape
 * seeds/vc-portfolios.mjs emits, so `toPortalEntry()` consumes both).
 *
 * Rules: entries must have a non-empty name; `ats` must be a known platform
 * with an SLUG_RE-safe `ats_id` (entries without a valid board are dropped —
 * a region seed's contract is "every entry is scannable"); duplicates
 * (same ats+ats_id, or same normalized name) keep the first occurrence.
 *
 * @param {unknown}  raw       Candidate entry array (static data or local extras).
 * @param {string}   regionId  Region id used as the SeedCompany `source`.
 * @returns {import('./vc-portfolios.mjs').SeedCompany[]}
 */
export function parseRegionEntries(raw, regionId) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenBoards = new Set();
  const seenNames = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const ats = typeof item.ats === 'string' ? item.ats.trim().toLowerCase() : '';
    const atsId = typeof item.ats_id === 'string' ? item.ats_id.trim() : '';
    if (!REGION_ATS.has(ats) || !atsId || !SLUG_RE.test(atsId)) continue;
    const boardKey = `${ats}:${atsId.toLowerCase()}`;
    const nameKey = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (seenBoards.has(boardKey) || seenNames.has(nameKey)) continue;
    seenBoards.add(boardKey);
    seenNames.add(nameKey);
    const slug = nameKey.replace(/[^a-z0-9._-]/g, '') || atsId.toLowerCase();
    out.push({
      name,
      slug: SLUG_RE.test(slug) ? slug : atsId.toLowerCase(),
      url: typeof item.url === 'string' ? item.url : '',
      ats,
      ats_id: atsId,
      source: regionId,
    });
  }
  return out;
}

/**
 * Read optional user extras from seeds/regions.local.json (gitignored).
 * Malformed JSON is reported once and ignored — extras must never break a scan.
 *
 * @param {string} regionId
 * @returns {unknown[]}
 */
function loadLocalExtras(regionId) {
  if (!existsSync(LOCAL_EXTRAS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(LOCAL_EXTRAS_PATH, 'utf-8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.error('⚠️  seeds/regions.local.json: ignored — top level must be an object keyed by region id, e.g. {"boston": [...]}');
      return [];
    }
    const list = data[regionId];
    if (list !== undefined && !Array.isArray(list)) {
      console.error(`⚠️  seeds/regions.local.json: ignored — "${regionId}" must be an array of entries`);
      return [];
    }
    return list ?? [];
  } catch (err) {
    console.error(`⚠️  seeds/regions.local.json: ignored — ${err.message}`);
    return [];
  }
}

// ── Region registry ──────────────────────────────────────────────────

const REGION_DATA = {
  boston: { companies: BOSTON_COMPANIES, label: 'Boston Metro Tech' },
  'ai-native': { companies: AI_NATIVE_COMPANIES, label: 'AI-Native ISVs' },
};

/**
 * Registry with the same contract as vc-portfolios SEED_SOURCES, consumed by
 * scan-ats-full.mjs --seeds/--region. fetch() is async for contract parity
 * even though region data is local.
 *
 * To add a region: add a verified company array + REGION_DATA entry +
 * REGION_LOCATION_KEYWORDS entry. Verify with `node seeds/regions.mjs <id> --probe`.
 *
 * @type {Record<string, { fetch: (opts?: object) => Promise<object[]>, label: string }>}
 */
export const REGION_SEED_SOURCES = Object.fromEntries(
  Object.entries(REGION_DATA).map(([id, { companies, label }]) => [
    id,
    {
      label,
      fetch: async () => parseRegionEntries([...companies, ...loadLocalExtras(id)], id),
    },
  ]),
);

// ── CLI self-probe: node seeds/regions.mjs boston --probe ────────────

const BOARD_URL = {
  greenhouse: (id) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs`,
  ashby: (id) => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
  lever: (id) => `https://api.lever.co/v0/postings/${id}?mode=json`,
  smartrecruiters: (id) => `https://api.smartrecruiters.com/v1/companies/${id}/postings`,
};

async function probeBoard(ats, atsId) {
  const res = await fetch(BOARD_URL[ats](atsId), {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; career-ops-seeds/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (ats === 'lever') return Array.isArray(data) ? data.length : null;
  if (ats === 'smartrecruiters') return Array.isArray(data?.content) ? data.content.length : null;
  return Array.isArray(data?.jobs) ? data.jobs.length : null;
}

async function probeCli(regionId) {
  const source = REGION_SEED_SOURCES[regionId];
  if (!source) {
    console.error(`Unknown region "${regionId}". Valid: ${Object.keys(REGION_SEED_SOURCES).join(', ')}`);
    process.exit(1);
  }
  const companies = await source.fetch();
  console.log(`Probing ${companies.length} boards for region "${regionId}"…`);
  let live = 0, dead = 0, jobs = 0;
  for (const c of companies) {
    let count = null;
    try { count = await probeBoard(c.ats, c.ats_id); } catch { /* dead */ }
    if (count === null) {
      dead++;
      console.log(`  ✗ ${c.name} (${c.ats}/${c.ats_id}) — board unreachable`);
    } else {
      live++;
      jobs += count;
    }
  }
  console.log(`\n${live} live boards · ${jobs} open postings · ${dead} unreachable${dead ? ' — remove or re-verify the ✗ entries' : ''}`);
  process.exit(dead ? 2 : 0);
}

// realpath both sides so symlinked invocation and %-encoded path characters
// don't defeat the comparison (no URL round-trip on argv).
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  const regionId = process.argv[2];
  if (!regionId || !process.argv.includes('--probe')) {
    console.log('Usage: node seeds/regions.mjs <region> --probe');
    console.log(`Regions: ${Object.keys(REGION_SEED_SOURCES).join(', ')}`);
    process.exit(regionId ? 1 : 0);
  }
  await probeCli(regionId);
}
