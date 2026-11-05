#!/usr/bin/env bash
# The test phase's run of record on the dedicated test VM (docs/test-phase/RUNBOOK.md, plan TST D10).
# Run it from a checkout, on Kevin's machine. It is the only thing that reaches the VM.
#
#   ops/tst/vm-run.sh <user@host[:port]> <sha7> [--skip-k6] [--people 2000 --weeks 8]
#
# In order, one status line each:
#   1 release        stack/deploy-remote.sh <target> <sha7>            (the forced-command deploy key)
#   2 db port        the stack's db published on the VM's 127.0.0.1:5439 (stack/tst/compose.tst.yml)
#   3 tunnel         ssh -L 127.0.0.1:<local>:127.0.0.1:5439           (never another interface)
#   4 generator      Musterwerk, --people/--weeks, through the tunnel. It replaces the stack's empty company or
#                    an earlier Musterwerk, and refuses any other company, so it cannot wipe a customer's data
#   5 scenario       the Playwright acceptance spec against the VM's address (TST_BASE_URL)
#   6 k6             cookies for 2,000 accounts, then the k6 run        (skipped by --skip-k6)
#   7 restore test   backup.sh <slug> backup, then restore-test; seconds against RTO_SECONDS
#   8 close          the tunnel and the db port go away
#   9 results        docs/test-phase/results/<yyyy-mm-dd>.md
# A failed step 1-4 stops the run (the results file still says how far it got); 5-7 are recorded and
# the run goes on. Exit 0 only when every step that ran passed.
#
# <target> is a normal ssh login of the VM's deploy user (key: TST_SSH_KEY_FILE, default your agent
# or ~/.ssh keys; host key must be in known_hosts). stack/deploy-remote.sh uses the forced-command
# deploy key as ever (DEPLOY_SSH_KEY_FILE, DEPLOY_KNOWN_HOSTS_FILE).
#
# AUTH_SECRET, the Postgres password and the login codes are read over ssh into files of mode 600 in
# a private temp dir, handed to the child that needs them through its environment, never printed,
# never in an argument list, and removed on exit.
#
# Environment (all optional):
#   TST_SSH_KEY_FILE    key for the admin login                       TST_LOCAL_PORT  tunnel port (5439)
#   TST_SEED            generator seed (1)                            TST_ACCOUNTS    k6 accounts (2000)
#   TST_VUS             k6 virtual users (200: about 100 requests/s)  TST_K6_DURATION k6 duration (5m)
#   TST_GENERATOR       a command instead of `npx tsx prisma/generators/musterwerk/run.ts` (given the same options)
#   TST_E2E_CMD         the scenario command, run in apps/app with TST_BASE_URL, TST_SLUG, TST_CODES_FILE set
#                       (default: the TST acceptance spec through playwright.db.config.ts)
#   TST_K6_RUN          default apps/app/tests/load/k6/run.sh; given the cookies file as its argument, and
#                       BASE_URL, VUS, DURATION, TST_K6_SUMMARY (a k6 --summary-export json to write)
#   TST_RESULTS_DIR     default docs/test-phase/results
set -uo pipefail
umask 077

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

usage() { sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed -E 's/^# ?//' >&2; }
die2() { echo "vm-run: $*" >&2; exit 2; }

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
[ "$#" -ge 2 ] || { usage; exit 2; }
target="$1" sha="$2"; shift 2
people=2000 weeks=8 skip_k6=false
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-k6) skip_k6=true; shift ;;
    --people) [ $# -ge 2 ] || die2 "--people needs a value"; people="$2"; shift 2 ;;
    --weeks) [ $# -ge 2 ] || die2 "--weeks needs a value"; weeks="$2"; shift 2 ;;
    *) die2 "unknown option '$1' (see --help)" ;;
  esac
done
tst_valid_target "$target" || die2 "'$target' is not user@host[:port]"
tst_valid_sha "$sha" || die2 "'$sha' is not a 7-char lowercase commit sha"
[[ "$people" =~ ^[1-9][0-9]{0,5}$ ]] || die2 "--people is a number (got '$people')"
[[ "$weeks" =~ ^[1-9][0-9]{0,2}$ ]] || die2 "--weeks is a number (got '$weeks')"
port="${TST_LOCAL_PORT:-5439}"
[[ "$port" =~ ^[0-9]{2,5}$ ]] || die2 "TST_LOCAL_PORT is a port number"
seed="${TST_SEED:-1}"; accounts="${TST_ACCOUNTS:-2000}"
[[ "$seed" =~ ^[0-9]+$ ]] || die2 "TST_SEED is a number"
[[ "$accounts" =~ ^[1-9][0-9]{0,5}$ ]] || die2 "TST_ACCOUNTS is a number"
vus="${TST_VUS:-200}"; k6_duration="${TST_K6_DURATION:-5m}"
[[ "$vus" =~ ^[1-9][0-9]{0,5}$ ]] || die2 "TST_VUS is a number"
[[ "$k6_duration" =~ ^[1-9][0-9]*[smh]$ ]] || die2 "TST_K6_DURATION is like 300s, 5m or 1h"
if ! $skip_k6; then command -v jq >/dev/null || die2 "the results file needs jq (or use --skip-k6)"; fi

