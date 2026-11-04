#!/usr/bin/env bash
# Break-glass window (SEC-B1, D4): the customer's operator opens a time-limited way in for NextUp.
#   stack/break-glass.sh <slug> open --hours <1-24> --reason <text>   prints the code once
#   stack/break-glass.sh <slug> close
#   stack/break-glass.sh <slug> status                                open until <ISO> | closed | expired <ISO>
# Run on the host as root or the deploy user. Writes $NEXTUP_INSTANCES/<slug>/break-glass/window.json
# (only the code's sha256) and appends to break-glass/log. The code is never logged or stored.
# BREAK_GLASS_NOW (an ISO time) replaces the clock; for tests only.
set -euo pipefail
umask 022

home_dir="${NEXTUP_HOME:-$HOME/nextup}"
instances="${NEXTUP_INSTANCES:-$home_dir/instances}"

die() { echo "break-glass: $*" >&2; exit 1; }
usage() { die "usage: break-glass.sh <slug> open --hours <1-24> --reason <text> | close | status"; }

[ $# -ge 2 ] || usage
slug="$1"; action="$2"; shift 2
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,38}$ ]] || die "bad slug"
[ -d "$instances/$slug" ] || die "unknown stack '$slug' (no $instances/$slug)"

dir="$instances/$slug/break-glass"
window="$dir/window.json"
logf="$dir/log"

now_epoch() { if [ -n "${BREAK_GLASS_NOW:-}" ]; then date -u -d "$BREAK_GLASS_NOW" +%s || die "bad BREAK_GLASS_NOW"; else date -u +%s; fi; }
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }
sha256() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
who() { echo "${SUDO_USER:-${USER:-$(id -un)}}"; }
json_str() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
field() { sed -n -E "s/.*\"$1\":\"([^\"]*)\".*/\1/p" "$window" | head -1; }
logline() {  # action until by reason - never the code
  mkdir -p "$dir"
  printf '%s\t%s\t%s\t%s\t%s\n' "$(iso "$(now_epoch)")" "$1" "$2" "$3" "$4" >> "$logf"
}

case "$action" in
  open)
    hours="" reason=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --hours) [ $# -ge 2 ] || usage; hours="$2"; shift 2 ;;
        --reason) [ $# -ge 2 ] || usage; reason="$2"; shift 2 ;;
        *) usage ;;
      esac
    done
    [[ "$hours" =~ ^[0-9]{1,2}$ ]] && [ "$((10#$hours))" -ge 1 ] && [ "$((10#$hours))" -le 24 ] || die "--hours must be 1-24"
    hours=$((10#$hours))
    reason="$(printf '%s' "$reason" | tr '\r\n\t' '   ' | tr -d '\000-\037' | sed -E 's/^ +//; s/ +$//')"
    [ -n "$reason" ] || die "--reason must not be empty"
    reason="${reason:0:200}"
    code="$(openssl rand -hex 12)"
    now="$(now_epoch)"; until_iso="$(iso $((now + hours * 3600)))"; by="$(who)"
    mkdir -p "$dir"
    tmp="$(mktemp "$dir/.window.XXXXXX")"
    printf '{"v":1,"codeSha256":"%s","openedAt":"%s","until":"%s","by":"%s","reason":"%s"}\n' \
      "$(printf '%s' "$code" | sha256)" "$(iso "$now")" "$until_iso" "$(json_str "$by")" "$(json_str "$reason")" > "$tmp"
    chmod 644 "$tmp"; mv -f "$tmp" "$window"
    logline open "$until_iso" "$by" "$reason"
    echo "$code"
    ;;

  close)
    [ -f "$window" ] || { echo "closed"; exit 0; }
    logline close "$(field until)" "$(who)" "$(field reason)"
    rm -f "$window"
    echo "closed"
    ;;

  status)
    [ -f "$window" ] || { echo "closed"; exit 0; }
    until_iso="$(field until)"
    until_epoch="$(date -u -d "$until_iso" +%s 2>/dev/null)" || die "unreadable window.json"
    if [ "$(now_epoch)" -lt "$until_epoch" ]; then
      echo "open until $until_iso"
    else
      # an expiry is logged once, the first time status sees it
      grep -qF "$(printf '\texpired\t%s\t' "$until_iso")" "$logf" 2>/dev/null || logline expired "$until_iso" "$(field by)" "$(field reason)"
      echo "expired $until_iso"
    fi
    ;;

  *) usage ;;
esac
