#!/usr/bin/env bash
# Proof for OPS-E1: stage, release and deploy back each stack up (backup.sh pre-migrate) before its
# add-stack.sh, skip a stack whose backup fails, and move a stack without a backup as before.
# Everything is stubs inside the container host (stack/tests/README.md); no real server.
#   bash stack/tests/box-release.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS box release backs up before migrating"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }

# The box: a copy of stack/ and three instances, all under one temp folder.
host_exec 'bash -s' <<'SETUP' || exit 1
set -e
BOX="$(mktemp -d)"; echo "$BOX" > /tmp/box-path
mkdir -p "$BOX/nextup" "$BOX/instances" "$BOX/bin" "$BOX/build"
cp -a /opt/nextup-src/stack "$BOX/nextup/stack"
rm -rf "$BOX/nextup/stack/instances"
: > "$BOX/calls"; : > "$BOX/fail"
mk() { # slug port track-has-restic
  mkdir -p "$BOX/instances/$1"
  printf 'PORT=%s\nSTAGE=demo\n' "$2" > "$BOX/instances/$1/stack.conf"
  printf 'NEXTUP_APP_IMAGE=x\n' > "$BOX/instances/$1/.env"
  [ "$3" != restic ] || echo 'RESTIC_PASSWORD=secret' >> "$BOX/instances/$1/.env"
}
mk acme 3101 restic; mk globex 3111 none; mk stg 3991 restic

# A stub stack: what a fetched commit holds. Every script only records its call.
cp -a /opt/nextup-src/stack "$BOX/build/stack"
rm -rf "$BOX/build/stack/instances"
cat > "$BOX/build/stack/nginx/ports.md" <<'EOS'
| Slug | Port | Stage | Track | Host | Notes |
|---|---|---|---|---|---|
| acme | 3101 | demo | release | acme.example | |
| globex | 3111 | demo | release | globex.example | |
| stg | 3991 | demo | main | stg.example | |
EOS
cp "$BOX/build/stack/nginx/ports.md" "$BOX/nextup/stack/nginx/ports.md"
for f in nginx/add-stack.sh backup.sh ctl.sh; do
  cat > "$BOX/build/stack/$f" <<'EOS'
#!/usr/bin/env bash
BOX="$(cat /tmp/box-path)"
echo "$(basename "$0") $*" >> "$BOX/calls"
echo "$0" >> "$BOX/call-paths"
if [ "$(basename "$0")" = backup.sh ] && grep -qx "$1" "$BOX/fail"; then exit 1; fi
exit 0
EOS
  chmod 755 "$BOX/build/stack/$f"
done
tar czf "$BOX/stack.tgz" -C "$BOX/build" --transform 's,^stack,nextup-x/stack,' stack

# curl hands out that tarball; docker pulls and prints nothing.
cat > "$BOX/bin/curl" <<'EOS'
#!/usr/bin/env bash
cat "$(cat /tmp/box-path)/stack.tgz"
EOS
cat > "$BOX/bin/docker" <<'EOS'
#!/usr/bin/env bash
exit 0
EOS
chmod 755 "$BOX/bin/curl" "$BOX/bin/docker"
SETUP

# deploy.sh as deploy, on the box's own copy, with every state file under $BOX.
deploy() { # <args...>
  host_exec 'BOX="$(cat /tmp/box-path)"
    export PATH="$BOX/bin:$PATH" NEXTUP_INSTANCES="$BOX/instances" NEXTUP_DEPLOY_LOG="$BOX/deploy.log" \
      NEXTUP_BACKUP_LOG="$BOX/backup.log" NEXTUP_STAGED="$BOX/staged" NEXTUP_RELEASED="$BOX/released" \
      NEXTUP_DEPLOY_LOCK="$BOX/deploy.lock" NEXTUP_AUTOMATION="$BOX/automation"
    cd "$BOX/nextup" && stack/nginx/deploy.sh '"$*"' 2>&1'
}
calls() { host_exec 'cat "$(cat /tmp/box-path)/calls"'; }
reset_calls() { host_exec ': > "$(cat /tmp/box-path)/calls"; : > "$(cat /tmp/box-path)/call-paths"'; }
# Line number of the first call matching an exact line, or 0.
line_of() { calls | grep -nxF -- "$1" | head -n 1 | cut -d: -f1; }
before() { local a b; a="$(line_of "$1")"; b="$(line_of "$2")"; [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; }

# --- release aaaaaaa: acme (restic) backs up first, globex (none) does not, stg is left to stage ---
reset_calls
out="$(deploy release aaaaaaa)"; rc=$?
t_eq "release aaaaaaa exits 0" 0 "$rc"
t_ok "acme: backup.sh pre-migrate before add-stack.sh" before \
  "backup.sh acme pre-migrate aaaaaaa" "add-stack.sh acme 3101 demo --images aaaaaaa"
t_ok "acme: backup taken is printed" grep -q 'backup taken' <<< "$out"
t_eq "globex: moved without a backup call" "1:0" \
  "$(calls | grep -c '^add-stack.sh globex 3111 demo --images aaaaaaa$'):$(calls | grep -c '^backup.sh globex')"
t_ok "output says no backup" grep -q 'no backup' <<< "$out"
t_eq "stg: not moved by release" 0 "$(calls | grep -c ' stg ')"

# --- stage bbbbbbb: stg backs up from its own copy before add-stack.sh ---
reset_calls
out="$(deploy stage bbbbbbb)"; rc=$?
t_eq "stage bbbbbbb exits 0" 0 "$rc"
t_ok "stg: backup.sh pre-migrate before add-stack.sh" before \
  "backup.sh stg pre-migrate bbbbbbb" "add-stack.sh stg 3991 demo --images bbbbbbb"
t_ok "stg: the backup ran from its own copy" bash -c \
  'grep -q "/instances/stg/stack/backup.sh$" <<< "$1"' _ \
  "$(host_exec 'cat "$(cat /tmp/box-path)/call-paths"')"
t_eq "stage touches neither acme nor globex" 0 "$(calls | grep -cE ' (acme|globex) ')"

# --- release ccccccc with acme's backup failing: acme is skipped, globex still moves ---
deploy stage ccccccc >/dev/null
host_exec 'echo acme > "$(cat /tmp/box-path)/fail"'
reset_calls
out="$(deploy release ccccccc)"; rc=$?
t_ok "release ccccccc exits non-zero" test "$rc" -ne 0
t_eq "acme: not moved after a failed backup" 0 "$(calls | grep -c '^add-stack.sh acme ')"
t_eq "globex: still moved" 1 "$(calls | grep -c '^add-stack.sh globex 3111 demo --images ccccccc$')"
t_ok "output names the failed backup" grep -q '!! acme: backup failed' <<< "$out"
t_ok "deploy.log records the failure" host_exec 'grep -q "release ccccccc done (failed=1)" "$(cat /tmp/box-path)/deploy.log"'
host_exec ': > "$(cat /tmp/box-path)/fail"'

# --- a forced command still cannot deploy ---
host_exec 'BOX="$(cat /tmp/box-path)"; cd "$BOX/nextup"
  SSH_ORIGINAL_COMMAND="deploy main" NEXTUP_DEPLOY_LOG="$BOX/deploy.log" stack/nginx/deploy.sh >/dev/null 2>&1'
t_eq "forced command 'deploy main' is refused with exit 2" 2 "$?"

t_done
