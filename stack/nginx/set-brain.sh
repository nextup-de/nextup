#!/usr/bin/env bash
# Point one company stack at the AI server (stack/brain-server/) instead of a brain of its own.
# On the stack's server:
#
#   ~/nextup/stack/nginx/set-brain.sh acme http://10.77.0.3:8000   # asks for the key (not echoed)
#   ~/nextup/stack/nginx/set-brain.sh acme --off                   # no brain: keyword router, offline coach
#
# The key is read from the terminal or a pipe, never from the command line (ps, shell history).
# Nothing changes unless the AI server answers and accepts the key.
# A stack that ran its own brain (install.sh --brain) loses the `brain` profile and its two
# containers. Its downloaded model stays in the volume nextup-<slug>_ollamadata until you remove it.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
slug="${1:?usage: set-brain.sh SLUG URL | --off}"
target="${2:?usage: set-brain.sh SLUG URL | --off}"
env_file="$NEXTUP_INSTANCES/$slug/.env"
[ -f "$env_file" ] || { echo "No stack '$slug' ($env_file missing)." >&2; exit 1; }

set_key() {  # replace KEY=... or append it; the file keeps its owner and mode
  if grep -q "^$1=" "$env_file"; then sed -i "s|^$1=.*|$1=$2|" "$env_file"
  else printf '%s=%s\n' "$1" "$2" >> "$env_file"; fi
}

key=""
if [ "$target" != --off ]; then
  url="${target%/}"
  [[ "$url" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || { echo "The URL must look like http://10.77.0.3:8000 - nothing changed." >&2; exit 1; }
  if [ -t 0 ]; then read -r -s -p "Key of the AI server (there: brain-server.sh key): " key; echo; else read -r key || true; fi
  key="${key%$'\r'}"
  [[ "$key" =~ ^[A-Za-z0-9_-]{32,100}$ ]] || { echo "That doesn't look like a key - nothing changed." >&2; exit 1; }
  curl -fsS -m 10 -o /dev/null "$url/health" || { echo "No answer from $url/health - nothing changed." >&2; exit 1; }
  # An empty request: 422 means the key was accepted (the body is what it complains about), 401 not.
  code="$(printf 'header = "X-API-Key: %s"\n' "$key" | curl -s -m 10 -o /dev/null -w '%{http_code}' -K - \
    -X POST -H 'Content-Type: application/json' -d '{}' "$url/v1/route" || true)"
  [ "$code" = 422 ] || { echo "The AI server did not accept the key (HTTP $code) - nothing changed." >&2; exit 1; }
fi

# The stack's own brain and model, if it had them: removed while the profile still names them.
profiles="$(grep '^COMPOSE_PROFILES=' "$env_file" | cut -d= -f2- || true)"
case ",$profiles," in
  *,brain,*)
    "$here/../ctl.sh" "$slug" rm -sf brain ollama
    set_key COMPOSE_PROFILES "$(printf '%s' "$profiles" | tr ',' '\n' | grep -vx brain | paste -sd, - || true)" ;;
esac

if [ "$target" = --off ]; then
  set_key BRAIN_URL ""; set_key BRAIN_API_KEY ""
  echo "'$slug' has no brain now."
else
  set_key BRAIN_URL "$url"; set_key BRAIN_API_KEY "$key"; unset key
  echo "'$slug' now asks the brain at $url."
fi
# Only the app reads these; recreate it so it picks them up.
"$here/../ctl.sh" "$slug" up -d app