app_dir="$repo/apps/app"
results_dir="${TST_RESULTS_DIR:-$repo/docs/test-phase/results}"
rto="$(tst_rto "$repo/docs/ops/RPO_RTO.md")"
tst_set_target "$target"
tst_tmp_init || die2 "no temp dir"
trap tst_exit_handler EXIT
trap 'exit 130' INT TERM

TST_STEP_TOTAL=9
declare -A result secs detail
order=(release dbport tunnel generator scenario k6 restore close results)
slug="" origin="" db_open=false tunnel_pid="" scenario_line="" restore_secs=""
k6_summary="" k6_note="" k6_accounts=""
started="$(date -u +%FT%TZ)"
failed=0

# step <key> <label> <fatal: yes|no> <function>: one status line, time taken, log kept in the temp dir.
step() {
  local key="$1" label="$2" fatal="$3" fn="$4" t0 rc log
  TST_STEP_N=$((TST_STEP_N + 1))
  log="$TST_TMP/$key.log"; ( umask 077; : > "$log" )
  t0=$(date +%s)
  "$fn" >"$log" 2>&1; rc=$?
  secs[$key]=$(( $(date +%s) - t0 ))
  if [ "$rc" -eq 0 ]; then
    result[$key]=ok
    tst_status "$label" ok "${secs[$key]}s${detail[$key]:+, ${detail[$key]}}"
  else
    result[$key]=FAILED; failed=1
    tst_status "$label" FAILED "${secs[$key]}s, exit $rc"
    tail -n 15 "$log" | sed 's/^/    | /' >&2
    if [ "$fatal" = yes ]; then return 1; fi
  fi
  return 0
}
skip_step() { # <key> <label> <why>
  TST_STEP_N=$((TST_STEP_N + 1)); result[$1]=skipped; secs[$1]=0
  tst_status "$2" skipped "$3"
}

remote_get() { # <KEY>: one KEY=value line of the stack's .env, read over ssh
  tst_remote "sed -n 's/^$1=//p' \"\$HOME/nextup/instances/$slug/.env\" | tail -n 1 | tr -d '\\r'"
}
compose_remote='cd "$HOME/nextup" && docker compose -f stack/compose.yml'

