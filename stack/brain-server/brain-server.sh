#!/usr/bin/env bash
# The AI server: the brain and its model on a machine of their own (README.md next to this file).
# Run it on that machine, from a checkout of this repo.
#
#   stack/brain-server/brain-server.sh install [--bind IP] [--model NAME]
#   stack/brain-server/brain-server.sh test      # one routing and one coach answer, with the seconds
#   stack/brain-server/brain-server.sh update    # after a brain PR: pull main, rebuild, restart the brain
#   stack/brain-server/brain-server.sh url       # what a stack gets as BRAIN_URL
#   stack/brain-server/brain-server.sh key       # prints the key, for stack/nginx/set-brain.sh
#   stack/brain-server/brain-server.sh ps | logs -f ollama | down ...   (anything else goes to docker compose)
#
# Everything it writes lives in $NEXTUP_BRAIN (default ~/nextup/brain), mode 600:
#   .env   BRAIN_API_KEY, the address and port the brain listens on, the model
#
# --bind is the address stacks reach the brain on. Default: this machine's private-network address
# (10.x). Only a private address or 127.0.0.1 is accepted - the brain is never put on a public one.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
dir="${NEXTUP_BRAIN:-$HOME/nextup/brain}"
env_file="$dir/.env"
compose=(docker compose -f "$here/compose.yml" --env-file "$env_file")
action="${1:-}"; shift || true

die() { echo "brain-server: $*" >&2; exit 1; }
get() { grep -E "^$1=" "$env_file" 2>/dev/null | cut -d= -f2- || true; }
# Append KEY=VALUE only if the key is missing: an existing key is never overwritten.
add() { [ -n "$(get "$1")" ] || (umask 077; printf '%s=%s\n' "$1" "$2" >> "$env_file"); }
put() { if grep -q "^$1=" "$env_file"; then sed -i "s|^$1=.*|$1=$2|" "$env_file"; else add "$1" "$2"; fi; }
installed() { [ -n "$(get BRAIN_BIND)" ] || die "not installed yet - run: $0 install"; }
base() { echo "http://$(get BRAIN_BIND):$(get BRAIN_PORT)"; }

private_ip() { ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | grep -m1 '^10\.' || true; }

need_docker() {
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then return; fi
  [ "$(id -u)" = 0 ] && command -v apt-get >/dev/null \
    || die "docker with the compose plugin is missing - install it, then run this again"
  echo "Installing Docker ..."
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2 >/dev/null
}

build() { echo "Building the brain from $repo/services/brain ..."; docker build -q -t nextup-brain:local "$repo/services/brain" >/dev/null; }

# ok = the model server answers and has the model. The first start downloads the model (~7 GB).
wait_ready() {
  local state="" i
  echo -n "Waiting for the brain and its model "
  for i in $(seq 1 360); do
    state="$(curl -fsS -m 5 "$(base)/health" 2>/dev/null || true)"
    case "$state" in *'"status":"ok"'*) echo " ready"; return 0 ;; esac
    echo -n "."; sleep 5
  done
  echo; "${compose[@]}" logs --tail 20 ollama brain >&2
  die "not ready after 30 minutes (last answer: ${state:-none})"
}

case "$action" in
  install)
    bind="" model=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --bind) bind="$2"; shift 2 ;;
        --model) model="$2"; shift 2 ;;
        *) die "unknown option: $1" ;;
      esac
    done
    command -v openssl >/dev/null || die "openssl is not installed"
    command -v curl >/dev/null || die "curl is not installed"
    bind="${bind:-$(get BRAIN_BIND)}"; bind="${bind:-$(private_ip)}"
    [ -n "$bind" ] || die "no private-network address (10.x) on this machine: attach it to the network first, or pass --bind 127.0.0.1 to try it on this machine only"
    [[ "$bind" =~ ^(127\.0\.0\.1|10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+)$ ]] \
      || die "--bind must be a private address or 127.0.0.1 (got '$bind')"
    [ -z "$model" ] || [[ "$model" =~ ^[a-zA-Z0-9._:/-]+$ ]] || die "--model: letters, digits and . _ : / - only"
    need_docker
    mkdir -p "$dir"; [ -f "$env_file" ] || (umask 077; : > "$env_file")
    add BRAIN_API_KEY "$(openssl rand -hex 24)"
    add BRAIN_PORT 8000
    put BRAIN_BIND "$bind"
    if [ -n "$model" ]; then put BRAIN_MODEL "$model"; else add BRAIN_MODEL mistral-nemo; fi
    build
    "${compose[@]}" up -d --remove-orphans
    wait_ready
    echo
    echo "The brain is up:  $(base)   model: $(get BRAIN_MODEL)"
    echo "  Try it:           $0 test"
    echo "  Connect a stack:  on its server, stack/nginx/set-brain.sh SLUG $(base)   (key: $0 key)"
    ;;

  update)
    installed
    [ ! -d "$repo/.git" ] || git -C "$repo" pull -q --ff-only
    build
    "${compose[@]}" up -d --remove-orphans
    wait_ready
    ;;

  url) installed; base ;;
  key) installed; get BRAIN_API_KEY ;;

  test)
    installed
    command -v python3 >/dev/null || die "test needs python3"
    # The same Acme snapshot and brief shape as the evals (services/brain/eval). The key goes in
    # through the environment, never the command line.
    BRAIN_TEST_URL="$(base)" BRAIN_TEST_KEY="$(get BRAIN_API_KEY)" BRAIN_TEST_EVAL="$repo/services/brain/eval/acme.json" python3 - <<'PY'
import json, os, time, urllib.error, urllib.request

ctx = json.load(open(os.environ["BRAIN_TEST_EVAL"], encoding="utf-8"))
url, key = os.environ["BRAIN_TEST_URL"], os.environ["BRAIN_TEST_KEY"]

def ask(path, body):
    req = urllib.request.Request(url + path, json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "X-API-Key": key})
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.load(r), time.time() - start
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{path}: HTTP {e.code} {e.read().decode()[:200]}")

idea = {"title": "Two new colleagues still cannot log into the MES after a month", "body": ""}
out, s = ask("/v1/route", {"company": ctx["company"], "idea": idea, "routes": ctx["routes"], "known": ctx["known"]})
row = next((r["type"] for r in ctx["routes"] if r["id"] == out["route_id"]), "no row")
print(f"routing  {s:5.1f} s   {out['route_id']} ({row})   same as: {out['same_as']}   model: {out['model']}")
print(f"  reason: {out['reason']}")

brief = ("The idea scores 38/100; it can be published at 70. The scores are computed, not yours to change - never state a different number.\n"
         "- Feasibility: 20/100 (missing: Who would decide)\n"
         'Ask exactly one short, challenging question that would raise "Feasibility". Do not answer it yourself.')
idea = {"title": "New colleagues wait weeks for their logins", "body": ""}
out, s = ask("/v1/coach", {"company": ctx["company"], "idea": idea, "history": [{"role": "user", "text": idea["title"]}],
                           "brief": brief, "known": ctx["known"]})
print(f"coach    {s:5.1f} s   point: {out['open_point']}   earlier: {out['earlier_id']}")
for label, field in (("note", "note"), ("asks", "question"), ("why", "why"), ("suggests", "recommended")):
    print(f"  {label}: {out[field]}")
PY
    ;;

  "") die "usage: $0 install | test | update | url | key | <docker compose args>" ;;
  *) installed; exec "${compose[@]}" "$action" "$@" ;;
esac
