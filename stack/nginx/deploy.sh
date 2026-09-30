#!/usr/bin/env bash
# The only thing CI may run on the shared box: move every installed stack to one image tag.
# Meant as a forced command, so the deploy key can't get a shell on a box with other sites:
#
#   ~/.ssh/authorized_keys (one line):
#   command="~/nextup/stack/nginx/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy
#
# CI then runs:   ssh hetzner deploy <tag>     (tag: main or a 7-char commit sha)
#                 ssh hetzner status
# By hand:        ~/nextup/stack/nginx/deploy.sh deploy main
#                 ~/nextup/stack/nginx/deploy.sh promote demo a16bc06
#
# A deploy first replaces ~/nextup/stack with the stack/ folder of the same commit from GitHub
# (the previous one stays as stack.prev), then moves every stack - the rows of ports.md with
# stage demo|real and an installed instance - to that commit's images.
#
# A pinned stack is the exception (PINNED=<sha> in its instances/<slug>/stack.conf): a deploy leaves
# it alone, so what is shown in an interview never changes by itself. Only `promote <slug> <sha>`
# moves it. It runs from its own copy of stack/ at that commit (instances/<slug>/stack), so its
# compose file and Caddyfile stay as old as its images.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
log="${NEXTUP_DEPLOY_LOG:-$HOME/nextup/deploy.log}"
backup_log="${NEXTUP_BACKUP_LOG:-$HOME/nextup/backup.log}"

# Forced command: the client's words arrive in SSH_ORIGINAL_COMMAND, never as a shell.
if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then read -r -a args <<< "$SSH_ORIGINAL_COMMAND"; else args=("$@"); fi
action="${args[0]:-}" tag="${args[1]:-}"

repo="${NEXTUP_REPO:-selluxhenner/nextup}"
stack_root="$(dirname "$here")"

# stack/ at one commit, from GitHub into DEST (which must not exist yet).
fetch_stack() {
  local ref="$1" dest="$2" tmp
  tmp="$(mktemp -d)"
  curl -fsSL --max-time 60 "https://codeload.github.com/$repo/tar.gz/$ref"     | tar xz -C "$tmp" --wildcards '*/stack/' || { rm -rf "$tmp"; echo "!! could not fetch stack/ at $ref"; return 1; }
  rm -rf "$dest"; mv "$tmp"/*/stack "$dest"; rm -rf "$tmp"
  [ -x "$dest/nginx/add-stack.sh" ] && [ -f "$dest/compose.yml" ] || { rm -rf "$dest"; echo "!! stack/ at $ref looks wrong"; return 1; }
  # Never let a download carry secrets or instances in.
  rm -rf "$dest/instances"
}

# stack/ at exactly the commit being deployed, so scripts and images always match. Swapped in
# with mv: this script keeps running from the old copy's already-open file.
sync_stack() {
  local ref="$1" new="$stack_root.new"
  fetch_stack "$ref" "$new" || return 1
  rm -rf "$stack_root.prev"; mv "$stack_root" "$stack_root.prev"; mv "$new" "$stack_root"
  echo "stack/ now at $ref (previous in $stack_root.prev)"
}

# A commit CI hasn't published (yet) changes nothing at all. $1 is the tag as on GHCR.
pull_images() {
  local i
  for i in nextup-app nextup-migrate; do
    docker pull -q "${NEXTUP_REGISTRY:-ghcr.io/selluxhenner}/$i:$1" >/dev/null || { echo "!! no image $i:$1 - nothing changed"; return 1; }
  done
}

# The commit a stack is pinned to, or nothing.
pinned() { sed -n -E 's/^PINNED=([0-9a-f]{7})$/\1/p' "$NEXTUP_INSTANCES/$1/stack.conf" 2>/dev/null | tail -1 || true; }

known() {  # slug port stage, for every stack the box knows, installed or not: ports.md rows + stack.conf files
  awk -F'|' 'NF>5 { for (i=2;i<=4;i++) gsub(/ /,"",$i); if ($4=="demo"||$4=="real") print $2, $3, $4 }' "$here/ports.md"
  # Stacks started from admin.sellux.ch (stack/provision/agent.sh) are registered on the box only.
  for conf in "$NEXTUP_INSTANCES"/*/stack.conf; do
    [ -f "$conf" ] || continue
    s="$(basename "$(dirname "$conf")")"
    grep -qE "^\| *$s *\|" "$here/ports.md" && continue
    p="$(sed -n -E 's/^PORT=([0-9]{4,5})$/\1/p' "$conf")"
    st="$(sed -n -E 's/^STAGE=(demo|real)$/\1/p' "$conf")"
    [ -n "$p" ] && [ -n "$st" ] && echo "$s $p $st"
  done
}