do_release() {
  "$repo/stack/deploy-remote.sh" "$target" "$sha" || return 1
  slug="$(tst_remote "sed -n 's/^SLUG=//p' \"\$HOME/nextup/host.conf\" | tail -n 1 | tr -d '\\r'")" || return 1
  [[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || { echo "no SLUG in the VM's host.conf"; return 1; }
  origin="$(remote_get APP_ORIGIN)" || return 1
  [[ "$origin" =~ ^https?://[^[:space:]]+$ ]] || { echo "no APP_ORIGIN in the stack's .env"; return 1; }
  echo "$slug" > "$TST_TMP/slug"; echo "$origin" > "$TST_TMP/origin"
}

do_dbport() {
  # The two secrets: files of mode 600, never echoed.
  tst_secret_file auth_secret >/dev/null || return 1
  tst_secret_file pg_password >/dev/null || return 1
  remote_get AUTH_SECRET > "$TST_TMP/auth_secret" || return 1
  remote_get POSTGRES_PASSWORD > "$TST_TMP/pg_password" || return 1
  [ -s "$TST_TMP/auth_secret" ] && [ -s "$TST_TMP/pg_password" ] || { echo "AUTH_SECRET or POSTGRES_PASSWORD missing in the stack's .env"; return 1; }
  db_open=true
  tst_remote "$compose_remote -f stack/tst/compose.tst.yml --env-file instances/$slug/.env up -d --no-deps db \
    && for i in \$(seq 1 30); do $compose_remote --env-file instances/$slug/.env exec -T db pg_isready -U nextup -d nextup && exit 0; sleep 2; done; exit 1"
}

do_tunnel() {
  tst_ssh_opts
  ssh "${TST_OPTS[@]}" -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -N \
    -L "127.0.0.1:$port:127.0.0.1:5439" "$TST_DEST" &
  tunnel_pid=$!
  TST_BG_PIDS+=("$tunnel_pid")
  tst_wait_port "$port" 30 || { echo "nothing listens on 127.0.0.1:$port"; return 1; }
}

# Runs <command...> in <dir> with the secrets in its environment only.
with_secrets() { # <dir> <command...>
  local dir="$1"; shift
  ( cd "$dir" || exit 1
    AUTH_SECRET="$(<"$TST_TMP/auth_secret")"
    DATABASE_URL="postgresql://nextup:$(<"$TST_TMP/pg_password")@127.0.0.1:$port/nextup"
    export AUTH_SECRET DATABASE_URL TST_BASE_URL="$origin" TST_SLUG="$slug"
    "$@" )
}

do_generator() {
  local codes gen
  codes="$(tst_secret_file codes)" || return 1
  if [ -n "${TST_GENERATOR:-}" ]; then gen=("$TST_GENERATOR"); else gen=(npx tsx prisma/generators/musterwerk/run.ts); fi
  with_secrets "$app_dir" "${gen[@]}" --slug "$slug" --people "$people" --weeks "$weeks" --seed "$seed" --codes "$codes" --replace-generated \
    | sed -E 's/[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}[[:space:]]*$/<code hidden>/'
  return "${PIPESTATUS[0]}"
}

do_scenario() {
  local i cmd
  for i in $(seq 1 45); do
    tst_remote "curl -fs -o /dev/null --max-time 5 '$origin/api/health'" && break
    sleep 2
  done
  if [ -n "${TST_E2E_CMD:-}" ]; then read -r -a cmd <<< "$TST_E2E_CMD"
  else cmd=(npx playwright test -c playwright.db.config.ts tests/e2e/db/musterwerk.spec.ts -g "TST acceptance"); fi
  TST_CODES_FILE="$TST_TMP/codes" with_secrets "$app_dir" "${cmd[@]}"; local rc=$?
  [ "$rc" -eq 0 ] || return "$rc"
  # Playwright exits 0 when every test skips: that is a step that tested nothing, not a pass.
  [ -n "${TST_E2E_CMD:-}" ] || grep -Eq '[1-9][0-9]* passed' "$TST_TMP/scenario.log" || { echo "no test of the scenario passed"; return 1; }
}

do_k6() {
  local cookies run
  cookies="$(tst_secret_file cookies)" || return 1
  k6_summary="$TST_TMP/k6-summary.json"; ( umask 077; : > "$k6_summary" )
  run="${TST_K6_RUN:-$app_dir/tests/load/k6/run.sh}"
  with_secrets "$app_dir" npx tsx tests/load/driver.ts --slug "$slug" --base-url "$origin" --single --accounts "$accounts" --write-cookies "$cookies" || return 1
  k6_accounts="$(jq -r '.accounts | length' "$cookies" 2>/dev/null)"
  detail[k6]="$k6_accounts accounts, $vus virtual users, $k6_duration"
  BASE_URL="$origin" VUS="$vus" DURATION="$k6_duration" TST_K6_SUMMARY="$k6_summary" with_secrets "$app_dir" "$run" "$cookies"
}

do_restore() {
  local out rc
  out="$(tst_remote "cd \"\$HOME/nextup\" && export NEXTUP_INSTANCES=\"\$HOME/nextup/instances\" && stack/backup.sh $slug backup && RTO_SECONDS=$rto stack/backup.sh $slug restore-test" 2>&1)"; rc=$?
  printf '%s\n' "$out"
  restore_secs="$(printf '%s\n' "$out" | tst_seconds_of)"
  return "$rc"
}

do_close() {
  [ -z "$tunnel_pid" ] || { kill "$tunnel_pid" 2>/dev/null; tunnel_pid=""; }
  close_db
}
close_db() {
  $db_open || return 0
  tst_remote "$compose_remote --env-file instances/$slug/.env up -d --no-deps db" && db_open=false
}
tst_on_exit 'close_db'

write_results() {
  local f d k page p95 p99 rate
  mkdir -p "$results_dir" || return 1
  d="$(date -u +%F)"; f="$results_dir/$d.md"
  {
    echo "# Test phase run $d"
    echo
    echo "- Released: \`$sha\` on \`${target#*@}\` (stack \`${slug:-?}\`, ${origin:-?})"
    echo "- Data: Musterwerk, $people people, $weeks weeks, seed $seed"
    echo "- Started $started, finished $(date -u +%FT%TZ) (UTC)"
    echo "- Outcome: $([ "$failed" -eq 0 ] && echo PASS || echo FAIL)"
    echo
    echo "## Steps"
    echo
    echo "| Step | Result | Seconds |"
    echo "|---|---|---|"
    for k in "${order[@]}"; do
      [ "$k" != results ] || continue
      echo "| $k | ${result[$k]:-not run} | ${secs[$k]:--} |"
    done
    echo
    echo "## Scenario"
    echo
    echo "${result[scenario]:-not run}${scenario_line:+ - $scenario_line}"
    echo
    echo "## k6 (budget: p95 < 1000 ms per page, errors < 1 %)"
    echo
    if [ "${result[k6]:-}" = skipped ] || [ ! -s "${k6_summary:-/nonexistent}" ]; then
      echo "${k6_note:-${result[k6]:-not run}}"
    else
      echo "| Page | p95 ms | p99 ms |"
      echo "|---|---|---|"
      for page in inbox case; do
        p95="$(tst_k6_metric "$k6_summary" "$page" 'p(95)')"; p99="$(tst_k6_metric "$k6_summary" "$page" 'p(99)')"
        echo "| $page | $p95 | $p99 |"
      done
      rate="$(jq -r '(.metrics.http_req_failed.value // .metrics.http_req_failed.rate) // "-"' "$k6_summary" 2>/dev/null)"
      echo
      echo "Failed requests: $rate (accounts: ${k6_accounts:-?} of $accounts asked for, virtual users: $vus, duration: $k6_duration)"
    fi
    echo
    echo "## Restore test"
    echo
    if [ -n "$restore_secs" ]; then
      echo "restore-test took **$restore_secs s**, RTO_SECONDS is **$rto** (docs/ops/RPO_RTO.md): $([ "$restore_secs" -le "$rto" ] && echo within || echo OVER) the RTO."
    else
      echo "${result[restore]:-not run} - no seconds recorded (RTO_SECONDS $rto)."
    fi
    echo
    echo "## Versions"
    echo
    echo "- vm-run checkout: \`$(git -C "$repo" rev-parse --short=7 HEAD 2>/dev/null || echo unknown)\`"
    echo "- released sha: \`$sha\`"
    echo "- db image: \`$(awk '/^  [A-Za-z0-9_-]+:/{f=($1=="db:")} f&&$1=="image:"{print $2; exit}' "$repo/stack/compose.yml" | tr -d '\r"')\`"
    echo "- node (this machine): \`$(node --version 2>/dev/null || echo none)\`"
    echo "- k6 image: \`$(grep -ho 'grafana/k6[^ "]*' "$app_dir/tests/load/k6/run.sh" 2>/dev/null | head -n 1)\`"
    echo "- VM: \`$(tst_remote 'uname -sr; docker --version' 2>/dev/null | tr '\n' ' ')\`"
  } > "$f" || return 1
  echo "$f" > "$TST_TMP/results-path"
}

run() {
  step release "release $sha" yes do_release || return 1
  step dbport "open the db port (127.0.0.1 only)" yes do_dbport || return 1
  step tunnel "ssh tunnel to the database" yes do_tunnel || return 1
  step generator "generate Musterwerk ($people people, $weeks weeks)" yes do_generator || return 1
  step scenario "scenario spec against $origin" no do_scenario
  scenario_line="$(tail -n 40 "$TST_TMP/scenario.log" 2>/dev/null | grep -E '[0-9]+ (passed|failed)' | tail -n 1 | sed 's/^[[:space:]]*//')"
  if $skip_k6; then
    skip_step k6 "k6 load run" "--skip-k6"; k6_note="skipped (--skip-k6)"
  else
    step k6 "k6 load run ($accounts accounts)" no do_k6
  fi
  step restore "backup and restore test (RTO ${rto}s)" no do_restore
}

run
# Steps a failure kept from running still get their line. Then, whatever happened, the port closes
# and the results are written.
for i in 0 1 2 3 4 5 6; do
  [ -z "${result[${order[$i]}]:-}" ] || continue
  TST_STEP_N=$i; skip_step "${order[$i]}" "${order[$i]}" "not run: an earlier step failed"
done
TST_STEP_N=7
step close "close the tunnel and the db port" no do_close
step results "write the results file" no write_results
if [ -s "$TST_TMP/results-path" ]; then echo "results: ${results_dir#"$repo"/}/$(basename "$(cat "$TST_TMP/results-path")")"; fi
exit "$failed"
