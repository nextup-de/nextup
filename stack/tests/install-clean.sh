#!/usr/bin/env bash
# On-prem install rehearsal: installs one real-stage stack from registry images on a CLEAN machine
# and checks it works, backs up and restores. Run it ON the target (a clean VM, or the container
# host of stack/tests) as the deploy user, from any copy of stack/.
#
#   stack/tests/install-clean.sh --slug acme --origin https://nextup.example.com --images 1a2b3c4
#   stack/tests/install-clean.sh --slug rehearsal --origin http://localhost:8080 --images main \
#       --registry localhost:5000/nextup --backup-repo s3:https://s3.example.com/bucket/rehearsal
#
# Options
#   --slug SLUG         the company (same rules as install.sh)
#   --origin URL        where people reach it
#   --images main|SHA   the images CI published: main, or a 7-char commit sha
#   --registry R        where the images live (default ghcr.io/nextup-de)
#   --name NAME         the company's display name (default: slug)
#   --entra-tenant-id ID  the customer's Entra tenant ID, handed to install.sh (copied into the company once)
#   --backup-repo REPO  restic repository for an off-box backup (optional; an absolute path is
#                       a folder on this machine). Keys of the environment are copied into the
#                       stack's .env: BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY.
#
# Never runs `down -v` and never touches another slug. The install's own output goes to
# $NEXTUP_HOME/install-<slug>.log, mode 600, and is never printed (a real stage prints no admin code).
set -u

here="$(cd "$(dirname "$0")" && pwd)"
stack="$(cd "$here/.." && pwd)"

slug="" origin="" images="" registry="ghcr.io/nextup-de" name="" backup_repo="" entra_tenant=""
while [ $# -gt 0 ]; do
  case "$1" in
    --slug) slug="${2:?--slug needs a value}"; shift 2 ;;
    --origin) origin="${2:?--origin needs a value}"; origin="${origin%/}"; shift 2 ;;
    --images) images="${2:?--images needs a value}"; shift 2 ;;
    --registry) registry="${2:?--registry needs a value}"; shift 2 ;;
    --name) name="${2:?--name needs a value}"; shift 2 ;;
    --entra-tenant-id) entra_tenant="${2:?--entra-tenant-id needs a value}"; shift 2 ;;
    --backup-repo) backup_repo="${2:?--backup-repo needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done
[ -n "$slug" ] && [ -n "$origin" ] && [ -n "$images" ] || { echo "install-clean: --slug, --origin and --images are required (see --help)" >&2; exit 2; }

export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-${NEXTUP_HOME:-$HOME/nextup}/instances}"
home="${NEXTUP_HOME:-$HOME/nextup}"
env_file="$NEXTUP_INSTANCES/$slug/.env"
log="$home/install-$slug.log"

# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"
t_init "install-clean $slug"

have_tools() {
  command -v docker >/dev/null || { echo "docker is missing"; return 1; }
  docker compose version --short | grep -q '^v\?2\.' || { echo "docker compose v2 is missing"; return 1; }
  command -v openssl >/dev/null || { echo "openssl is missing"; return 1; }
  command -v curl >/dev/null || { echo "curl is missing"; return 1; }
}

is_clean() {
  [ ! -e "$env_file" ] || { echo "$env_file exists"; return 1; }
  [ -z "$(docker ps -aq --filter "label=com.docker.compose.project=nextup-$slug")" ] \
    || { echo "compose project nextup-$slug has containers"; return 1; }
}

run_install() {
  mkdir -p "$home"
  ( umask 077; : > "$log" )
  local args=(--slug "$slug" --origin "$origin" --stage real --images "$images")
  [ -z "$name" ] || args+=(--name "$name")
  [ -z "$entra_tenant" ] || args+=(--entra-tenant-id "$entra_tenant")
  NEXTUP_REGISTRY="$registry" "$stack/install.sh" "${args[@]}" >> "$log" 2>&1
  local rc=$?
  # Only the tail of a failed install is shown, without the line that holds the admin code.
  [ "$rc" -eq 0 ] || tail -n 30 "$log" | grep -v 'code:' >&2
  return "$rc"
}

# One line per app process (APP_REPLICAS): "healthy" only when they all say it.
app_health() { "$stack/ctl.sh" "$slug" ps app --format '{{.Health}}' 2>/dev/null | sort -u; }

origin_health() { [ "$(curl -s -o /dev/null -w '%{http_code}' "$origin/api/health")" = 200 ]; }

# Published ports per service: "<service> <ports>" for every container of the project.
published() {
  docker ps --filter "label=com.docker.compose.project=nextup-$slug" \
    --format '{{.Label "com.docker.compose.service"}}|{{.Ports}}'
}

db_publishes_nothing() { ! published | grep '^db|' | grep -q -- '->'; }

only_caddy_publishes() {
  local with
  with="$(published | grep -- '->' | cut -d'|' -f1 | sort -u | tr '\n' ' ')"
  [ "$with" = "caddy " ] || { echo "services with published ports: ${with:-none}"; return 1; }
}

write_backup_settings() {
  (
    umask 077
    {
      printf '\n# Off-box backup (stack/tests/install-clean.sh --backup-repo)\n'
      printf 'RESTIC_REPOSITORY=%s\n' "$backup_repo"
      printf 'RESTIC_PASSWORD=%s\n' "$(openssl rand -hex 32)"
      if [ -n "${BACKUP_S3_ACCESS_KEY_ID:-}" ]; then printf 'BACKUP_S3_ACCESS_KEY_ID=%s\n' "$BACKUP_S3_ACCESS_KEY_ID"; fi
      if [ -n "${BACKUP_S3_SECRET_ACCESS_KEY:-}" ]; then printf 'BACKUP_S3_SECRET_ACCESS_KEY=%s\n' "$BACKUP_S3_SECRET_ACCESS_KEY"; fi
      case "$backup_repo" in /*) ;; *) printf 'BACKUP_OFFBOX=required\n' ;; esac
    } >> "$env_file"
  )
}

abort() { t_done; exit 1; }

t_ok "docker, docker compose v2, openssl and curl are installed" have_tools || true
[ "$T_FAILED" -eq 0 ] || abort
t_ok "the machine is clean for '$slug'" is_clean
[ "$T_FAILED" -eq 0 ] || abort
t_ok "install.sh --stage real --images $images exits 0 (output in $log)" run_install
[ "$T_FAILED" -eq 0 ] || abort
t_eq "the app container is healthy" healthy "$(app_health)"
t_ok "$origin/api/health answers 200" origin_health
t_ok "the db service publishes no port" db_publishes_nothing
t_ok "caddy is the only container with a published port" only_caddy_publishes

if [ -n "$backup_repo" ]; then
  t_ok "backup settings for $backup_repo are in the .env" write_backup_settings
else
  echo "note - backups stay on this machine; pass --backup-repo for an off-box target"
fi
t_ok "backup.sh $slug backup exits 0" "$stack/backup.sh" "$slug" backup
t_ok "backup.sh $slug restore-test exits 0" "$stack/backup.sh" "$slug" restore-test

# A real stage has no shared code: /admin opens with Microsoft, a console admin's code, or a break-glass window.
echo "admin: $origin/admin (no way in yet? stack/break-glass.sh $slug open --hours 2 --reason \"<why>\")"
t_done
