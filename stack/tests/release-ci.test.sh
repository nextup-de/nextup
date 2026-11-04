#!/usr/bin/env bash
# Proof for stack/remote/release-ci.sh and .github/workflows/release-customer.yml: stack/tests/README.md.
#   bash stack/tests/release-ci.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "SEC hands to: release-ci.sh releases a tag to a customer host"
trap host_down EXIT

# --- The workflow file (text checks; no runner needed) -------------------------------------------
wf=.github/workflows/release-customer.yml
t_ok "workflow: the file exists" test -f "$wf"
t_ok "workflow: triggers on workflow_dispatch" grep -Eq '^  workflow_dispatch:' "$wf"
t_ok "workflow: no push trigger" bash -c '! grep -Eq "^  push:" "$1"' _ "$wf"
t_ok "workflow: no pull_request trigger" bash -c '! grep -Eq "^  pull_request(_target)?:" "$1"' _ "$wf"
t_ok "workflow: no schedule, workflow_call or workflow_run trigger" bash -c '! grep -Eq "^  (schedule|workflow_call|workflow_run):" "$1"' _ "$wf"
t_ok "workflow: permissions contents read" bash -c 'grep -Eq "^permissions:" "$1" && grep -Eq "^  contents: read$" "$1"' _ "$wf"
t_ok "workflow: environment customer-<customer>" grep -Fq 'environment: customer-${{ inputs.customer }}' "$wf"
t_ok "workflow: concurrency per customer" grep -Fq 'group: release-customer-${{ inputs.customer }}' "$wf"
t_ok "workflow: calls release-ci.sh" grep -Eq 'run: bash stack/remote/release-ci\.sh$' "$wf"
t_ok "workflow: every action is pinned by a 40-char sha" bash -c '
  n=$(grep -Ec "^ *- uses: |^ *uses: " "$1"); [ "$n" -ge 1 ] &&
  [ "$n" -eq "$(grep -Ec "uses: [^@ ]+@[0-9a-f]{40}( |$)" "$1")" ]' _ "$wf"
t_ok "workflow: secrets only through env" bash -c '! grep -E "run:.*\\$\{\{" "$1"' _ "$wf"
for name in DEPLOY_TARGET HEALTH_URL DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS TAG; do
  t_ok "workflow: passes $name" grep -Eq "^ +$name: " "$wf"
done

# --- The script on the Docker test host ----------------------------------------------------------
host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1

# A stack whose backup, install and ctl only record their call (as deploy-remote.test.sh).
host_root 'bash -s' <<'SETUP' || exit 1
set -e
rm -rf /opt/stubstack
cp -a /opt/nextup-src/stack /opt/stubstack
cd /opt/stubstack
cat > backup.sh <<'EOS'
#!/usr/bin/env bash
echo "backup.sh $*" >> /tmp/calls
exit "$(cat /tmp/backup-rc 2>/dev/null || echo 0)"
EOS
cat > install.sh <<'EOS'
#!/usr/bin/env bash
echo "install.sh $*" >> /tmp/calls
echo "  Admin: https://cirel.example/admin   code: 0123abcd"
EOS
cat > ctl.sh <<'EOS'
#!/usr/bin/env bash
echo "ctl.sh $*" >> /tmp/calls
echo "  app Up 5 seconds"
EOS
chmod 755 backup.sh install.sh ctl.sh
chmod a+rX -R /opt/stubstack
: > /tmp/calls; echo 0 > /tmp/backup-rc; chmod 666 /tmp/calls /tmp/backup-rc
rm -rf /home/deploy/nextup/stack
cp -a /opt/stubstack /home/deploy/nextup/stack
mkdir -p /home/deploy/nextup/instances/cirel
chown -R deploy:docker /home/deploy/nextup
SETUP
host_mirror aaaaaaa /opt/stubstack || exit 1
host_mirror bbbbbbb /opt/stubstack || exit 1
host_exec 'set -e
  printf "SLUG=cirel\nNEXTUP_REGISTRY=localhost:5000/nextup\nNEXTUP_STACK_URL=file:///srv/mirror/{sha}.tar.gz\n" > ~/nextup/host.conf
  printf "APP_ORIGIN=https://cirel.example\nNEXTUP_APP_IMAGE=localhost:5000/nextup/nextup-app:sha-0000000\n" > ~/nextup/instances/cirel/.env' || exit 1
