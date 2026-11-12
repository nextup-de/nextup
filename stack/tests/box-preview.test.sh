#!/usr/bin/env bash
# Proof for the PR previews (RUNBOOK "PR previews"): deploy.sh preview puts a PR in a free slot,
# keeps it there on the next push (a fresh install each time), hands the oldest slot to a new PR
# when all are taken, never lets stage/release touch a slot, and the --previews-only key can do
# nothing else. Everything is stubs inside the container host (stack/tests/README.md); no real server.
#   bash stack/tests/box-preview.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS box PR previews"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }

host_exec 'bash -s' <<'SETUP' || exit 1
set -e
BOX="$(mktemp -d)"; echo "$BOX" > /tmp/box-path
mkdir -p "$BOX/nextup" "$BOX/instances" "$BOX/bin" "$BOX/build"
cp -a /opt/nextup-src/stack "$BOX/nextup/stack"
rm -rf "$BOX/nextup/stack/instances"
: > "$BOX/calls"; : > "$BOX/fail"; : > "$BOX/sites"
# acme: a release-track stack that must not notice the slots.
mkdir -p "$BOX/instances/acme"
printf 'PORT=3101\nSTAGE=demo\n' > "$BOX/instances/acme/stack.conf"
printf 'NEXTUP_APP_IMAGE=x\n' > "$BOX/instances/acme/.env"

# What a fetched commit holds: the real deploy.sh, stub scripts that record their call.
cp -a /opt/nextup-src/stack "$BOX/build/stack"
rm -rf "$BOX/build/stack/instances"
cat > "$BOX/build/stack/nginx/ports.md" <<'EOS'
| Slug | Port | Stage | Track | Host | Notes |
|---|---|---|---|---|---|
| acme | 3101 | demo | release | acme.example | |
| preview1 | 3961 | preview | - | preview1.example | |
| preview2 | 3971 | preview | - | preview2.example | |
| preview3 | 3981 | preview | - | preview3.example | |
EOS
cp "$BOX/build/stack/nginx/ports.md" "$BOX/nextup/stack/nginx/ports.md"
for f in nginx/add-stack.sh backup.sh ctl.sh; do
  cat > "$BOX/build/stack/$f" <<'EOS'
#!/usr/bin/env bash
BOX="$(cat /tmp/box-path)"
echo "$(basename "$0") $*" >> "$BOX/calls"
if [ "$(basename "$0")" = add-stack.sh ]; then
  grep -qx "$1" "$BOX/fail" && exit 1
  echo "NEXTUP_APP_IMAGE=x" > "$NEXTUP_INSTANCES/$1/.env"
  echo "  Admin:        https://x/admin   code: secret-admin-code"
fi
exit 0
EOS
  chmod 755 "$BOX/build/stack/$f"
done
tar czf "$BOX/stack.tgz" -C "$BOX/build" --transform 's,^stack,nextup-x/stack,' stack

cat > "$BOX/bin/curl" <<'EOS'
#!/usr/bin/env bash
cat "$(cat /tmp/box-path)/stack.tgz"
EOS
cat > "$BOX/bin/docker" <<'EOS'
#!/usr/bin/env bash
echo "docker $*" >> "$(cat /tmp/box-path)/calls"
exit 0
EOS
# sudo -n <helper> ...: the root helper, which remembers the sites it made.
cat > "$BOX/bin/sudo" <<'EOS'
#!/usr/bin/env bash
[ "$1" = -n ] && shift
exec "$@"
EOS
cat > "$BOX/bin/nextup-site" <<'EOS'
#!/usr/bin/env bash
BOX="$(cat /tmp/box-path)"
case "$1" in
  check) grep -qx "$2" "$BOX/sites" ;;
  add) echo "site add $2 $3" >> "$BOX/calls"; echo "$2" >> "$BOX/sites" ;;
  *) exit 2 ;;
esac
EOS
chmod 755 "$BOX/bin/"*
SETUP

deploy() { # <args...> ; SSH_CMD and FLAGS from the caller's environment
  host_exec 'BOX="$(cat /tmp/box-path)"
    export PATH="$BOX/bin:$PATH" NEXTUP_INSTANCES="$BOX/instances" NEXTUP_DEPLOY_LOG="$BOX/deploy.log" \
      NEXTUP_BACKUP_LOG="$BOX/backup.log" NEXTUP_STAGED="$BOX/staged" NEXTUP_RELEASED="$BOX/released" \
      NEXTUP_DEPLOY_LOCK="$BOX/deploy.lock" NEXTUP_AUTOMATION="$BOX/automation" \
      NEXTUP_SITE_HELPER="$BOX/bin/nextup-site" NEXTUP_PREVIEW_MIN_DISK_MB='"${MIN_DISK:-1}"'
    [ -z "'"${SSH_CMD:-}"'" ] || export SSH_ORIGINAL_COMMAND="'"${SSH_CMD:-}"'"
    cd "$BOX/nextup" && stack/nginx/deploy.sh '"${FLAGS:-} $*"' 2>&1'
}
calls() { host_exec 'cat "$(cat /tmp/box-path)/calls"'; }
reset_calls() { host_exec ': > "$(cat /tmp/box-path)/calls"'; }
conf() { host_exec 'cat "$(cat /tmp/box-path)/instances/'"$1"'/stack.conf" 2>/dev/null'; }

# --- the first PR gets the first slot, a site and a certificate ---
out="$(deploy preview 101 aaaaaaa)"; rc=$?
t_eq "preview 101 exits 0" 0 "$rc"
t_ok "101 is installed in preview1 as a demo stack of its commit" grep -qx \
  'add-stack.sh preview1 3961 demo --images aaaaaaa --app-replicas 1' <<< "$(calls)"
