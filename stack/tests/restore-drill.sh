#!/usr/bin/env bash
# G4 criterion 6, the restore drill (docs/test-phase/G4_DRILLS.md). Run it ON a test VM as the deploy user, from
# ~/nextup. It takes a backup, wipes the stack's data, restores the backup into the live stack and prints how long
# that took and whether the data came back. NEVER on a customer's or the shared box: it deletes the database.
#
#   stack/tests/restore-drill.sh --slug tst                  # asks you to type the slug before it wipes
#   stack/tests/restore-drill.sh --slug tst --yes tst        # the same without the question
#   scp stack/tests/restore-drill.sh deploy@<vm>:nextup/   # a released stack/ older than this file: copy it,
#   ~/nextup/restore-drill.sh --slug tst                   # it then uses ~/nextup/stack
#
# In order:
#   1 before     the stack answers <origin>/api/health; row count of every table, and the case with the most events
#   2 backup     stack/backup.sh <slug> backup, to the stack's RESTIC_REPOSITORY (s3: on the test VM: off the server)
#   3 wipe       --- the clock starts: the decision to restore ---
#                ctl.sh down, then the stack's data volumes go (pgdata, n8ndata, maildata). Caddy's certificate
#                volumes stay, so repeated drills do not run into Let's Encrypt's limits.
#   4 reinstall  ctl.sh up -d: an empty database, migrated, as after an install
#   5 restore    stack/backup.sh <slug> restore <the snapshot of step 2>, read back from the repository
#   6 healthy    <origin>/api/health answers 200 --- the clock stops (docs/ops/RPO_RTO.md: "until /api/health
#                answers 200 again")
#   7 after      the same counts and the same case, compared with step 1
# The result goes to the screen and to ~/nextup/restore-drill-<slug>-<utc>.md (no secret in it). The time is shown
# against RTO_SECONDS (default 3600, docs/ops/RPO_RTO.md) and against 4 h (14400 s, the budget plan's figure), as the
# target is not decided yet. Exit 0 when the data matches, the app is healthy and the time is within RTO_SECONDS.
#
# Options: --health-url URL (default: APP_ORIGIN of the stack's .env), --wait S (seconds to wait for health, 900).
set -uo pipefail
umask 077

here="$(cd "$(dirname "$0")" && pwd)"
home="${NEXTUP_HOME:-$HOME/nextup}"
# From stack/tests of a checkout, or copied alone next to a released ~/nextup/stack (whose commit may predate it).
if [ -x "$here/../ctl.sh" ]; then stack="$(cd "$here/.." && pwd)"; else stack="$home/stack"; fi
[ -x "$stack/ctl.sh" ] && [ -x "$stack/backup.sh" ] || { echo "restore-drill: no stack/ctl.sh and backup.sh in $stack" >&2; exit 2; }
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$home/instances}"

slug="" yes="" health="" wait_s=900
while [ $# -gt 0 ]; do
  case "$1" in
    --slug) slug="${2:?--slug needs a value}"; shift 2 ;;
    --yes) yes="${2:?--yes needs the slug}"; shift 2 ;;
    --health-url) health="${2:?--health-url needs a value}"; shift 2 ;;
    --wait) wait_s="${2:?--wait needs seconds}"; shift 2 ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed -E 's/^# ?//'; exit 0 ;;
    *) echo "restore-drill: unknown option '$1' (see --help)" >&2; exit 2 ;;
  esac