stacks() {  # the same, but only installed, running stacks
  known | while read -r s p st; do
    # Reserved rows (not installed) are skipped without failing the loop; so is a stack stopped on
    # purpose from admin (stack.conf STOPPED=true) - a deploy must not start it again.
    [ -f "$NEXTUP_INSTANCES/$s/.env" ] || continue
    grep -qx 'STOPPED=true' "$NEXTUP_INSTANCES/$s/stack.conf" 2>/dev/null && continue
    echo "$s $p $st"
  done
}

# Every deploy pulls a new app (~0.4 GB) and migrate (~2.8 GB) image; left alone they filled the
# 75 GB disk in one day (28 Sep: Postgres of a new stack could not start). Keep :main and the two
# newest sha tags of each (for a rollback); never one a container still uses. All are on GHCR.
prune_images() {
  local repo used t n
  used="$(docker ps -a --format '{{.Image}}' | sort -u)"
  for repo in nextup-app nextup-migrate; do
    n=0
    while read -r t; do
      n=$((n + 1)); [ "$n" -le 2 ] && continue
      grep -qx "${NEXTUP_REGISTRY:-ghcr.io/selluxhenner}/$repo:$t" <<< "$used" && continue
      docker rmi "${NEXTUP_REGISTRY:-ghcr.io/selluxhenner}/$repo:$t" >/dev/null 2>&1 || true
    done < <(docker images "${NEXTUP_REGISTRY:-ghcr.io/selluxhenner}/$repo" --format '{{.Tag}}' | grep '^sha-')
  done
  docker image prune -f >/dev/null 2>&1 || true
  echo "images pruned; disk: $(df -h / | awk 'NR==2 { print $4 " free" }')"
}

