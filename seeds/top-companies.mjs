// @ts-check
/**
 * seeds/top-companies.mjs — ranked seed of the strongest tech companies to
 * sell for: the OpenAI / Databricks / Wiz / Stripe tier.
 *
 * Curated 2026-08-07 from public rankings (Forbes Cloud 100 2025, LinkedIn Top
 * Startups, RepVue top-rated, top public SaaS/security/infra vendors), then
 * every board LIVE-PROBED with the board-name identity check — the same rule
 * that has caught impostor boards before (greenhouse/vast = Vast the space
 * station company, NOT VAST Data; ashby/flock = a UK insurtech, NOT Flock
 * Safety). Only identity-verified boards carry ats/ats_id here.
 *
 * NO_BOARD_COMPANIES lists curated companies with no verifiable public ATS
 * board (custom career sites: Salesforce, Oracle, NVIDIA, HubSpot...). They
 * stay listed so future probes can promote them — never delete, only promote.
 *
 * Consumed via seeds/regions.mjs REGION_DATA as: --seeds top250
 * Local additions: seeds/regions.local.json under the "top250" key.
 */

/** Verified boards, ordered by curated rank (1 = strongest). */
export const TOP_COMPANIES = [
  { name: 'OpenAI', ats: 'ashby', ats_id: 'openai' }, // #1 ai
  { name: 'Anthropic', ats: 'greenhouse', ats_id: 'anthropic' }, // #2 ai
  { name: 'Databricks', ats: 'greenhouse', ats_id: 'databricks' }, // #3 data
  { name: 'Wiz', ats: 'greenhouse', ats_id: 'wizinc' }, // #4 security
  { name: 'Snowflake', ats: 'ashby', ats_id: 'snowflake' }, // #6 data
  { name: 'Stripe', ats: 'greenhouse', ats_id: 'stripe' }, // #7 fintech
  { name: 'Cloudflare', ats: 'greenhouse', ats_id: 'cloudflare' }, // #8 infra
  { name: 'Datadog', ats: 'greenhouse', ats_id: 'datadog' }, // #9 infra
  { name: 'Ramp', ats: 'ashby', ats_id: 'ramp' }, // #10 fintech
  { name: 'ServiceNow', ats: 'smartrecruiters', ats_id: 'servicenow' }, // #16 saas
  { name: 'Verkada', ats: 'greenhouse', ats_id: 'verkada' }, // #19 hardware
  { name: 'Grafana Labs', ats: 'greenhouse', ats_id: 'grafanalabs' }, // #20 infra
  { name: 'Palantir', ats: 'lever', ats_id: 'palantir' }, // #22 data
  { name: 'Figma', ats: 'greenhouse', ats_id: 'figma' }, // #23 saas
  { name: 'Sierra', ats: 'ashby', ats_id: 'sierra' }, // #24 ai
  { name: 'Cursor', ats: 'ashby', ats_id: 'cursor' }, // #25 devtools
  { name: 'Perplexity', ats: 'ashby', ats_id: 'perplexity' }, // #26 ai
  { name: 'Zscaler', ats: 'greenhouse', ats_id: 'zscaler' }, // #27 security
  { name: 'Samsara', ats: 'greenhouse', ats_id: 'samsara' }, // #28 saas
  { name: 'Axon', ats: 'greenhouse', ats_id: 'axon' }, // #29 hardware
  { name: 'MongoDB', ats: 'greenhouse', ats_id: 'mongodb' }, // #30 data
  { name: 'Brex', ats: 'greenhouse', ats_id: 'brex' }, // #34 fintech
  { name: 'Mercury', ats: 'greenhouse', ats_id: 'mercury' }, // #35 fintech
  { name: 'Plaid', ats: 'ashby', ats_id: 'plaid' }, // #36 fintech
  { name: 'Gong', ats: 'smartrecruiters', ats_id: 'gong' }, // #37 saas
  { name: 'Klaviyo', ats: 'greenhouse', ats_id: 'klaviyo' }, // #38 saas
  { name: 'Toast', ats: 'greenhouse', ats_id: 'toast' }, // #39 saas
  { name: 'ServiceTitan', ats: 'smartrecruiters', ats_id: 'servicetitan' }, // #40 saas
  { name: 'CoreWeave', ats: 'greenhouse', ats_id: 'coreweave' }, // #43 infra
  { name: 'Harvey', ats: 'ashby', ats_id: 'harvey' }, // #44 ai
  { name: 'xAI', ats: 'greenhouse', ats_id: 'xai' }, // #45 ai
  { name: 'Vercel', ats: 'greenhouse', ats_id: 'vercel' }, // #46 devtools
  { name: 'Canva', ats: 'smartrecruiters', ats_id: 'canva' }, // #47 saas
  { name: 'Notion', ats: 'ashby', ats_id: 'notion' }, // #48 saas
  { name: 'Chainguard', ats: 'greenhouse', ats_id: 'chainguard' }, // #52 security
  { name: 'Netskope', ats: 'greenhouse', ats_id: 'netskope' }, // #54 security
  { name: 'Cato Networks', ats: 'greenhouse', ats_id: 'catonetworks' }, // #55 security
  { name: 'Huntress', ats: 'greenhouse', ats_id: 'huntress' }, // #57 security
  { name: 'Okta', ats: 'greenhouse', ats_id: 'okta' }, // #58 security
  { name: 'Rubrik', ats: 'greenhouse', ats_id: 'rubrik' }, // #59 security
  { name: 'Vanta', ats: 'ashby', ats_id: 'vanta' }, // #60 security
  { name: 'Drata', ats: 'ashby', ats_id: 'drata' }, // #61 security
  { name: 'Tanium', ats: 'greenhouse', ats_id: 'tanium' }, // #63 security
  { name: 'Confluent', ats: 'ashby', ats_id: 'confluent' }, // #65 data
  { name: 'ClickHouse', ats: 'greenhouse', ats_id: 'clickhouse' }, // #66 data
  { name: 'Elastic', ats: 'greenhouse', ats_id: 'elastic' }, // #67 data
  { name: 'Redis', ats: 'ashby', ats_id: 'redis' }, // #68 data
  { name: 'Fivetran', ats: 'greenhouse', ats_id: 'fivetran' }, // #69 data
  { name: 'Sigma Computing', ats: 'greenhouse', ats_id: 'sigmacomputing' }, // #71 data
  { name: 'Cribl', ats: 'greenhouse', ats_id: 'cribl' }, // #72 infra
  { name: 'Temporal', ats: 'ashby', ats_id: 'temporal' }, // #74 infra
  { name: 'Twilio', ats: 'greenhouse', ats_id: 'twilio' }, // #75 infra
  { name: 'Glean', ats: 'smartrecruiters', ats_id: 'glean' }, // #77 ai
  { name: 'Writer', ats: 'ashby', ats_id: 'writer' }, // #78 ai
  { name: 'Decagon', ats: 'ashby', ats_id: 'decagon' }, // #79 ai
  { name: 'Cresta', ats: 'greenhouse', ats_id: 'cresta' }, // #80 ai
  { name: 'ElevenLabs', ats: 'ashby', ats_id: 'elevenlabs' }, // #81 ai
  { name: 'Together AI', ats: 'greenhouse', ats_id: 'togetherai' }, // #82 ai
  { name: 'Fireworks AI', ats: 'ashby', ats_id: 'fireworks' }, // #83 ai
  { name: 'Baseten', ats: 'ashby', ats_id: 'baseten' }, // #84 infra
  { name: 'Modal', ats: 'ashby', ats_id: 'modal' }, // #85 infra
  { name: 'Lambda', ats: 'ashby', ats_id: 'lambda' }, // #86 infra
  { name: 'Crusoe', ats: 'ashby', ats_id: 'crusoe' }, // #87 infra
  { name: 'Nebius', ats: 'greenhouse', ats_id: 'nebius' }, // #88 infra
  { name: 'Scale AI', ats: 'greenhouse', ats_id: 'scaleai' }, // #89 data
  { name: 'Surge AI', ats: 'ashby', ats_id: 'surge-ai' }, // #90 data
  { name: 'Mercor', ats: 'ashby', ats_id: 'mercor' }, // #91 ai
  { name: 'Cohere', ats: 'ashby', ats_id: 'cohere' }, // #93 ai
  { name: 'Arista Networks', ats: 'smartrecruiters', ats_id: 'aristanetworks' }, // #95 infra
  { name: 'Pure Storage', ats: 'greenhouse', ats_id: 'purestorage' }, // #96 infra
  { name: 'GitLab', ats: 'greenhouse', ats_id: 'gitlab' }, // #99 devtools
  { name: 'Postman', ats: 'greenhouse', ats_id: 'postman' }, // #101 devtools
  { name: 'Docker', ats: 'ashby', ats_id: 'docker' }, // #102 devtools
  { name: 'Kong', ats: 'ashby', ats_id: 'kong' }, // #103 infra
  { name: 'Harness', ats: 'greenhouse', ats_id: 'harnessinc' }, // #104 devtools
  { name: 'LaunchDarkly', ats: 'greenhouse', ats_id: 'launchdarkly' }, // #105 devtools
  { name: 'Sentry', ats: 'ashby', ats_id: 'sentry' }, // #106 devtools
  { name: 'Miro', ats: 'ashby', ats_id: 'miro' }, // #115 saas
  { name: 'Airtable', ats: 'greenhouse', ats_id: 'airtable' }, // #116 saas
  { name: 'Linear', ats: 'ashby', ats_id: 'linear' }, // #117 saas
  { name: 'ClickUp', ats: 'ashby', ats_id: 'clickup' }, // #118 saas
  { name: 'Intercom', ats: 'greenhouse', ats_id: 'intercom' }, // #119
  { name: 'Braze', ats: 'greenhouse', ats_id: 'braze' }, // #120 saas
  { name: 'Attentive', ats: 'greenhouse', ats_id: 'attentive' }, // #121 saas
  { name: '6sense', ats: 'greenhouse', ats_id: '6sense' }, // #122 saas
  { name: 'Apollo.io', ats: 'greenhouse', ats_id: 'apolloio' }, // #124 saas
  { name: 'Common Room', ats: 'ashby', ats_id: 'commonroom' }, // #125 saas
  { name: 'Nooks', ats: 'greenhouse', ats_id: 'nooks' }, // #127 saas
  { name: 'Celonis', ats: 'greenhouse', ats_id: 'celonis' }, // #128 data
  { name: 'AlphaSense', ats: 'greenhouse', ats_id: 'alphasense' }, // #129 data
  { name: 'Cerebras', ats: 'ashby', ats_id: 'cerebras' }, // #131 hardware
  { name: 'Applied Intuition', ats: 'ashby', ats_id: 'applied' }, // #133
  { name: 'Shield AI', ats: 'lever', ats_id: 'shieldai' }, // #134 hardware
  { name: 'Skydio', ats: 'ashby', ats_id: 'skydio' }, // #135 hardware
  { name: 'Gecko Robotics', ats: 'ashby', ats_id: 'gecko-robotics' }, // #137 hardware
  { name: 'Motive', ats: 'greenhouse', ats_id: 'motive' }, // #138 saas
  { name: 'Zip', ats: 'ashby', ats_id: 'zip' }, // #139 saas
  { name: 'Airwallex', ats: 'ashby', ats_id: 'airwallex' }, // #141 fintech
  { name: 'Adyen', ats: 'greenhouse', ats_id: 'adyen' }, // #143 fintech
  { name: 'Melio', ats: 'greenhouse', ats_id: 'melio' }, // #144 fintech
  { name: 'Modern Treasury', ats: 'ashby', ats_id: 'moderntreasury' }, // #145 fintech
  { name: 'Coinbase', ats: 'greenhouse', ats_id: 'coinbase' }, // #147 fintech
  { name: 'Fireblocks', ats: 'greenhouse', ats_id: 'fireblocks' }, // #148 fintech
  { name: 'TRM Labs', ats: 'ashby', ats_id: 'trm-labs' }, // #150 security
  { name: 'Alloy', ats: 'greenhouse', ats_id: 'alloy' }, // #151 fintech
  { name: 'Persona', ats: 'ashby', ats_id: 'persona' }, // #152 security
  { name: 'Socure', ats: 'ashby', ats_id: 'socure' }, // #153 security
  { name: 'Sardine', ats: 'ashby', ats_id: 'sardine' }, // #154 fintech
  { name: 'Gusto', ats: 'greenhouse', ats_id: 'gusto' }, // #155 saas
  { name: 'Remote', ats: 'greenhouse', ats_id: 'remote' }, // #156 saas
  { name: 'HiBob', ats: 'smartrecruiters', ats_id: 'hibob' }, // #157 saas
  { name: 'Ashby', ats: 'ashby', ats_id: 'ashby' }, // #159 saas
  { name: 'Greenhouse', ats: 'greenhouse', ats_id: 'greenhouse' }, // #160 saas
  { name: 'Checkr', ats: 'greenhouse', ats_id: 'checkr' }, // #161 saas
  { name: 'Veeva', ats: 'lever', ats_id: 'veeva' }, // #162 saas
  { name: 'Ironclad', ats: 'ashby', ats_id: 'ironcladhq' }, // #163 saas
  { name: 'Legora', ats: 'ashby', ats_id: 'legora' }, // #166 ai
  { name: 'Hebbia', ats: 'ashby', ats_id: 'hebbia-ai' }, // #167 ai
  { name: 'Abridge', ats: 'ashby', ats_id: 'abridge' }, // #168 ai
  { name: 'OpenEvidence', ats: 'ashby', ats_id: 'openevidence' }, // #169 ai
  { name: 'Ambience Healthcare', ats: 'ashby', ats_id: 'ambiencehealthcare' }, // #170 ai
  { name: 'Benchling', ats: 'ashby', ats_id: 'benchling' }, // #175 saas
  { name: 'Pinecone', ats: 'ashby', ats_id: 'pinecone' }, // #177 data
  { name: 'Weaviate', ats: 'ashby', ats_id: 'weaviate' }, // #178 data
  { name: 'LangChain', ats: 'ashby', ats_id: 'langchain' }, // #179 devtools
  { name: 'Cognition', ats: 'ashby', ats_id: 'cognition' }, // #180 devtools
  { name: 'Replit', ats: 'ashby', ats_id: 'replit' }, // #181 devtools
  { name: 'Lovable', ats: 'greenhouse', ats_id: 'lovable' }, // #182 devtools
  { name: 'Runway', ats: 'ashby', ats_id: 'runway' }, // #183 ai
  { name: 'Synthesia', ats: 'ashby', ats_id: 'synthesia' }, // #184 ai
  { name: 'HeyGen', ats: 'greenhouse', ats_id: 'heygen' }, // #185 ai
  { name: 'Deepgram', ats: 'ashby', ats_id: 'deepgram' }, // #186 ai
  { name: 'Cartesia', ats: 'ashby', ats_id: 'cartesia' }, // #187 ai
  { name: 'LiveKit', ats: 'ashby', ats_id: 'livekit' }, // #188 infra
  { name: 'Braintrust', ats: 'ashby', ats_id: 'braintrust' }, // #189 devtools
  { name: 'Arize AI', ats: 'greenhouse', ats_id: 'arizeai' }, // #190 ai
  { name: 'Honeycomb', ats: 'greenhouse', ats_id: 'honeycomb' }, // #191 infra
  { name: 'Starburst', ats: 'greenhouse', ats_id: 'starburst' }, // #193 data
  { name: 'Dremio', ats: 'greenhouse', ats_id: 'dremio' }, // #194 data
  { name: 'Hex', ats: 'ashby', ats_id: 'hex' }, // #196 data
  { name: 'Omni', ats: 'ashby', ats_id: 'omni' }, // #197 data
  { name: 'Airbyte', ats: 'ashby', ats_id: 'airbyte' }, // #198 data
  { name: 'SingleStore', ats: 'greenhouse', ats_id: 'singlestore' }, // #200 data
  { name: 'PlanetScale', ats: 'greenhouse', ats_id: 'planetscale' }, // #201 data
  { name: 'Supabase', ats: 'ashby', ats_id: 'supabase' }, // #202 data
  { name: 'Neo4j', ats: 'greenhouse', ats_id: 'neo4j' }, // #203 data
  { name: 'DDN', ats: 'ashby', ats_id: 'ddn' }, // #205 data
  { name: 'Torq', ats: 'greenhouse', ats_id: 'torq' }, // #208 security
  { name: 'Tines', ats: 'greenhouse', ats_id: 'tines' }, // #209 security
  { name: 'Axonius', ats: 'greenhouse', ats_id: 'axonius' }, // #210 security
  { name: 'Armis', ats: 'smartrecruiters', ats_id: 'armis' }, // #211 security
  { name: 'Dragos', ats: 'greenhouse', ats_id: 'dragos' }, // #213 security
  { name: 'Orca Security', ats: 'greenhouse', ats_id: 'orcasecurity' }, // #216 security
  { name: 'Sysdig', ats: 'lever', ats_id: 'sysdig' }, // #217 security
  { name: 'Illumio', ats: 'ashby', ats_id: 'illumio' }, // #218 security
  { name: 'Expel', ats: 'greenhouse', ats_id: 'expel' }, // #220 security
  { name: 'Halcyon', ats: 'greenhouse', ats_id: 'halcyon' }, // #223 security
  { name: 'Tenable', ats: 'greenhouse', ats_id: 'tenableinc' }, // #224 security
  { name: '1Password', ats: 'ashby', ats_id: '1password' }, // #226 security
  { name: 'JumpCloud', ats: 'lever', ats_id: 'jumpcloud' }, // #227 infra
  { name: 'BigID', ats: 'greenhouse', ats_id: 'bigid' }, // #230 security
  { name: 'Securiti', ats: 'smartrecruiters', ats_id: 'securiti' }, // #231 security
  { name: 'OneTrust', ats: 'greenhouse', ats_id: 'onetrust' }, // #232 security
  { name: 'Recorded Future', ats: 'greenhouse', ats_id: 'recordedfuture' }, // #233 security
  { name: 'Semgrep', ats: 'ashby', ats_id: 'semgrep' }, // #234 security
  { name: 'Socket', ats: 'greenhouse', ats_id: 'socket' }, // #235 security
  { name: 'Endor Labs', ats: 'greenhouse', ats_id: 'endorlabs' }, // #236 security
  { name: 'HackerOne', ats: 'ashby', ats_id: 'hackerone' }, // #237 security
  { name: 'Horizon3.ai', ats: 'ashby', ats_id: 'horizon3ai' }, // #238 security
  { name: 'Nozomi Networks', ats: 'greenhouse', ats_id: 'nozominetworks' }, // #239 security
  { name: 'Saviynt', ats: 'lever', ats_id: 'saviynt' }, // #240 security
  { name: 'WorkOS', ats: 'ashby', ats_id: 'workos' }, // #242 devtools
  { name: 'Lumos', ats: 'ashby', ats_id: 'lumos' }, // #243 security
  { name: 'Amplitude', ats: 'greenhouse', ats_id: 'amplitude' }, // #246 saas
  { name: 'PostHog', ats: 'ashby', ats_id: 'posthog' }, // #247 devtools
  { name: 'Webflow', ats: 'greenhouse', ats_id: 'webflow' }, // #248 saas
  { name: 'AppsFlyer', ats: 'greenhouse', ats_id: 'appsflyer' }, // #249 saas
  { name: 'Workato', ats: 'greenhouse', ats_id: 'workato' }, // #250 saas
  { name: 'CockroachDB', ats: 'greenhouse', ats_id: 'cockroachlabs' },
  { name: 'Monte Carlo', ats: 'ashby', ats_id: 'montecarlodata' },
];

