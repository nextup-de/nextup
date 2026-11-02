#!/usr/bin/env bash
# Proof OPS-Z1 B1: the whole deploy path on a clean host with the real scripts - install from images,
# release over the forced command, the pre-migrate snapshot off-box, restore within the RTO.
#   bash stack/tests/deploy-path.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS acceptance: release on a clean host backs up before migrating and restores within RTO"
trap host_down EXIT

# On this machine: no floating image, and the RTO from the doc.
t_eq "stack/compose.yml has no :latest" 0 "$(grep -c ':latest' stack/compose.yml)"
rto="$(tr -d '\r' < docs/ops/RPO_RTO.md | sed -n 's/^RTO_SECONDS=\([0-9][0-9]*\)$/\1/p' | head -n 1)"
t_ok "RTO_SECONDS is read from docs/ops/RPO_RTO.md ($rto)" test -n "$rto"
[ -n "$rto" ] || rto=3600

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1
host_minio_up || exit 1
host_sshd_up /home/deploy/nextup/stack/remote/host.sh || exit 1
host_mirror bbbbbbb || exit 1

q() { host_exec "stack/ctl.sh opsz exec -T db psql -U nextup -d nextup -tAc \"$1\"" 2>/dev/null | tr -d '\r'; }

# 1. A clean install from images with an off-box backup repository.
export BACKUP_S3_ACCESS_KEY_ID=opstest BACKUP_S3_SECRET_ACCESS_KEY=opstest-secret-123
out="$(host_stack_up opsz aaaaaaa --backup-repo "$OPSTEST_S3/opsz" 2>&1)"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 40 >&2
t_eq "1. install-clean opsz exits 0" 0 "$rc"
t_ok "1. its last line ends in '0 failed'" bash -c '[[ "$1" == *"0 failed" ]]' _ "$(printf '%s\n' "$out" | tail -n 1)"
t_ok "1. the .env has BACKUP_OFFBOX=required" host_exec 'grep -qx BACKUP_OFFBOX=required ~/nextup/instances/opsz/.env'
unset BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY

# 2. A marker row.
host_exec "stack/ctl.sh opsz exec -T db psql -U nextup -d nextup -c \"INSERT INTO \\\"User\\\"(name) VALUES ('ops-marker')\"" >/dev/null 2>&1
t_eq "2. the marker is in the database" 1 "$(q "SELECT count(*) FROM \\\"User\\\" WHERE name='ops-marker'")"

# 3. host.conf.
host_exec 'printf "SLUG=opsz\nNEXTUP_REGISTRY=localhost:5000/nextup\nNEXTUP_STACK_URL=file:///srv/mirror/{sha}.tar.gz\n" > /home/deploy/nextup/host.conf'
t_ok "3. host.conf is written" host_exec 'grep -qx SLUG=opsz /home/deploy/nextup/host.conf'

# 4. Release bbbbbbb as ci over the forced command.
client=/opt/nextup-src/stack/deploy-remote.sh
out="$(host_ci "$client deploy@127.0.0.1 bbbbbbb" 2>&1)"; rc=$?
printf '%s\n' "$out" | sed 's/^/    | /'
t_eq "4. deploy-remote bbbbbbb exits 0" 0 "$rc"
t_ok "4. its output has no 'code:'" bash -c '[[ "$1" != *"code:"* ]]' _ "$out"
t_ok "4. the .env names sha-bbbbbbb" host_exec 'grep -q "^NEXTUP_APP_IMAGE=.*sha-bbbbbbb" ~/nextup/instances/opsz/.env'
t_eq "4. the app answers fake v2" "fake v2" "$(host_exec 'curl -fs http://localhost:8080/' 2>/dev/null)"
t_eq "4. _prisma_migrations has 2 finished rows" 2 "$(q 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"

# 5. The pre-migrate snapshot is in the MinIO repository and older than migration 002.
sel='[.[] | select((.tags // []) | index("opsz-pre-migrate") and index("release-bbbbbbb"))] | last'
id="$(host_exec "stack/backup.sh opsz snapshots --json | jq -r '$sel | .short_id // empty'" 2>/dev/null)"
snap_time="$(host_exec "stack/backup.sh opsz snapshots --json | jq -r '$sel | .time // empty'" 2>/dev/null)"
t_ok "5. a snapshot tagged opsz-pre-migrate and release-bbbbbbb is listed ($id)" test -n "$id"
fin="$(q "SELECT finished_at FROM _prisma_migrations WHERE migration_name LIKE '%002_case'")"
t_ok "5. its time ($snap_time) is before 002_case finished_at ($fin)" \
  host_exec "[ -n '$snap_time' ] && [ -n '$fin' ] && [ \$(date -d '$snap_time' +%s) -lt \$(date -d '$fin' +%s) ]"

# 6. restore-test of that snapshot: the state before the migration, within the RTO.
out="$(host_exec "stack/backup.sh opsz restore-test $id" 2>&1)"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 20 >&2
t_eq "6. restore-test exits 0" 0 "$rc"
t_ok "6. it logs migrations=1" bash -c '[[ "$1" == *"migrations=1 "* ]]' _ "$out"
secs="$(printf '%s\n' "$out" | sed -n 's/.*seconds=\([0-9][0-9]*\).*/\1/p' | tail -n 1)"
t_ok "6. seconds=$secs is at most $rto" bash -c '[ -n "$1" ] && [ "$1" -le "$2" ]' _ "$secs" "$rto"

# 7. Lose the data, restore the snapshot.
host_exec "stack/ctl.sh opsz exec -T db psql -U nextup -d nextup -c 'DELETE FROM \"User\"'" >/dev/null 2>&1
t_eq "7. the users are gone" 0 "$(q 'SELECT count(*) FROM \"User\"')"
out="$(host_exec "echo opsz | stack/backup.sh opsz restore $id" 2>&1)"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 20 >&2
t_eq "7. restore exits 0" 0 "$rc"
secs="$(printf '%s\n' "$out" | sed -n 's/.*seconds=\([0-9][0-9]*\).*/\1/p' | tail -n 1)"
t_ok "7. seconds=$secs is at most $rto" bash -c '[ -n "$1" ] && [ "$1" -le "$2" ]' _ "$secs" "$rto"
t_eq "7. the marker row is back" 1 "$(q "SELECT count(*) FROM \\\"User\\\" WHERE name='ops-marker'")"
t_eq "7. _prisma_migrations has 1 row" 1 "$(q 'SELECT count(*) FROM _prisma_migrations')"
t_ok "7. /api/health answers 200 within 60 s" host_exec \
  'for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w %{http_code} http://localhost:8080/api/health)" = 200 ] && exit 0; sleep 1; done; exit 1'

# 8. The way forward after a restore: release the same sha again.
host_ci "$client deploy@127.0.0.1 bbbbbbb" >/dev/null 2>&1; rc=$?
t_eq "8. releasing bbbbbbb again exits 0" 0 "$rc"
t_eq "8. _prisma_migrations has 2 rows again" 2 "$(q 'SELECT count(*) FROM _prisma_migrations')"

# 9. status.
out="$(host_ci "$client deploy@127.0.0.1 status" 2>&1)"
t_ok "9. status prints opsz" bash -c '[[ "$1" == *opsz* ]]' _ "$out"
t_ok "9. status prints bbbbbbb" bash -c '[[ "$1" == *bbbbbbb* ]]' _ "$out"

t_done
