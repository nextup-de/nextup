#!/usr/bin/env bash
# Proof for SEC-R1 (D9): stack/rotate-keys.sh rotates AUTH_SECRET, the connector vault key and the
# restic password. Docker and restic are a stub (fake/rotate/docker); no Docker host is needed.
#   bash stack/tests/rotate-keys.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "SEC rotate keys"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export NEXTUP_INSTANCES="$tmp/instances"
export ROTATE_DOCKER="$PWD/stack/tests/fake/rotate/docker"
export ROTATE_STUB_LOG="$tmp/calls.log"
export ROTATE_WAIT_SECONDS=2 ROTATE_POLL_SECONDS=1
inst="$NEXTUP_INSTANCES/acme"
script=stack/rotate-keys.sh
OLD_AUTH=oldauth0000000000000000000000000000000000000000000000000000aaaa
OLD_VAULT=oldvault000000000000000000000000000000000000000000000000000bbbb
OLD_PW=oldresticpw00000000000000000000000000000000000000000000000000cc
export ROTATE_STUB_OLDPW="$OLD_PW"

fresh() {
  mkdir -p "$inst"
  (umask 077; printf 'COMPANY_SLUG=acme\nAUTH_SECRET=%s\nCONNECTOR_VAULT_KEY=%s\nRESTIC_REPOSITORY=/srv/backups/acme\nRESTIC_PASSWORD=%s\nOTHER=keep-me\n' \
    "$OLD_AUTH" "$OLD_VAULT" "$OLD_PW" > "$inst/.env")
  chmod 0600 "$inst/.env"
  : > "$ROTATE_STUB_LOG"; : > "$inst/rotations.log"
  unset ROTATE_STUB_FAIL ROTATE_STUB_VAULT
}
val() { grep -E "^$1=" "$inst/.env" | cut -d= -f2-; }
mode() { stat -c %a "$inst/.env" 2>/dev/null || stat -f %Lp "$inst/.env"; }
# A checkout on NTFS (Git Bash) cannot hold 0600; expect whatever chmod 0600 yields on this disk.
: > "$tmp/probe"; chmod 0600 "$tmp/probe"
want_mode="$(stat -c %a "$tmp/probe" 2>/dev/null || stat -f %Lp "$tmp/probe")"
calls() { cat "$ROTATE_STUB_LOG"; }
run() { out="$("$@" 2>&1)"; rc=$?; }
leaks() { # no secret value in the log or the output
  local v
  for v in "$OLD_AUTH" "$OLD_VAULT" "$OLD_PW" "$(val AUTH_SECRET)" "$(val CONNECTOR_VAULT_KEY)" "$(val RESTIC_PASSWORD)"; do
    [ -n "$v" ] || continue
    grep -qF "$v" "$inst/rotations.log" && return 1
    printf '%s' "$out" | grep -qF "$v" && return 1
  done
  return 0
}

# --- bad input: exit 2 -------------------------------------------------------
fresh
run bash $script; t_eq "no arguments exits 2" 2 "$rc"
run bash $script acme nope --yes; t_eq "unknown key exits 2" 2 "$rc"
run bash $script nosuch auth --yes; t_eq "unknown stack exits 2" 2 "$rc"
run bash $script acme auth --bogus; t_eq "unknown option exits 2" 2 "$rc"

# --- auth --------------------------------------------------------------------
fresh
run bash $script acme auth </dev/null; t_eq "auth without --yes and no answer exits 1" 1 "$rc"
t_eq "auth declined changes nothing" "$OLD_AUTH" "$(val AUTH_SECRET)"
run bash $script acme auth --yes
t_eq "auth exits 0" 0 "$rc"
t_ok "auth sets a new 64-hex secret" bash -c "[[ '$(val AUTH_SECRET)' =~ ^[0-9a-f]{64}\$ ]] && [ '$(val AUTH_SECRET)' != '$OLD_AUTH' ]"
t_eq "auth leaves other lines" keep-me "$(val OTHER)"
t_eq "auth recreates the app once" 1 "$(calls | grep -c '^compose up')"
t_eq ".env stays 0600 after auth" "$want_mode" "$(mode)"
t_ok "auth warns that sessions end" bash -c "printf '%s' '$out' | grep -qi 'session'"
t_ok "auth logs the key name, no value" bash -c "grep -q 'AUTH_SECRET' '$inst/rotations.log'"
t_ok "auth leaks no value" leaks

