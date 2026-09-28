#!/usr/bin/env bash
# Connect one company stack to admin.sellux.ch (bug reports out, replies back in).
# Issue the stack's token first in admin.sellux.ch -> Stacks, then on the box:
#
#   ~/nextup/stack/nginx/set-ops.sh acme                 # asks for the token (not echoed)
#   ~/nextup/stack/nginx/set-ops.sh acme --off           # disconnect: tickets stay in the stack
#
# The token is read from the terminal, never from the command line (ps, shell history).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
slug="${1:?usage: set-ops.sh SLUG [--off]}"
env_file="$NEXTUP_INSTANCES/$slug/.env"
url="${OPS_URL:-https://admin.sellux.ch}"
[ -f "$env_file" ] || { echo "No stack '$slug' ($env_file missing)." >&2; exit 1; }

set_key() {  # replace KEY=... or append it; the file keeps its owner and mode
  if grep -q "^$1=" "$env_file"; then sed -i "s|^$1=.*|$1=$2|" "$env_file"
  else printf '%s=%s\n' "$1" "$2" >> "$env_file"; fi
}

if [ "${2:-}" = --off ]; then
  set_key OPS_URL ""; set_key OPS_TOKEN ""
  echo "Disconnected '$slug' from admin."
else
  read -r -s -p "OPS_TOKEN for '$slug' (from $url -> Stacks): " token; echo
  [[ "$token" =~ ^nxs_[A-Za-z0-9_-]{43}$ ]] || { echo "That doesn't look like a token - nothing changed." >&2; exit 1; }
  set_key OPS_URL "$url"; set_key OPS_TOKEN "$token"; unset token
  echo "Connected '$slug' to $url."
fi
# Only the app reads these; recreate it so it picks them up.
"$here/../ctl.sh" "$slug" up -d app
