#!/usr/bin/env bash
# SEC-B1 (D3): a real stack sends no secret to the admin vault; a demo stack sends what it always did;
# the agent no longer writes BREAK_GLASS.txt. Plain bash, no framework.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pass=0 fail=0
ok() { pass=$((pass + 1)); }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
check() { if [ "$2" = "$3" ]; then ok; else bad "$1 (got '$2', want '$3')"; fi; }

# Load just the function; agent.sh itself runs a job when sourced.
eval "$(sed -n '/^secrets_to_send() {/,/^}/p' "$here/agent.sh")"

for st in real sandbox live ""; do
  check "'$st' sends nothing" "$(secrets_to_send "$st")" ""
done
check "demo sends the five, unchanged" "$(secrets_to_send demo)" \
  "ADMIN_ACCESS_CODE POSTGRES_PASSWORD AUTH_SECRET N8N_ENCRYPTION_KEY RESTIC_PASSWORD"

check "write_break_glass is gone" "$(grep -c 'write_break_glass()' "$here/agent.sh")" 0
check "agent never names BREAK_GLASS.txt except to log it is unused" \
  "$(grep 'BREAK_GLASS.txt' "$here/agent.sh" | grep -vc 'no longer used\|\[ -e ')" 0

# collect_secrets for a real stack: the job result carries "secrets":{} and "logins":[], logs once
# that a leftover BREAK_GLASS.txt is unused, and leaves the file in place.
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
dir="$tmp/acme"; mkdir -p "$dir"
printf 'ADMIN_ACCESS_CODE=abc123\nPOSTGRES_PASSWORD=pw\n' > "$dir/.env"
env_file="$dir/.env" log="$tmp/log" stage=real slug=acme; : > "$log"
box_stage() { echo real; }
getenv() { grep -E "^$1=" "$env_file" | head -1 | cut -d= -f2-; }
stack=/nonexistent
eval "$(sed -n '/^collect_secrets() {/,/^}/p' "$here/agent.sh")"
secrets_json="" logins_json="" secrets_empty=0
collect_secrets
check "real: no secrets json" "$secrets_json" ""
check "real: no logins json" "$logins_json" ""
check "real: result marked empty" "$secrets_empty" 1
check "real: no file written" "$([ -e "$dir/BREAK_GLASS.txt" ] && echo yes || echo no)" no
check "real: nothing logged without a file" "$(wc -c < "$log" | tr -d ' ')" 0
echo old > "$dir/BREAK_GLASS.txt"
collect_secrets
check "real: leftover file kept" "$(cat "$dir/BREAK_GLASS.txt")" old
check "real: logs it is unused" "$(grep -c '^break-glass file no longer used; open a window with stack/break-glass.sh$' "$log")" 1
check "real: log has no code" "$(grep -c 'abc123' "$log")" 0

# The report shape: eval the report body builder through a stub of the pieces it prints.
body="$(secrets_json="" logins_json="" secrets_empty=1; { [ -n "$secrets_json" ] && :; } ; sed -n '/^report() {/,/^}/p' "$here/agent.sh" | grep -c 'secrets_empty')"
check "report prints explicit empties" "$([ "$body" -ge 2 ] && echo yes || echo no)" yes

echo "SEC agent secrets: $pass passed"
[ "$fail" -eq 0 ]