host_sshd_up /home/deploy/nextup/stack/remote/host.sh || exit 1

# A health endpoint inside the host: the fake app answers 200 on /api/health; port 8098 answers nothing.
host_root 'docker run -d --name health -p 127.0.0.1:8099:3000 localhost:5000/nextup/nextup-app:sha-aaaaaaa >/dev/null' || exit 1
_host_wait 30 'curl -fs http://127.0.0.1:8099/api/health' || { echo "health endpoint not answering" >&2; exit 1; }

script=/opt/nextup-src/stack/remote/release-ci.sh
good_env='export DEPLOY_TARGET=deploy@127.0.0.1 DEPLOY_SSH_KEY="$(cat ~/.ssh/nextup-deploy)" DEPLOY_KNOWN_HOSTS="$(cat ~/.ssh/known_hosts)" HEALTH_URL=http://127.0.0.1:8099/api/health TAG=aaaaaaa HEALTH_INTERVAL=1 HEALTH_TRIES=3'
# rel [<shell words run after the good environment, e.g. "TAG=bbbbbbb" or "unset HEALTH_URL">...]
rel() { local pre=""; for w in "$@"; do pre="$pre; $w"; done; host_ci "$good_env$pre; bash $script" 2>&1; }
rc_rel() { rel "$@" >/dev/null; echo $?; }
released() { host_exec "tail -n 1 ~/nextup/released | cut -d' ' -f1"; }
has() { [[ "$1" == *"$2"* ]]; }

# A release goes through the forced command, then status, then the health check.
out="$(rel)"; rc=$?
printf '%s\n' "$out" | sed 's/^/    | /'
t_eq "release aaaaaaa exits 0" 0 "$rc"
t_eq "the host's released list ends with aaaaaaa" aaaaaaa "$(released)"
t_ok "backup.sh pre-migrate ran" bash -c 'grep -q "^backup.sh cirel pre-migrate aaaaaaa$" <<< "$1"' _ "$(host_exec 'cat /tmp/calls')"
t_ok "status was read (released: aaaaaaa)" has "$out" "released: aaaaaaa"
t_ok "the health check passed" has "$out" "healthy"
t_ok "no login code in the output" bash -c '! grep -q 0123abcd <<< "$1"' _ "$out"
t_ok "the private key is not in the output" bash -c '! grep -Eq "BEGIN OPENSSH|PRIVATE KEY" <<< "$1"' _ "$out"

# Bad or missing settings: exit 2, the message names each one, nothing reaches the host.
before="$(host_exec 'wc -l < /tmp/calls')"
t_eq "a bad tag exits 2" 2 "$(rc_rel 'TAG=AAAAAAA')"
t_ok "it names TAG" has "$(rel 'TAG=main')" "TAG"
t_eq "a bad target exits 2" 2 "$(rc_rel 'DEPLOY_TARGET="a b"')"
t_ok "it names DEPLOY_TARGET" has "$(rel 'DEPLOY_TARGET="a b"')" "DEPLOY_TARGET"
t_eq "a missing HEALTH_URL exits 2" 2 "$(rc_rel 'unset HEALTH_URL')"
t_ok "it names HEALTH_URL" has "$(rel 'unset HEALTH_URL')" "HEALTH_URL"
t_eq "a missing key exits 2" 2 "$(rc_rel 'unset DEPLOY_SSH_KEY')"
t_ok "it names DEPLOY_SSH_KEY" has "$(rel 'unset DEPLOY_SSH_KEY')" "DEPLOY_SSH_KEY"
t_eq "missing known_hosts exits 2" 2 "$(rc_rel 'unset DEPLOY_KNOWN_HOSTS')"
t_ok "it names DEPLOY_KNOWN_HOSTS" has "$(rel 'unset DEPLOY_KNOWN_HOSTS')" "DEPLOY_KNOWN_HOSTS"
t_eq "a bad customer slug exits 2" 2 "$(rc_rel 'export CUSTOMER=Acme')"
multi="$(rel 'unset TAG' 'unset DEPLOY_TARGET')"
t_ok "two missing settings are both named" bash -c '[[ "$1" == *TAG* && "$1" == *DEPLOY_TARGET* ]]' _ "$multi"
t_ok "a bad key value is not echoed" bash -c '! grep -q "not-a-key-secret-xyz" <<< "$1"' _ "$(rel 'DEPLOY_SSH_KEY=not-a-key-secret-xyz')"
t_eq "none of them reached the host" "$before" "$(host_exec 'wc -l < /tmp/calls')"
t_eq "released is unchanged" aaaaaaa "$(released)"

