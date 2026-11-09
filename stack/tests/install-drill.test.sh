#!/usr/bin/env bash
# Proof of the G4 install drill recorder: stack/tests/install-drill.sh on a clean Docker test host, answers piped in.
#   bash stack/tests/install-drill.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "G4 install drill"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1

drill="stack/tests/install-drill.sh --slug fresh --origin http://localhost:8080 --images aaaaaaa --registry localhost:5000/nextup"
host_exec "$drill" </dev/null >/dev/null 2>&1; rc=$?
t_ok "with no answers it still finishes and fails (no host.conf)" test "$rc" -eq 1
# Back to a clean machine: the stack, its .env, its local backup repository (a new install has a new RESTIC_PASSWORD).
host_exec "rm -f ~/nextup/install-drill-*.md; printf 'fresh\n' | stack/ctl.sh fresh down -v >/dev/null 2>&1; rm -rf ~/nextup/instances/fresh ~/nextup-backups/fresh"

host_exec "printf 'SLUG=fresh\n' > ~/nextup/host.conf"
# One answer line per prompt: 10 steps ask "done?" and then "fix?"; the install step asks only "fix?".
answers='m 3\n\n\n\n\n\n\n\ns\nharden.sh is not on the test host\n\n\n\n\n\n\n\ns\nno cron daemon on the test host\n\n\n'
out="$(host_exec "printf '$answers' | $drill" 2>&1)"; rc=$?
printf '%s\n' "$out" | tail -n 22 | sed 's/^/    | /'
t_eq "the drill exits 0" 0 "$rc"
t_ok "install-clean ran and passed" bash -c '[[ "$1" =~ install-clean.sh:\ install-clean\ fresh:\ [0-9]+\ passed,\ 0\ failed ]]' _ "$out"
t_ok "the VM step took the 3 minutes given" bash -c '[[ "$1" == *"| 1 | VM created, firewall attached |"*"| 3.0 | ok | - |"* ]]' _ "$out"
t_ok "the skipped step keeps its reason as a fix" bash -c '[[ "$1" == *"| 5 | Harden the VM |"*"| skipped | harden.sh is not on the test host |"* ]]' _ "$out"
t_ok "two manual fixes, no failed check, PASS with the findings note" \
  bash -c '[[ "$1" == *"checks failed: 0; manual fixes: 2"* && "$1" == *"Result: PASS - each manual fix is a finding"* ]]' _ "$out"
t_ok "the record file is there (in the directory it ran from)" host_exec "ls ~/nextup/install-drill-fresh-*.md"
t_ok "the admin code is in neither the output nor the record" \
  bash -c '! printf "%s" "$1" | grep -q "code:" && ! printf "%s" "$2" | grep -q "code:"' _ "$out" "$(host_exec 'cat ~/nextup/install-drill-fresh-*.md')"

t_done
