#!/usr/bin/env bash
# Encrypted backups of one company stack with restic (docs/plans/2026-09-27_platform.md, stage 1 step 5).
#
#   stack/backup.sh acme backup              # database dump + the instance .env (+ n8n data)
#   stack/backup.sh all backup               # every installed stack (what cron runs nightly)
#   stack/backup.sh all restore-test         # every stack's latest snapshot (cron, weekly)
#   stack/backup.sh acme pre-migrate SHA     # snapshot before a release migrates (SHA: 7 hex chars)
#   stack/backup.sh acme snapshots [--json]  # list what's there (nightly and pre-migrate snapshots)
#   stack/backup.sh acme restore-test [ID]   # restore into a throwaway project and check it
#   stack/backup.sh acme restore ID          # replace the LIVE database (asks for the slug)
#
# Each stack has its own repository and password. Both live in the stack's .env and are added
# on the first run if missing:
#   RESTIC_REPOSITORY  where backups go. An absolute path is a folder on this machine
#                      (default: $NEXTUP_BACKUPS/<slug> or ~/nextup-backups/<slug>). A local folder is NOT
#                      off-box: it lives on the same disk as the stack. sftp:, s3:, rest: work as restic
#                      understands them and are off-box.
#   RESTIC_PASSWORD    encrypts the repository. Keep a copy OFF this machine (password manager):
#                      without it no backup can be read.
#   BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY   (optional)
#                      credentials for an s3: repository, given to restic as AWS_ACCESS_KEY_ID and
#                      AWS_SECRET_ACCESS_KEY. The app's own AWS_* lines (Bedrock) are never used.
#   BACKUP_OFFBOX=required   (optional) every action refuses a local or empty RESTIC_REPOSITORY.
# pre-migrate SHA has the content of backup, tagged <slug>-pre-migrate and release-<sha> (not <slug>), so the
# nightly forget never prunes it; the last 10 are kept. RTO_SECONDS (environment, default 3600) is the limit
# restore-test must stay under (docs/ops/RPO_RTO.md).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
instances="${NEXTUP_INSTANCES:-$here/instances}"
# Outside the repo by default, so a laptop never has backups in the working tree.
backups="${NEXTUP_BACKUPS:-$HOME/nextup-backups}"
restic_image="restic/restic:0.19.1"
slug="${1:?usage: stack/backup.sh SLUG|all backup|snapshots|pre-migrate SHA|restore-test [ID]|restore ID}"
action="${2:?usage: stack/backup.sh SLUG|all backup|snapshots|pre-migrate SHA|restore-test [ID]|restore ID}"
snap="${3:-latest}"

die() { echo "backup: $*" >&2; exit 1; }
log() { echo "$(date -u +%FT%TZ) $slug: $*"; }

