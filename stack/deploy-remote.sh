#!/usr/bin/env bash
# Release a commit to a customer host over ssh: the client of stack/remote/host.sh.
#
#   stack/deploy-remote.sh <user@host[:port]> <sha>      move the host's stack to that commit
#   stack/deploy-remote.sh <user@host[:port]> status     slug, image, services, last released sha
#   stack/deploy-remote.sh -h | --help
#
# <sha> is the 7-char lowercase commit sha whose images CI published (images.yml). Both arguments
# are checked before anything connects (exit 2 on bad input). The exit code is the host's.
# Going back is `release <older sha>` (stack/remote/README.md).
#
# Environment (all optional):
#   DEPLOY_SSH_KEY_FILE      the private deploy key           default ~/.ssh/nextup-deploy
#   DEPLOY_KNOWN_HOSTS_FILE  the host's key must be in here   default ~/.ssh/known_hosts
# No key and no host is read from this repo; the host key is never accepted on first use.
#
# On the host, ~deploy/.ssh/authorized_keys holds one line for that key (the forced command only
# accepts `release <sha>` and `status`, so the key gets no shell):
#   command="~/nextup/stack/remote/host.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy
set -euo pipefail

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed -E 's/^# ?//' >&2; }

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
[ "$#" -eq 2 ] || { usage; exit 2; }
target="$1" what="$2"

[[ "$target" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] \
  || { echo "deploy-remote: '$target' is not user@host[:port]" >&2; exit 2; }
[[ "$what" =~ ^([0-9a-f]{7}|status)$ ]] \
  || { echo "deploy-remote: '$what' is neither status nor a 7-char lowercase commit sha" >&2; exit 2; }

port_args=()
dest="$target"
if [[ "$target" == *:* ]]; then
  dest="${target%:*}"
  port_args=(-p "${target##*:}")
fi

if [ "$what" = status ]; then remote=(status); else remote=(release "$what"); fi

exec ssh -i "${DEPLOY_SSH_KEY_FILE:-$HOME/.ssh/nextup-deploy}" \
  -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="${DEPLOY_KNOWN_HOSTS_FILE:-$HOME/.ssh/known_hosts}" \
  -o BatchMode=yes -o ConnectTimeout=15 \
  "${port_args[@]}" "$dest" "${remote[@]}"
