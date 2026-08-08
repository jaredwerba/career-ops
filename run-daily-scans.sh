#!/bin/zsh
# run-daily-scans.sh — full discovery sweep for career-ops (launchd daily job).
# Zero-token: hits public job-board APIs only, writes to data/pipeline.md,
# rebuilds the static dashboard. Logs to data/scan-logs/.
#
# Interactive terminal → animated progress: a phase bar, a spinner with elapsed
# time and a live new-offer count, and each phase's actual finds printed as it
# completes. Full raw output still lands in the log either way.
# launchd (no TTY) → silent, log-only: byte-identical to the original behavior.
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

INTERACTIVE=0
[ -t 1 ] && INTERACTIVE=1

# CAREEROPS_STREAM=1 (set by dashboard-server.mjs behind the RUN SCAN button):
# emit plain, line-oriented progress — no spinner, no carriage returns, no
# colour — so it renders correctly in a browser pane. Mutually exclusive with
# the TTY animation.
STREAM=${CAREEROPS_STREAM:-0}
if [ "$STREAM" = "1" ]; then INTERACTIVE=0; fi

# ── animated phase runner (interactive only) ─────────────────────────────
# Array, not a string: ${str:offset:1} slices BYTES under a C locale and
# shreds multibyte braille glyphs — array elements are always whole.
SPIN=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
PHASE_N=0
PHASE_TOTAL=9
TOTAL_NEW=0
SWEEP_START=$SECONDS
TMPOUT="$(mktemp -t careerops-phase)"
trap 'rm -f "$TMPOUT"' EXIT

# bar 3 9 → ██████░░░░░░░░░░░░ (18 cells)
bar() {
  local done=$1 total=$2 width=18 fill i out=''
  fill=$(( done * width / total ))
  for (( i = 1; i <= width; i++ )); do
    if (( i <= fill )); then out+='█'; else out+='░'; fi
  done
  print -rn -- "$out"
}

# run_phase "title" cmd args... — animates while cmd runs; appends output to LOG.
run_phase() {
  local title="$1"; shift
  PHASE_N=$(( PHASE_N + 1 ))
  echo "--- $title ---" >> "$LOG"

  if [ "$STREAM" = "1" ]; then
    print -r -- "PHASE $PHASE_N/$PHASE_TOTAL start $title"
    local sstart=$SECONDS rc=0
    : > "$TMPOUT"
    "$@" > "$TMPOUT" 2>&1 || rc=$?
    local n
    n=$(grep -c '^ *+ ' "$TMPOUT" 2>/dev/null) || n=0
    TOTAL_NEW=$(( TOTAL_NEW + n ))
    grep '^ *+ ' "$TMPOUT" 2>/dev/null | head -10 | sed 's/^ *+ /+ /'
    print -r -- "PHASE $PHASE_N/$PHASE_TOTAL done $(( SECONDS - sstart ))s ${n} new rc=$rc"
    cat "$TMPOUT" >> "$LOG"
    return 0
  fi

  if (( ! INTERACTIVE )); then
    "$@" >> "$LOG" 2>&1 || true
    return 0
  fi

  : > "$TMPOUT"
  "$@" > "$TMPOUT" 2>&1 &
  local pid=$!
  trap "kill $pid 2>/dev/null; printf '\n'; exit 130" INT

  local start=$SECONDS i=0 frame offers elapsed
  while kill -0 $pid 2>/dev/null; do
    frame="${SPIN[$(( i % 10 + 1 ))]}"
    offers=$(grep -c '^ *+ ' "$TMPOUT" 2>/dev/null) || offers=0
    elapsed=$(( SECONDS - start ))
    printf '\r\033[K \033[36m%s\033[0m [%s] %d/%d  %-46.46s \033[2m%3ds\033[0m · \033[33m%s new\033[0m' \
      "$frame" "$(bar $(( PHASE_N - 1 )) $PHASE_TOTAL)" "$PHASE_N" "$PHASE_TOTAL" \
      "$title" "$elapsed" "$offers"
    sleep 0.15
    i=$(( i + 1 ))
  done
  local rc=0
  wait $pid || rc=$?
  trap - INT

  offers=$(grep -c '^ *+ ' "$TMPOUT" 2>/dev/null) || offers=0
  TOTAL_NEW=$(( TOTAL_NEW + offers ))
  elapsed=$(( SECONDS - start ))
  local mark=$'\033[32m✓\033[0m'
  (( rc != 0 )) && mark=$'\033[31m✗\033[0m'
  printf '\r\033[K %s [%s] %d/%d  %-46.46s \033[2m%3ds\033[0m · \033[33m%s new\033[0m\n' \
    "$mark" "$(bar $PHASE_N $PHASE_TOTAL)" "$PHASE_N" "$PHASE_TOTAL" "$title" "$elapsed" "$offers"

  # The lines that matter: this phase's new offers (capped; full list in LOG).
  grep '^ *+ ' "$TMPOUT" 2>/dev/null | head -10 | sed $'s/^ *+ /   \033[2m+\033[0m /'
  if (( offers > 10 )); then
    printf '   \033[2m… +%d more in %s\033[0m\n' $(( offers - 10 )) "$LOG"
  fi

  cat "$TMPOUT" >> "$LOG"
  return 0
}

say_both() {
  echo "$1" >> "$LOG"
  if (( INTERACTIVE )) || [ "$STREAM" = "1" ]; then echo "$1"; fi
}

say_both "===== career-ops daily sweep: $(date) ====="
run_phase "tracked companies + job boards"          node scan.mjs
run_phase "Boston region seed"                      node scan-ats-full.mjs --region boston --since 7
run_phase "AI-native ISV seed"                      node scan-ats-full.mjs --seeds ai-native --since 7
run_phase "YC + a16z portfolios"                    node scan-ats-full.mjs --seeds yc,a16z --since 7
run_phase "GC/Insight/Battery/Bessemer/Sequoia"     node scan-ats-full.mjs --seeds gc,insight,battery,bessemer,sequoia --since 7
run_phase "top-250 elite companies"                 node scan-ats-full.mjs --seeds top250 --since 7
run_phase "full ATS directory walk"                 node scan-ats-full.mjs --since 2
run_phase "rebuild dashboard"                       node build-web-dashboard.mjs
run_phase "ranked shortlist"                        node shortlist.mjs --days 1 --top 20
say_both "===== done: $(date) ====="

if (( INTERACTIVE )); then
  printf '\n \033[32m█\033[0m Sweep complete in %dm%02ds · \033[33m%d new offers\033[0m · log: %s\n' \
    $(( (SECONDS - SWEEP_START) / 60 )) $(( (SECONDS - SWEEP_START) % 60 )) "$TOTAL_NEW" "$LOG"
elif [ "$STREAM" = "1" ]; then
  print -r -- "SWEEP done $(( (SECONDS - SWEEP_START) / 60 ))m$(( (SECONDS - SWEEP_START) % 60 ))s ${TOTAL_NEW} new"
fi

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
