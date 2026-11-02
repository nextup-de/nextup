#!/usr/bin/env bash
# Proof for OPS-C1: health.sh sends every alert and recovery to every ntfy topic and mail address,
# keeps going when one fails, pings HEARTBEAT_URL after every run, and still works with only the
# old NTFY_URL. A stub curl in the host records every call; nothing leaves the host.
#   bash stack/tests/health-alerts.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS alerts reach every recipient"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }

stub="$(mktemp)"
cat > "$stub" <<'EOS'
#!/usr/bin/env bash
# Stub curl: one line per call in $CALLS: the arguments, then the -d / --upload-file body.
body="" prev="" wfmt=false
for a in "$@"; do
  case "$prev" in
    -d) body="$a" ;;
    --upload-file) body="$(cat "$a")" ;;
  esac
  [ "$a" = -w ] && wfmt=true
  prev="$a"
done
echo "ARGS: $* BODY: $(printf '%s' "$body" | tr '\n' '~')" >> "$CALLS"
if $wfmt; then
  if [ -f "$HOME/stub/up" ]; then printf 200; else printf 500; fi
  exit 0
fi
case "$*" in *"n1.opsalert.test/"*) exit 22 ;; esac
exit 0
EOS
host_exec 'mkdir -p ~/stub && cat > ~/stub/curl && chmod +x ~/stub/curl' < "$stub" || exit 1
rm -f "$stub"

host_exec 'mkdir -p ~/opsalert/instances/opsalert
printf "APP_ORIGIN=http://opsalert.test\nRESTIC_PASSWORD=secret-must-not-leak\n" > ~/opsalert/instances/opsalert/.env
cat > ~/opsalert/health.env.full <<EOF
NTFY_URL=https://n0.opsalert.test/topic-zero-secret
NTFY_URLS=https://n1.opsalert.test/topic-one-secret https://n2.opsalert.test/topic-two-secret https://n0.opsalert.test/topic-zero-secret
ALERT_EMAILS=a@opsalert.test b@opsalert.test
ALERT_SMTP_URL=smtp://mail.opsalert.test:25
ALERT_MAIL_FROM=alerts@opsalert.test
HEARTBEAT_URL=https://hc.opsalert.test/ping/x
EOF
printf "NTFY_URL=https://n0.opsalert.test/topic-zero-secret\n" > ~/opsalert/health.env.legacy
cp ~/opsalert/health.env.full ~/opsalert/health.env' || exit 1

# run [args]: one run of health.sh with the stub first on PATH; the calls of that run land in
# ~/opsalert/calls and are appended to ~/opsalert/all.
run() {
  host_exec ": > ~/opsalert/calls; PATH=\$HOME/stub:\$PATH CALLS=\$HOME/opsalert/calls NEXTUP_HOME=\$HOME/opsalert NEXTUP_INSTANCES=\$HOME/opsalert/instances stack/health.sh $*; rc=\$?; cat ~/opsalert/calls >> ~/opsalert/all; exit \$rc"
}
# count <pattern...>: lines of the last run's calls that match every pattern
count() {
  local cmd="cat ~/opsalert/calls" p
  for p in "$@"; do cmd+=" | grep -F -- '$p'"; done
  host_exec "$cmd | wc -l" | tr -d '[:space:]'
}
title="NextUp problem: web opsalert.test"

host_exec ': > ~/opsalert/all'

# --- first run: the check has failed once, nothing alerts yet ------------------------------------
run >/dev/null
t_eq "run 1: no alert for the web check" 0 "$(count "Title: $title")"
t_eq "run 1: no mail for the web check" 0 "$(count "Subject: $title")"
t_eq "run 1: heartbeat called once" 1 "$(count 'https://hc.opsalert.test/ping/x')"

