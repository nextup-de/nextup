#!/usr/bin/env bash
# The only thing CI may run on the shared box: move company stacks to one commit's images.
# Meant as a forced command, so the deploy key can't get a shell on a box with other sites:
#
#   ~/.ssh/authorized_keys (one line):
#   command="~/nextup/stack/nginx/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy
#
# Two tracks (the Track column of ports.md; RUNBOOK "Staging and the release track"):
#
#   stage <sha>     the stacks on track `main` (staging.sellux.ch) get the commit first
#   release <sha>   every other stack gets it - only a sha that `stage` moved before
#   status          what runs where, and the last staged and released sha
#
# And the PR previews (RUNBOOK "PR previews"; .github/workflows/preview.yml, with its own key that
# may run only these two and status - authorized_keys: command="~/nextup/stack/nginx/deploy.sh --previews-only"):
#
#   preview <pr> <sha>   a fresh demo stack of that PR's commit in a preview slot (previewN.sellux.ch)
#   unpreview <pr>       the PR's slot emptied
#
# CI runs:        ssh hetzner stage <sha>, later ssh hetzner release <sha>, ssh hetzner status
#                 (.github/workflows/images.yml + deploy.yml: the release waits for Kevin's approval)
# By hand:        ~/nextup/stack/nginx/deploy.sh promote demo a16bc06
#                 ~/nextup/stack/nginx/deploy.sh unpin musterwerk  (back onto its track)
#                 ~/nextup/stack/nginx/deploy.sh deploy main     (both tracks at once, no gate;
#                                                                 refused over ssh)
#
# A release first replaces ~/nextup/stack with the stack/ folder of the same commit from GitHub
# (the previous one stays as stack.prev), then moves every release-track stack - the rows of
# ports.md with stage demo|real and an installed instance, plus the stacks admin.sellux.ch
# started - to that commit's images. So ~/nextup/stack is always the released commit.
#
# A main-track stack runs from its own copy of stack/ at its commit (instances/<slug>/stack), as
# a pinned one does: staging is usually ahead of the release, and its compose file and scripts
# must be as new as its images, without touching everyone else's.
#
# Every stack follows its track unless someone pinned it by hand: a pinned stack (PINNED=<sha> in
# its instances/<slug>/stack.conf) is left alone by both, so what is shown in an interview never
# changes by itself. Only `promote <slug> <sha>` moves (and pins) it; `unpin <slug>` puts it back
# on its track at once - the last released sha (staged, for a main-track stack).
#
# Every move takes a backup first (stage, release, deploy and promote): `backup.sh <slug>
# pre-migrate <sha>`, before the new commit's migrations run. A stack whose backup fails is not
# moved; a stack without one set up yet, or with its database down, moves without.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
log="${NEXTUP_DEPLOY_LOG:-$HOME/nextup/deploy.log}"
backup_log="${NEXTUP_BACKUP_LOG:-$HOME/nextup/backup.log}"
# Every sha that reached staging, and every sha that was released: "<sha> <time>", newest last.
staged_list="${NEXTUP_STAGED:-$HOME/nextup/staged}"
released_list="${NEXTUP_RELEASED:-$HOME/nextup/released}"
lock_file="${NEXTUP_DEPLOY_LOCK:-$HOME/nextup/deploy.lock}"

usage() { echo "usage: stage <sha> | release <sha> | deploy <main|sha> | promote <slug> <sha> | unpin <slug> | preview <pr> <sha> | unpreview <pr> | status" >&2; exit 2; }

# The PR preview key runs this script as `deploy.sh --previews-only` (its authorized_keys line):
# it may fill and empty the preview slots and read status, nothing else - no customer stack.
only=""
if [ "${1:-}" = --previews-only ]; then only=previews; shift; fi

# Forced command: the client's words arrive in SSH_ORIGINAL_COMMAND, never as a shell - and
# exactly as many as the verb takes.
if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  read -r -a args <<< "$SSH_ORIGINAL_COMMAND"
  # `deploy` skips the gate, so the CI key can't use it: stage, then release. `unpin` is not in
  # the list either: only the box agent (admin's Version card) and a person on the box run it.
  [ "${args[0]:-}" != deploy ] || { echo "deploy: not over ssh - use stage <sha>, then release <sha>" >&2; exit 2; }
  case "${args[0]:-}:${#args[@]}" in status:1|stage:2|release:2|promote:3|preview:3|unpreview:2) ;; *) usage ;; esac