t_ok "preview1 gets its nginx site once" grep -qx 'site add preview1 3961' <<< "$(calls)"
t_ok "the URL is printed for the workflow" grep -qx 'PREVIEW_URL=https://preview1.sellux.ch' <<< "$out"
t_ok "the admin code stays out of the CI log" bash -c '! grep -q secret-admin-code <<< "$1"' _ "$out"
t_ok "stack.conf names the PR and the commit" bash -c 'grep -qx PREVIEW_PR=101 <<< "$1" && grep -qx PREVIEW_SHA=aaaaaaa <<< "$1"' _ "$(conf preview1)"
t_ok "it runs from its own copy of stack/" host_exec 'test -x "$(cat /tmp/box-path)/instances/preview1/stack/nginx/add-stack.sh"'

deploy preview 102 aaaaaaa >/dev/null; deploy preview 103 aaaaaaa >/dev/null
t_ok "102 and 103 take the next two slots" bash -c 'grep -qx PREVIEW_PR=102 <<< "$1" && grep -qx PREVIEW_PR=103 <<< "$2"' _ "$(conf preview2)" "$(conf preview3)"

# --- a push to 101: same slot, wiped first, no second site ---
reset_calls
out="$(deploy preview 101 bbbbbbb)"; rc=$?
t_eq "preview 101 again exits 0" 0 "$rc"
t_ok "the old stack is taken down with its volumes" grep -q '^docker compose .*preview1/.env down -v' <<< "$(calls)"
t_ok "101 stays in preview1 at the new commit" grep -qx 'add-stack.sh preview1 3961 demo --images bbbbbbb --app-replicas 1' <<< "$(calls)"
t_eq "no second nginx site" 0 "$(calls | grep -c '^site add')"
t_ok "nothing evicted" bash -c '! grep -q PREVIEW_EVICTED <<< "$1"' _ "$out"

# --- all taken: the slot updated longest ago goes to the new PR ---
host_exec 'I="$(cat /tmp/box-path)/instances"
  sed -i "s/^PREVIEW_AT=.*/PREVIEW_AT=300/" "$I/preview1/stack.conf"
  sed -i "s/^PREVIEW_AT=.*/PREVIEW_AT=200/" "$I/preview2/stack.conf"
  sed -i "s/^PREVIEW_AT=.*/PREVIEW_AT=100/" "$I/preview3/stack.conf"'
out="$(deploy preview 104 ccccccc)"; rc=$?
t_eq "preview 104 exits 0" 0 "$rc"
t_ok "104 takes preview3 from 103" bash -c 'grep -qx PREVIEW_EVICTED=103 <<< "$1" && grep -qx PREVIEW_URL=https://preview3.sellux.ch <<< "$1"' _ "$out"
t_ok "preview3 now holds 104" grep -qx PREVIEW_PR=104 <<< "$(conf preview3)"

# --- stage and release never touch a slot ---
reset_calls
deploy release ddddddd >/dev/null
t_ok "release moves acme" grep -qx 'add-stack.sh acme 3101 demo --images ddddddd' <<< "$(calls)"
t_eq "release leaves the slots alone" 0 "$(calls | grep -c 'preview')"
out="$(deploy status)"
t_ok "status lists the slots" bash -c 'grep -qE "^preview1 +PR #101 at bbbbbbb" <<< "$1" && grep -qE "^preview3 +PR #104" <<< "$1"' _ "$out"

# --- a stack that does not come up frees its slot ---
host_exec 'echo preview2 > "$(cat /tmp/box-path)/fail"'
deploy preview 102 eeeeeee >/dev/null; rc=$?
t_ok "a failed preview exits non-zero" test "$rc" -ne 0
t_ok "and leaves its slot empty" host_exec '! test -e "$(cat /tmp/box-path)/instances/preview2"'
host_exec ': > "$(cat /tmp/box-path)/fail"'

# --- too little disk: refused before anything changes ---
reset_calls
out="$(MIN_DISK=999999999 deploy preview 105 aaaaaaa)"; rc=$?
t_ok "too little disk is refused" bash -c '[ "$1" -ne 0 ] && grep -q "disk free" <<< "$2"' _ "$rc" "$out"
t_eq "nothing installed" 0 "$(calls | grep -c '^add-stack.sh')"

# --- unpreview ---
deploy unpreview 101 >/dev/null; rc=$?
t_eq "unpreview 101 exits 0" 0 "$rc"
t_ok "preview1 is empty again" host_exec '! test -e "$(cat /tmp/box-path)/instances/preview1"'
t_ok "status shows it free" grep -qE '^preview1 +free' <<< "$(deploy status)"
deploy unpreview 999 >/dev/null
t_eq "unpreview of a PR without a slot exits 0" 0 "$?"

# --- the preview key: previews and status only ---
SSH_CMD="release ddddddd" FLAGS=--previews-only deploy >/dev/null
t_eq "--previews-only refuses release (exit 2)" 2 "$?"
SSH_CMD="promote acme ddddddd" FLAGS=--previews-only deploy >/dev/null
t_eq "--previews-only refuses promote (exit 2)" 2 "$?"
out="$(SSH_CMD="preview 106 aaaaaaa" FLAGS=--previews-only deploy)"; rc=$?
t_ok "--previews-only may preview" bash -c '[ "$1" -eq 0 ] && grep -q "^PREVIEW_URL=" <<< "$2"' _ "$rc" "$out"
SSH_CMD="preview 106 aaaaaaa extra" deploy >/dev/null
t_eq "a preview with extra words is refused (exit 2)" 2 "$?"

t_done
