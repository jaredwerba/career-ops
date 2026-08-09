#!/bin/zsh
# run-daily-scans.sh — two-tier discovery sweep for career-ops.
#
#   --tier fast   (default) pre-verified sources only: tracked companies +
#                 job boards, Boston/AI-native/top250 seeds, fresh ATS walk,
#                 dashboard + shortlist. Minutes, not hours. This is what the
#                 8am launchd job and the dashboard RUN SCAN button run.
#   --tier heavy  portfolio probing: YC + a16z (~7,000 companies) and the five
#                 enterprise-VC portfolios (~2,500) — each probed across up to
#                 5 candidate boards. Hours. Runs from its own launchd job at
#                 02:00 so it lands before the morning fast sweep.
#   --tier full   everything in one run (the pre-split behavior; used for
#                 end-to-end timing).
#   --force       rerun even if this tier already completed today.
#
# Zero-token: public job-board APIs only. Logs to data/scan-logs/.
# Interactive terminal → animated progress. launchd (no TTY) → silent, log-only.
set -u
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

TIER="fast"
FORCE=0
while (( $# )); do
  case "$1" in
    --force) FORCE=1 ;;
    --tier) shift; TIER="${1:-fast}" ;;
    --tier=*) TIER="${1#*=}" ;;
    fast|heavy|full) TIER="$1" ;;   # bare tier name also accepted
    *) echo "unknown arg: $1 (usage: run-daily-scans.sh [--tier fast|heavy|full] [--force])"; exit 2 ;;
  esac
  shift
done
case "$TIER" in fast|heavy|full) ;; *) echo "unknown tier: $TIER"; exit 2 ;; esac

LOGDIR="data/scan-logs"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m-%d).log"

# Per-tier daily guard: launchd fires at its scheduled hour AND at login
# (RunAtLoad catch-up for days the Mac was asleep), so a tier bails out if it
# already completed today. --force overrides.
if (( ! FORCE )) && grep -q "^===== done ($TIER):" "$LOG" 2>/dev/null; then
  echo "career-ops: $TIER sweep already completed today ($LOG) — skipping. Use --force to rerun."
  exit 0
fi

# Cross-invocation lock. scan.mjs rewrites data/pipeline.md with a full
# read-modify-writeFileSync, so two concurrent sweeps (e.g. a long 02:00 heavy
# run still going when the 08:00 fast job fires, or the dashboard button while
# either runs) can silently drop each other's rows. mkdir is atomic; the
# second sweep waits its turn. Locks older than 12h are presumed crashed.
LOCKDIR="data/.sweep.lock"
acquire_lock() {
  local waited=0
  while ! mkdir "$LOCKDIR" 2>/dev/null; do
    if [ -d "$LOCKDIR" ]; then
      local age=$(( $(date +%s) - $(stat -f %m "$LOCKDIR" 2>/dev/null || echo 0) ))
      if (( age > 43200 )); then
        echo "career-ops: breaking stale sweep lock (${age}s old)" | tee -a "$LOG"
        rm -rf "$LOCKDIR"
        continue
      fi
    fi
    if (( waited == 0 )); then
      echo "career-ops: another sweep is running — waiting for it to finish (check: ps aux | grep run-daily-scans)" | tee -a "$LOG"
    fi
    sleep 60
    waited=$(( waited + 60 ))
    if (( waited >= 14400 )); then
      echo "career-ops: gave up waiting for the sweep lock after 4h" | tee -a "$LOG"
      exit 1
    fi
  done
  # NOTE: the cleanup trap is deliberately NOT set here. In zsh an EXIT trap
  # created inside a function fires when the FUNCTION returns — which would
  # delete the lock the moment this returns (caught by the concurrency test:
  # a second sweep walked straight through). It is set at top level below.
}
acquire_lock
trap 'rm -rf "$LOCKDIR"' EXIT INT TERM

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
case "$TIER" in
  fast)  PHASE_TOTAL=7 ;;
  heavy) PHASE_TOTAL=2 ;;
  full)  PHASE_TOTAL=9 ;;
esac
TOTAL_NEW=0
SWEEP_START=$SECONDS
TMPOUT="$(mktemp -t careerops-phase)"
trap 'rm -f "$TMPOUT"; rm -rf "$LOCKDIR"' EXIT INT TERM

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
  # Timestamped so an unattended run's per-phase cost is recoverable from the
  # log alone (the heavy tier runs for hours; knowing which phase owns that
  # time is the difference between guessing and measuring).
  echo "--- [$(date +%H:%M:%S)] $PHASE_N/$PHASE_TOTAL $title ---" >> "$LOG"

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

say_both "===== career-ops $TIER sweep: $(date) ====="

if [ "$TIER" = "fast" ] || [ "$TIER" = "full" ]; then
  run_phase "tracked companies + job boards"          node scan.mjs
  run_phase "Boston region seed"                      node scan-ats-full.mjs --region boston --since 7
  run_phase "AI-native ISV seed"                      node scan-ats-full.mjs --seeds ai-native --since 7
fi
if [ "$TIER" = "full" ]; then
  run_phase "YC + a16z portfolios"                    node scan-ats-full.mjs --seeds yc,a16z --since 7
  run_phase "GC/Insight/Battery/Bessemer/Sequoia"     node scan-ats-full.mjs --seeds gc,insight,battery,bessemer,sequoia --since 7
