#!/usr/bin/env bash
# The box agent: starts, stops and deletes company stacks when admin.sellux.ch asks.
#
# It only ever calls OUT, to admin's loopback port, once a minute from cron:
#
#   * * * * * ~/nextup/stack/provision/agent.sh >> ~/nextup/provision/agent.log 2>&1
#
#   GET  $ADMIN_URL/api/provision/next        -> 204 (nothing to do) or one job, key=value lines
#   POST $ADMIN_URL/api/provision/jobs/<id>/progress  <- while it works: the step and the log so far
#   POST $ADMIN_URL/api/provision/jobs/<id>   <- how it went, the scrubbed log, the stack's passwords
#
# Config: ~/nextup/provision/.env (mode 600), read line by line (never sourced):
#   ADMIN_URL=http://127.0.0.1:3131        admin's own loopback port - not through nginx, which admin
#                                          refuses for these calls. An https URL is verified normally.
#   PROVISION_TOKEN=npa_...                admin keeps only its sha256 (PROVISION_TOKEN_SHA256)
#   OPS_PUBLIC_URL=https://admin.sellux.ch where new stacks send tickets (default shown)
#   NEXTUP_IMAGES=released                 image tag for new stacks: released (the last sha deploy.sh
#                                          released; main until there is one), main, a 7-char sha, or local
#   SITE_HELPER=/usr/local/sbin/nextup-site  root helper for nginx + certbot (see that file), or none
#   MIN_MEM_MB=600                         refuse a new stack below this much MemAvailable
#   MIN_DISK_MB=6000                       refuse a create/restart below this much free disk (images ~3.3 GB)
#
# What admin may ask for - nothing else, and every value is checked here again:
#   create       install a new stack (install.sh via add-stack.sh), nginx + TLS, report its passwords
#   credentials  read an existing stack's passwords into admin's vault
#   restart      start a stack again (after stop, or to recover)
#   stop         stop a stack; data stays; deploys leave it stopped (stack.conf STOPPED=true)
#   purge        delete a DEMO stack for good: containers, volumes, .env, nginx site
set -euo pipefail
umask 077

here="$(cd "$(dirname "$0")" && pwd)"
stack="$(dirname "$here")"
home_dir="${NEXTUP_HOME:-$HOME/nextup}"
config="${NEXTUP_PROVISION_ENV:-$home_dir/provision/.env}"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$home_dir/instances}"
export NEXTUP_SITES="${NEXTUP_SITES:-$home_dir/nginx}"
domain="${NEXTUP_DOMAIN:-sellux.ch}"
RESERVED=" www admin api n8n mail automation ops status app static assets _next login signup pricing contact imprint privacy forgot-password invite demo landing staging "

say() { echo "$(date -u +%FT%TZ) $*"; }
die() { say "agent: $*" >&2; exit 1; }

# ── Config ───────────────────────────────────────────────────────────────────────────────────────
[ -f "$config" ] || die "no config at $config"
ADMIN_URL="" PROVISION_TOKEN="" OPS_PUBLIC_URL="https://admin.sellux.ch" NEXTUP_IMAGES="released" SITE_HELPER="/usr/local/sbin/nextup-site" MIN_MEM_MB=600 MIN_DISK_MB=6000
while IFS='=' read -r k v; do
  v="${v%$'\r'}"
  case "$k" in
    ADMIN_URL) ADMIN_URL="${v%/}" ;;
    PROVISION_TOKEN) PROVISION_TOKEN="$v" ;;
    OPS_PUBLIC_URL) OPS_PUBLIC_URL="${v%/}" ;;
    NEXTUP_IMAGES) NEXTUP_IMAGES="$v" ;;
    SITE_HELPER) SITE_HELPER="$v" ;;
    MIN_MEM_MB) MIN_MEM_MB="$v" ;;
    MIN_DISK_MB) MIN_DISK_MB="$v" ;;
  esac
