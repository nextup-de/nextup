#!/usr/bin/env bash
# Proof of the G4 restore drill: stack/tests/restore-drill.sh on the Docker test host, backups in MinIO (off "the server").
#   bash stack/tests/restore-drill.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "G4 restore drill"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1
host_minio_up || exit 1

export BACKUP_S3_ACCESS_KEY_ID=opstest BACKUP_S3_SECRET_ACCESS_KEY=opstest-secret-123
out="$(host_stack_up drill bbbbbbb --backup-repo "$OPSTEST_S3/drill")"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 40 >&2
t_eq "install-clean drill exits 0" 0 "$rc"

sql() { host_exec "stack/ctl.sh drill exec -T db psql -U nextup -d nextup -tA -c \"$1\""; }
sql "INSERT INTO \\\"User\\\" (name) SELECT 'p' || g FROM generate_series(1, 250) g; INSERT INTO \\\"Case\\\" (title) VALUES ('Leck an Linie 3'), ('Zweiter Fall');" >/dev/null
t_eq "the stack holds 250 people before the drill" 250 "$(sql 'SELECT count(*) FROM \"User\"')"

drill="stack/tests/restore-drill.sh --slug drill --health-url http://localhost:8080/api/health"
out="$(host_exec "printf 'nope\n' | $drill" 2>&1)"; rc=$?
t_eq "a wrong slug at the question exits 1" 1 "$rc"
t_ok "and wipes nothing" bash -c '[[ "$1" == *"nothing wiped"* ]]' _ "$out"
t_eq "the people are still there" 250 "$(sql 'SELECT count(*) FROM \"User\"')"

out="$(host_exec "$drill --yes drill" 2>&1)"; rc=$?
printf '%s\n' "$out" | sed 's/^/    | /'
t_eq "the drill exits 0" 0 "$rc"
t_ok "it deleted the database volume" bash -c '[[ "$1" == *"deleted nextup-drill_pgdata"* ]]' _ "$out"
t_ok "the snapshot came from the off-server repository" bash -c '[[ "$1" == *"off the server: yes"* ]]' _ "$out"
t_ok "it prints the restore time in seconds" bash -c '[[ "$1" =~ \*\*Restore\ time\*\*.*\*\*[0-9]+\ s\*\* ]]' _ "$out"
t_ok "against both targets" bash -c '[[ "$1" == *"against 1 h (RTO_SECONDS 3600"*"| within |"* && "$1" == *"against 4 h (14400 s"* ]]' _ "$out"
t_ok "the data matches, the known case too" bash -c '[[ "$1" == *"| Data | match: "* && "$1" =~ Known\ case\ \|\ before\ .1\ [0-9a-f]{32}.,\ after\ .1\ [0-9a-f]{32}. ]]' _ "$out"
t_ok "PASS" bash -c '[[ "$1" == *"| Result | PASS |"* ]]' _ "$out"
t_eq "250 people after the restore" 250 "$(sql 'SELECT count(*) FROM \"User\"')"
t_ok "the report file is there" host_exec "ls ~/nextup/restore-drill-drill-*.md"

# Over the target fails the drill even when the data came back.
out="$(host_exec "RTO_SECONDS=0 $drill --yes drill" 2>&1)"; rc=$?
t_eq "with RTO_SECONDS=0 the drill exits 1" 1 "$rc"
t_ok "it says OVER for the 1 h line" bash -c '[[ "$1" == *"RTO_SECONDS 0"*"| OVER |"* ]]' _ "$out"

host_exec "stack/ctl.sh drill stop app" >/dev/null 2>&1
out="$(host_exec "$drill --yes drill" 2>&1)"; rc=$?
t_eq "an unhealthy stack is refused before anything is wiped" 1 "$rc"
t_ok "it says so" bash -c '[[ "$1" == *"start from a healthy stack"* ]]' _ "$out"

t_done
