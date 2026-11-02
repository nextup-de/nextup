#!/usr/bin/env bash
# The host side of stack/deploy-remote.sh: the forced command of the deploy key on a customer VM.
# It does one thing - move this host's one stack to a released sha, with a backup before the
# migrate. No nginx, no ports.md, no box agent (stack/nginx/deploy.sh is the shared box's).
#
#   ~/.ssh/authorized_keys (one line):
#   command="~/nextup/stack/remote/host.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy
#
#   release <sha>   the sha is 7 lowercase hex chars; in this order, under a lock:
#                   .env of the stack exists -> images pulled -> stack/ fetched into stack.new ->
#                   backup.sh <slug> pre-migrate <sha> -> stack.new becomes stack (the old one stays as
#                   stack.prev) -> install.sh -> sha appended to ~/nextup/released.
#                   Any failure before the swap changes nothing.
#   status          the slug, its image, the state of each service, the last released sha
#
# Over ssh the client's words arrive in SSH_ORIGINAL_COMMAND and are split into words, never run
# as a shell. By hand on the host the same verbs come from the arguments.
#
# ~/nextup/host.conf (read line by line with sed, never sourced):
#   SLUG=acme                                                    required
#   NEXTUP_REGISTRY=ghcr.io/nextup-de                            optional, this is the default
#   NEXTUP_STACK_URL=https://codeload.github.com/nextup-de/nextup/tar.gz/{sha}
#                                                                optional; {sha} is replaced; file:// ok
# Going back: release <older sha>, plus `backup.sh <slug> restore <snapshot id>` when a migration
# ran in between (stack/remote/README.md).
set -euo pipefail
umask 077

home="${NEXTUP_HOME:-$HOME/nextup}"
conf="$home/host.conf"
instances="$home/instances"
log="$home/deploy.log"
backup_log="$home/backup.log"
released_list="$home/released"
lock_file="$home/deploy.lock"

usage() { echo "usage: release <sha: 7 lowercase hex chars> | status" >&2; exit 2; }

if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  read -r -a args <<< "$SSH_ORIGINAL_COMMAND"
else
  args=("$@")
fi
case "${args[0]:-}:${#args[@]}" in status:1|release:2) ;; *) usage ;; esac
action="${args[0]}" sha="${args[1]:-}"
[ "$action" != release ] || [[ "$sha" =~ ^[0-9a-f]{7}$ ]] || usage

# One KEY=value line of a file, never sourced.
conf_get() {  # file key
  sed -n -E "s/^$2=(.*)$/\1/p" "$1" 2>/dev/null | tail -n 1 | tr -d '\r' || true
}

# CI logs are no place for secrets: drop the admin code and any login codes (as stack/nginx/deploy.sh).
hide_codes() { grep -vE 'code:|[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\s*$' || true; }

stamp() { date -u +%FT%TZ; }
step() { echo "$*"; echo "$(stamp) $*" >> "$log"; }

last_released() { if [ -f "$released_list" ]; then tail -n 1 "$released_list" | cut -d' ' -f1; fi; }

slug="$(conf_get "$conf" SLUG)"
registry="$(conf_get "$conf" NEXTUP_REGISTRY)"; registry="${registry:-ghcr.io/nextup-de}"
stack_url="$(conf_get "$conf" NEXTUP_STACK_URL)"
[ -n "$stack_url" ] || stack_url='https://codeload.github.com/nextup-de/nextup/tar.gz/{sha}'
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || { echo "!! SLUG in $conf is missing or not 2-32 of a-z, 0-9, '-'" >&2; exit 1; }
case "$stack_url" in
  https://*|file://*) ;;
  *) echo "!! NEXTUP_STACK_URL in $conf must start with https:// or file://" >&2; exit 1 ;;
esac
case "$stack_url" in *'{sha}'*) ;; *) echo "!! NEXTUP_STACK_URL in $conf must contain {sha}" >&2; exit 1 ;; esac

env_file="$instances/$slug/.env"
new="$home/stack.new"
placeholder="{sha}"

# One move at a time: two migrations must never overlap.
take_lock() {
  command -v flock >/dev/null || return 0
  exec 8>"$lock_file"
  flock -w 1500 8 || { echo "!! another deploy has held $lock_file for 25 minutes - nothing changed" >&2; exit 1; }
}

# Before the swap: undo what was prepared, say so, stop.
bail() {
  rm -rf "$new"
  step "!! $1 - nothing changed"
  exit 1
}

# stack/ of one commit into stack.new, from NEXTUP_STACK_URL.
fetch_stack() {  # sha
  local url tmp
  url="${stack_url//"$placeholder"/$1}"
  tmp="$(mktemp -d)"
  curl -fsSL --max-time 60 "$url" | tar xz -C "$tmp" --wildcards '*/stack/' \
    || { rm -rf "$tmp"; return 1; }
  rm -rf "$new"
  mv "$tmp"/*/stack "$new" || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
  # Never let a download carry instances in. It holds no secret, so everyone may read it (the
  # containers mount files from it).
  rm -rf "$new/instances"
  chmod -R go+rX "$new"
  [ -f "$new/install.sh" ] && [ -f "$new/backup.sh" ] && [ -f "$new/compose.yml" ] \
    || { rm -rf "$new"; return 1; }
}

release() {
  local app_origin images i prev rc=0
  take_lock
  step "release $sha started"
  [ -f "$env_file" ] || bail "no stack '$slug' installed ($env_file missing)"
  app_origin="$(conf_get "$env_file" APP_ORIGIN)"
  [ -n "$app_origin" ] || bail "APP_ORIGIN is not in $env_file"

  images=(nextup-app nextup-migrate)
  grep -q '^BRAIN_API_KEY=' "$env_file" && images+=(nextup-brain)
  for i in "${images[@]}"; do
    docker pull -q "$registry/$i:sha-$sha" >/dev/null 2>&1 || bail "no image $i:sha-$sha in $registry"
  done
  step "images pulled: ${images[*]} at sha-$sha"

  fetch_stack "$sha" || bail "could not fetch a complete stack/ at $sha"
  step "stack/ at $sha fetched into $new"

  NEXTUP_INSTANCES="$instances" "$new/backup.sh" "$slug" pre-migrate "$sha" >> "$backup_log" 2>&1 \
    || bail "backup failed (see $backup_log)"
  step "backup before the migrate done"

  prev="$(last_released)"
  rm -rf "$home/stack.prev"
  mv "$home/stack" "$home/stack.prev"
  mv "$new" "$home/stack"
  step "stack/ now at $sha (previous in $home/stack.prev)"

  # Over ssh this is a log: drop the admin code and any login codes.
  NEXTUP_INSTANCES="$instances" NEXTUP_REGISTRY="$registry" \
    "$home/stack/install.sh" --slug "$slug" --origin "$app_origin" --stage real --images "$sha" \
    </dev/null 2>&1 | hide_codes || rc=$?
  if [ "$rc" -ne 0 ]; then
    step "!! $slug did not come up at $sha - to go back: release ${prev:-<an earlier released sha>}"
    exit 1
  fi
  echo "$sha $(stamp)" >> "$released_list"
  step "install of $slug at $sha done"
  step "release $sha done"
}

status() {
  echo "$slug"
  echo "  image: $(conf_get "$env_file" NEXTUP_APP_IMAGE)"
  NEXTUP_INSTANCES="$instances" "$home/stack/ctl.sh" "$slug" ps --format '  {{.Service}} {{.Status}}' 2>&1 || true
  echo "released: $(last_released)"
}

main() {
  case "$action" in
    release) release ;;
    status) status ;;
  esac
}
main
exit 0