/** Curated but no identity-verifiable public ATS board (as of 2026-08-07). */
export const NO_BOARD_COMPANIES = [
  'CrowdStrike',
  'Microsoft',
  'Google Cloud',
  'Amazon Web Services',
  'NVIDIA',
  'Palo Alto Networks',
  'Salesforce',
  'Rippling',
  'Anduril',
  'HubSpot',
  'Atlassian',
  'Deel',
  'Procore',
  'Oracle',
  'SentinelOne',
  'Abnormal AI',
  'Cyera',
  'Island',
  'Arctic Wolf',
  'Snyk',
  'CyberArk',
  'dbt Labs',
  'Chronosphere',
  'Clay',
  'Mistral AI',
  'VAST Data',
  'Nutanix',
  'Dynatrace',
  'GitHub',
  'Varonis',
  'Fortinet',
  'Veeam',
  'Workday',
  'SAP',
  'Adobe',
  'Shopify',
  'monday.com',
  'Clari',
  'Qualified',
  'Groq',
  'AMD',
  'Flock Safety',
  'Navan',
  'Checkout.com',
  'Circle',
  'Chainalysis',
  'Papaya Global',
  'Clio',
  'EvenUp',
  'Hippocratic AI',
  'Medallion',
  'Innovaccer',
  'Tempus AI',
  'Hugging Face',
  'ThoughtSpot',
  'WEKA',
  'NetApp',
  'Cisco',
  'Claroty',
  'Silverfort',
  'Veza',
  'Vectra AI',
  'Red Canary',
  'ReliaQuest',
  'Proofpoint',
  'Kandji',
  'NinjaOne',
  'ConductorOne',
  'AuditBoard',
  'Workiva',
];
