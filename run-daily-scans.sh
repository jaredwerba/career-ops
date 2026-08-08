#!/bin/zsh
# run-daily-scans.sh — full discovery sweep for career-ops (launchd daily job).
# Zero-token: hits public job-board APIs only, writes to data/pipeline.md,
# rebuilds the static dashboard. Logs to data/scan-logs/.
set -u
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

LOGDIR="data/scan-logs"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m-%d).log"

# The launchd job now also fires at login (RunAtLoad) so a day the Mac was
# asleep at 8am still gets scanned. That means this script can be invoked more
# than once a day, so bail out if today's sweep already finished. Pass --force
# to override.
if [ "${1:-}" != "--force" ] && grep -q '^===== done:' "$LOG" 2>/dev/null; then
  echo "career-ops: today's scan already completed ($LOG) — skipping. Use --force to rerun."
  exit 0
fi

{
  echo "===== career-ops daily sweep: $(date) ====="
  echo "--- tracked companies (national) ---"
  node scan.mjs
  echo "--- boston region seed ---"
  node scan-ats-full.mjs --region boston --since 7
  echo "--- ai-native ISV seed ---"
  node scan-ats-full.mjs --seeds ai-native --since 7
  echo "--- VC portfolio seeds (YC + a16z) ---"
  node scan-ats-full.mjs --seeds yc,a16z --since 7
  echo "--- enterprise/Boston VC portfolios (GC, Insight, Battery, Bessemer, Sequoia) ---"
  node scan-ats-full.mjs --seeds gc,insight,battery,bessemer,sequoia --since 7
  echo "--- top-250 elite companies seed ---"
  node scan-ats-full.mjs --seeds top250 --since 7
  echo "--- full ATS directory walk (fresh postings) ---"
  node scan-ats-full.mjs --since 2
  echo "--- rebuild dashboard ---"
  node build-web-dashboard.mjs
  echo "--- ranked shortlist ---"
  node shortlist.mjs --days 1 --top 20
  echo "===== done: $(date) ====="
} >> "$LOG" 2>&1

# Ranked shortlist to its own file — this is the handoff to Claude ("build
# resumes for today's top 5"), and it saves re-deriving the ranking by hand.
{
  echo "# career-ops shortlist — $(date +%Y-%m-%d)"
  echo
  node shortlist.mjs --days 1 --top 20 2>&1
} > data/shortlist-today.txt

# Desktop notification. Without this the 8am run is invisible — the whole point
# is not having to remember to go look.
MATCHES=$(node shortlist.mjs --days 1 --urls 2>/dev/null | wc -l | tr -d ' ')
if [ "${MATCHES:-0}" -gt 0 ]; then
  /usr/bin/osascript -e "display notification \"$MATCHES ranked matches overnight. Ask Claude to build resumes.\" with title \"career-ops — $MATCHES matches\"" 2>/dev/null || true
else
  /usr/bin/osascript -e 'display notification "No ranked matches today." with title "career-ops"' 2>/dev/null || true
fi

# keep 30 days of logs
find "$LOGDIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
