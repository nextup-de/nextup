#!/usr/bin/env bash
# Encrypted backups of one company stack with restic (docs/PLATFORM_PLAN.md, stage 1 step 5).
#
#   stack/backup.sh acme backup              # database dump + the instance .env (+ n8n data)
#   stack/backup.sh all backup               # every installed stack (what cron runs nightly)
#   stack/backup.sh all restore-test         # every stack's latest snapshot (cron, weekly)
#   stack/backup.sh acme snapshots           # list what's there
#   stack/backup.sh acme restore-test [ID]   # restore into a throwaway project and check it
#   stack/backup.sh acme restore ID          # replace the LIVE database (asks for the slug)
#
# Each stack has its own repository and password. Both live in the stack's .env and are added
# on the first run if missing:
#   RESTIC_REPOSITORY  where backups go. An absolute path is a folder on this machine
#                      (default: $NEXTUP_BACKUPS/<slug> or ~/nextup-backups/<slug>, NOT off-box). sftp:, s3:, rest: work
#                      as restic understands them.
#   RESTIC_PASSWORD    encrypts the repository. Keep a copy OFF this machine (password manager):
#                      without it no backup can be read.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
instances="${NEXTUP_INSTANCES:-$here/instances}"
# Outside the repo by default, so a laptop never has backups in the working tree.
backups="${NEXTUP_BACKUPS:-$HOME/nextup-backups}"
restic_image="restic/restic:0.19.1"
slug="${1:?usage: stack/backup.sh SLUG|all backup|snapshots|restore-test [ID]|restore ID}"
action="${2:?usage: stack/backup.sh SLUG|all backup|snapshots|restore-test [ID]|restore ID}"
snap="${3:-latest}"

die() { echo "backup: $*" >&2; exit 1; }
log() { echo "$(date -u +%FT%TZ) $slug: $*"; }

