#!/usr/bin/env bash
# Proof for stack/deploy-remote.sh and stack/remote/host.sh: stack/tests/README.md.
#   bash stack/tests/deploy-remote.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS hands to: stack/deploy-remote.sh <host> <tag> over a forced command"
trap host_down EXIT

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1

# A stack whose backup, install and ctl only record their call: the real ones are OPS-Z1's proof.
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
echo "  Admin: https://opsrem.example/admin   code: 0123abcd"
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
mkdir -p /home/deploy/nextup/instances/opsrem
chown -R deploy:docker /home/deploy/nextup
SETUP
host_mirror aaaaaaa /opt/stubstack || exit 1
host_mirror bbbbbbb /opt/stubstack || exit 1
host_exec 'set -e
  printf "SLUG=opsrem\nNEXTUP_REGISTRY=localhost:5000/nextup\nNEXTUP_STACK_URL=file:///srv/mirror/{sha}.tar.gz\n" > ~/nextup/host.conf
  printf "APP_ORIGIN=https://opsrem.example\nNEXTUP_APP_IMAGE=localhost:5000/nextup/nextup-app:sha-0000000\n" > ~/nextup/instances/opsrem/.env' || exit 1
host_sshd_up /home/deploy/nextup/stack/remote/host.sh || exit 1

client=/opt/nextup-src/stack/deploy-remote.sh
ssh_cmd() { host_ci "ssh -i ~/.ssh/nextup-deploy -o BatchMode=yes deploy@127.0.0.1 $1"; }
rc_of() { "$@" >/dev/null 2>&1; echo $?; }

# The client checks its arguments before it connects: a stub ssh would leave a marker.
host_ci 'rm -f /tmp/ssh-called; mkdir -p /tmp/fakebin; printf "#!/bin/sh\ntouch /tmp/ssh-called\n" > /tmp/fakebin/ssh; chmod +x /tmp/fakebin/ssh'
for bad in abc AAAAAAA; do
  t_eq "client: '$bad' exits 2" 2 "$(rc_of host_ci "PATH=/tmp/fakebin:\$PATH $client deploy@127.0.0.1 $bad")"
done
t_eq "client: a missing argument exits 2" 2 "$(rc_of host_ci "PATH=/tmp/fakebin:\$PATH $client deploy@127.0.0.1")"
t_eq "client: a bad host exits 2" 2 "$(rc_of host_ci "PATH=/tmp/fakebin:\$PATH $client 'a b' aaaaaaa")"
t_ok "client: none of them connected" host_ci 'test ! -e /tmp/ssh-called'
t_ok "client: --help prints the usage" bash -c '[[ "$1" == *authorized_keys* ]]' _ "$(host_ci "$client --help" 2>&1)"

# The forced command takes release <sha> and status only.
for cmd in 'bash' 'release' 'release aaaaaaa x' 'deploy main' 'release AAAAAAA' 'status now'; do
  t_eq "ssh '$cmd' is refused with 2" 2 "$(rc_of ssh_cmd "'$cmd'")"
done
t_ok "nothing ran for the refused words" test -z "$(host_exec 'cat /tmp/calls')"

# A release.
out="$(host_ci "$client deploy@127.0.0.1 aaaaaaa" 2>&1)"; rc=$?
printf '%s\n' "$out" | sed 's/^/    | /'
t_eq "release aaaaaaa exits 0" 0 "$rc"
calls="$(host_exec 'cat /tmp/calls')"
b="$(printf '%s\n' "$calls" | grep -n '^backup.sh opsrem pre-migrate aaaaaaa$' | head -1 | cut -d: -f1)"
i="$(printf '%s\n' "$calls" | grep -n '^install.sh --slug opsrem --origin https://opsrem.example --stage real --images aaaaaaa$' | head -1 | cut -d: -f1)"
t_ok "backup.sh pre-migrate came before install.sh (lines ${b:-none} < ${i:-none})" test -n "$b" -a -n "$i" -a "${b:-9}" -lt "${i:-0}"
t_ok "stack.prev exists" host_exec 'test -d ~/nextup/stack.prev'
t_ok "stack.new is gone" host_exec 'test ! -e ~/nextup/stack.new'
t_eq "released ends with aaaaaaa" aaaaaaa "$(host_exec "tail -n 1 ~/nextup/released | cut -d' ' -f1")"
t_ok "the output has no 'code:'" bash -c '! grep -q "code:" <<< "$1"' _ "$out"
t_ok "the output has no login code" bash -c '! grep -q 0123abcd <<< "$1"' _ "$out"

# A failing backup changes nothing.
installs="$(host_exec 'grep -c "^install.sh" /tmp/calls')"
host_root 'echo 1 > /tmp/backup-rc'
host_exec 'touch ~/nextup/stack/MARKER'
out="$(host_ci "$client deploy@127.0.0.1 bbbbbbb" 2>&1)"; rc=$?
t_eq "release bbbbbbb with a failing backup exits 1" 1 "$rc"
t_ok "it says 'nothing changed'" bash -c '[[ "$1" == *"nothing changed"* ]]' _ "$out"
t_eq "no new install.sh call" "$installs" "$(host_exec 'grep -c "^install.sh" /tmp/calls')"
t_ok "the marker in stack/ is still there" host_exec 'test -e ~/nextup/stack/MARKER'
t_ok "stack.new is gone after the failure" host_exec 'test ! -e ~/nextup/stack.new'
t_eq "released still ends with aaaaaaa" aaaaaaa "$(host_exec "tail -n 1 ~/nextup/released | cut -d' ' -f1")"
host_root 'echo 0 > /tmp/backup-rc'

# An image CI never published changes nothing.
out="$(host_ci "$client deploy@127.0.0.1 ccccccc" 2>&1)"; rc=$?
t_eq "release ccccccc (no image) exits 1" 1 "$rc"
t_ok "it says 'nothing changed'" bash -c '[[ "$1" == *"nothing changed"* ]]' _ "$out"
t_ok "the marker is still there" host_exec 'test -e ~/nextup/stack/MARKER'

# A host without the stack's .env.
host_exec 'mv ~/nextup/instances/opsrem/.env ~/nextup/instances/opsrem/.env.away'
t_eq "release without .env exits 1" 1 "$(rc_of host_ci "$client deploy@127.0.0.1 aaaaaaa")"
host_exec 'mv ~/nextup/instances/opsrem/.env.away ~/nextup/instances/opsrem/.env'

# status
out="$(host_ci "$client deploy@127.0.0.1 status" 2>&1)"; rc=$?
t_eq "status exits 0" 0 "$rc"
t_ok "status names the slug" bash -c '[[ "$1" == *opsrem* ]]' _ "$out"
t_ok "status names the last released sha" bash -c '[[ "$1" == *"released: aaaaaaa"* ]]' _ "$out"
t_ok "status shows a service state" bash -c '[[ "$1" == *"app Up"* ]]' _ "$out"

# deploy.log: one line per step, each with a UTC time.
dlog="$(host_exec 'cat ~/nextup/deploy.log')"
for step in 'release aaaaaaa started' 'images pulled' 'fetched into' 'backup before the migrate done' \
            'now at aaaaaaa' 'install of opsrem at aaaaaaa done' 'release aaaaaaa done' 'no image nextup-app:sha-ccccccc'; do
  t_ok "deploy.log has a line with '$step'" bash -c 'grep -Eq "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+Z .*$2" <<< "$1"' _ "$dlog" "$step"
done

t_done
