#!/usr/bin/env bash
# automation.sellux.ch: n8n for building and testing workflows, behind two logins.
#   1. the NextUp login page (gate/) - nginx lets nothing through to n8n without its session
#   2. n8n's own user accounts - the first visitor creates the owner, so do that right away
#
#   stack/automation/automation.sh install [--host automation.sellux.ch] [--port 3141]
#   stack/automation/automation.sh set-password           # new login password, ends all sessions
#   stack/automation/automation.sh backup | snapshots | restore-test [ID]
#   stack/automation/automation.sh ps | logs -f | down ...   (anything else goes to docker compose)
#
# Everything it writes lives in $NEXTUP_AUTOMATION (default ~/nextup/automation), mode 600:
#   .env        N8N_ENCRYPTION_KEY, host, ports, login hash + session secret, backup repo + password
#   login.txt   the login (user + password) - read it with cat, keep it in the password manager
#   nginx-site  the nginx site, copied to /etc/nginx/sites-available/nextup-automation
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="${NEXTUP_AUTOMATION:-$HOME/nextup/automation}"
env_file="$dir/.env"
restic_image="restic/restic:0.19.1"
compose=(docker compose -f "$here/compose.yml" --env-file "$env_file")
action="${1:-}"; shift || true

die() { echo "automation: $*" >&2; exit 1; }
log() { echo "$(date -u +%FT%TZ) automation: $*"; }
get() { grep -E "^$1=" "$env_file" | cut -d= -f2- || true; }
rand() { openssl rand -hex "$1"; }
# Append KEY=VALUE only if the key is missing: existing secrets are never overwritten.
add() { [ -n "$(get "$1")" ] || (umask 077; printf '%s=%s\n' "$1" "$2" >> "$env_file"); }
put() { sed -i "s|^$1=.*|$1=$2|" "$env_file"; }

# scrypt hash of a password read from stdin (never from argv, where ps would show it).
hash_password() {
  docker run --rm -i node:22-alpine node -e '
    const c = require("crypto"); let pw = "";
    process.stdin.on("data", (d) => (pw += d)).on("end", () => {
      const salt = c.randomBytes(16);
      console.log("scrypt:" + salt.toString("hex") + ":" + c.scryptSync(pw, salt, 32).toString("hex"));
    });'
}

new_login() {  # writes login.txt and GATE_PASSWORD_HASH; reuses the password given, if any
  local pw="${1:-}" h
  [ -n "$pw" ] || pw="$(rand 16)"
  h="$(printf '%s' "$pw" | hash_password)"
  [[ "$h" =~ ^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$ ]] || die "could not hash the password"
  (umask 077; printf 'url: https://%s\nuser: %s\npassword: %s\n' "$(get N8N_HOST)" "$(get GATE_USER)" "$pw" > "$dir/login.txt")
  if [ -n "$(get GATE_PASSWORD_HASH)" ]; then put GATE_PASSWORD_HASH "$h"; else add GATE_PASSWORD_HASH "$h"; fi
}

write_site() {
  local host port gport tpl
  host="$(get N8N_HOST)"; port="$(get N8N_PORT)"; gport="$(get GATE_PORT)"
  # With a certificate: the full https site. Without: http only, until certbot certonly has run.
  if [ -d "/etc/letsencrypt/live/$host" ]; then tpl="$here/nginx-https.conf"; else tpl="$here/nginx-http.conf"; fi
  (umask 077; sed -e "s|__HOST__|$host|g" -e "s|__N8N_PORT__|$port|g" -e "s|__GATE_PORT__|$gport|g" \
    "$tpl" > "$dir/nginx-site")
}

wait_healthy() {
  local svc="$1" state=""
  echo -n "Waiting for $svc "
  for _ in $(seq 1 60); do
    state="$("${compose[@]}" ps "$svc" --format '{{.Health}}' 2>/dev/null || true)"
    [ "$state" = healthy ] && break
    echo -n "."; sleep 3
  done
  echo
  [ "$state" = healthy ] || { "${compose[@]}" logs --tail 40 "$svc" >&2; die "$svc did not become healthy"; }
}