if [ "$slug" = all ]; then
  [ "$action" = backup ] || [ "$action" = restore-test ] || die "'all' works with backup and restore-test"
  failed=0
  for env in "$instances"/*/.env; do
    [ -f "$env" ] || continue
    "$0" "$(basename "$(dirname "$env")")" "$action" || failed=1
  done
  exit "$failed"
fi

env_file="$instances/$slug/.env"
[ -f "$env_file" ] || die "no stack '$slug' ($env_file missing)"
get() { grep -E "^$1=" "$env_file" | cut -d= -f2- || true; }
compose=(docker compose -f "$here/compose.yml" --env-file "$env_file")

# Add the backup settings once; never touch an existing value.
if [ -z "$(get RESTIC_PASSWORD)" ]; then
  (umask 077; printf '\n# Backups (stack/backup.sh). Keep RESTIC_PASSWORD off this machine too.\nRESTIC_REPOSITORY=%s\nRESTIC_PASSWORD=%s\n' \
    "$backups/$slug" "$(openssl rand -hex 32)" >> "$env_file")
  log "added RESTIC_REPOSITORY and RESTIC_PASSWORD to $env_file - copy the password off this machine"
fi
repo="$(get RESTIC_REPOSITORY)"
export RESTIC_PASSWORD="$(get RESTIC_PASSWORD)"

# restic runs in a container. A local repository is mounted at /repo; any other kind is passed on.
restic() {
  local mounts=() target="$repo"
  if [[ "$repo" = /* ]]; then mkdir -p "$repo"; mounts=(-v "$repo:/repo"); target=/repo; fi
  # As the calling user, so restored files and a local repository stay ours, not root's.
  docker run --rm --user "$(id -u):$(id -g)" -e RESTIC_CACHE_DIR=/tmp/restic-cache \
    -e RESTIC_PASSWORD -e RESTIC_REPOSITORY="$target" --hostname "nextup-$slug" \
    "${mounts[@]}" "${extra_mounts[@]}" "$restic_image" "$@"
}
extra_mounts=()
restic cat config >/dev/null 2>&1 || { restic init >/dev/null; log "created repository $repo"; }

case "$action" in
  backup)
    work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; chmod 700 "$work"
    "${compose[@]}" exec -T db pg_dump -U nextup -d nextup -Fc > "$work/db.dump"
    [ -s "$work/db.dump" ] || die "pg_dump wrote nothing"
    cp "$env_file" "$work/instance.env"
    extra_mounts=(-v "$work:/data/stack:ro")
    # n8n's workflows and credentials, if this stack runs it (its key is in instance.env).
    if docker volume inspect "nextup-${slug}_n8ndata" >/dev/null 2>&1; then
      extra_mounts+=(-v "nextup-${slug}_n8ndata:/data/n8n:ro")
    fi
    restic backup --quiet --tag "$slug" /data
    restic forget --quiet --tag "$slug" --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
    log "backup done ($(du -h "$work/db.dump" | cut -f1) database dump) -> $repo"
    ;;

  snapshots)
    restic snapshots --tag "$slug" ;;

  restore-test)
    # Never touches the live stack: its own network, container names and no published ports.
    t="nextup-restoretest-$slug"
    drop() { docker rm -f "$t-db" >/dev/null 2>&1 || true; docker network rm "$t" >/dev/null 2>&1 || true; }
    drop; work="$(mktemp -d)"; chmod 700 "$work"; trap 'drop; rm -rf "$work"' EXIT
    extra_mounts=(-v "$work:/restore")
    restic restore "$snap" --target /restore --include /data/stack >/dev/null
    dump="$work/data/stack/db.dump"
    [ -s "$dump" ] || die "snapshot $snap has no database dump"
    docker network create --internal "$t" >/dev/null
    docker run -d --name "$t-db" --network "$t" -e POSTGRES_USER=nextup -e POSTGRES_PASSWORD=restoretest \
      -e POSTGRES_DB=nextup -v "$dump:/restore.dump:ro" postgres:17 >/dev/null
    for _ in $(seq 1 30); do docker exec "$t-db" pg_isready -U nextup -d nextup >/dev/null 2>&1 && break; sleep 1; done
    sleep 2   # the image restarts postgres once after init
    for _ in $(seq 1 30); do docker exec "$t-db" pg_isready -U nextup -d nextup >/dev/null 2>&1 && break; sleep 1; done
    docker exec "$t-db" pg_restore -U nextup -d nextup --no-owner /restore.dump
    q() { docker exec "$t-db" psql -U nextup -d nextup -tAc "$1"; }
    companies="$(q 'SELECT count(*) FROM "Company"')"
    users="$(q 'SELECT count(*) FROM "User"' 2>/dev/null || echo '?')"
    migrations="$(q 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
    has_env=no; [ -s "$work/data/stack/instance.env" ] && has_env=yes
    log "restore-test $snap: companies=$companies users=$users migrations=$migrations instance.env=$has_env"
    [ "$migrations" -gt 0 ] && [ "$has_env" = yes ] || die "restore-test FAILED"
    log "restore-test OK"
    ;;

  restore)
    [ "$snap" != latest ] || die "name the snapshot to restore (stack/backup.sh $slug snapshots)"
    read -r -p "This REPLACES the live database of '$slug' with snapshot $snap. Type the slug: " answer
    [ "$answer" = "$slug" ] || die "not confirmed - nothing changed"
    work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; chmod 700 "$work"
    extra_mounts=(-v "$work:/restore")
    restic restore "$snap" --target /restore --include /data/stack/db.dump >/dev/null
    [ -s "$work/data/stack/db.dump" ] || die "snapshot $snap has no database dump"
    "${compose[@]}" stop app
    psql() { "${compose[@]}" exec -T db psql -U nextup -d postgres -v ON_ERROR_STOP=1 -c "$1"; }
    psql 'DROP DATABASE IF EXISTS nextup WITH (FORCE)'
    psql 'CREATE DATABASE nextup OWNER nextup'
    "${compose[@]}" exec -T db pg_restore -U nextup -d nextup --no-owner < "$work/data/stack/db.dump"
    "${compose[@]}" start app
    log "restored $snap into the live database"
    ;;

  *) die "unknown action '$action'" ;;
esac