# --- vault -------------------------------------------------------------------
fresh
run bash $script acme vault --yes
t_eq "vault exits 0" 0 "$rc"
t_eq "vault drops the previous key" "" "$(val CONNECTOR_VAULT_KEY_PREVIOUS)"
t_ok "vault has a new key" bash -c "[ -n '$(val CONNECTOR_VAULT_KEY)' ] && [ '$(val CONNECTOR_VAULT_KEY)' != '$OLD_VAULT' ]"
t_eq "vault recreates twice, previous set then unset" "compose up previous=set compose logs compose up previous=absent" \
  "$(calls | tr '\n' ' ' | sed 's/ $//')"
t_eq ".env stays 0600 after vault" "$want_mode" "$(mode)"
t_ok "vault leaks no value" leaks

fresh; export ROTATE_STUB_VAULT=timeout
run bash $script acme vault --yes
t_eq "vault timeout exits 1" 1 "$rc"
t_eq "vault timeout keeps the previous key" "$OLD_VAULT" "$(val CONNECTOR_VAULT_KEY_PREVIOUS)"
t_ok "vault timeout keeps a new current key" bash -c "[ -n '$(val CONNECTOR_VAULT_KEY)' ] && [ '$(val CONNECTOR_VAULT_KEY)' != '$OLD_VAULT' ]"
t_eq "vault timeout recreates only once" 1 "$(calls | grep -c '^compose up')"
t_eq ".env stays 0600 after a stopped vault" "$want_mode" "$(mode)"
t_ok "vault timeout leaks no value" leaks

fresh; export ROTATE_STUB_VAULT=failed
run bash $script acme vault --yes
t_eq "vault failed>0 exits 1" 1 "$rc"
t_eq "vault failed>0 keeps the previous key" "$OLD_VAULT" "$(val CONNECTOR_VAULT_KEY_PREVIOUS)"
t_eq "vault failed>0 recreates only once" 1 "$(calls | grep -c '^compose up')"
run bash $script acme vault --yes
t_eq "vault refuses while a previous key is set" 1 "$rc"

# --- restic ------------------------------------------------------------------
fresh
run bash $script acme restic --yes
t_eq "restic exits 0" 0 "$rc"
t_eq "restic order and passwords" "restic key list pw=old|restic key add pw=old|restic snapshots pw=new|restic key remove pw=new|" \
  "$(calls | tr '\n' '|')"
t_ok "restic puts a new password in .env" bash -c "[ -n '$(val RESTIC_PASSWORD)' ] && [ '$(val RESTIC_PASSWORD)' != '$OLD_PW' ]"
t_eq ".env stays 0600 after restic" "$want_mode" "$(mode)"
t_ok "restic leaks no value" leaks

for f in key-add snapshots key-remove; do
  fresh; export ROTATE_STUB_FAIL=$f
  run bash $script acme restic --yes
  t_eq "restic $f failure exits 1" 1 "$rc"
  t_eq "restic $f failure keeps the old password" "$OLD_PW" "$(val RESTIC_PASSWORD)"
  t_ok "restic $f failure leaks no value" leaks
done
fresh; export ROTATE_STUB_FAIL=key-add
run bash $script acme restic --yes
t_eq "failed key add never reaches snapshots or remove" 0 "$(calls | grep -cE 'snapshots|key remove')"
unset ROTATE_STUB_FAIL
fresh; export ROTATE_STUB_FAIL=snapshots
run bash $script acme restic --yes
t_eq "failed snapshots never removes the old key" 0 "$(calls | grep -c 'key remove')"

t_done
