#!/usr/bin/env bash
# ITC-E1: the break-glass code of a sandbox/live stack stays on the box. Plain bash, no framework.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pass=0 fail=0
ok() { pass=$((pass + 1)); }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
check() { if [ "$2" = "$3" ]; then ok; else bad "$1 (got '$2', want '$3')"; fi; }

# Load just the two functions; agent.sh itself runs a job when sourced.
eval "$(sed -n '/^secrets_to_send() {/,/^}/p;/^write_break_glass() {/,/^}/p' "$here/agent.sh")"

has() { case " $1 " in *" $2 "*) echo yes ;; *) echo no ;; esac; }

for st in sandbox live real ""; do
  check "$st omits ADMIN_ACCESS_CODE" "$(has "$(secrets_to_send "$st")" ADMIN_ACCESS_CODE)" no
  check "$st keeps POSTGRES_PASSWORD" "$(has "$(secrets_to_send "$st")" POSTGRES_PASSWORD)" yes
done
check "demo sends ADMIN_ACCESS_CODE" "$(has "$(secrets_to_send demo)" ADMIN_ACCESS_CODE)" yes
check "demo sends five" "$(secrets_to_send demo | wc -w | tr -d ' ')" 5

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
log="$tmp/log"; : > "$log"
write_break_glass "$tmp" "code-1234"
check "file written" "$([ -f "$tmp/BREAK_GLASS.txt" ] && echo yes || echo no)" yes
if [ "$(uname -s | cut -c1-5)" != MINGW ]; then
  check "mode 600" "$(stat -c %a "$tmp/BREAK_GLASS.txt")" 600
fi
check "log says written" "$(grep -c '^break-glass written$' "$log")" 1
check "log has no value" "$(grep -c 'code-1234' "$log")" 0
write_break_glass "$tmp" "other-code"
check "not overwritten" "$(grep -c 'code-1234' "$tmp/BREAK_GLASS.txt")" 1
check "second call logs nothing" "$(grep -c '^break-glass written$' "$log")" 1

echo "ITC break-glass: $pass passed"
[ "$fail" -eq 0 ]