done
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || { echo "restore-drill: --slug is required (see --help)" >&2; exit 2; }
[[ "$wait_s" =~ ^[0-9]+$ ]] || { echo "restore-drill: --wait is seconds" >&2; exit 2; }
env_file="$NEXTUP_INSTANCES/$slug/.env"
[ -f "$env_file" ] || { echo "restore-drill: no stack '$slug' ($env_file missing)" >&2; exit 2; }
get() { grep -E "^$1=" "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '\r'; }
[ -n "$health" ] || health="$(get APP_ORIGIN)/api/health"
rto="${RTO_SECONDS:-3600}" budget_plan=14400
repo="$(get RESTIC_REPOSITORY)"

ctl() { "$stack/ctl.sh" "$slug" "$@"; }
psql_q() { ctl exec -T db psql -U nextup -d nextup -v ON_ERROR_STOP=1 -tA "$@"; }
code_of() { curl -s -o /dev/null --max-time 5 -w '%{http_code}' "$health" 2>/dev/null; }
step() { printf '[%s/7] %s\n' "$1" "$2"; }
fail() { echo "restore-drill: $*" >&2; exit 1; }

# Row counts of every table of the public schema, "<table> <count>" sorted; then the case with the most events.
fingerprint() { # <out file>
  printf '%s\n' "SELECT format('SELECT %L || '' '' || count(*) FROM public.%I', table_name, table_name)
    FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name \\gexec" \
    | psql_q > "$1" || return 1
  [ -s "$1" ] || { echo "no tables"; return 1; }
}
# "<case id> <events> <md5 of the events' rows>", or "<id> <md5 of the row>" for a stack without CaseEvent.
known_case() { # [case id]
  local id="${1:-}"
  [[ "$id" =~ ^[A-Za-z0-9_.:-]*$ ]] || id="-"
  if [ "$(psql_q -c "SELECT to_regclass('public.\"CaseEvent\"') IS NOT NULL")" = t ]; then
    if [ -z "$id" ]; then
      psql_q -F ' ' -c 'SELECT e."targetId", count(*), md5(string_agg(e::text, chr(10) ORDER BY e.seq)) FROM "CaseEvent" e
        WHERE e."targetId" IN (SELECT "caseId" FROM "CaseView") GROUP BY e."targetId" ORDER BY count(*) DESC, e."targetId" LIMIT 1'
    else
      psql_q -F ' ' -c "SELECT e.\"targetId\", count(*), md5(string_agg(e::text, chr(10) ORDER BY e.seq)) FROM \"CaseEvent\" e
        WHERE e.\"targetId\" = '$id' GROUP BY e.\"targetId\""
    fi
  elif [ "$(psql_q -c "SELECT to_regclass('public.\"Case\"') IS NOT NULL")" = t ]; then
    psql_q -F ' ' -c "SELECT c.id, md5(c::text) FROM \"Case\" c ${id:+WHERE c.id::text = '$id'} ORDER BY c.id LIMIT 1"
  fi
}
# The newest snapshot tagged <slug> (what `backup` just wrote), from `backup.sh snapshots --json`.
newest_snapshot() {
  local json; json="$("$stack/backup.sh" "$slug" snapshots --json)" || return 1
  if command -v jq >/dev/null; then
    printf '%s' "$json" | jq -r --arg s "$slug" '[.[] | select((.tags // []) | index($s))] | sort_by(.time) | last | .short_id // empty'
  else
    printf '%s' "$json" | python3 -c 'import json,sys; s=sys.argv[1]; l=sorted([x for x in json.load(sys.stdin) if s in (x.get("tags") or [])], key=lambda x: x["time"]); print(l[-1]["short_id"] if l else "")' "$slug"
  fi
}

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
started_at="$(date -u +%FT%TZ)"

step 1 "before: $health and a fingerprint of the data"
[ "$(code_of)" = 200 ] || fail "$health does not answer 200 - start from a healthy stack"
fingerprint "$work/before" || fail "could not count the tables (is the db running?)"
case_before="$(known_case)"
tables="$(wc -l < "$work/before" | tr -d ' ')"; rows="$(awk '{s+=$2} END {print s+0}' "$work/before")"
echo "    $tables tables, $rows rows; known case: ${case_before:-none}"

step 2 "backup to ${repo:-the default local repository}"
t=$(date +%s)
"$stack/backup.sh" "$slug" backup || fail "backup failed"
backup_s=$(( $(date +%s) - t ))
snap="$(newest_snapshot)"; [ -n "$snap" ] || fail "no snapshot tagged $slug after the backup"
repo="$(get RESTIC_REPOSITORY)"
case "$repo" in s3:*|b2:*|sftp:*|rest:*|azure:*|gs:*|swift:*|rclone:*) offbox=yes ;; *) offbox="no ($repo)" ;; esac
echo "    snapshot $snap in ${backup_s}s, off the server: $offbox"

