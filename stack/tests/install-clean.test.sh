#!/usr/bin/env bash
# Proof for the harness and install-clean.sh: stack/tests/README.md.
#   bash stack/tests/install-clean.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS hands to: stack/tests/install-clean.sh installs a stack on a clean host from images only"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1
host_minio_up || exit 1
host_root "printf '#!/bin/sh\necho \"got: \$SSH_ORIGINAL_COMMAND\"\n' > /home/deploy/echo-command.sh; chmod 755 /home/deploy/echo-command.sh" || exit 1
host_sshd_up /home/deploy/echo-command.sh || exit 1
host_mirror aaaaaaa || exit 1

out="$(host_stack_up opsclean aaaaaaa)"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 40 >&2
t_eq "host_stack_up opsclean aaaaaaa exits 0" 0 "$rc"
last="$(printf '%s\n' "$out" | tail -n 1)"
t_ok "its last line ends in '0 failed' ($last)" bash -c '[[ "$1" == *", 0 failed" ]]' _ "$last"

t_ok ".env names the aaaaaaa app image" \
  host_exec "grep -qx 'NEXTUP_APP_IMAGE=localhost:5000/nextup/nextup-app:sha-aaaaaaa' ~/nextup/instances/opsclean/.env"
psql_q='stack/ctl.sh opsclean exec -T db psql -U nextup -d nextup -tAc'
t_eq "\"Company\" holds opsclean" opsclean "$(host_exec "$psql_q 'SELECT slug FROM \"Company\"'")"
t_eq "_prisma_migrations has one row" 1 "$(host_exec "$psql_q 'SELECT count(*) FROM _prisma_migrations'")"
t_eq "http://localhost:8080/ serves the fake v1 app" "fake v1" "$(host_exec "curl -s http://localhost:8080/")"

host_stack_up opsclean aaaaaaa >/dev/null 2>&1; rc=$?
t_ok "a second host_stack_up opsclean aaaaaaa exits non-zero (not clean)" test "$rc" -ne 0

s3_host="${OPSTEST_S3#s3:http://}"
t_eq "MinIO health answers 200 at $s3_host" 200 \
  "$(host_exec "curl -s -o /dev/null -w '%{http_code}' http://$s3_host/minio/health/live")"
t_eq "ssh as ci runs only the forced command" "got: hello world" \
  "$(host_ci "ssh -i ~/.ssh/nextup-deploy deploy@127.0.0.1 hello world")"
t_ok "the mirror tarball lists nextup-aaaaaaa/stack/compose.yml" \
  host_exec "tar -tzf /srv/mirror/aaaaaaa.tar.gz | grep -qx 'nextup-aaaaaaa/stack/compose.yml'"

t_done
