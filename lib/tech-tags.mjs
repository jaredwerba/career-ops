// ── "Tech" classification (curated, 2026-07-06) ─────────────────────────────
// Tags only "real tech": hyperscalers, neoclouds, Oracle-like enterprise
// software/infra vendors, AI-native ISVs, and physical/deep-tech makers.
// Marketplaces, staffing, consumer services, and unknowns stay blank.
//
// Extracted from build-web-dashboard.mjs so the dashboard and shortlist.mjs
// classify companies identically — one list, one place to add a company.

export const TECH_GROUPS = {
  'Hyperscaler': ['amazon web services', 'microsoft', 'google cloud', 'google'],
  'Neocloud': ['coreweave','nebius','together ai','baseten','lambda','crusoe','fireworks ai','modal',
    'runpod','tensorwave','voltage park','vast.ai','cerebras','vultr','digitalocean','fal','replicate',
    'sf compute','prime intellect','paperspace','groq','sambanova','lightning ai','anyscale'],
  'Enterprise SW': ['servicenow','sap','salesforce','workday','databricks','snowflake','mongodb','datadog',
    'gitlab','atlassian','confluent','redis','neo4j','cockroach labs','singlestore','clickhouse','teradata',
    'couchbase','cloudera','informatica','celonis','uipath','automation anywhere','elastic','cloudflare',
    'fastly','akamai','nutanix','rubrik','cohesity','wiz','palo alto networks','okta','twilio','braze',
    'amplitude','samsara','fivetran','dbt labs','airbyte','sigma computing','thoughtspot','alteryx',
    'sourcegraph','grafana labs','temporal','chronosphere','cribl','sysdig','aqua security','semgrep',
    'chainguard','tailscale','teleport','backblaze','wasabi','nasuni','veeam','acronis','progress',
    'pegasystems','intersystems','netbrain','nexthink','dynatrace','smartbear','solo.io','starburst',
    'atscale','tamr','immuta','precisely','quickbase','outsystems','gong','outreach','salesloft','clari',
    'apollo.io','hightouch','census','airtable','notion','figma','vercel','linear','postman','hubspot',
    'klaviyo','semrush','constant contact','everbridge','goto','mimecast','cyberark','rapid7','snyk',
    'veracode','black duck','recorded future','bitsight','cybereason','transmit security','imprivata',
    'onapsis','simspace','reversinglabs','tufin','aura','tines','hycu','coralogix','pentera','black kite',
    'toast','flywire','circle','duck creek','healthedge','definitive healthcare','acquia',
    'mirakl','salsify','logrocket','bynder','workhuman','litmus','wistia','appcues','fairmarkit','bullhorn',
    'linksquares','jellyfish','cloudzero','mabl','posit','devo','skillsoft','crunchtime',
    'elastic path','airslate','lendbuzz','hometap','stavvy','trustcloud','summize','wicket','vulncheck',
    'sublime security','realm.security','onelayer','allure security','clarity security','zoom'],
  'AI-Native': ['openai','anthropic','cohere','mistral ai','perplexity','xai','glean','sierra','hugging face',
    'harvey','abridge','decagon','cresta','writer','elevenlabs','synthesia','deepgram','assemblyai',
    'speechmatics','livekit','vapi','retell','bland','suno','liquid ai','cognition','langchain','replit',
    'poolside','mercor','hebbia','scale ai','character ai','runway ml','stability ai','black forest labs',
    'ideogram','krea','udio','cartesia','hume','rime','otter.ai','read ai','fathom','granola','exa',
    'firecrawl','browserbase','e2b','letta','reflection ai','imbue','dust','typeface','jasper','gamma',
    'heygen','pika','world labs','snorkel','labelbox','encord','voxel51','arize','fiddler','braintrust',
    'llamaindex','unstructured','pinecone','weaviate','qdrant','zilliz','maven agi','artisan','nooks',
    'orum','rilla','sybill','unify','you.com','openevidence','openhands','lovable','blitzy','7ai',
    'lazarus ai','posh ai','gradient ai','overjet','videahealth','codametrix','pathai','cohere health',
    'code metal','arcee','augment code','scaled cognition','contextual ai','observe.ai','indico data',
    'centaur labs','beacon biosignals','tomorrow.io','osmo','instacart'],
  'Hardware & Deep Tech': ['apple','figure','tenstorrent','physical intelligence','formlabs','markforged',
    'desktop metal','vulcanforms','seurat','locus robotics','berkshire grey','righthand robotics',
    'vecna robotics','realtime robotics','pickle robot','piaggio fast forward','corvus robotics',
    'boston dynamics','symbotic','irobot','sharkninja','bose','motional','lightmatter','quera',
    'commonwealth fusion','form energy','sublime systems','boston metal','electric hydrogen',
    'ascend elements','24m','factorial energy','via separations','eyebot','bevi','owl labs','whoop',
    'lumafield','circuithub','tulip interfaces','tulip','tive','cambridge mobile telematics','modulate',
    'neurable','matrixspace','rise robotics','verve motion','cleo robotics','flexxbotics','teradar',
    'reframe systems','alsym energy','phoenix tailings','agzen','gradiant','zerorisc'],
};

export const TECH_TAGS = (() => {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = new Map();
  for (const [tag, names] of Object.entries(TECH_GROUPS)) for (const n of names) map.set(norm(n), tag);
  return { map, norm };
})();

export function classifyTech(company) {
  const n = TECH_TAGS.norm(company);
  if (!n) return '';
  if (TECH_TAGS.map.has(n)) return TECH_TAGS.map.get(n);
  for (const [key, tag] of TECH_TAGS.map) {
    if (key.length >= 6 && (n.startsWith(key) || (key.startsWith(n) && n.length >= 6))) return tag;
  }
  return '';
}