else args=("$@"); fi
if [ "$only" = previews ]; then
  case "${args[0]:-}" in preview|unpreview|status) ;; *) echo "this key may only preview, unpreview or status" >&2; exit 2 ;; esac
fi
action="${args[0]:-}" tag="${args[1]:-}"

repo="${NEXTUP_REPO:-nextup-de/nextup}"
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
    docker pull -q "${NEXTUP_REGISTRY:-ghcr.io/nextup-de}/$i:$1" >/dev/null || { echo "!! no image $i:$1 - nothing changed"; return 1; }
  done
}

# The commit a stack is pinned to, or nothing.
pinned() { sed -n -E 's/^PINNED=([0-9a-f]{7})$/\1/p' "$NEXTUP_INSTANCES/$1/stack.conf" 2>/dev/null | tail -1 || true; }

known() {  # slug port stage track, for every stack the box knows, installed or not: ports.md rows + stack.conf files
  awk -F'|' 'NF>5 { for (i=2;i<=5;i++) gsub(/ /,"",$i); if ($4=="demo"||$4=="real") print $2, $3, $4, ($5=="main" ? "main" : "release") }' "$here/ports.md"
  # Stacks started from admin.sellux.ch (stack/provision/agent.sh) are registered on the box only,
  # and always on the release track: only a ports.md row can put a stack on main.
  for conf in "$NEXTUP_INSTANCES"/*/stack.conf; do
    [ -f "$conf" ] || continue
    s="$(basename "$(dirname "$conf")")"
    grep -qE "^\| *$s *\|" "$here/ports.md" && continue
    p="$(sed -n -E 's/^PORT=([0-9]{4,5})$/\1/p' "$conf")"
    st="$(sed -n -E 's/^STAGE=(demo|real)$/\1/p' "$conf")"
    [ -n "$p" ] && [ -n "$st" ] && echo "$s $p $st release"
  done
}

stacks() {  # the same, but only installed, running stacks
  known | while read -r s p st tr; do
    # Reserved rows (not installed) are skipped without failing the loop; so is a stack stopped on
    # purpose from admin (stack.conf STOPPED=true) - a deploy must not start it again.
    [ -f "$NEXTUP_INSTANCES/$s/.env" ] || continue
    grep -qx 'STOPPED=true' "$NEXTUP_INSTANCES/$s/stack.conf" 2>/dev/null && continue
    echo "$s $p $st $tr"
  done
}

# One KEY=value line in a stack's stack.conf (made with its PORT and STAGE when there is none yet),
# or with an empty value: the line removed.
set_conf() {  # slug port stage KEY [value]
  local conf="$NEXTUP_INSTANCES/$1/stack.conf"
  mkdir -p "$NEXTUP_INSTANCES/$1"
  [ -f "$conf" ] || printf 'PORT=%s\nSTAGE=%s\n' "$2" "$3" > "$conf"
  sed -i "/^$4=/d" "$conf"
  [ -z "${5:-}" ] || echo "$4=$5" >> "$conf"
}

# stack/ at SHA into the stack's own folder (instances/<slug>/stack), the copy it then runs from.
own_copy() {  # slug sha
  local dir="$NEXTUP_INSTANCES/$1"
  mkdir -p "$dir"
  fetch_stack "$2" "$dir/stack.new" || return 1
  rm -rf "$dir/stack"; mv "$dir/stack.new" "$dir/stack"
}

# CI logs are no place for secrets: drop the admin code and any login codes.
hide_codes() { grep -vE 'code:|[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\s*$' || true; }

# The shas in a list file, and whether one is in it.
last_in() { [ -f "$1" ] && tail -n 1 "$1" | cut -d' ' -f1 || true; }
listed() { [ -f "$1" ] && grep -q "^$2 " "$1"; }
note() {  # list sha: append, keep the newest 200
  echo "$2 $(date -u +%FT%TZ)" >> "$1"
  tail -n 200 "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}
passed() { listed "$staged_list" "$1" || listed "$released_list" "$1"; }

# One move at a time: two migrations, or a prune during another move's pull, must never overlap.
# CI's stage and release, a promote by hand and the box agent all come through here.
take_lock() {
  command -v flock >/dev/null || return 0
  exec 8>"$lock_file"
  flock -w 1500 8 || { echo "!! another deploy has held $lock_file for 25 minutes - nothing changed" >&2; exit 1; }
}

# The database as it is now, before the new commit's migrations run: going back is a move to the
# old sha, plus `backup.sh <slug> restore` if a migration was in between. A stack whose database is
# down, or that the nightly backup has not set up yet, moves without one. Returns 1 when the backup
# fails: that stack is then not moved.
backup_before() {  # slug sha stack-dir (the copy of stack/ whose scripts run the move)
  if grep -q '^RESTIC_PASSWORD=' "$NEXTUP_INSTANCES/$1/.env" 2>/dev/null       && "$3/ctl.sh" "$1" exec -T db pg_isready -U nextup -d nextup </dev/null >/dev/null 2>&1; then
    "$3/backup.sh" "$1" pre-migrate "$2" </dev/null >> "$backup_log" 2>&1       || { echo "!! $1: backup failed (see $backup_log) - not moved"; return 1; }
    echo "backup taken"
  else
    echo "no backup (new stack, or its database is not running)"
  fi
}

# Track main: every installed, unpinned main-track stack to TAG, each from its own copy of stack/.
# Sets `moved` to how many it moved; returns 1 when one failed.
moved=0
move_main_track() {  # tag
  local s p st tr pin rc failed=0
  while read -r s p st tr; do
    [ "$tr" = main ] || continue
    pin="$(pinned "$s")"
    if [ -n "$pin" ]; then echo "== $s stays at $pin (pinned; 'promote $s <sha>' moves it)"; continue; fi
    moved=$((moved + 1))
    echo "== $s -> $1 (track main)"
    rc=0
    own_copy "$s" "$1" || rc=1
    if [ "$rc" -eq 0 ]; then
      backup_before "$s" "$1" "$NEXTUP_INSTANCES/$s/stack" || rc=1
    fi
    if [ "$rc" -eq 0 ]; then
      set_conf "$s" "$p" "$st" TRACK main
      "$NEXTUP_INSTANCES/$s/stack/nginx/add-stack.sh" "$s" "$p" "$st" --images "$1" </dev/null 2>&1 | hide_codes || rc=$?
    fi
    [ "$rc" -eq 0 ] || { echo "!! $s failed"; failed=1; }
  done < <(stacks)
  return "$failed"
}

# Track release: ~/nextup/stack to TAG, then every installed, unpinned release-track stack.
move_release_track() {  # tag
  local s p st tr pin rc failed=0
  sync_stack "$1" || return 2
  # From here on the new copy's scripts run (same paths, new files).
  while read -r s p st tr; do
    pin="$(pinned "$s")"
    if [ -n "$pin" ]; then echo "== $s stays at $pin (pinned; 'promote $s <sha>' moves it)"; continue; fi
    if [ "$tr" = main ]; then echo "== $s follows main ('stage <sha>' moves it)"; continue; fi
    echo "== $s -> $1"
    if ! backup_before "$s" "$1" "$stack_root"; then failed=1; continue; fi
    # It was on main before (ports.md changed): back onto the shared stack/.
    grep -q '^TRACK=' "$NEXTUP_INSTANCES/$s/stack.conf" 2>/dev/null && set_conf "$s" "$p" "$st" TRACK
    rc=0
    "$here/add-stack.sh" "$s" "$p" "$st" --images "$1" </dev/null 2>&1 | hide_codes || rc=$?
    [ "$rc" -eq 0 ] || { echo "!! $s failed"; failed=1; }
  done < <(stacks)
  # automation.sellux.ch: apply compose changes (never its secrets or nginx site).
  if [ -f "${NEXTUP_AUTOMATION:-$HOME/nextup/automation}/.env" ]; then
    echo "== automation"
    "$stack_root/automation/automation.sh" up -d --remove-orphans </dev/null 2>&1 | grep -vE '^ *Container .* (Running|Waiting)' || true
  fi
  return "$failed"
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
      grep -qx "${NEXTUP_REGISTRY:-ghcr.io/nextup-de}/$repo:$t" <<< "$used" && continue
      docker rmi "${NEXTUP_REGISTRY:-ghcr.io/nextup-de}/$repo:$t" >/dev/null 2>&1 || true
    done < <(docker images "${NEXTUP_REGISTRY:-ghcr.io/nextup-de}/$repo" --format '{{.Tag}}' | grep '^sha-')
  done
  docker image prune -f >/dev/null 2>&1 || true
  echo "images pruned; disk: $(df -h / | awk 'NR==2 { print $4 " free" }')"
}

# ── PR previews (RUNBOOK "PR previews") ─────────────────────────────────────────────────────────
# A fixed set of slots: the ports.md rows with stage `preview`. Each keeps its nginx site and
# certificate for good (made once, by the root helper); a PR borrows a slot, and every push gives
# it a fresh demo stack (acme's demo data) at the PR's commit, from that commit's own stack/.
# Stage, release and deploy never see the slots (known() lists only demo and real rows), and
# backup.sh and health.sh skip a stack.conf with PREVIEW_PR. Closing the PR empties its slot. With
# every slot taken, the one updated longest ago goes to the new PR.
preview_min_disk_mb="${NEXTUP_PREVIEW_MIN_DISK_MB:-8000}"
site_helper="${NEXTUP_SITE_HELPER:-/usr/local/sbin/nextup-site}"
slots() { awk -F'|' 'NF>5 { for (i=2;i<=4;i++) gsub(/ /,"",$i); if ($4=="preview") print $2, $3 }' "$here/ports.md"; }
conf_val() { sed -n -E "s/^$2=(.*)$/\1/p" "$NEXTUP_INSTANCES/$1/stack.conf" 2>/dev/null | tail -1 || true; }
slot_of() {  # pr -> "slot port" of the slot that holds it
  local s p
  while read -r s p; do [ "$(conf_val "$s" PREVIEW_PR)" = "$1" ] && { echo "$s $p"; return 0; }; done < <(slots)
  return 1
}
pick_slot() {  # pr -> "slot port evicted-pr": its own slot, else a free one, else the oldest
  local s p at oldest="" best=""
  slot_of "$1" && return 0
  while read -r s p; do
    if [ -z "$(conf_val "$s" PREVIEW_PR)" ]; then echo "$s $p"; return 0; fi
    at="$(conf_val "$s" PREVIEW_AT)"; at="${at:-0}"
    if [ -z "$oldest" ] || [ "$at" -lt "$oldest" ]; then oldest="$at"; best="$s $p $(conf_val "$s" PREVIEW_PR)"; fi
  done < <(slots)
  [ -n "$best" ] && echo "$best"
}
# Containers, volumes and the slot's folder away (its .env with them): the next preview is a new
# install. The nginx site and certificate stay with the slot.
preview_wipe() {  # slot
  local dir="$NEXTUP_INSTANCES/$1" compose="$stack_root/compose.yml"
  if [ -f "$dir/.env" ]; then
    [ -f "$dir/stack/compose.yml" ] && compose="$dir/stack/compose.yml"
    docker compose -f "$compose" --env-file "$dir/.env" down -v --remove-orphans </dev/null >/dev/null 2>&1 || true
  fi
  rm -rf "${dir:?}"
}
free_disk_mb() { df -Pm "${DOCKER_ROOT:-/var/lib/docker}" 2>/dev/null | awk 'NR==2 { print $4 }' | grep -E '^[0-9]+$' || df -Pm / | awk 'NR==2 { print $4 }'; }

by="${SSH_CONNECTION:-local}"
case "$action" in
  status)
    stacks | while read -r s _ _ tr; do
      pin="$(pinned "$s")" mark=""
      if [ -n "$pin" ]; then mark="  (pinned)"; elif [ "$tr" = main ]; then mark="  (main)"; fi
      printf '%-10s %s%s\n' "$s" "$(grep '^NEXTUP_APP_IMAGE=' "$NEXTUP_INSTANCES/$s/.env" | cut -d= -f2)" "$mark"
      "$here/../ctl.sh" "$s" ps --format '  {{.Service}} {{.Status}}'
    done
    slots | while read -r s _; do
      pr="$(conf_val "$s" PREVIEW_PR)"
      if [ -n "$pr" ]; then printf '%-10s PR #%s at %s\n' "$s" "$pr" "$(conf_val "$s" PREVIEW_SHA)"; else printf '%-10s free\n' "$s"; fi
    done
    echo "staged:   $(last_in "$staged_list")"
    echo "released: $(last_in "$released_list")" ;;
  stage)
    [[ "$tag" =~ ^[0-9a-f]{7}$ ]] || { echo "stage: a 7-char commit sha" >&2; exit 2; }
    take_lock
    echo "$(date -u +%FT%TZ) stage $tag by ${by%% *}" >> "$log"
    pull_images "sha-$tag" || { echo "$(date -u +%FT%TZ) stage $tag failed: no images" >> "$log"; exit 1; }
    failed=0
    move_main_track "$tag" || failed=1
    if [ "$moved" -eq 0 ]; then
      echo "!! no main-track stack is installed - nothing staged (RUNBOOK, \"Staging and the release track\")"
      echo "$(date -u +%FT%TZ) stage $tag failed: no main-track stack" >> "$log"; exit 1
    fi
    prune_images
    [ "$failed" -eq 0 ] && note "$staged_list" "$tag"
    echo "$(date -u +%FT%TZ) stage $tag done (failed=$failed)" >> "$log"
    exit "$failed" ;;
  release)
    [[ "$tag" =~ ^[0-9a-f]{7}$ ]] || { echo "release: a 7-char commit sha" >&2; exit 2; }
    # Once there is a staging stack, nothing reaches the others without passing it first. Gated on
    # the list, not on a running stack, so stopping staging can't switch the gate off.
    if [ -f "$staged_list" ] && ! passed "$tag"; then
      echo "release: $tag never reached staging - stage it first" >&2; exit 2
    fi
    take_lock
    echo "$(date -u +%FT%TZ) release $tag by ${by%% *}" >> "$log"
    pull_images "sha-$tag" || { echo "$(date -u +%FT%TZ) release $tag failed: no images" >> "$log"; exit 1; }
    rc=0; move_release_track "$tag" || rc=$?
    [ "$rc" -ne 2 ] || { echo "$(date -u +%FT%TZ) release $tag failed: stack/ not updated" >> "$log"; exit 1; }
    prune_images
    [ "$rc" -eq 0 ] && note "$released_list" "$tag"
    echo "$(date -u +%FT%TZ) release $tag done (failed=$rc)" >> "$log"
    exit "$rc" ;;
  deploy)
    # Both tracks at once and no gate: what CI did before staging existed, and the way back by hand.
    [[ "$tag" =~ ^(main|[0-9a-f]{7})$ ]] || { echo "deploy: tag must be main or a 7-char commit sha" >&2; exit 2; }
    take_lock
    echo "$(date -u +%FT%TZ) deploy $tag by ${by%% *}" >> "$log"
    # The images first.
    img_tag="$tag"; [ "$tag" = main ] || img_tag="sha-$tag"
    pull_images "$img_tag" || { echo "$(date -u +%FT%TZ) deploy $tag failed: no images" >> "$log"; exit 1; }
    failed=0
    move_main_track "$tag" || failed=1
    rc=0; move_release_track "$tag" || rc=$?
    [ "$rc" -ne 2 ] || { echo "$(date -u +%FT%TZ) deploy $tag failed: stack/ not updated" >> "$log"; exit 1; }
    [ "$rc" -eq 0 ] || failed=1
    prune_images
    if [ "$failed" -eq 0 ] && [ "$tag" != main ]; then note "$staged_list" "$tag"; note "$released_list" "$tag"; fi
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
    # Over ssh, only a commit that reached staging or was released. By hand, any published sha.
    [ -z "${SSH_ORIGINAL_COMMAND:-}" ] || passed "$tag" || { echo "promote: $tag was never staged or released" >&2; exit 2; }
    read -r _ port stage _ < <(known | awk -v s="$slug" '$1 == s') || true
    [ -n "${port:-}" ] || { echo "promote: '$slug' is neither in ports.md nor in a stack.conf" >&2; exit 2; }
    take_lock
    dir="$NEXTUP_INSTANCES/$slug"
    was="$(pinned "$slug")"
    echo "$(date -u +%FT%TZ) promote $slug $tag (was ${was:-not pinned}) by ${by%% *}" >> "$log"
    bail() { echo "!! $1"; echo "$(date -u +%FT%TZ) promote $slug $tag failed: $1" >> "$log"; exit 1; }
    pull_images "sha-$tag" || bail "no images"
    # The database as it is now, before the new commit's migrations run (backup_before).
    backup_before "$slug" "$tag" "$stack_root"       || { echo "$(date -u +%FT%TZ) promote $slug $tag failed: backup failed"; exit 1; }
    own_copy "$slug" "$tag" || bail "stack/ not fetched - nothing changed"
    set_conf "$slug" "$port" "$stage" PINNED "$tag"
    echo "== $slug -> $tag (pinned)"
    # Over ssh the output is a CI log: drop the admin code and any login codes, as a deploy does.
    # By hand they are shown - the first install prints them once.
    scrub() { if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then hide_codes; else cat; fi; }
    rc=0
    "$dir/stack/nginx/add-stack.sh" "$slug" "$port" "$stage" --images "$tag" "${extra[@]}" </dev/null 2>&1 | scrub || rc=$?
    [ "$rc" -eq 0 ] || bail "$slug did not come up at $tag${was:+ - to go back: promote $slug $was}"
    echo "$(date -u +%FT%TZ) promote $slug $tag done" >> "$log"
    echo "$slug is pinned at $tag${was:+ (was $was; to go back: promote $slug $was)}" ;;
  unpin)
    # Back onto its track, now: the last released sha (a main-track stack: the last staged one),
    # backup first, then the stack runs from the shared stack/ (or its track's own copy) again
    # and every later stage or release moves it. Pinning it again is a `promote`.
    slug="$tag"
    [[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || { echo "usage: unpin <slug>" >&2; exit 2; }
    read -r _ port stage track < <(known | awk -v s="$slug" '$1 == s') || true
    [ -n "${port:-}" ] || { echo "unpin: '$slug' is neither in ports.md nor in a stack.conf" >&2; exit 2; }
    [ -f "$NEXTUP_INSTANCES/$slug/.env" ] || { echo "unpin: $slug is not installed" >&2; exit 2; }
    take_lock
    was="$(pinned "$slug")"
    [ -n "$was" ] || { echo "$slug is not pinned - it already follows its track ($track)"; exit 0; }
    if [ "$track" = main ]; then to="$(last_in "$staged_list")"; else to="$(last_in "$released_list")"; fi
    [[ "$to" =~ ^[0-9a-f]{7}$ ]] || { echo "unpin: no sha on track $track yet - $slug stays pinned at $was" >&2; exit 1; }
    dir="$NEXTUP_INSTANCES/$slug"
    echo "$(date -u +%FT%TZ) unpin $slug -> $to (was pinned at $was) by ${by%% *}" >> "$log"
    bail() { echo "!! $1 - $slug stays pinned at $was"; echo "$(date -u +%FT%TZ) unpin $slug failed: $1" >> "$log"; exit 1; }
    pull_images "sha-$to" || bail "no images for $to"
    if [ "$track" = main ]; then
      backup_before "$slug" "$to" "$dir/stack" || bail "backup failed"
      own_copy "$slug" "$to" || bail "stack/ at $to not fetched"
      set_conf "$slug" "$port" "$stage" PINNED
      set_conf "$slug" "$port" "$stage" TRACK main
      runner="$dir/stack/nginx/add-stack.sh"
    else
      backup_before "$slug" "$to" "$stack_root" || bail "backup failed"
      set_conf "$slug" "$port" "$stage" PINNED
      # Its own copy of stack/ goes: from now on it runs from the shared ~/nextup/stack (ctl.sh).
      rm -rf "${dir:?}/stack"
      runner="$here/add-stack.sh"
    fi
    echo "== $slug -> $to (follows track $track again; was pinned at $was)"
    rc=0
    "$runner" "$slug" "$port" "$stage" --images "$to" </dev/null 2>&1 | hide_codes || rc=$?
    if [ "$rc" -ne 0 ]; then
      echo "!! $slug did not come up at $to - it is no longer pinned; to pin it back: promote $slug $was"
      echo "$(date -u +%FT%TZ) unpin $slug failed: did not come up at $to" >> "$log"; exit 1
    fi
    echo "$(date -u +%FT%TZ) unpin $slug done" >> "$log"
    echo "$slug follows track $track again, at $to (to pin it back: promote $slug $was)" ;;
  preview)
    # A fresh demo stack of PR <pr> at <sha> in a preview slot. Any sha CI published (images.yml
    # pushes a PR's images only when it carries the label `preview`); the slot is never a customer.
    pr="$tag"; tag="${args[2]:-}"
    [[ "$pr" =~ ^[1-9][0-9]{0,5}$ ]] && [[ "$tag" =~ ^[0-9a-f]{7}$ ]] \
      || { echo "usage: preview <pr number> <7-char commit sha>" >&2; exit 2; }
    take_lock
    read -r slot port evicted < <(pick_slot "$pr") || true
    [ -n "${slot:-}" ] || { echo "!! no preview slots (rows with stage preview in ports.md)"; exit 1; }
    echo "$(date -u +%FT%TZ) preview #$pr $tag in $slot${evicted:+ (was #$evicted)} by ${by%% *}" >> "$log"
    bail() { echo "!! $1"; echo "$(date -u +%FT%TZ) preview #$pr $tag failed: $1" >> "$log"; exit 1; }
    disk="$(free_disk_mb)"
    if [ "${disk:-0}" -lt "$preview_min_disk_mb" ]; then
      prune_images; disk="$(free_disk_mb)"
      [ "${disk:-0}" -ge "$preview_min_disk_mb" ] || bail "only ${disk} MB disk free, a preview needs $preview_min_disk_mb MB"
    fi
    pull_images "sha-$tag" || bail "no images for $tag (does the PR carry the label preview?)"
    preview_wipe "$slot"
    own_copy "$slot" "$tag" || bail "stack/ at $tag not fetched"
    set_conf "$slot" "$port" demo PREVIEW_PR "$pr"
    set_conf "$slot" "$port" demo PREVIEW_SHA "$tag"
    set_conf "$slot" "$port" demo PREVIEW_AT "$(date +%s)"
    echo "== $slot -> PR #$pr at $tag${evicted:+ (slot taken from PR #$evicted)}"
    rc=0
    "$NEXTUP_INSTANCES/$slot/stack/nginx/add-stack.sh" "$slot" "$port" demo --images "$tag" --app-replicas 1 \
      </dev/null 2>&1 | hide_codes || rc=$?
    # A half-started stack would restart forever: take it out again, slot free.
    [ "$rc" -eq 0 ] || { preview_wipe "$slot"; bail "the stack did not come up - slot $slot is free again"; }
    # The slot's nginx site and certificate: made by the root helper the first time, then kept.
    if ! sudo -n "$site_helper" check "$slot" </dev/null >/dev/null 2>&1; then
      sudo -n "$site_helper" add "$slot" "$port" </dev/null 2>&1 \
        || bail "the stack runs, but nginx does not serve $slot yet: install $site_helper (stack/provision/nextup-site.sh)"
    fi
    prune_images
    echo "$(date -u +%FT%TZ) preview #$pr $tag in $slot done" >> "$log"
    # Read by .github/workflows/preview.yml.
    echo "PREVIEW_URL=https://$slot.${NEXTUP_DOMAIN:-sellux.ch}"
    [ -z "${evicted:-}" ] || echo "PREVIEW_EVICTED=$evicted" ;;
  unpreview)
    pr="$tag"
    [[ "$pr" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "usage: unpreview <pr number>" >&2; exit 2; }
    take_lock
    read -r slot _ < <(slot_of "$pr") || true
    [ -n "${slot:-}" ] || { echo "PR #$pr has no preview - nothing to do"; exit 0; }
    echo "$(date -u +%FT%TZ) unpreview #$pr from $slot by ${by%% *}" >> "$log"
    preview_wipe "$slot"
    prune_images
    echo "PR #$pr's preview is gone; $slot is free" ;;
  *) usage ;;
esac