# The key file: mode 600, in RUNNER_TEMP, gone afterwards. A stub deploy-remote.sh records what it sees.
host_ci 'set -e
  d=$(mktemp -d); echo "$d" > /tmp/stubci-dir
  mkdir -p "$d/stack/remote" "$d/runner"
  cp -a /opt/nextup-src/stack/remote/release-ci.sh "$d/stack/remote/"
  cat > "$d/stack/deploy-remote.sh" <<EOS
#!/usr/bin/env bash
echo "\$*" >> "$d/args"
stat -c "%a" "\$DEPLOY_SSH_KEY_FILE" >> "$d/keymode"
stat -c "%a" "\$DEPLOY_KNOWN_HOSTS_FILE" >> "$d/khmode"
stat -c "%a" "\$(dirname "\$DEPLOY_SSH_KEY_FILE")" >> "$d/dirmode"
echo "\$DEPLOY_SSH_KEY_FILE" > "$d/keypath"
cat "\$DEPLOY_SSH_KEY_FILE" > "$d/keycontent"
EOS
  chmod +x "$d/stack/deploy-remote.sh" "$d/stack/remote/release-ci.sh"' || exit 1
stub="$(host_ci 'cat /tmp/stubci-dir')"
out="$(host_ci "$good_env; export RUNNER_TEMP=$stub/runner; bash $stub/stack/remote/release-ci.sh" 2>&1)"; rc=$?
t_eq "stub: release-ci exits 0" 0 "$rc"
t_eq "stub: the key file had mode 600" 600 "$(host_ci "head -n 1 $stub/keymode")"
t_eq "stub: known_hosts had mode 600" 600 "$(host_ci "head -n 1 $stub/khmode")"
t_eq "stub: the temp folder had mode 700" 700 "$(host_ci "head -n 1 $stub/dirmode")"
t_ok "stub: the key lived under RUNNER_TEMP" bash -c '[[ "$1" == "$2"/runner/* ]]' _ "$(host_ci "cat $stub/keypath")" "$stub"
t_ok "stub: it held the key text" bash -c '[[ "$1" == *BEGIN* ]]' _ "$(host_ci "head -n 1 $stub/keycontent")"
t_ok "stub: the key file is gone afterwards" host_ci "test ! -e \"\$(cat $stub/keypath)\""
t_ok "stub: nothing is left in RUNNER_TEMP" host_ci "test -z \"\$(ls -A $stub/runner)\""
t_eq "stub: deploy-remote got the target and tag, then status" "deploy@127.0.0.1 aaaaaaa
deploy@127.0.0.1 status" "$(host_ci "cat $stub/args")"

# The health check fails: exit 1, the host's last lines are printed.
out="$(rel 'TAG=bbbbbbb' 'HEALTH_URL=http://127.0.0.1:8098/api/health' 'HEALTH_TRIES=2')"; rc=$?
t_eq "an unhealthy stack exits 1" 1 "$rc"
t_ok "it says so" has "$out" "health check did not answer"
t_ok "it prints the host's last lines" has "$out" "last 50 lines from the host"
t_ok "they hold the host's own output" has "$out" "now at bbbbbbb"
t_eq "the release itself did happen" bbbbbbb "$(released)"

# The release fails (backup): the host's output is shown, the exit code is the host's.
host_root 'echo 1 > /tmp/backup-rc'
out="$(rel 'TAG=aaaaaaa')"; rc=$?
t_eq "a failing release exits 1" 1 "$rc"
t_ok "it prints the host's last lines" has "$out" "last 50 lines from the host"
t_ok "they say 'nothing changed'" has "$out" "nothing changed"
t_eq "released is unchanged by the failure" bbbbbbb "$(released)"
host_root 'echo 0 > /tmp/backup-rc'

t_done