done < "$config"
[[ "$ADMIN_URL" =~ ^(http://127\.0\.0\.1:[0-9]{2,5}|https://[a-z0-9.-]+)$ ]] || die "ADMIN_URL must be http://127.0.0.1:PORT or https://host"
[[ "$PROVISION_TOKEN" =~ ^npa_[A-Za-z0-9_-]{32,100}$ ]] || die "PROVISION_TOKEN must be npa_..."
[[ "$OPS_PUBLIC_URL" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || die "OPS_PUBLIC_URL looks wrong"
[[ "$NEXTUP_IMAGES" =~ ^(released|main|local|[0-9a-f]{7})$ ]] || die "NEXTUP_IMAGES is released, main, local or a 7-char sha"
# A new company gets what the others run - the last released commit (stack/nginx/deploy.sh), never
# one that only reached staging. Its scripts come from ~/nextup/stack, which is that same commit.
if [ "$NEXTUP_IMAGES" = released ]; then
  NEXTUP_IMAGES="$(tail -n 1 "${NEXTUP_RELEASED:-$home_dir/released}" 2>/dev/null | cut -d' ' -f1 || true)"
  [[ "$NEXTUP_IMAGES" =~ ^[0-9a-f]{7}$ ]] || NEXTUP_IMAGES=main
fi
[[ "$MIN_MEM_MB" =~ ^[0-9]{1,6}$ ]] || die "MIN_MEM_MB is a number"
[[ "$MIN_DISK_MB" =~ ^[0-9]{1,7}$ ]] || die "MIN_DISK_MB is a number"
[ "$SITE_HELPER" = none ] || [[ "$SITE_HELPER" =~ ^/usr/local/sbin/[a-z-]+$ ]] || die "SITE_HELPER is none or /usr/local/sbin/<name>"

# ── One run at a time ────────────────────────────────────────────────────────────────────────────
work="$(mktemp -d)"
lock="$home_dir/provision/agent.lock"
if command -v flock >/dev/null; then
  exec 9>"$lock"; flock -n 9 || { rm -rf "$work"; exit 0; }
  trap 'rm -rf "$work"' EXIT
else  # Git Bash on a laptop has no flock
  mkdir "$lock.d" 2>/dev/null || { rm -rf "$work"; exit 0; }
  trap 'rm -rf "$work"; rmdir "$lock.d"' EXIT
fi

# The token goes to curl in a header file, never on its command line (ps would show it).
printf 'Authorization: Bearer %s\n' "$PROVISION_TOKEN" > "$work/auth"
curl_admin() { curl -sS --max-time 30 --proto '=http,https' -H @"$work/auth" "$@"; }

disk_mb() { df -Pm "${DOCKER_ROOT:-/var/lib/docker}" 2>/dev/null | awk 'NR==2 { print $4 }' | grep -E '^[0-9]+$' || df -Pm / | awk 'NR==2 { print $4 }'; }
mem_mb() {  # MemAvailable, else MemFree (Git Bash), else 0
  local m
  m="$(awk '/^MemAvailable:/ { a = $2 } /^MemFree:/ { f = $2 } END { printf "%d", (a ? a : f) / 1024 }' /proc/meminfo 2>/dev/null || true)"
  echo "${m:-0}"
}
helper_ok() { [ "$SITE_HELPER" != none ] && [ -x "$SITE_HELPER" ] && sudo -n -l "$SITE_HELPER" >/dev/null 2>&1 && echo yes || echo no; }
installed() { local d; for d in "$NEXTUP_INSTANCES"/*/; do [ -f "$d.env" ] && basename "$d"; done 2>/dev/null | paste -sd, -; }

# ── Ask for work ─────────────────────────────────────────────────────────────────────────────────
code="$(curl_admin -o "$work/job" -w '%{http_code}' -H "X-Agent-Info: mem_mb=$(mem_mb) disk_mb=$(disk_mb) stacks=$(installed) helper=$(helper_ok)" "$ADMIN_URL/api/provision/next" || true)"
case "$code" in
  204) exit 0 ;;
  200) ;;
  *) die "admin answered $code to /api/provision/next" ;;
esac

id="" action="" slug="" port="" stage="" name_b64="" ops_token=""
while IFS='=' read -r k v; do
  case "$k" in
    id) id="$v" ;; action) action="$v" ;; slug) slug="$v" ;; port) port="$v" ;; stage) stage="$v" ;;
    name_b64) name_b64="$v" ;; ops_token) ops_token="$v" ;;
    *) die "unknown job field '$k' - refusing the job" ;;
  esac
done < "$work/job"
[[ "$id" =~ ^[a-z0-9]{10,40}$ ]] || die "bad job id"

# From here on every outcome is reported back, so the company page never spins forever.
log="$work/log"; : > "$log"
secrets_json=""
logins_json=""

# Codes and tokens never reach agent.log or admin in clear (same filter as deploy.sh, plus tokens).
scrub() { sed -E -e 's/(code:[[:space:]]*)[^[:space:]]+/\1[hidden]/g' \
                 -e 's/\b[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/[login code]/g' \
                 -e 's/\b(nxs|npa)_[A-Za-z0-9_-]{8,}/[token]/g'; }

report() {  # status (done|failed|needs_nginx)
  local status="$1" body="$work/report.json"
  {
    printf '{"status":"%s","log_b64":"%s"' "$status" "$(scrub < "$log" | tail -c 60000 | base64 | tr -d '\n')"
    [ -n "$secrets_json" ] && printf ',"secrets":{%s}' "$secrets_json"
    [ -n "$logins_json" ] && printf ',"logins":[%s]' "$logins_json"
    printf '}\n'
  } > "$body"
  local rc
  # Admin may be restarting or its database briefly away (28 Sep: a 500 left a job "running"
  # for 30 min): try a few times before giving up.
  local try
  for try in 1 2 3 4 5; do
    rc="$(curl_admin -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' --data-binary @"$body" "$ADMIN_URL/api/provision/jobs/$id" || true)"
    case "$rc" in 200|404|409|422) break ;; esac
    sleep $((try * 5))
  done
  say "job $id $action $slug -> $status (admin answered $rc)"
  scrub < "$log" | sed 's/^/    /'
}
fail() { echo "!! $*" >> "$log"; report failed; exit 1; }

# Where the job is, with the log so far, so admin's company page shows the setup as it happens.
# Best effort: an older admin answers 404 and the job goes on. Never carries a password.
step=""
progress() {  # step: checks | install | health | secrets | nginx
  step="$1"
  printf '{"step":"%s","log_b64":"%s"}\n' "$step" "$(scrub < "$log" | tail -c 60000 | base64 | tr -d '\n')" > "$work/progress.json"
  curl_admin --max-time 10 -o /dev/null -H 'Content-Type: application/json' --data-binary @"$work/progress.json" \
    "$ADMIN_URL/api/provision/jobs/$id/progress" 2>/dev/null || true
}
# Like run(), but posts the log every 5 s while the command works (docker pulls take minutes).
run_watched() {
  echo "\$ ${*//$ops_token/[token]}" >> "$log"
  "$@" >> "$log" 2>&1 < /dev/null &
  local pid=$! rc=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 5
    if kill -0 "$pid" 2>/dev/null; then progress "$step"; fi
  done
  wait "$pid" || rc=$?
  return "$rc"
}

[[ "$action" =~ ^(create|credentials|restart|stop|purge)$ ]] || fail "action '$action' is not allowed"
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || fail "bad slug"
case "$RESERVED" in *" $slug "*) fail "'$slug' is reserved" ;; esac
[[ "$port" =~ ^3[1-9][0-9]1$ ]] || fail "port must be the first of a block, 3101-3991"
[[ "$stage" =~ ^(demo|real)$ ]] || fail "bad stage"

dir="$NEXTUP_INSTANCES/$slug"
env_file="$dir/.env"
conf="$dir/stack.conf"
getenv() { grep -E "^$1=" "$env_file" 2>/dev/null | head -1 | cut -d= -f2- || true; }

# The stage the BOX knows for this slug (ports.md row or stack.conf) - admin's word is not enough
# for anything destructive.
box_stage() {
  local s
  s="$(awk -F'|' -v slug="$slug" 'NF>5 { for (i=2;i<=4;i++) gsub(/ /,"",$i); if ($2==slug) print $4 }' "$stack/nginx/ports.md")"
  [ -n "$s" ] || s="$(sed -n -E 's/^STAGE=(demo|real)$/\1/p' "$conf" 2>/dev/null)"
  echo "$s"
}
box_port() {
  local p
  p="$(awk -F'|' -v slug="$slug" 'NF>5 { for (i=2;i<=4;i++) gsub(/ /,"",$i); if ($2==slug) print $3 }' "$stack/nginx/ports.md")"
  [ -n "$p" ] || p="$(sed -n -E 's/^PORT=([0-9]+)$/\1/p' "$conf" 2>/dev/null)"
  echo "$p"
}

port_busy() {  # any listener on the block's ports
  local p
  for p in "$port" $((port + 1)) $((port + 2)) $((port + 9)); do
    if command -v ss >/dev/null; then ss -Htln "sport = :$p" | grep -q . && return 0
    else (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && return 0
    fi
  done
  return 1
}
port_taken_elsewhere() {  # the port belongs to another slug in ports.md or a stack.conf
  awk -F'|' -v slug="$slug" -v port="$port" 'NF>5 { for (i=2;i<=4;i++) gsub(/ /,"",$i); if ($3==port && $2!=slug) found=1 } END { exit !found }' "$stack/nginx/ports.md" && return 0
  local c
  for c in "$NEXTUP_INSTANCES"/*/stack.conf; do
    [ -f "$c" ] && [ "$c" != "$conf" ] && grep -qx "PORT=$port" "$c" && return 0
  done
  return 1
}

collect_secrets() {  # the stack's passwords (+ demo login codes) for admin's vault
  local k v parts=()
  for k in ADMIN_ACCESS_CODE POSTGRES_PASSWORD AUTH_SECRET N8N_ENCRYPTION_KEY RESTIC_PASSWORD; do
    v="$(getenv "$k")"
    [[ "$v" =~ ^[A-Za-z0-9_+/=.-]{1,200}$ ]] && parts+=("\"$k\":\"$v\"")
  done
  secrets_json="$(IFS=,; echo "${parts[*]:-}")"
  # Demo login codes are printed once by the seed in the migrate container's log.
  local line nm cd lp=()
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    cd="${line##* }"; nm="${line% *}"; nm="${nm%"${nm##*[![:space:]]}"}"
    [[ "$cd" =~ ^[a-z0-9][a-z0-9-]*-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$ ]] && [[ "$nm" =~ ^[A-Za-z\ .\'-]{1,40}$ ]] && lp+=("{\"name\":\"$nm\",\"code\":\"$cd\"}")
  done < <("$stack/ctl.sh" "$slug" logs --no-log-prefix migrate 2>/dev/null | sed -n '/^login codes/,$p' | tail -n +2)
  logins_json="$(IFS=,; echo "${lp[*]:-}")"
}

health() {  # the app answers through the stack's Caddy
  local i
  for i in 1 2 3 4 5 6; do
    curl -fsS --max-time 5 -o /dev/null -H "Host: $slug.$domain" "http://127.0.0.1:$port/api/health" && return 0
    sleep 5
  done
  return 1
}

nginx_add() {  # 0 = nginx serves it over https now
  if [ "$SITE_HELPER" = none ] || [ ! -x "$SITE_HELPER" ]; then
    echo "The nginx helper is not installed ($SITE_HELPER). Run the sudo lines above, or install the helper (Handbook > Runbooks)." >> "$log"
    return 1
  fi
  sudo -n "$SITE_HELPER" add "$slug" "$port" >> "$log" 2>&1
}
nginx_serves() { [ -L "/etc/nginx/sites-enabled/nextup-$slug" ]; }

# A failed create/restart must not leave containers restarting forever (a db that can't start
# restarts every few seconds). Stop them; volumes and .env stay, so Restart or Delete still work.
stop_half_built() {
  echo "Stopping the half-started containers (data stays; Restart or Delete from admin)." >> "$log"
  "$stack/ctl.sh" "$slug" down >> "$log" 2>&1 < /dev/null || true
}

run() { echo "\$ ${*//$ops_token/[token]}" >> "$log"; "$@" >> "$log" 2>&1 < /dev/null; }

case "$action" in
  create)
    progress checks
    if [ -f "$env_file" ]; then
      # A retry of a create that got this far before: same port or nothing.
      [ "$(box_port)" = "$port" ] || fail "$slug is already installed with another port ($(box_port))"
    else
      port_taken_elsewhere && fail "port $port belongs to another stack"
      port_busy && fail "something already listens on $port-$((port + 9))"
      free="$(mem_mb)"
      [ "$free" -ge "$MIN_MEM_MB" ] || fail "only ${free} MB memory available, need $MIN_MEM_MB MB for a new stack"
      disk="$(disk_mb)"
      [ "${disk:-0}" -ge "$MIN_DISK_MB" ] || fail "only ${disk} MB disk free, need $MIN_DISK_MB MB for a new stack"
    fi
    # `IFS='=' read` above drops one trailing "=", which is base64 padding here: put it back.
    while (( ${#name_b64} % 4 )); do name_b64+="="; done
    name="$(printf '%s' "$name_b64" | base64 -d 2>/dev/null)" || fail "bad name"
    [[ "$ops_token" =~ ^nxs_[A-Za-z0-9_-]{20,100}$ ]] || fail "the job carries no ticket token"
    mkdir -p "$dir"
    [ -f "$conf" ] || printf 'PORT=%s\nSTAGE=%s\n' "$port" "$stage" > "$conf"
    progress install
    NEXTUP_OPS_TOKEN="$ops_token" run_watched "$stack/nginx/add-stack.sh" "$slug" "$port" "$stage" \
      --images "$NEXTUP_IMAGES" --name "$name" --ops-url "$OPS_PUBLIC_URL" || { stop_half_built; fail "add-stack.sh failed"; }
    progress health
    health || { stop_half_built; fail "the app does not answer on 127.0.0.1:$port"; }
    echo "The app answers on 127.0.0.1:$port." >> "$log"
    progress secrets
    collect_secrets
    progress nginx
    if nginx_add; then report done; else report needs_nginx; fi
    ;;

  credentials)
    [ -f "$env_file" ] || fail "$slug is not installed on this box"
    collect_secrets
    echo "Read $(tr -cd ',' <<< ",$secrets_json" | wc -c | tr -d ' ') value(s) from $env_file." >> "$log"
    report done
    ;;

  restart)
    [ -f "$env_file" ] || fail "$slug is not installed on this box"
    [ "$(box_port)" = "$port" ] || fail "the box has $slug on port $(box_port), admin says $port"
    [ -f "$conf" ] && sed -i '/^STOPPED=/d' "$conf"
    progress install
    disk="$(disk_mb)"
    [ "${disk:-0}" -ge 1000 ] || fail "only ${disk} MB disk free - the database can't start like this"
    run_watched "$stack/nginx/add-stack.sh" "$slug" "$port" "$(box_stage)" || { stop_half_built; fail "add-stack.sh failed"; }
    progress health
    health || fail "the app does not answer on 127.0.0.1:$port"
    progress secrets
    collect_secrets
    progress nginx
    if nginx_serves || nginx_add; then report done; else report needs_nginx; fi
    ;;

  stop)
    [ -f "$env_file" ] || fail "$slug is not installed on this box"
    run "$stack/nginx/remove-stack.sh" "$slug" || fail "remove-stack.sh failed"
    # Remember it, so the next deploy leaves it stopped (deploy.sh reads STOPPED=true).
    [ -f "$conf" ] || printf 'PORT=%s\nSTAGE=%s\n' "$(box_port)" "$(box_stage)" > "$conf"
    grep -qx 'STOPPED=true' "$conf" || echo 'STOPPED=true' >> "$conf"
    report done
    ;;

  purge)
    if [ ! -f "$env_file" ]; then
      # A create that failed before install.sh wrote the .env: no containers, no data. Clear what
      # the agent itself left (stack.conf, an nginx site) so admin can forget the company.
      if [ -d "$dir" ] && [ -n "$(ls -A "$dir" | grep -vx stack.conf)" ]; then
        fail "$dir holds more than stack.conf but no .env - look at it by hand"
      fi
      rm -f "$conf"; [ -d "$dir" ] && rmdir "$dir"
      if [ "$SITE_HELPER" != none ] && [ -x "$SITE_HELPER" ] && nginx_serves; then
        sudo -n "$SITE_HELPER" remove "$slug" >> "$log" 2>&1 || echo "!! nginx helper failed" >> "$log"
      fi
      rm -f "$NEXTUP_SITES/nextup-$slug"
      echo "$slug was never installed on this box - nothing to delete." >> "$log"
      report done
      exit 0
    fi
    # Stage 1: only demo stacks, whatever admin says.
    [ "$(box_stage)" = demo ] || fail "$slug is not a demo stack on this box - refusing to delete it"
    printf '%s\n' "$slug" > "$work/confirm"
    echo "\$ remove-stack.sh $slug --purge" >> "$log"
    "$stack/nginx/remove-stack.sh" "$slug" --purge < "$work/confirm" >> "$log" 2>&1 || fail "remove-stack.sh --purge failed"
    if [ "$SITE_HELPER" != none ] && [ -x "$SITE_HELPER" ]; then
      sudo -n "$SITE_HELPER" remove "$slug" >> "$log" 2>&1 || echo "!! nginx helper failed - run the sudo lines above" >> "$log"
    fi
    rm -f "$NEXTUP_SITES/nextup-$slug"
    report done
    ;;
esac