install() {
  local host="automation.sellux.ch" port="3141"
  while [ $# -gt 0 ]; do
    case "$1" in
      --host) host="$2"; shift 2 ;;
      --port) port="$2"; shift 2 ;;
      *) die "unknown option $1" ;;
    esac
  done
  [[ "$host" =~ ^[a-z0-9.-]+$ ]] || die "bad --host"
  [[ "$port" =~ ^[0-9]{4,5}$ ]] || die "bad --port"
  mkdir -p "$dir"; chmod 700 "$dir"

  if [ -f "$env_file" ]; then
    echo "Keeping $env_file (the encryption key is never regenerated)."
  else
    (umask 077; cat > "$env_file" <<ENV
# automation (n8n) - written by stack/automation/automation.sh on $(date -u +%Y-%m-%dT%H:%MZ).
# N8N_ENCRYPTION_KEY encrypts n8n's stored credentials: keep a copy in the password manager.
N8N_HOST=$host
N8N_PORT=$port
N8N_ENCRYPTION_KEY=$(rand 32)
RESTIC_REPOSITORY=$(dirname "$dir")/backups/automation
RESTIC_PASSWORD=$(rand 32)
ENV
    )
    echo "Wrote $env_file with a new encryption key."
  fi
  # The login page (added to older installs too). GATE_SECRET signs the session cookies.
  add GATE_PORT "$(( $(get N8N_PORT) + 1 ))"
  add GATE_USER nextup
  add GATE_SECRET "$(rand 32)"
  if [ -z "$(get GATE_PASSWORD_HASH)" ]; then
    # An install from the basic-auth days keeps its password, so a saved login still works.
    local old=""
    if [ -f "$dir/basic-auth.txt" ]; then old="$(sed -n 's/^password: //p' "$dir/basic-auth.txt")"; fi
    new_login "$old"
    rm -f "$dir/basic-auth.txt" "$dir/htpasswd"
    echo "Wrote the login to $dir/login.txt"
  fi

  write_site
  "${compose[@]}" up -d --remove-orphans
  wait_healthy n8n
  wait_healthy gate
  host="$(get N8N_HOST)"
  echo "n8n is up on 127.0.0.1:$(get N8N_PORT), its login page on 127.0.0.1:$(get GATE_PORT), for https://$host"

  local live=/etc/nginx/sites-available/nextup-automation
  if cmp -s "$dir/nginx-site" "$live"; then return; fi
  echo
  echo "nginx needs the new site for $host. Run as a sudoer:"
  echo
  if [ ! -d "/etc/letsencrypt/live/$host" ]; then echo "  sudo certbot certonly --nginx -d $host"; fi
  echo "  sudo install -m 644 $dir/nginx-site $live"
  echo "  sudo ln -sf $live /etc/nginx/sites-enabled/"
  echo "  sudo nginx -t && sudo systemctl reload nginx"
  if [ -e /etc/nginx/nextup-automation.htpasswd ]; then echo "  sudo rm /etc/nginx/nextup-automation.htpasswd     # basic auth is gone"; fi
  if [ ! -d "/etc/letsencrypt/live/$host" ]; then echo "  # then run install again: it writes the https version of the site"; fi
  echo
  echo "Sign in at https://$host with the login in $dir/login.txt, then create the n8n owner"
  echo "account if nobody has yet."
}

