#!/usr/bin/env bash
# Health checks for the box, with push alerts via ntfy. Cron runs it every 5 minutes.
#
#   stack/health.sh install     # once: ~/nextup/health.env with a private ntfy topic, cron, a test push
#   stack/health.sh             # run every check; alert on new failures and on recovery
#   stack/health.sh --summary   # push the state of every check (cron: Mondays 08:00)
#   stack/health.sh --list      # print the state of every check, push nothing
#
# What it checks:
#   web      every stack's APP_ORIGIN/api/health, automation's login page, and HEALTH_URLS
#   backup   a "<name>: backup done" line in backup.log from the last 26 h, for every stack,
#            automation and BACKUP_NAMES; the latest restore test of each must not have failed
#   cert     the https certificate of every web check has more than 14 days left (hourly)
#   disk     / is less than 85% full        memory   more than 400 MB available
#
# A check has to fail twice in a row (10 min) before it alerts, so a deploy doesn't page anyone.
# Alerts name the check and what was seen, never a secret.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
base="${NEXTUP_HOME:-$HOME/nextup}"
instances="${NEXTUP_INSTANCES:-$base/instances}"
conf="$base/health.env"
state="$base/health.state"
log="$base/health.log"
backup_log="$base/backup.log"

get() { grep -E "^$1=" "$2" 2>/dev/null | cut -d= -f2- || true; }
now() { date -u +%FT%TZ; }

push() {  # title, message, priority, tags
  local url; url="$(get NTFY_URL "$conf")"
  [ -n "$url" ] || return 0
  curl -fsS --max-time 10 -H "Title: $1" -H "Priority: $3" -H "Tags: $4" -d "$2" "$url" >/dev/null \
    || echo "$(now) could not reach ntfy" >> "$log"
}

if [ "${1:-}" = install ]; then
  mkdir -p "$base"
  if [ -f "$conf" ]; then
    echo "Keeping $conf."
  else
    (umask 077; cat > "$conf" <<ENV
# stack/health.sh settings. The topic name is the only thing that protects the alerts: keep it
# private (it's in the password manager with the rest).
NTFY_URL=https://ntfy.sh/nextup-$(openssl rand -hex 12)
# More https endpoints to watch, space separated.
HEALTH_URLS=https://admin.sellux.ch/api/health https://sellux.ch/
# More names whose nightly "<name>: backup done" line must be in backup.log.
BACKUP_NAMES=admin
ENV
    )
    echo "Wrote $conf."
  fi
  line1="*/5 * * * * $here/health.sh >/dev/null 2>&1"
  line2="0 8 * * 1 $here/health.sh --summary >/dev/null 2>&1"
  { crontab -l 2>/dev/null | grep -v 'stack/health.sh' | grep -v '^# NextUp health checks'
    echo "# NextUp health checks (stack/health.sh): every 5 min, weekly summary Monday 08:00 (UTC)."
    echo "$line1"; echo "$line2"; } | crontab -
  crontab -l | grep -q 'stack/health.sh --summary' || { echo "cron not written" >&2; exit 1; }
  push "NextUp alerts are on" "You'll get a push here when a check on the box fails, and when it recovers." default white_check_mark
  echo "Cron installed and a test push sent. Subscribe to the topic in the ntfy app:"
  echo "  grep NTFY_URL $conf"
  exit 0
fi

[ -f "$conf" ] || { echo "Run '$0 install' first." >&2; exit 1; }
mode="${1:-run}"
results=()   # "name|ok|detail"
check() { results+=("$1|$2|$3"); }

