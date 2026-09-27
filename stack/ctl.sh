#!/usr/bin/env bash
# docker compose for one installed stack, with its own .env - so nobody has to remember the flags.
#
#   stack/ctl.sh acme ps
#   stack/ctl.sh acme logs -f app
#   stack/ctl.sh acme down            # stops it; data stays in the volumes
#   stack/ctl.sh acme down -v         # stops it AND deletes its database - asks first
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
slug="${1:?usage: stack/ctl.sh SLUG <docker compose args>}"; shift
env_file="${NEXTUP_INSTANCES:-$here/instances}/$slug/.env"
[ -f "$env_file" ] || { echo "No stack '$slug' installed ($env_file missing)." >&2; exit 1; }

if [ "${1:-}" = down ] && printf '%s\n' "$@" | grep -qx -- '-v\|--volumes'; then
  read -r -p "This deletes the database of '$slug'. Type the slug to confirm: " answer
  [ "$answer" = "$slug" ] || { echo "Not confirmed - nothing deleted."; exit 1; }
fi
exec docker compose -f "$here/compose.yml" --env-file "$env_file" "$@"
