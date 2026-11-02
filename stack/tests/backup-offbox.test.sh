#!/usr/bin/env bash
# Proof OPS-A1 B1: stack/backup.sh with an off-box (S3) repository, pre-migrate snapshots and BACKUP_OFFBOX.
#   bash stack/tests/backup-offbox.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS hands to: stack/backup.sh with an off-box RESTIC_REPOSITORY"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1
host_minio_up || exit 1

export BACKUP_S3_ACCESS_KEY_ID=opstest BACKUP_S3_SECRET_ACCESS_KEY=opstest-secret-123
out="$(host_stack_up opsbk aaaaaaa --backup-repo "$OPSTEST_S3/opsbk")"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 40 >&2
last="$(printf '%s\n' "$out" | tail -n 1)"
t_ok "install-clean ends with '0 failed' ($last)" bash -c '[[ "$1" == *", 0 failed" ]]' _ "$last"

# Number of snapshots in the repository carrying the given tag.
count() { # <tag>
  host_exec "stack/backup.sh opsbk snapshots --json | jq --arg t '$1' '[.[] | select(.tags | index(\$t))] | length'"
}
t_eq "one snapshot tagged opsbk" 1 "$(count opsbk)"

host_exec "printf 'AWS_ACCESS_KEY_ID=wrong\nAWS_SECRET_ACCESS_KEY=wrong\n' >> ~/nextup/instances/opsbk/.env"
host_exec "stack/backup.sh opsbk backup" >/dev/null 2>&1; rc=$?
t_eq "backup exits 0 although the app's AWS_* keys are wrong" 0 "$rc"
t_eq "two snapshots tagged opsbk" 2 "$(count opsbk)"

out="$(host_exec "stack/backup.sh opsbk pre-migrate aaaaaaa" 2>&1)"; rc=$?
t_eq "pre-migrate aaaaaaa exits 0" 0 "$rc"
t_ok "it logs the pre-migrate line" bash -c '[[ "$1" =~ opsbk:\ pre-migrate\ backup\ done\ aaaaaaa\ [0-9a-f]{8} ]]' _ "$out"
t_eq "one snapshot tagged opsbk-pre-migrate" 1 "$(count opsbk-pre-migrate)"
t_eq "one snapshot tagged release-aaaaaaa" 1 "$(count release-aaaaaaa)"
t_eq "the pre-migrate snapshot is not tagged opsbk" 2 "$(count opsbk)"

host_exec "stack/backup.sh opsbk pre-migrate abc" >/dev/null 2>&1; rc=$?
t_eq "pre-migrate abc exits 2" 2 "$rc"

host_exec "stack/backup.sh opsbk backup" >/dev/null 2>&1
t_eq "the pre-migrate snapshot survives another backup" 1 "$(count opsbk-pre-migrate)"

host_exec "sed -i 's#^RESTIC_REPOSITORY=.*#RESTIC_REPOSITORY=/home/deploy/local-repo#' ~/nextup/instances/opsbk/.env"
out="$(host_exec "stack/backup.sh opsbk backup" 2>&1)"; rc=$?
t_eq "backup with a local repository and BACKUP_OFFBOX=required exits 1" 1 "$rc"
t_ok "it names BACKUP_OFFBOX" bash -c '[[ "$1" == *BACKUP_OFFBOX* ]]' _ "$out"

# Without --backup-repo and the keys the stack backs up locally, as before.
unset BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY
host_exec "stack/ctl.sh opsbk down" >/dev/null 2>&1   # both stacks want port 8080
out="$(host_stack_up opslocal aaaaaaa)"; rc=$?
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | tail -n 40 >&2
t_eq "a stack without --backup-repo installs" 0 "$rc"
t_ok "opslocal backs up to its default local repository" \
  host_exec "stack/backup.sh opslocal backup && test -d ~/nextup-backups/opslocal"

t_done
