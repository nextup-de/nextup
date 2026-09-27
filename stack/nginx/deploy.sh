#!/usr/bin/env bash
# The only thing CI may run on the shared box: move every installed stack to one image tag.
# Meant as a forced command, so the deploy key can't get a shell on a box with other sites:
#
#   ~/.ssh/authorized_keys (one line):
#   command="~/nextup/stack/nginx/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy
#
# CI then runs:   ssh hetzner deploy <tag>     (tag: main or a short commit sha)
#                 ssh hetzner status
# By hand:        ~/nextup/stack/nginx/deploy.sh deploy main
#
# Stacks are the rows of ports.md with stage demo|real and an installed instance. It updates
# images only; new stack/ files still arrive with git archive (RUNBOOK.md).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
log="${NEXTUP_DEPLOY_LOG:-$HOME/nextup/deploy.log}"

# Forced command: the client's words arrive in SSH_ORIGINAL_COMMAND, never as a shell.
read -r -a args <<< "${SSH_ORIGINAL_COMMAND:-$*}"
action="${args[0]:-}" tag="${args[1]:-}"

stacks() {  # slug port stage, for every installed stack in the registry
  awk -F'|' 'NF>5 { for (i=2;i<=4;i++) gsub(/ /,"",$i); if ($4=="demo"||$4=="real") print $2, $3, $4 }' \
    "$here/ports.md" | while read -r s p st; do [ -f "$NEXTUP_INSTANCES/$s/.env" ] && echo "$s $p $st"; done
}

case "$action" in
  status)
    stacks | while read -r s _ _; do
      printf '%-10s %s\n' "$s" "$(grep '^NEXTUP_APP_IMAGE=' "$NEXTUP_INSTANCES/$s/.env" | cut -d= -f2)"
      "$here/../ctl.sh" "$s" ps --format '  {{.Service}} {{.Status}}'
    done ;;
  deploy)
    [[ "$tag" =~ ^(main|[0-9a-f]{7,40})$ ]] || { echo "deploy: tag must be main or a short sha" >&2; exit 2; }
    echo "$(date -u +%FT%TZ) deploy $tag by ${SSH_CONNECTION%% *}" >> "$log"
    failed=0
    while read -r s p st; do
      echo "== $s -> $tag"
      # CI logs are no place for secrets: drop the admin code and any login codes.
      rc=0
      "$here/add-stack.sh" "$s" "$p" "$st" --images "$tag" </dev/null 2>&1 \
        | { grep -vE 'code:|[a-z0-9]+-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\s*$' || true; } || rc=$?
      [ "$rc" -eq 0 ] || { echo "!! $s failed"; failed=1; }
    done < <(stacks)
    echo "$(date -u +%FT%TZ) deploy $tag done (failed=$failed)" >> "$log"
    exit "$failed" ;;
  *) echo "usage: deploy <main|sha> | status" >&2; exit 2 ;;
esac
