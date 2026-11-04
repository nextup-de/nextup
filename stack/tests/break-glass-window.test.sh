#!/usr/bin/env bash
# Proof for SEC-B1 (D4): stack/break-glass.sh opens, reports and closes a time-limited window.
# No Docker: a temp NEXTUP_INSTANCES.
#   bash stack/tests/break-glass-window.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
source stack/tests/lib/assert.sh

t_init "SEC break-glass window"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export NEXTUP_INSTANCES="$tmp/instances"
mkdir -p "$NEXTUP_INSTANCES/acme"
bg="bash stack/break-glass.sh"
win="$NEXTUP_INSTANCES/acme/break-glass/window.json"
logf="$NEXTUP_INSTANCES/acme/break-glass/log"
tab="$(printf '\t')"
export BREAK_GLASS_NOW="2026-11-04T10:00:00Z"

t_eq "status before any window" "closed" "$($bg acme status)"

code="$($bg acme open --hours 2 --reason "support ticket 42")"
t_ok "code is 24 hex" bash -c "printf '%s' '$code' | grep -qE '^[0-9a-f]{24}$'"
t_ok "window.json exists" test -f "$win"
hash="$(printf '%s' "$code" | sha256sum | cut -d' ' -f1)"
t_ok "window holds the code's sha256" grep -q "\"codeSha256\":\"$hash\"" "$win"
t_ok "window holds v" grep -q '"v":1' "$win"
t_ok "window holds openedAt" grep -q '"openedAt":"2026-11-04T10:00:00Z"' "$win"
t_ok "window holds by" grep -q '"by":"[^"]' "$win"
t_ok "window holds reason" grep -q '"reason":"support ticket 42"' "$win"
t_ok "until is opened + 2h" grep -q '"until":"2026-11-04T12:00:00Z"' "$win"
t_ok "window does not contain the code" bash -c "! grep -q '$code' '$win'"
t_ok "log does not contain the code" bash -c "! grep -q '$code' '$logf'"
t_eq "log has one open line" 1 "$(grep -c "${tab}open${tab}" "$logf")"
if [ "$(uname -s | cut -c1-5)" != MINGW ]; then t_eq "window mode 644" 644 "$(stat -c %a "$win")"; fi

t_eq "status open" "open until 2026-11-04T12:00:00Z" "$($bg acme status)"
t_eq "status open just before until" "open until 2026-11-04T12:00:00Z" "$(BREAK_GLASS_NOW=2026-11-04T11:59:59Z $bg acme status)"
t_eq "status expired at until" "expired 2026-11-04T12:00:00Z" "$(BREAK_GLASS_NOW=2026-11-04T12:00:00Z $bg acme status)"
BREAK_GLASS_NOW=2026-11-04T13:00:00Z $bg acme status >/dev/null
t_eq "expiry logged once" 1 "$(grep -c "${tab}expired${tab}" "$logf")"

code2="$($bg acme open --hours 24 --reason "second")"
t_ok "second open makes a new code" test "$code2" != "$code"
t_ok "second open replaced the window" grep -q "\"codeSha256\":\"$(printf '%s' "$code2" | sha256sum | cut -d' ' -f1)\"" "$win"
t_ok "second open until is +24h" grep -q '"until":"2026-11-05T10:00:00Z"' "$win"
t_ok "old hash is gone" bash -c "! grep -q '$hash' '$win'"

$bg acme close >/dev/null
t_ok "close removes the window" test ! -e "$win"
t_eq "status after close" "closed" "$($bg acme status)"
t_eq "log has a close line" 1 "$(grep -c "${tab}close${tab}" "$logf")"
t_ok "no code in the log at all" bash -c "! grep -qE '$code|$code2' '$logf'"

t_ok "refuses unknown slug" bash -c "! $bg nope open --hours 1 --reason x"
t_ok "refuses hours 0" bash -c "! $bg acme open --hours 0 --reason x"
t_ok "refuses hours 25" bash -c "! $bg acme open --hours 25 --reason x"
t_ok "refuses hours abc" bash -c "! $bg acme open --hours abc --reason x"
t_ok "refuses empty reason" bash -c "! $bg acme open --hours 1 --reason ''"
t_ok "refuses blank reason" bash -c "! $bg acme open --hours 1 --reason '   '"
t_ok "refusals leave no window" test ! -e "$win"

$bg acme open --hours 1 --reason "$(printf 'a%.0s' $(seq 1 300))" >/dev/null
t_eq "reason cut at 200" 200 "$(sed -n -E 's/.*"reason":"([^"]*)".*/\1/p' "$win" | tr -d '\n' | wc -c | tr -d ' ')"
$bg acme open --hours 1 --reason 'say "hi" \ there' >/dev/null
t_ok "reason with quotes is valid json" bash -c "command -v node >/dev/null || exit 0; node -e 'JSON.parse(require(\"fs\").readFileSync(process.argv[1],\"utf8\"))' '$win'"

t_done