# --- second run: it alerts, topic 1 fails ---------------------------------------------------------
run >/dev/null
t_eq "run 2: topic 0 (legacy NTFY_URL, listed twice) got one push" 1 "$(count 'n0.opsalert.test/topic-zero-secret' "Title: $title")"
t_eq "run 2: topic 1 (failing) was tried once" 1 "$(count 'n1.opsalert.test/topic-one-secret' "Title: $title")"
t_eq "run 2: topic 2 got one push" 1 "$(count 'n2.opsalert.test/topic-two-secret' "Title: $title")"
t_eq "run 2: a@ got one mail" 1 "$(count '--mail-rcpt a@opsalert.test' "Subject: $title")"
t_eq "run 2: b@ got one mail" 1 "$(count '--mail-rcpt b@opsalert.test' "Subject: $title")"
t_eq "run 2: mail uses the smtp url and sender" 2 "$(count '--url smtp://mail.opsalert.test:25' '--mail-from alerts@opsalert.test' "Subject: $title")"
t_eq "run 2: mail has From, To and a message body" 1 "$(count '--mail-rcpt a@opsalert.test' 'BODY: From: alerts@opsalert.test~To: a@opsalert.test~Subject: '"$title"'~Date: ')"
t_eq "run 2: heartbeat called once" 1 "$(count 'https://hc.opsalert.test/ping/x')"
log="$(host_exec "cat ~/opsalert/health.log")"
t_ok "health.log: could not reach topic 1's host" grep -q 'could not reach n1.opsalert.test' <<< "$log"
t_ok "health.log: never the topic path" bash -c '! grep -q "topic-one-secret" <<< "$1"' _ "$log"
t_ok "health.log: the others were reached" bash -c '! grep -qE "could not reach (n0|n2|a@|b@)" <<< "$1"' _ "$log"

# --- third run: the host answers 200, one recovery to everyone ------------------------------------
host_exec 'touch ~/stub/up'
run >/dev/null
rec="Recovered: web opsalert.test"
t_eq "run 3: topic 0 got one recovery" 1 "$(count 'n0.opsalert.test/topic-zero-secret' "Title: $rec")"
t_eq "run 3: topic 1 was tried once" 1 "$(count 'n1.opsalert.test/topic-one-secret' "Title: $rec")"
t_eq "run 3: topic 2 got one recovery" 1 "$(count 'n2.opsalert.test/topic-two-secret' "Title: $rec")"
t_eq "run 3: a@ got one recovery mail" 1 "$(count '--mail-rcpt a@opsalert.test' "Subject: $rec")"
t_eq "run 3: b@ got one recovery mail" 1 "$(count '--mail-rcpt b@opsalert.test' "Subject: $rec")"
t_eq "run 3: heartbeat called once" 1 "$(count 'https://hc.opsalert.test/ping/x')"

t_eq "no logged call contains the instance secret" 0 "$(host_exec 'grep -c secret-must-not-leak ~/opsalert/all; true' | tr -d '[:space:]')"
t_eq "mail files are removed afterwards" 0 "$(host_exec 'ls /tmp | wc -l' | tr -d '[:space:]')"

# --- --list sends nothing and pings nothing --------------------------------------------------------
host_exec 'rm -f ~/stub/up'
run --list >/dev/null
t_eq "--list: only the web check calls curl, no push, no heartbeat" 0 "$(host_exec "grep -vc -e \" -w \" ~/opsalert/calls; true" | tr -d "[:space:]")"

# --- a health.env with only NTFY_URL works as before ----------------------------------------------
host_exec 'cp ~/opsalert/health.env.legacy ~/opsalert/health.env; rm -f ~/opsalert/health.state'
run >/dev/null
run >/dev/null
t_eq "legacy: topic 0 got the alert" 1 "$(count 'n0.opsalert.test/topic-zero-secret' "Title: $title")"
t_eq "legacy: no other topic was called" 00 "$(count n1.opsalert.test)$(count n2.opsalert.test)"
t_eq "legacy: no mail attempted" 0 "$(count '--mail-rcpt')"
t_eq "legacy: no heartbeat" 0 "$(count 'hc.opsalert.test')"

t_done