# restic in a container, as the calling user; a local repository is mounted at /repo.
restic() {
  local repo mounts=() target
  repo="$(get RESTIC_REPOSITORY)"; target="$repo"
  if [[ "$repo" = /* ]]; then mkdir -p "$repo"; mounts=(-v "$repo:/repo"); target=/repo; fi
  RESTIC_PASSWORD="$(get RESTIC_PASSWORD)" docker run --rm --user "$(id -u):$(id -g)" \
    -e RESTIC_CACHE_DIR=/tmp/restic-cache -e RESTIC_PASSWORD -e RESTIC_REPOSITORY="$target" \
    --hostname nextup-automation "${mounts[@]}" "${extra_mounts[@]}" "$restic_image" "$@"
}
extra_mounts=()

case "$action" in
  install) install "$@" ;;

  set-password)
    [ -f "$env_file" ] || die "not installed ($env_file missing)"
    new_login
    "${compose[@]}" up -d gate >/dev/null 2>&1
    wait_healthy gate
    echo "New password in $dir/login.txt. Everyone has to sign in again."
    ;;

  backup|snapshots|restore-test)
    [ -f "$env_file" ] || die "not installed ($env_file missing)"
    restic cat config >/dev/null 2>&1 || { restic init >/dev/null; log "created repository $(get RESTIC_REPOSITORY)"; }
    case "$action" in
      backup)
        work="$(mktemp -d)"; chmod 700 "$work"; trap 'rm -rf "$work"' EXIT
        # Exports are consistent even while n8n runs; credentials stay encrypted with the key.
        "${compose[@]}" exec -T n8n sh -c 'rm -rf /tmp/bk && mkdir -p /tmp/bk &&
          (n8n export:workflow --all --output=/tmp/bk/workflows.json || echo "[]" > /tmp/bk/workflows.json) &&
          (n8n export:credentials --all --output=/tmp/bk/credentials.json || echo "[]" > /tmp/bk/credentials.json)' </dev/null >/dev/null 2>&1
        "${compose[@]}" cp n8n:/tmp/bk/. "$work/" >/dev/null 2>&1
        "${compose[@]}" exec -T n8n rm -rf /tmp/bk </dev/null
        cp "$env_file" "$work/automation.env"
        extra_mounts=(-v "$work:/data/export:ro" -v "nextup-automation_n8ndata:/data/n8n:ro")
        restic backup --quiet --tag automation /data
        restic forget --quiet --tag automation --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
        log "backup done -> $(get RESTIC_REPOSITORY)"
        ;;
      snapshots) restic snapshots --tag automation ;;
      restore-test)
        # A throwaway n8n with a fresh database imports the exports and decrypts the credentials
        # with the key from the backup. The running n8n is not touched.
        work="$(mktemp -d)"; chmod 700 "$work"; trap 'rm -rf "$work"' EXIT
        extra_mounts=(-v "$work:/restore")
        restic restore "${1:-latest}" --target /restore --include /data/export >/dev/null
        x="$work/data/export"
        [ -s "$x/automation.env" ] || die "snapshot has no automation.env"
        key="$(grep '^N8N_ENCRYPTION_KEY=' "$x/automation.env" | cut -d= -f2-)"
        # The same n8n version that made the backup.
        image="$(docker inspect -f '{{.Config.Image}}' nextup-automation-n8n-1 2>/dev/null || echo n8nio/n8n:2.41.3)"
        out="$(docker run --rm --network none --user "$(id -u):$(id -g)" -e N8N_ENCRYPTION_KEY="$key" -e N8N_DIAGNOSTICS_ENABLED=false \
          -v "$x:/r:ro" --entrypoint sh "$image" -c '
            n8n import:workflow --input=/r/workflows.json >/dev/null 2>&1 || true
            n8n import:credentials --input=/r/credentials.json >/dev/null 2>&1 || true
            echo "workflows=$(n8n list:workflow 2>/dev/null | grep -c "|" || true)"
            n8n export:credentials --all --decrypted --output=/tmp/c.json >/dev/null 2>&1 && \
              echo "credentials=$(grep -o "\"id\"" /tmp/c.json | wc -l) decrypted=yes" || echo "credentials=0"' 2>/dev/null)"
        log "restore-test: $(echo $out)"
        ;;
    esac ;;

  "") sed -n '2,14p' "$0" ;;
  *) [ -f "$env_file" ] || die "not installed ($env_file missing)"; exec "${compose[@]}" "$action" "$@" ;;
esac