by="${SSH_CONNECTION:-local}"
case "$action" in
  status)
    stacks | while read -r s _ _; do
      pin="$(pinned "$s")"
      printf '%-10s %s%s\n' "$s" "$(grep '^NEXTUP_APP_IMAGE=' "$NEXTUP_INSTANCES/$s/.env" | cut -d= -f2)" "${pin:+  (pinned)}"
      "$here/../ctl.sh" "$s" ps --format '  {{.Service}} {{.Status}}'
    done ;;
  deploy)
    [[ "$tag" =~ ^(main|[0-9a-f]{7})$ ]] || { echo "deploy: tag must be main or a 7-char commit sha" >&2; exit 2; }
    echo "$(date -u +%FT%TZ) deploy $tag by ${by%% *}" >> "$log"
    # The images first.
    img_tag="$tag"; [ "$tag" = main ] || img_tag="sha-$tag"
    pull_images "$img_tag" || { echo "$(date -u +%FT%TZ) deploy $tag failed: no images" >> "$log"; exit 1; }
    sync_stack "$tag" || { echo "$(date -u +%FT%TZ) deploy $tag failed: stack/ not updated" >> "$log"; exit 1; }
    # From here on the new copy's scripts run (same paths, new files).
    failed=0
    while read -r s p st; do
      pin="$(pinned "$s")"
      if [ -n "$pin" ]; then echo "== $s stays at $pin (pinned; 'promote $s <sha>' moves it)"; continue; fi
      echo "== $s -> $tag"
      # CI logs are no place for secrets: drop the admin code and any login codes.
      rc=0
      "$here/add-stack.sh" "$s" "$p" "$st" --images "$tag" </dev/null 2>&1 \
        | { grep -vE 'code:|[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\s*$' || true; } || rc=$?
      [ "$rc" -eq 0 ] || { echo "!! $s failed"; failed=1; }
    done < <(stacks)
    # automation.sellux.ch: apply compose changes (never its secrets or nginx site).
    if [ -f "${NEXTUP_AUTOMATION:-$HOME/nextup/automation}/.env" ]; then
      echo "== automation"
      "$stack_root/automation/automation.sh" up -d --remove-orphans </dev/null 2>&1 | grep -vE '^ *Container .* (Running|Waiting)' || true
    fi
    prune_images
    echo "$(date -u +%FT%TZ) deploy $tag done (failed=$failed)" >> "$log"
    exit "$failed" ;;
  promote)
    # Move one stack to one commit and pin it there. Also its first install. A pin is a commit,
    # never the moving `main`.
    slug="$tag"; tag="${args[2]:-}"; extra=("${args[@]:3}")
    [[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] && [[ "$tag" =~ ^[0-9a-f]{7}$ ]] \
      || { echo "usage: promote <slug> <7-char commit sha> [install.sh options]" >&2; exit 2; }
    # install.sh options (--name on the first install) only by hand, never from the CI key.
    [ -z "${SSH_ORIGINAL_COMMAND:-}" ] || [ "${#extra[@]}" -eq 0 ] || { echo "promote: no options over ssh" >&2; exit 2; }
    read -r _ port stage < <(known | awk -v s="$slug" '$1 == s') || true
    [ -n "${port:-}" ] || { echo "promote: '$slug' is neither in ports.md nor in a stack.conf" >&2; exit 2; }
    dir="$NEXTUP_INSTANCES/$slug"; conf="$dir/stack.conf"
    was="$(pinned "$slug")"
    echo "$(date -u +%FT%TZ) promote $slug $tag (was ${was:-not pinned}) by ${by%% *}" >> "$log"
    bail() { echo "!! $1"; echo "$(date -u +%FT%TZ) promote $slug $tag failed: $1" >> "$log"; exit 1; }
    pull_images "sha-$tag" || bail "no images"
    # The database as it is now, before the new commit's migrations run: going back is a promote
    # to the old sha, plus `backup.sh <slug> restore` if a migration was in between. A stack whose
    # database is down, or that the nightly backup has not set up yet, moves without one.
    if grep -q '^RESTIC_PASSWORD=' "$dir/.env" 2>/dev/null \
        && "$stack_root/ctl.sh" "$slug" exec -T db pg_isready -U nextup -d nextup >/dev/null 2>&1; then
      "$stack_root/backup.sh" "$slug" backup >> "$backup_log" 2>&1 || bail "backup failed (see $backup_log) - nothing changed"
      echo "backup taken"
    else
      echo "no backup (new stack, or its database is not running)"
    fi
    mkdir -p "$dir"
    fetch_stack "$tag" "$dir/stack.new" || bail "stack/ not fetched - nothing changed"
    rm -rf "$dir/stack"; mv "$dir/stack.new" "$dir/stack"
    # The pin first: a deploy that runs meanwhile already leaves the stack alone.
    [ -f "$conf" ] || printf 'PORT=%s\nSTAGE=%s\n' "$port" "$stage" > "$conf"
    sed -i '/^PINNED=/d' "$conf"; echo "PINNED=$tag" >> "$conf"
    echo "== $slug -> $tag (pinned)"
    # Over ssh the output is a CI log: drop the admin code and any login codes, as a deploy does.
    # By hand they are shown - the first install prints them once.
    scrub() { if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then grep -vE 'code:|[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\s*$' || true; else cat; fi; }
    rc=0
    "$dir/stack/nginx/add-stack.sh" "$slug" "$port" "$stage" --images "$tag" "${extra[@]}" </dev/null 2>&1 | scrub || rc=$?
    [ "$rc" -eq 0 ] || bail "$slug did not come up at $tag${was:+ - to go back: promote $slug $was}"
    echo "$(date -u +%FT%TZ) promote $slug $tag done" >> "$log"
    echo "$slug is pinned at $tag${was:+ (was $was; to go back: promote $slug $was)}" ;;
  *) echo "usage: deploy <main|sha> | promote <slug> <sha> | status" >&2; exit 2 ;;
esac
