#!/usr/bin/env bash
# automation.sellux.ch: n8n for building and testing workflows, behind two logins.
#   1. nginx basic auth - nobody reaches n8n at all without it
#   2. n8n's own user accounts - the first visitor creates the owner, so do that right away
#
#   stack/automation/automation.sh install [--host automation.sellux.ch] [--port 3141]
#   stack/automation/automation.sh backup | snapshots | restore-test [ID]
#   stack/automation/automation.sh ps | logs -f | down ...   (anything else goes to docker compose)
#
# Everything it writes lives in $NEXTUP_AUTOMATION (default ~/nextup/automation), mode 600:
#   .env            N8N_ENCRYPTION_KEY, host, port, backup repository + password
#   basic-auth.txt  the nginx login (user + password) - read it with cat, keep it in the password manager
#   htpasswd        its hash, copied to /etc/nginx/nextup-automation.htpasswd
#   nginx-site      the nginx site, copied to /etc/nginx/sites-available/nextup-automation
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

  if [ ! -f "$dir/htpasswd" ]; then
    local pw; pw="$(rand 16)"
    (umask 077
     printf 'user: nextup\npassword: %s\n' "$pw" > "$dir/basic-auth.txt"
     printf 'nextup:%s\n' "$(openssl passwd -apr1 "$pw")" > "$dir/htpasswd")
    echo "Wrote the nginx login to $dir/basic-auth.txt"
  fi

  host="$(get N8N_HOST)"; port="$(get N8N_PORT)"
  (umask 077; cat > "$dir/nginx-site" <<CONF
# automation (n8n) at $host -> 127.0.0.1:$port. Written by stack/automation/automation.sh.
# Two logins: this basic auth first, then n8n's own accounts. certbot --nginx adds TLS.
server {
    listen 80;
    listen [::]:80;
    server_name $host;

    client_max_body_size 50m;

    auth_basic "automation";
    auth_basic_user_file /etc/nginx/nextup-automation.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        # The editor's live updates run over a websocket.
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # The basic-auth header is for nginx only; n8n never sees the password.
        proxy_set_header Authorization "";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
CONF
  )

  "${compose[@]}" up -d
  echo -n "Waiting for n8n "
  local state=""
  for _ in $(seq 1 60); do
    state="$("${compose[@]}" ps n8n --format '{{.Health}}' 2>/dev/null || true)"
    [ "$state" = healthy ] && break
    echo -n "."; sleep 3
  done
  echo
  [ "$state" = healthy ] || { "${compose[@]}" logs --tail 40 n8n >&2; die "n8n did not become healthy"; }
  echo "n8n is up on 127.0.0.1:$port for https://$host"

  if [ ! -e /etc/nginx/sites-enabled/nextup-automation ]; then
    cat <<CMD

nginx does not serve $host yet. Run once, as a sudoer:

  sudo install -m 640 -o root -g www-data $dir/htpasswd /etc/nginx/nextup-automation.htpasswd
  sudo install -m 644 $dir/nginx-site /etc/nginx/sites-available/nextup-automation
  sudo ln -sf /etc/nginx/sites-available/nextup-automation /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d $host

Then open https://$host (login: cat $dir/basic-auth.txt) and create the n8n owner account
straight away - until someone does, the first visitor past the basic auth gets to.
CMD
  fi
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

  "") sed -n '2,16p' "$0" ;;
  *) [ -f "$env_file" ] || die "not installed ($env_file missing)"; exec "${compose[@]}" "$action" "$@" ;;
esac