# --- web + cert -----------------------------------------------------------------------------
urls=()
for env in "$instances"/*/.env; do
  [ -f "$env" ] || continue
  o="$(get APP_ORIGIN "$env")"; [ -n "$o" ] && urls+=("$o/api/health")
done
auto_host="$(get N8N_HOST "$base/automation/.env")"
[ -n "$auto_host" ] && urls+=("https://$auto_host/_gate/health")
for u in $(get HEALTH_URLS "$conf"); do urls+=("$u"); done

hourly=false; [ "$(date -u +%M)" -lt 5 ] && hourly=true
[ "$mode" != run ] && hourly=true
for u in "${urls[@]}"; do
  host="$(sed -E 's#^https?://([^/:]+).*#\1#' <<< "$u")"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$u" || true)"
  if [ "$code" = 200 ]; then check "web $host" 1 "200"; else check "web $host" 0 "HTTP ${code:-no answer} from $u"; fi
  if $hourly && [[ "$u" = https://* ]]; then
    end="$(echo | timeout 10 openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    if [ -z "$end" ]; then check "cert $host" 0 "no certificate read"
    else
      days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
      if [ "$days" -gt 14 ]; then check "cert $host" 1 "$days days left"
      else check "cert $host" 0 "expires in $days days ($end)"; fi
    fi
  fi
done

# --- backups ----------------------------------------------------------------------------------
names=()
for env in "$instances"/*/.env; do [ -f "$env" ] && names+=("$(basename "$(dirname "$env")")"); done
[ -f "$base/automation/.env" ] && names+=(automation)
for n in $(get BACKUP_NAMES "$conf"); do names+=("$n"); done
limit=$(( $(date +%s) - 26 * 3600 ))
for n in "${names[@]}"; do
  last="$(grep -E "^[0-9TZ:-]+ $n: backup done" "$backup_log" 2>/dev/null | tail -1 | cut -d' ' -f1)"
  if [ -z "$last" ]; then check "backup $n" 0 "no backup in $backup_log yet"
  elif [ "$(date -d "$last" +%s)" -lt "$limit" ]; then check "backup $n" 0 "last backup $last"
  else check "backup $n" 1 "last $last"; fi
  rt="$(grep -E "^[0-9TZ:-]+ $n: restore-test" "$backup_log" 2>/dev/null | tail -1)"
  if grep -qiE 'fail|error' <<< "$rt"; then check "restore-test $n" 0 "${rt#* }"
  elif [ -n "$rt" ]; then check "restore-test $n" 1 "${rt%% *}"; fi
done

# --- disk + memory -----------------------------------------------------------------------------
used="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
if [ "$used" -lt 85 ]; then check "disk" 1 "$used% used"; else check "disk" 0 "/ is $used% full"; fi
avail=$(( $(awk '/^MemAvailable/ {print $2}' /proc/meminfo) / 1024 ))
if [ "$avail" -gt 400 ]; then check "memory" 1 "$avail MB available"; else check "memory" 0 "only $avail MB available"; fi

# --- report -----------------------------------------------------------------------------------
if [ "$mode" = --list ]; then
  for r in "${results[@]}"; do IFS='|' read -r n ok d <<< "$r"; printf '%-4s %-34s %s\n' "$([ "$ok" = 1 ] && echo ok || echo FAIL)" "$n" "$d"; done
  exit 0
fi
if [ "$mode" = --summary ]; then
  bad=0; body=""
  for r in "${results[@]}"; do IFS='|' read -r n ok d <<< "$r"; [ "$ok" = 1 ] || { bad=$((bad+1)); body+="✗ $n: $d"$'\n'; }; done
  if [ "$bad" = 0 ]; then push "NextUp: all ${#results[@]} checks OK" "Weekly summary - web, certificates, backups, disk and memory are fine." low white_check_mark
  else push "NextUp: $bad of ${#results[@]} checks failing" "$body" high warning; fi
  exit 0
fi

# Remember consecutive failures per check; alert at the second, and once more on recovery.
declare -A fails=() alerted=()
if [ -f "$state" ]; then
  while IFS='|' read -r n c a; do [ -n "$n" ] && { fails["$n"]="$c"; alerted["$n"]="$a"; }; done < "$state"
fi
new_state=""
for r in "${results[@]}"; do
  IFS='|' read -r n ok d <<< "$r"
  c="${fails[$n]:-0}"; a="${alerted[$n]:-0}"
  if [ "$ok" = 1 ]; then
    if [ "$a" = 1 ]; then
      push "Recovered: $n" "$d" default white_check_mark; echo "$(now) RECOVERED $n: $d" >> "$log"
    fi
    c=0; a=0
  else
    c=$((c + 1))
    if [ "$c" -ge 2 ] && [ "$a" = 0 ]; then
      push "NextUp problem: $n" "$d" high rotating_light; echo "$(now) FAIL $n: $d" >> "$log"; a=1
    fi
  fi
  new_state+="$n|$c|$a"$'\n'
done
# Certificate checks run hourly and keep their state in between; a check that is gone for good
# (a removed stack) is forgotten.
declare -A ran=()
for r in "${results[@]}"; do ran["${r%%|*}"]=1; done
for n in "${!fails[@]}"; do [[ "$n" = cert\ * ]] && [ -z "${ran[$n]:-}" ] && new_state+="$n|${fails[$n]}|${alerted[$n]}"$'
'; done
(umask 077; printf '%s' "$new_state" > "$state.tmp" && mv "$state.tmp" "$state")
