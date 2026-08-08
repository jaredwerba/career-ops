#!/bin/bash
# morning-scan.sh — the 7:45am run, driven by launchd.
#
# Does exactly what you type by hand:
#   npm run scan && npm run scan:boston && node build-web-dashboard.mjs
# then adds the two things that make it useful unattended:
#   - writes a ranked shortlist to data/shortlist-today.txt (Claude reads this at 8:00)
#   - fires a macOS notification with the headline count
#
# Run `./morning-scan.sh --check` first to verify node resolves under launchd's
# minimal environment before trusting it to a schedule.

set -uo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$REPO/data/morning-logs"
TODAY="$(date +%Y-%m-%d)"
LOG="$LOG_DIR/$TODAY.log"
SHORTLIST="$REPO/data/shortlist-today.txt"

# launchd hands jobs a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin) — node lives in
# none of those, which is the single most common reason a scheduled job that
# works in Terminal dies silently at 7:45am. Add the usual suspects, plus the
# active nvm version if that's how node got installed.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

notify() { # notify <title> <message>
  /usr/bin/osascript -e "display notification \"${2//\"/\\\"}\" with title \"${1//\"/\\\"}\"" >/dev/null 2>&1 || true
}

die() {
  echo "[$(date +%H:%M:%S)] FAILED: $1" >>"$LOG"
  notify "career-ops scan failed" "$1"
  exit 1
}

mkdir -p "$LOG_DIR"
cd "$REPO" || die "cannot cd to $REPO"

NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

if [ "${1:-}" = "--check" ]; then
  echo "repo:      $REPO"
  echo "node:      ${NODE_BIN:-NOT FOUND}"
  echo "npm:       ${NPM_BIN:-NOT FOUND}"
  echo "log dir:   $LOG_DIR"
  echo "shortlist: $SHORTLIST"
  [ -n "$NODE_BIN" ] && echo "node ver:  $(node -v)"
  if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
    echo
    echo "node/npm not on PATH. Find yours with:  which node"
    echo "then add its directory to the PATH= line near the top of this script."
    exit 1
  fi
  notify "career-ops" "Check passed — node $(node -v) found."
  echo
  echo "OK — safe to schedule."
  exit 0
fi

[ -n "$NODE_BIN" ] || die "node not found on PATH (run ./morning-scan.sh --check)"
[ -n "$NPM_BIN" ]  || die "npm not found on PATH (run ./morning-scan.sh --check)"

{
  echo "════════════════════════════════════════════"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] morning run starting"
  echo "node: $(node -v)  at $NODE_BIN"
} >>"$LOG"

# Row count before, so we can report how many are genuinely new.
BEFORE=0
[ -f data/scan-history.tsv ] && BEFORE=$(wc -l < data/scan-history.tsv | tr -d ' ')

echo "[$(date +%H:%M:%S)] npm run scan" >>"$LOG"
npm run scan >>"$LOG" 2>&1 || echo "[warn] scan exited $?" >>"$LOG"

echo "[$(date +%H:%M:%S)] npm run scan:boston" >>"$LOG"
npm run scan:boston >>"$LOG" 2>&1 || echo "[warn] scan:boston exited $?" >>"$LOG"

echo "[$(date +%H:%M:%S)] build dashboard" >>"$LOG"
node build-web-dashboard.mjs >>"$LOG" 2>&1 || die "dashboard build failed — see $LOG"

AFTER=0
[ -f data/scan-history.tsv ] && AFTER=$(wc -l < data/scan-history.tsv | tr -d ' ')
NEW=$(( AFTER - BEFORE ))
[ "$NEW" -lt 0 ] && NEW=0

# Ranked shortlist — this file is the handoff to Claude at 8:00.
echo "[$(date +%H:%M:%S)] shortlist" >>"$LOG"
{
  echo "# career-ops shortlist — $TODAY"
  echo "# $NEW new postings scanned since yesterday"
  echo
  node shortlist.mjs --days 1 --top 20 2>&1
} > "$SHORTLIST" || die "shortlist failed — see $LOG"

# Headline for the notification: how many ranked matches made the cut.
MATCHES=$(node shortlist.mjs --days 1 --urls 2>/dev/null | wc -l | tr -d ' ')
BOSTON=$(node shortlist.mjs --days 1 --top 50 2>/dev/null | grep -ci "massachusetts\|boston\|somerville\|cambridge\|framingham" || true)

echo "[$(date +%H:%M:%S)] done — $NEW new, $MATCHES ranked, $BOSTON Boston-area" >>"$LOG"

if [ "$MATCHES" -gt 0 ]; then
  notify "career-ops — $MATCHES matches" "$NEW new postings overnight · $BOSTON Boston-area. Ask Claude to build resumes."
else
  notify "career-ops — nothing new" "$NEW postings scanned, no ranked matches today."
fi
