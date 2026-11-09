#!/usr/bin/env bash
# G4 criterion 2 (2,000 accounts, p95 under 1 s): the k6 run in three stages, one verdict per stage and page.
# docs/test-phase/G4_DRILLS.md. It is a TST_K6_RUN for ops/tst/vm-run.sh, and tests/load/g4-load.sh calls it too.
#
#   tests/load/k6/g4-stages.sh <cookies.json>
#   TST_K6_RUN=apps/app/tests/load/k6/g4-stages.sh ops/tst/vm-run.sh deploy@<host> <sha7>
#
# The stages are the two of tests/load/musterwerk-load.test.ts plus vm-run's default, on the same budget
# (p95 < 1,000 ms per page, failed requests < 1 %, no body over 2 MB: the thresholds of musterwerk.js):
#   workday  one person in forty on a page at any moment: ceil(G4_PEOPLE / 40) virtual users   (50 at 2,000)
#   peak     PEAK_VUS virtual users, vm-run's default (200, about 100 requests/s)
#   all      every person on a page at once: G4_PEOPLE virtual users                          (2,000)
# Criterion 2 passes when every stage in G4_REQUIRED (default "workday all", the two tests' stages) is within the
# budget. "peak" is there to show where the line is when "all" is not.
#
# Environment (all optional):
#   BASE_URL       the server k6 loads (default: the cookie file's)
#   G4_PEOPLE      people in the company (2000); sets the workday and all stages
#   PEAK_VUS       200          DURATION   per stage, like 300s, 5m (5m)
#   G4_STAGES      "workday peak all"       G4_REQUIRED  "workday all"
#   G4_REPORT      the markdown report (default test-results/load/g4-load-<utc time>.md, from the current dir)
#   TST_K6_SUMMARY a k6 summary json to write: the last stage that ran (what vm-run's results table reads)
#   K6_RUN         the k6 runner, given the cookies file with VUS, DURATION, TST_K6_SUMMARY (default run.sh here)
# Exit 0: criterion 2 holds for the stages run. 1: a required stage is over budget or k6 failed. 2: bad input.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cookies="${1:?usage: g4-stages.sh <cookies.json>}"
[ -r "$cookies" ] || { echo "g4-stages: cannot read $cookies" >&2; exit 2; }
command -v jq >/dev/null || { echo "g4-stages: needs jq" >&2; exit 2; }
people="${G4_PEOPLE:-2000}" peak="${PEAK_VUS:-200}" duration="${DURATION:-5m}"
stages="${G4_STAGES:-workday peak all}" required="${G4_REQUIRED:-workday all}"
[[ "$people" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "g4-stages: G4_PEOPLE is a number" >&2; exit 2; }
[[ "$peak" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "g4-stages: PEAK_VUS is a number" >&2; exit 2; }
[[ "$duration" =~ ^[1-9][0-9]*[smh]$ ]] || { echo "g4-stages: DURATION is like 300s, 5m or 1h" >&2; exit 2; }
run="${K6_RUN:-$here/run.sh}"
report="${G4_REPORT:-test-results/load/g4-load-$(date -u +%Y%m%dT%H%M%SZ).md}"
mkdir -p "$(dirname "$report")" || exit 2
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

accounts="$(jq -r '.accounts | length' "$cookies")"
inbox="$(jq -r '[.accounts[] | select(.inbox)] | length' "$cookies")"
base="${BASE_URL:-$(jq -r .baseUrl "$cookies")}"

vus_of() {
  case "$1" in
    workday) echo $(( (people + 39) / 40 < 5 ? 5 : (people + 39) / 40 )) ;;
    peak) echo "$peak" ;;
    all) echo "$people" ;;
    *) return 1 ;;
  esac
}
for s in $stages $required; do vus_of "$s" >/dev/null || { echo "g4-stages: unknown stage '$s' (workday, peak, all)" >&2; exit 2; }; done

# <summary> <jq path> -> a number rounded to whole ms, or "-"
num() { jq -r "($2) // \"-\" | if type==\"number\" then (.*1|round) else . end" "$1" 2>/dev/null || echo "-"; }
p95() { num "$1" "(.metrics[\"http_req_duration{page:$2}\"][\"p(95)\"] // .metrics[\"http_req_duration{page:$2}\"].values[\"p(95)\"])"; }

