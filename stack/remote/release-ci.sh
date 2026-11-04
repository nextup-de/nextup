#!/usr/bin/env bash
# Release a tag to a customer host from CI: the body of .github/workflows/release-customer.yml.
# It validates its settings, writes the key and the pinned host key to private temp files, runs
# stack/deploy-remote.sh (release, then status), and polls the health URL.
#
# Settings, all from the environment (the workflow takes them from the GitHub environment
# `customer-<slug>`; nothing is read from the repo):
#   DEPLOY_TARGET       user@host[:port]                              environment variable
#   DEPLOY_SSH_KEY      the private half of the forced-command key    environment secret
#   DEPLOY_KNOWN_HOSTS  the host's key line(s), from ssh-keyscan      environment secret
#   HEALTH_URL          http(s) URL that answers 200 when the stack is up   environment variable
#   TAG                 7-char lowercase commit sha whose images images.yml published
# Optional:
#   CUSTOMER            the slug, checked against ^[a-z][a-z0-9-]{1,39}$ when set
#   HEALTH_TRIES        default 10        HEALTH_INTERVAL   seconds between tries, default 15
#   RUNNER_TEMP         where the key files live, default $TMPDIR or /tmp; removed on exit
#
# Exit 2: a setting is missing or malformed (every one is named, no value is printed).
# Exit 1 (or the host's code): the release, the status or the health check failed; the last 50
#         lines of what the host said (its output of release and status) are printed.
# The key and the known_hosts text are never echoed.
set -uo pipefail
umask 077
export LC_ALL=C   # [a-z] must not match capitals

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_remote="$here/../deploy-remote.sh"

bad=()
need() { # <name> <regex> <what it must be>
  local name="$1" value="${!1:-}"
  if [ -z "$value" ]; then bad+=("$name is not set ($3)")
  elif ! [[ "$value" =~ $2 ]]; then bad+=("$name is not valid ($3)"); fi
}
need DEPLOY_TARGET '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:[0-9]{1,5})?$' 'user@host[:port]'
need TAG '^[0-9a-f]{7}$' '7 lowercase hex chars'
need HEALTH_URL '^https?://[^[:space:]]+$' 'an http(s) URL'
need DEPLOY_SSH_KEY '^-----BEGIN ' 'a private key'
need DEPLOY_KNOWN_HOSTS '[^[:space:]]' "the host's known_hosts line(s)"
[ -z "${CUSTOMER:-}" ] || need CUSTOMER '^[a-z][a-z0-9-]{1,39}$' 'a-z, 0-9, -; 2-40 chars'
tries="${HEALTH_TRIES:-10}" interval="${HEALTH_INTERVAL:-15}"
[[ "$tries" =~ ^[0-9]{1,3}$ && "$tries" -ge 1 ]] || bad+=("HEALTH_TRIES is not valid (a positive number)")
[[ "$interval" =~ ^[0-9]{1,4}$ ]] || bad+=("HEALTH_INTERVAL is not valid (seconds)")
if [ "${#bad[@]}" -gt 0 ]; then
  for m in "${bad[@]}"; do echo "release-ci: $m" >&2; done
  exit 2
fi

work="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/release-ci.XXXXXX")" || exit 1
key="$work/deploy_key" known="$work/known_hosts" log="$work/host.log"
cleanup() { rm -f "$key" "$known" "$log"; rmdir "$work" 2>/dev/null || true; }
trap cleanup EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key" && chmod 600 "$key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known" && chmod 600 "$known"
: > "$log"

export DEPLOY_SSH_KEY_FILE="$key" DEPLOY_KNOWN_HOSTS_FILE="$known"

# One step: its output goes to the job log and to $log.
run() { "$@" 2>&1 | tee -a "$log"; return "${PIPESTATUS[0]}"; }

fail() { # <rc> <what>
  echo "release-ci: $2" >&2
  echo "--- the last 50 lines from the host ---" >&2
  tail -n 50 "$log" >&2
  exit "$1"
}

echo "release-ci: releasing ${CUSTOMER:+$CUSTOMER }$TAG"
run "$deploy_remote" "$DEPLOY_TARGET" "$TAG"; rc=$?
run "$deploy_remote" "$DEPLOY_TARGET" status; src=$?
[ "$rc" -eq 0 ] || fail "$rc" "release $TAG failed (exit $rc)"
[ "$src" -eq 0 ] || fail "$src" "status failed (exit $src)"

for ((i = 1; i <= tries; i++)); do
  if curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL" 2>>"$log"; then
    echo "release-ci: healthy (try $i of $tries)"
    exit 0
  fi
  [ "$i" -eq "$tries" ] || sleep "$interval"
done
fail 1 "the health check did not answer 200 after $tries tries"
