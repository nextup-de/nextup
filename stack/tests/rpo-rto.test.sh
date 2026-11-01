#!/usr/bin/env bash
# Proof OPS-A1 B2: docs/ops/RPO_RTO.md and a restore within the RTO.
#   bash stack/tests/rpo-rto.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS hands to: docs/ops/RPO_RTO.md and a restore within RTO"
trap host_down EXIT

doc=docs/ops/RPO_RTO.md
rto="$(tr -d '\r' < "$doc" | sed -n 's/^RTO_SECONDS=\([0-9][0-9]*\)$/\1/p')"
t_eq "the doc holds RPO_HOURS=24" 1 "$(tr -d '\r' < "$doc" | grep -cx 'RPO_HOURS=24')"
t_eq "the doc holds RTO_SECONDS=3600" 3600 "$rto"
[ -n "$rto" ] || rto=3600

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1

out="$(host_stack_up opsrto aaaaaaa)"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 40 >&2
t_eq "host_stack_up opsrto exits 0" 0 "$rc"

host_exec "stack/backup.sh opsrto backup" >/dev/null 2>&1
out="$(host_exec "stack/backup.sh opsrto restore-test" 2>&1)"; rc=$?
t_eq "restore-test exits 0" 0 "$rc"
secs="$(printf '%s\n' "$out" | sed -n 's/.*seconds=\([0-9][0-9]*\).*/\1/p' | tail -n 1)"
t_ok "it logs seconds=$secs, at most $rto" bash -c '[ -n "$1" ] && [ "$1" -le "$2" ]' _ "$secs" "$rto"

out2="$(host_exec "RTO_SECONDS=0 stack/backup.sh opsrto restore-test" 2>&1)"; rc=$?
t_eq "restore-test with RTO_SECONDS=0 exits 1" 1 "$rc"
t_ok "it says over RTO" bash -c '[[ "$1" == *"over RTO"* ]]' _ "$out2"

want="$(host_exec "awk '/^  [A-Za-z0-9_-]+:/{f=(\$1==\"db:\")} f&&\$1==\"image:\"{print \$2; exit}' stack/compose.yml")"
t_ok "the restore-test log names the db image of compose.yml ($want)" \
  bash -c '[ -n "$2" ] && [[ "$1" == *"image=$2 "* ]]' _ "$out" "$want"

id="$(host_exec "stack/backup.sh opsrto snapshots --json" | jq -r '.[-1].short_id')"
out="$(printf 'opsrto\n' | host_exec "stack/backup.sh opsrto restore $id" 2>&1)"; rc=$?
t_eq "restore $id exits 0" 0 "$rc"
t_ok "it logs seconds=" bash -c '[[ "$1" =~ restored.*seconds=[0-9]+ ]]' _ "$out"
healthy=""
for _ in $(seq 1 30); do
  if [ "$(host_exec "curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/health")" = 200 ]; then healthy=200; break; fi
  sleep 2
done
t_eq "the app is healthy after the restore" 200 "$healthy"

t_done