# One verdict per stage, as plain variables (the Mac's /bin/bash 3.2 has no `declare -A`).
set_verdict() { printf -v "verdict_$1" '%s' "$2"; }
verdict_of() { local n="verdict_$1"; printf '%s' "${!n:-}"; }
rows=() last=""
for s in $stages; do
  vus="$(vus_of "$s")"; summary="$work/$s.json"
  echo "== stage $s: $vus virtual users, $duration, $accounts accounts against $base"
  BASE_URL="$base" VUS="$vus" DURATION="$duration" TST_K6_SUMMARY="$summary" "$run" "$cookies"; rc=$?
  # 99 is k6's "thresholds crossed": the figures are there and say what. Anything else is a run that broke.
  if [ ! -s "$summary" ]; then
    set_verdict "$s" "FAILED (k6 exit $rc, no summary)"; rows+=("| $s | $vus | - | - | - | - | - | $(verdict_of "$s") |"); continue
  fi
  last="$summary"
  ib="$(p95 "$summary" inbox)" cs="$(p95 "$summary" case)"
  reqs="$(num "$summary" '.metrics.http_reqs.count // .metrics.http_reqs.values.count')"
  fail="$(jq -r '((.metrics.http_req_failed.value // .metrics.http_req_failed.rate // .metrics.http_req_failed.values.rate) // "-") | if type=="number" then ((.*10000|round)/100|tostring) + " %" else . end' "$summary")"
  big="$(num "$summary" '.metrics.oversize_responses.count // .metrics.oversize_responses.values.count // 0')"
  why=()
  for pair in "inbox:$ib" "case:$cs"; do
    v="${pair#*:}"
    if [ "$v" = "-" ]; then why+=("no ${pair%%:*} requests"); elif [ "$v" -ge 1000 ]; then why+=("${pair%%:*} p95 $v ms"); fi
  done
  rate="$(jq -r '(.metrics.http_req_failed.value // .metrics.http_req_failed.rate // .metrics.http_req_failed.values.rate) // 1' "$summary")"
  jq -en --argjson r "$rate" '$r < 0.01' >/dev/null || why+=("failed requests $fail")
  [ "$big" = "-" ] || [ "$big" -eq 0 ] || why+=("$big bodies over 2 MB")
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 99 ]; then why+=("k6 exit $rc"); fi
  if [ "${#why[@]}" -eq 0 ]; then set_verdict "$s" PASS; else set_verdict "$s" "FAIL: $(IFS=,; echo "${why[*]}" | sed 's/,/, /g')"; fi
  rows+=("| $s | $vus | $reqs | $ib | $cs | $fail | $big | $(verdict_of "$s") |")
done
[ -z "${TST_K6_SUMMARY:-}" ] || [ -z "$last" ] || cp "$last" "$TST_K6_SUMMARY"

outcome=PASS missing=()
for s in $required; do
  case "$(verdict_of "$s")" in
    PASS) ;;
    "") missing+=("$s") ;;
    *) outcome=FAIL ;;
  esac
done
# A stage over budget decides it; only when none is, a stage not run leaves it open.
[ "$outcome" = FAIL ] || [ "${#missing[@]}" -eq 0 ] || outcome=INCOMPLETE

{
  echo "# G4 criterion 2: load run $(date -u +%FT%TZ)"
  echo
  echo "- Server: $base"
  echo "- Company: $people people; $accounts accounts with a page to load ($inbox with the inbox)"
  echo "- Budget per stage: p95 < 1,000 ms for inbox and case, failed requests < 1 %, no body over 2 MB; $duration per stage"
  echo
  echo "| Stage | Virtual users | Requests | inbox p95 ms | case p95 ms | Failed | Over 2 MB | Verdict |"
  echo "|---|---|---|---|---|---|---|---|"
  printf '%s\n' "${rows[@]}"
  echo
  if [ "$outcome" = INCOMPLETE ]; then
    echo "**Criterion 2: not shown** - required stage(s) not run: ${missing[*]} (G4_REQUIRED=\"$required\")."
  else
    echo "**Criterion 2: $outcome** (required stages: $required)."
  fi
} > "$report"
cat "$report"
echo "report: $report"
[ "$outcome" = PASS ]