if [ "$slug" = all ]; then
  [ "$action" = backup ] || [ "$action" = restore-test ] || die "'all' works with backup and restore-test"
  failed=0
  for env in "$instances"/*/.env; do
    [ -f "$env" ] || continue
    # A PR preview slot (deploy.sh preview) is a throwaway demo stack, wiped on every push.
    grep -qE '^PREVIEW_PR=' "$(dirname "$env")/stack.conf" 2>/dev/null && continue
    "$0" "$(basename "$(dirname "$env")")" "$action" || failed=1
  done
  exit "$failed"
fi

if [ "$action" = pre-migrate ]; then
  [[ "$snap" =~ ^[0-9a-f]{7}$ ]] || { echo "backup: pre-migrate needs a 7-character lowercase hex sha (got '$snap')" >&2; exit 2; }
fi

env_file="$instances/$slug/.env"
[ -f "$env_file" ] || die "no stack '$slug' ($env_file missing)"
get() { grep -E "^$1=" "$env_file" | cut -d= -f2- || true; }
compose=(docker compose -f "$here/compose.yml" --env-file "$env_file")

# BACKUP_OFFBOX=required: no action may run against a local (or missing) repository.
if [ "$(get BACKUP_OFFBOX)" = required ]; then
  case "$(get RESTIC_REPOSITORY)" in
    ""|/*) die "$slug: BACKUP_OFFBOX=required but RESTIC_REPOSITORY is local ($(get RESTIC_REPOSITORY))" ;;
  esac
fi

# Add the backup settings once; never touch an existing value.
if [ -z "$(get RESTIC_PASSWORD)" ]; then
  (umask 077; printf '\n# Backups (stack/backup.sh). Keep RESTIC_PASSWORD off this machine too.\nRESTIC_REPOSITORY=%s\nRESTIC_PASSWORD=%s\n' \
    "$backups/$slug" "$(openssl rand -hex 32)" >> "$env_file")
  log "added RESTIC_REPOSITORY and RESTIC_PASSWORD to $env_file - copy the password off this machine"
fi
repo="$(get RESTIC_REPOSITORY)"
export RESTIC_PASSWORD="$(get RESTIC_PASSWORD)"
# S3 credentials for restic, only when set. Never the app's AWS_* lines.
s3_env=()
if [ -n "$(get BACKUP_S3_ACCESS_KEY_ID)" ] && [ -n "$(get BACKUP_S3_SECRET_ACCESS_KEY)" ]; then
  export AWS_ACCESS_KEY_ID="$(get BACKUP_S3_ACCESS_KEY_ID)" AWS_SECRET_ACCESS_KEY="$(get BACKUP_S3_SECRET_ACCESS_KEY)"
  s3_env=(-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY)
else
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
fi

# restic runs in a container. A local repository is mounted at /repo; any other kind is passed on.
restic() {
  local mounts=() target="$repo"
  if [[ "$repo" = /* ]]; then mkdir -p "$repo"; mounts=(-v "$repo:/repo"); target=/repo; fi
  # As the calling user, so restored files and a local repository stay ours, not root's.
  docker run --rm --user "$(id -u):$(id -g)" -e RESTIC_CACHE_DIR=/tmp/restic-cache \
    -e RESTIC_PASSWORD -e RESTIC_REPOSITORY="$target" ${s3_env[@]+"${s3_env[@]}"} --hostname "nextup-$slug" \
    "${mounts[@]}" "${extra_mounts[@]}" "$restic_image" "$@"
}
extra_mounts=()

# Dump the database next to a copy of instance.env (and n8n's data) for restic to pick up from $work.
dump_stack() {
  work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; chmod 700 "$work"
  "${compose[@]}" exec -T db pg_dump -U nextup -d nextup -Fc > "$work/db.dump" || die "pg_dump failed (is the database running?)"
  [ -s "$work/db.dump" ] || die "pg_dump wrote nothing"
  cp "$env_file" "$work/instance.env"
  extra_mounts=(-v "$work:/data/stack:ro")
  # n8n's workflows and credentials, if this stack runs it (its key is in instance.env).
  if docker volume inspect "nextup-${slug}_n8ndata" >/dev/null 2>&1; then
    extra_mounts+=(-v "nextup-${slug}_n8ndata:/data/n8n:ro")
  fi
}

# After a successful backup: $INSTANCE_DIR/backup-status/last.json for the app's Backups check (PIL D10).
# Written to a temp file and moved, so a reader never sees half a file. A folder that cannot be written
# is a warning, not a failed backup. Nothing is written when INSTANCE_DIR is unset.
write_status() {
  local dir; dir="$(get INSTANCE_DIR)"
  [ -n "$dir" ] || return 0
  local offbox=false part="$dir/backup-status/.last.json.$$"
  # Off-box only for a restic remote scheme whose target is not this machine; anything else is false.
  case "$repo" in
    s3:*|b2:*|sftp:*|rest:*|azure:*|gs:*|swift:*|rclone:*)
      offbox=true
      case "$(printf '%s' "$repo" | tr 'A-Z' 'a-z')" in
        *localhost*|*127.0.0.1*|*'[::1]'*|*::1*) offbox=false ;;
      esac ;;
  esac
  if mkdir -p "$dir/backup-status" 2>/dev/null \
     && printf '{"at": "%s", "offbox": %s}\n' "$(date -u +%FT%TZ)" "$offbox" > "$part" 2>/dev/null \
     && mv -f "$part" "$dir/backup-status/last.json" 2>/dev/null; then
    return 0
  fi
  log "warning: could not write $dir/backup-status/last.json"
  return 0
}

restic cat config >/dev/null 2>&1 || { restic init >/dev/null; log "created repository $repo"; }

case "$action" in
  backup)
    dump_stack
    restic backup --quiet --tag "$slug" /data
    restic forget --quiet --tag "$slug" --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
    write_status
    log "backup done ($(du -h "$work/db.dump" | cut -f1) database dump) -> $repo"
    ;;

  pre-migrate)
    dump_stack
    summary="$(restic backup --json --tag "$slug-pre-migrate" --tag "release-$snap" /data)" || die "pre-migrate backup failed"
    id="$(printf '%s\n' "$summary" | sed -n 's/.*"message_type":"summary".*"snapshot_id":"\([0-9a-f]*\)".*/\1/p' | tail -n 1 | cut -c1-8)"
    [ -n "$id" ] || die "pre-migrate: restic reported no snapshot id"
    restic forget --quiet --tag "$slug-pre-migrate" --keep-last 10 --prune
    log "pre-migrate backup done $snap $id"
    ;;

  snapshots)
    json=(); [ "$snap" != --json ] || json=(--json)
    restic snapshots --tag "$slug" --tag "$slug-pre-migrate" ${json[@]+"${json[@]}"} ;;

  restore-test)
    # Never touches the live stack: its own network, container names and no published ports.
    t="nextup-restoretest-$slug"
    drop() { docker rm -f "$t-db" >/dev/null 2>&1 || true; docker network rm "$t" >/dev/null 2>&1 || true; }
    rto="${RTO_SECONDS:-3600}"; started="$(date +%s)"
    # The throwaway database runs the image of the db service in compose.yml, not a second tag.
    db_image="$(awk '/^  [A-Za-z0-9_-]+:/{f=($1=="db:")} f&&$1=="image:"{print $2; exit}' "$here/compose.yml" | tr -d '\r"')"
    [ -n "$db_image" ] || die "no image for the db service in $here/compose.yml"
    drop; work="$(mktemp -d)"; chmod 700 "$work"; trap 'drop; rm -rf "$work"' EXIT
    extra_mounts=(-v "$work:/restore")
    restic restore "$snap" --target /restore --include /data/stack >/dev/null
    dump="$work/data/stack/db.dump"
    [ -s "$dump" ] || die "snapshot $snap has no database dump"
    docker network create --internal "$t" >/dev/null
    docker run -d --name "$t-db" --network "$t" -e POSTGRES_USER=nextup -e POSTGRES_PASSWORD=restoretest \
      -e POSTGRES_DB=nextup -v "$dump:/restore.dump:ro" "$db_image" >/dev/null
    for _ in $(seq 1 30); do docker exec "$t-db" pg_isready -U nextup -d nextup >/dev/null 2>&1 && break; sleep 1; done
    sleep 2   # the image restarts postgres once after init
    for _ in $(seq 1 30); do docker exec "$t-db" pg_isready -U nextup -d nextup >/dev/null 2>&1 && break; sleep 1; done
    docker exec "$t-db" pg_restore -U nextup -d nextup --no-owner /restore.dump
    q() { docker exec "$t-db" psql -U nextup -d nextup -tAc "$1"; }
    companies="$(q 'SELECT count(*) FROM "Company"')"
    users="$(q 'SELECT count(*) FROM "User"' 2>/dev/null || echo '?')"
    migrations="$(q 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
    has_env=no; [ -s "$work/data/stack/instance.env" ] && has_env=yes
    seconds=$(( $(date +%s) - started ))
    log "restore-test $snap: companies=$companies users=$users migrations=$migrations instance.env=$has_env image=$db_image seconds=$seconds"
    [ "$migrations" -gt 0 ] && [ "$has_env" = yes ] || die "restore-test FAILED"
    [ "$seconds" -le "$rto" ] || die "restore-test FAILED: $seconds s over RTO $rto s"
    log "restore-test OK"
    ;;

  restore)
    [ "$snap" != latest ] || die "name the snapshot to restore (stack/backup.sh $slug snapshots)"
    read -r -p "This REPLACES the live database of '$slug' with snapshot $snap. Type the slug: " answer
    [ "$answer" = "$slug" ] || die "not confirmed - nothing changed"
    started="$(date +%s)"
    work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; chmod 700 "$work"
    extra_mounts=(-v "$work:/restore")
    restic restore "$snap" --target /restore --include /data/stack/db.dump >/dev/null
    [ -s "$work/data/stack/db.dump" ] || die "snapshot $snap has no database dump"
    "${compose[@]}" stop app
    psql() { "${compose[@]}" exec -T db psql -U nextup -d postgres -v ON_ERROR_STOP=1 -c "$1"; }
    psql 'DROP DATABASE IF EXISTS nextup WITH (FORCE)'
    psql 'CREATE DATABASE nextup OWNER nextup'
    "${compose[@]}" exec -T db pg_restore -U nextup -d nextup --no-owner < "$work/data/stack/db.dump"
    # --no-deps: `start app` would also re-run the one-shot migrate and apply the migrations the
    # snapshot predates; going forward again is a release.
    "${compose[@]}" up -d --no-deps --no-recreate app
    log "restored $snap into the live database seconds=$(( $(date +%s) - started ))"
    ;;

  *) die "unknown action '$action'" ;;
esac
