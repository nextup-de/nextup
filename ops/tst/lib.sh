#!/usr/bin/env bash
# Shared helpers of ops/tst/vm-run.sh. Source it; it sets no shell options.
# Nothing here prints a secret: values go into files of mode 600 (one flat private temp dir) or into
# the environment of one child process, never into an argument list or a log.

TST_STEP_N=0 TST_STEP_TOTAL=0
TST_TMP=""
TST_BG_PIDS=()
TST_CLEANUPS=()

# One status line per step: "[n/N] <name> ... <state> (<detail>)".
tst_status() { # <name> <state> [detail]
  printf '[%s/%s] %s ... %s%s\n' "$TST_STEP_N" "$TST_STEP_TOTAL" "$1" "$2" "${3:+ ($3)}"
}

# A private temp dir (mode 700). It stays flat: files only, so the exit handler can remove them one by one.
tst_tmp_init() {
  TST_TMP="$(mktemp -d)" || return 1
  chmod 700 "$TST_TMP"
}

tst_secret_file() { # <name>: creates an empty file of mode 600 and prints its path
  local f="$TST_TMP/$1"
  ( umask 077; : > "$f" ) && chmod 600 "$f" && printf '%s\n' "$f"
}

tst_on_exit() { TST_CLEANUPS+=("$*"); }

tst_exit_handler() {
  local pid c f
  for pid in ${TST_BG_PIDS[@]+"${TST_BG_PIDS[@]}"}; do kill "$pid" 2>/dev/null; done
  for c in ${TST_CLEANUPS[@]+"${TST_CLEANUPS[@]}"}; do eval "$c" >/dev/null 2>&1; done
  if [ -n "$TST_TMP" ] && [ -d "$TST_TMP" ]; then
    for f in "$TST_TMP"/* "$TST_TMP"/.[!.]*; do [ -e "$f" ] && rm -f "$f"; done
    rmdir "$TST_TMP" 2>/dev/null
  fi
  return 0
}

# <user@host[:port]> and a 7-char lowercase sha: the shapes deploy-remote.sh accepts.
tst_valid_target() { [[ "$1" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; }
tst_valid_sha() { [[ "$1" =~ ^[0-9a-f]{7}$ ]]; }

# The admin login: a normal ssh session as the deploy user (its forced-command key is only for
# deploy-remote.sh). TST_SSH_KEY_FILE picks a key; the host key must already be in known_hosts.
TST_DEST="" TST_SSH_PORT=() TST_OPTS=()
tst_set_target() { # <user@host[:port]>
  TST_DEST="$1" TST_SSH_PORT=()
  if [[ "$1" == *:* ]]; then TST_DEST="${1%:*}"; TST_SSH_PORT=(-p "${1##*:}"); fi
}
tst_ssh_opts() {
  TST_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15)
  [ -z "${TST_SSH_KEY_FILE:-}" ] || TST_OPTS+=(-i "$TST_SSH_KEY_FILE" -o IdentitiesOnly=yes)
  [ -z "${DEPLOY_KNOWN_HOSTS_FILE:-}" ] || TST_OPTS+=(-o UserKnownHostsFile="$DEPLOY_KNOWN_HOSTS_FILE")
  TST_OPTS+=(${TST_SSH_PORT[@]+"${TST_SSH_PORT[@]}"})
}
tst_remote() { # <command string run by the remote shell>
  tst_ssh_opts
  ssh "${TST_OPTS[@]}" "$TST_DEST" "$1"
}

# The seconds of "restore-test ...: seconds=<n>".
tst_seconds_of() { sed -n 's/.*seconds=\([0-9][0-9]*\).*/\1/p' | tail -n 1; }

# RTO_SECONDS of docs/ops/RPO_RTO.md (3600 when the line is missing).
tst_rto() { # <doc>
  local v
  v="$(tr -d '\r' < "$1" 2>/dev/null | sed -n 's/^RTO_SECONDS=\([0-9][0-9]*\)$/\1/p')"
  printf '%s\n' "${v:-3600}"
}

# A percentile (ms) of one k6 page tag out of a --summary-export json; "-" when it is not there.
tst_k6_metric() { # <summary.json> <page> <p(95)|p(99)>
  jq -r --arg m "http_req_duration{page:$2}" --arg k "$3" \
    '((.metrics[$m][$k] // .metrics[$m].values[$k]) // "-") | if type=="number" then ((.*10|round)/10) else . end' "$1" 2>/dev/null || echo "-"
}

# Wait until something listens on 127.0.0.1:<port>.
tst_wait_port() { # <port> <seconds>
  local i
  for i in $(seq 1 "$2"); do
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
