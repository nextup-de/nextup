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
#
# A deploy first replaces ~/nextup/stack with the stack/ folder of the same commit from GitHub
# (the previous one stays as stack.prev), then moves every stack - the rows of ports.md with
# stage demo|real and an installed instance - to that commit's images.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
log="${NEXTUP_DEPLOY_LOG:-$HOME/nextup/deploy.log}"

# Forced command: the client's words arrive in SSH_ORIGINAL_COMMAND, never as a shell.
read -r -a args <<< "${SSH_ORIGINAL_COMMAND:-$*}"
action="${args[0]:-}" tag="${args[1]:-}"

repo="${NEXTUP_REPO:-selluxhenner/nextup}"
stack_root="$(dirname "$here")"

# stack/ at exactly the commit being deployed, so scripts and images always match. Swapped in
# with mv: this script keeps running from the old copy's already-open file.
sync_stack() {
  local ref="$1" tmp new
  tmp="$(mktemp -d)"; new="$stack_root.new"
  curl -fsSL --max-time 60 "https://codeload.github.com/$repo/tar.gz/$ref"     | tar xz -C "$tmp" --wildcards '*/stack/' || { rm -rf "$tmp"; echo "!! could not fetch stack/ at $ref"; return 1; }
  rm -rf "$new"; mv "$tmp"/*/stack "$new"; rm -rf "$tmp"
  [ -x "$new/nginx/add-stack.sh" ] && [ -f "$new/compose.yml" ] || { rm -rf "$new"; echo "!! stack/ at $ref looks wrong"; return 1; }
  # Never let a download carry secrets or instances in.
  rm -rf "$new/instances"
  rm -rf "$stack_root.prev"; mv "$stack_root" "$stack_root.prev"; mv "$new" "$stack_root"
  echo "stack/ now at $ref (previous in $stack_root.prev)"
}

stacks() {  # slug port stage, for every installed, running stack: ports.md rows + stack.conf files
  {
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
  } | while read -r s p st; do
    # Reserved rows (not installed) are skipped without failing the loop; so is a stack stopped on
    # purpose from admin (stack.conf STOPPED=true) - a deploy must not start it again.
    [ -f "$NEXTUP_INSTANCES/$s/.env" ] || continue
    grep -qx 'STOPPED=true' "$NEXTUP_INSTANCES/$s/stack.conf" 2>/dev/null && continue
    echo "$s $p $st"
  done
}

case "$action" in
  status)
    stacks | while read -r s _ _; do
      printf '%-10s %s\n' "$s" "$(grep '^NEXTUP_APP_IMAGE=' "$NEXTUP_INSTANCES/$s/.env" | cut -d= -f2)"
      "$here/../ctl.sh" "$s" ps --format '  {{.Service}} {{.Status}}'
    done ;;
  deploy)
    [[ "$tag" =~ ^(main|[0-9a-f]{7})$ ]] || { echo "deploy: tag must be main or a 7-char commit sha" >&2; exit 2; }
    by="${SSH_CONNECTION:-local}"
    echo "$(date -u +%FT%TZ) deploy $tag by ${by%% *}" >> "$log"
    # The images first: a commit CI hasn't published (yet) changes nothing at all.
    img_tag="$tag"; [ "$tag" = main ] || img_tag="sha-$tag"
    for i in nextup-app nextup-migrate; do
      docker pull -q "${NEXTUP_REGISTRY:-ghcr.io/selluxhenner}/$i:$img_tag" >/dev/null \
        || { echo "!! no image $i:$img_tag - nothing changed"; echo "$(date -u +%FT%TZ) deploy $tag failed: no images" >> "$log"; exit 1; }
    done
    sync_stack "$tag" || { echo "$(date -u +%FT%TZ) deploy $tag failed: stack/ not updated" >> "$log"; exit 1; }
    # From here on the new copy's scripts run (same paths, new files).
    failed=0
    while read -r s p st; do
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
    echo "$(date -u +%FT%TZ) deploy $tag done (failed=$failed)" >> "$log"
    exit "$failed" ;;
  *) echo "usage: deploy <main|sha> | status" >&2; exit 2 ;;
esac