fi
if [ "$TIER" = "heavy" ]; then
  # All 7 portfolios in ONE invocation: seeds run concurrently inside the
  # process (single pipeline.md write, so no cross-process race) and the
  # worker budget is divided among them. 40 total workers ≈ 6/seed.
  run_phase "all VC portfolios (7 seeds, parallel)"   env CAREEROPS_CONCURRENCY=40 node scan-ats-full.mjs --seeds yc,a16z,gc,insight,battery,bessemer,sequoia --since 7
fi
if [ "$TIER" = "fast" ] || [ "$TIER" = "full" ]; then
  run_phase "top-250 elite companies seed"            node scan-ats-full.mjs --seeds top250 --since 7
  run_phase "full ATS directory walk (fresh)"         node scan-ats-full.mjs --since 2
fi
run_phase "rebuild dashboard"                         node build-web-dashboard.mjs
if [ "$TIER" = "fast" ] || [ "$TIER" = "full" ]; then
  run_phase "ranked shortlist"                        node shortlist.mjs --days 1 --top 20
fi

say_both "===== done ($TIER): $(date) ====="

if (( INTERACTIVE )); then
  printf '\n \033[32m█\033[0m %s sweep complete in %dm%02ds · \033[33m%d new offers\033[0m · log: %s\n' \
    "$TIER" $(( (SECONDS - SWEEP_START) / 60 )) $(( (SECONDS - SWEEP_START) % 60 )) "$TOTAL_NEW" "$LOG"
elif [ "$STREAM" = "1" ]; then
  print -r -- "SWEEP done $(( (SECONDS - SWEEP_START) / 60 ))m$(( (SECONDS - SWEEP_START) % 60 ))s ${TOTAL_NEW} new"
fi

# Morning artifacts belong to the fast/full sweep; the 02:00 heavy tier only
# rebuilds the dashboard (above) so overnight finds are on the board by 8am.
if [ "$TIER" = "fast" ] || [ "$TIER" = "full" ]; then
  # Ranked shortlist to its own file — this is the handoff to Claude ("build
  # resumes for today's top 5"), and it saves re-deriving the ranking by hand.
  {
    echo "# career-ops shortlist — $(date +%Y-%m-%d)"
    echo
    node shortlist.mjs --days 1 --top 20 2>&1
  } > data/shortlist-today.txt

  # Publish the PII-free public board so results are reachable away from this
  # machine (careerops-jobboard-public.vercel.app). Guarded: skipped silently
  # when the vercel CLI or the project link is absent, and a deploy failure
  # never fails the sweep.
  if command -v vercel >/dev/null 2>&1 && [ -d dashboard-public/.vercel ]; then
    echo "--- [$(date +%H:%M:%S)] publishing public board to vercel ---" >> "$LOG"
    node build-web-dashboard.mjs --public >> "$LOG" 2>&1 || true
    ( cd dashboard-public && vercel deploy --prod --yes ) >> "$LOG" 2>&1 || \
      echo "vercel deploy failed — public board is stale (see above)" >> "$LOG"
  fi

  MATCHES=$(node shortlist.mjs --days 1 --urls 2>/dev/null | wc -l | tr -d ' ')

  # Desktop notification. Without this the 8am run is invisible — the whole
  # point is not having to remember to go look.
  if [ "${MATCHES:-0}" -gt 0 ]; then
    /usr/bin/osascript -e "display notification \"$MATCHES ranked matches overnight. Ask Claude to build resumes.\" with title \"career-ops — $MATCHES matches\"" 2>/dev/null || true
  else
    /usr/bin/osascript -e 'display notification "No ranked matches today." with title "career-ops"' 2>/dev/null || true
  fi

  # Phone push via ntfy.sh — reaches the user when they are NOT at this Mac.
  # Opt-in by existence of config/ntfy-topic.txt (gitignored; the topic name is
  # the only credential, so treat it like a password). Tapping the notification
  # opens the public board. Delete the file to turn this off.
  NTFY_TOPIC_FILE="config/ntfy-topic.txt"
  if [ -f "$NTFY_TOPIC_FILE" ] && [ "${MATCHES:-0}" -gt 0 ]; then
    NTFY_TOPIC=$(head -1 "$NTFY_TOPIC_FILE" | tr -d '[:space:]')
    if [ -n "$NTFY_TOPIC" ]; then
      # Score rows only (score + date columns) — the "N ranked matches" header
      # also starts with digits and must not leak into the push body.
      TOP3=$(node shortlist.mjs --days 1 --top 3 2>/dev/null | grep -E '^\s+[0-9]+\s+20[0-9]{2}-' | sed 's/^ *//' | cut -c1-90 | head -3)
      curl -s --max-time 15 \
        -H "Title: career-ops: $MATCHES new ranked matches" \
        -H "Tags: briefcase" \
        -H "Click: https://careerops-jobboard-public.vercel.app" \
        -d "${TOP3:-Open the board for today's ranked matches.}" \
        "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || true
    fi
  fi
fi

# keep 30 days of logs
find "$LOGDIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