if [ "$yes" != "$slug" ]; then
  read -r -p "This DELETES the database of '$slug' and restores snapshot $snap. Type the slug: " answer
  [ "$answer" = "$slug" ] || fail "not confirmed - nothing wiped"
fi

step 3 "wipe: stop the stack, delete its data volumes (the clock starts)"
t0=$(date +%s)
ctl down >/dev/null 2>&1 || fail "ctl.sh down failed"
for v in pgdata n8ndata maildata; do
  if docker volume inspect "nextup-${slug}_$v" >/dev/null 2>&1; then docker volume rm "nextup-${slug}_$v" >/dev/null || fail "could not delete volume nextup-${slug}_$v"; echo "    deleted nextup-${slug}_$v"; fi
done
! docker volume inspect "nextup-${slug}_pgdata" >/dev/null 2>&1 || fail "the database volume is still there"

step 4 "reinstall: ctl.sh up -d (an empty, migrated database)"
ctl up -d --remove-orphans >/dev/null 2>&1 || fail "ctl.sh up -d failed"
for _ in $(seq 1 90); do ctl exec -T db pg_isready -U nextup -d nextup >/dev/null 2>&1 && break; sleep 2; done
empty="$(psql_q -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo '?')"
echo "    database up, $empty tables before the restore"

step 5 "restore snapshot $snap"
printf '%s\n' "$slug" | "$stack/backup.sh" "$slug" restore "$snap" || fail "backup.sh restore failed"

step 6 "wait for $health (the clock stops at 200)"
healthy=no
for _ in $(seq 1 "$wait_s"); do
  if [ "$(code_of)" = 200 ]; then healthy=yes; break; fi
  sleep 1
done
restore_s=$(( $(date +%s) - t0 ))
[ "$healthy" = yes ] || echo "    not healthy after ${wait_s}s"

step 7 "after: the same fingerprint"
fingerprint "$work/after" || : > "$work/after"
case_id="${case_before%% *}"
case_after="$(known_case "$case_id")"
data=match
diff -u "$work/before" "$work/after" > "$work/diff" || data=DIFFERENT
[ "$case_before" = "$case_after" ] || data=DIFFERENT

verdict() { [ "$restore_s" -le "$1" ] && echo within || echo OVER; }
ok=yes
[ "$healthy" = yes ] && [ "$data" = match ] && [ "$restore_s" -le "$rto" ] || ok=no
report="$home/restore-drill-$slug-$(date -u +%Y%m%dT%H%M%SZ).md"
{
  echo "# Restore drill: $slug, $started_at"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| Snapshot | \`$snap\`, off the server: $offbox |"
  echo "| Backup took | ${backup_s} s (not part of the restore time) |"
  echo "| **Restore time** (wipe -> /api/health 200) | **${restore_s} s** ($(( restore_s / 60 )) min $(( restore_s % 60 )) s) |"
  echo "| against 1 h (RTO_SECONDS $rto, docs/ops/RPO_RTO.md) | $(verdict "$rto") |"
  echo "| against 4 h (14400 s, the budget plan) | $(verdict "$budget_plan") |"
  echo "| Healthy afterwards | $healthy ($health) |"
  echo "| Data | $data: $tables tables, $rows rows before |"
  echo "| Known case | before \`${case_before:-none}\`, after \`${case_after:-none}\` |"
  echo "| Result | $([ "$ok" = yes ] && echo PASS || echo FAIL) |"
  if [ "$data" != match ]; then echo; echo '```diff'; head -n 60 "$work/diff"; echo '```'; fi
} > "$report"
echo; cat "$report"; echo; echo "report: $report"
[ "$ok" = yes ]
