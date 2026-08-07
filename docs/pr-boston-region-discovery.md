# Prepared PR: metro-region discovery → santifer/career-ops

To open it, run from ~/careerops (or tell Claude "open the upstream PR"):

```bash
gh pr create --repo santifer/career-ops \
  --head jaredwerba:feature/boston-region-discovery \
  --title "feat(seeds): metro-region discovery — probe-verified Boston seed + --region flag" \
  --body-file docs/pr-boston-region-discovery.md
```

(Delete everything above this line before using this file as the body, or just let Claude do it.)

---

## What

Adds a second seed family to the reverse ATS scanner (`scan-ats-full.mjs`): **curated metro-region company lists**, starting with Boston — "scan every tech company in a city" alongside the existing "every company in a fund" (yc/a16z).

- `seeds/regions.mjs`: region registry with the same `SEED_SOURCES` contract as vc-portfolios. First region: **boston** — 91 companies whose Greenhouse/Lever/Ashby/SmartRecruiters boards were live-probed AND identity-verified (the board's own company name must match; token guessing alone surfaces impostor boards — `athena` is "Athena Group Advisors", `purestorage` is "Everpure").
- `--region <id>`: region seed + metro location keywords in one flag; `--location-allow <kw,kw>` per-run location_filter override (`;` separator for keywords containing commas).
- SmartRecruiters added to `SEED_PROVIDERS`, with a `toPortalEntry()` branch pinning boards via `careers.smartrecruiters.com/<slug>`.
- `providers/smartrecruiters.mjs`: map `releasedDate` → `postedAt` (epoch ms). Without it every SR posting classified 'undated' and was silently dropped; as a string, every posting classified 'keep' regardless of age. Regression-tested.
- `seeds/regions.local.json` (gitignored) lets users extend a region without code edits; `node seeds/regions.mjs boston --probe` (npm run seeds:probe) re-verifies board liveness.
- `npm run scan:boston`; docs in `seeds/README.md` + `docs/SCRIPTS.md`; 15 offline contract tests registered in `test-all.mjs` and `update-system.mjs` SYSTEM_PATHS.

## Design notes

- Region lists are static + curation-verified rather than scraped: metro membership changes slowly and verified lists produce zero false-positive boards. Workday/custom-portal companies are deliberately excluded — the existing ATS directory walk covers them.
- Metro location keywords use `"town, ma"` compounds for nationally-ambiguous towns (Lexington KY, Burlington VT, Cambridge UK all bit during testing) and deliberately avoid the bare substring `", ma"` (matches ", Maryland", ", Madrid", …).
- Adding a region = one verified array + two registry entries; the probe CLI keeps lists honest before PRs.

## Verification

- `node test-all.mjs --quick`: 1234 passed, 0 failed
- `node region-seeds-tests.mjs`: 15/15
- Live: `--region boston --since 14` probed 91 boards, 0 errors, surfaced real Boston postings across Greenhouse/Lever/Ashby/SmartRecruiters

🤖 Generated with [Claude Code](https://claude.com/claude-code)
