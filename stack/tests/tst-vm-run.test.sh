#!/usr/bin/env bash
# Proof TST-V1 B1: ops/tst/vm-run.sh against the Docker test host.
#   bash stack/tests/tst-vm-run.test.sh
#
# The test host is the "VM". An `ssh` shim first in PATH turns every ssh of the script into a docker
# exec on the host: the deploy key's call runs the forced command (stack/remote/host.sh), the admin
# login runs a shell, and `-L` becomes a real local listener that reaches the host's 127.0.0.1:5439.
# The generator is a stub (TST_GENERATOR) that talks to Postgres through that tunnel. An `npx` shim records
# what the scenario and the load driver are really given, and TST_K6_RUN records what the runner gets. These
# check the commands, not the product: the spec and k6 against a real stack are the VM run itself.
# No real server is ever reached.
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "TST vm-run"
trap 'host_down; [ -z "${work:-}" ] || { rm -f "$work"/bin/* "$work"/results/* "$work"/* 2>/dev/null; rmdir "$work"/bin "$work"/results "$work" 2>/dev/null; }' EXIT

work="$(mktemp -d)"; mkdir "$work/bin"
port=$((20000 + RANDOM % 20000))
slug=tstvm

host_up || { echo "host_up failed" >&2; exit 1; }
host_registry_up || exit 1
host_fake_images || exit 1
out="$(host_stack_up "$slug" aaaaaaa)"; rc=$?
[ "$rc" -eq 0 ] || { printf '%s\n' "$out" | tail -n 30 >&2; echo "host_stack_up failed" >&2; exit 1; }

# The VM's side of a release: host.conf and a mirror of this working tree's stack/ as the commit.
host_mirror bbbbbbb /opt/nextup-src/stack || exit 1
host_exec "printf 'SLUG=$slug\nNEXTUP_REGISTRY=localhost:5000/nextup\nNEXTUP_STACK_URL=file:///srv/mirror/{sha}.tar.gz\n' > ~/nextup/host.conf" || exit 1

# --- the ssh shim and the stubs ---------------------------------------------------------------
proxy_js="$(cygpath -m "$work/proxy.js" 2>/dev/null || echo "$work/proxy.js")"
cat > "$work/proxy.js" <<'JS'
// 127.0.0.1:<lport> -> <rhost>:<rport> inside the container, one `docker exec nc` per connection.
const net = require("net"), { spawn } = require("child_process");
const [lport, rhost, rport, container] = process.argv.slice(2);
net.createServer((c) => {
  const p = spawn("docker", ["exec", "-i", container, "nc", rhost, rport]);
  c.pipe(p.stdin); p.stdout.pipe(c);
  c.on("close", () => p.kill()); c.on("error", () => p.kill()); p.on("exit", () => c.destroy());
}).listen(Number(lport), "127.0.0.1");
JS
cat > "$work/bin/ssh" <<SHIM
#!/usr/bin/env bash
# test shim: every call is logged, then run in the container
echo "ssh \$*" >> "$work/ssh.log"
l="" key="" dest="" cmd=()
while [ \$# -gt 0 ]; do
  case "\$1" in
    -L) l="\$2"; shift 2 ;;
    -i) key="\$2"; shift 2 ;;
    -o|-p|-F|-J|-b|-c|-D|-E|-e|-I|-O|-R|-S|-W|-w|-l) shift 2 ;;
    -*) shift ;;
    *) if [ -z "\$dest" ]; then dest="\$1"; else cmd+=("\$1"); fi; shift ;;
  esac
done
if [ -n "\$l" ]; then
  IFS=: read -r lh lp rh rp <<< "\$l"
  exec node "$proxy_js" "\$lp" "\$rh" "\$rp" "$OPSTEST_HOST"
elif [ -n "\$key" ]; then
  exec docker exec -i -u deploy -w /home/deploy/nextup -e NEXTUP_HOME=/home/deploy/nextup \\
    -e SSH_ORIGINAL_COMMAND="\${cmd[*]}" "$OPSTEST_HOST" bash -lc /home/deploy/nextup/stack/remote/host.sh
else
  exec docker exec -i -u deploy -w /home/deploy -e NEXTUP_HOME=/home/deploy/nextup "$OPSTEST_HOST" bash -lc "\${cmd[*]}"
fi
SHIM
cat > "$work/gen.sh" <<STUB
#!/usr/bin/env bash
# the generator stub: records what it was given and talks to Postgres through the tunnel
echo "args \$*" >> "$work/gen.log"
echo "database \${DATABASE_URL##*@}" >> "$work/gen.log"
echo "auth_secret_set \$([ -n "\${AUTH_SECRET:-}" ] && echo yes || echo no)" >> "$work/gen.log"
while [ \$# -gt 0 ]; do [ "\$1" = --codes ] && codes="\$2"; shift; done
echo "codes_path \$codes" >> "$work/gen.log"
echo "codes_mode \$(stat -c %a "\$codes" 2>/dev/null || stat -f %Lp "\$codes")" >> "$work/gen.log"
echo "person.1@musterwerk.test	SECRETMARK123" > "\$codes"
exec 3<>/dev/tcp/127.0.0.1/$port || { echo "tunnel refused"; exit 1; }
printf '\x00\x00\x00\x08\x04\xd2\x16\x2f' >&3
IFS= read -r -n1 -t 20 ans <&3
echo "postgres_answer \$ans" >> "$work/gen.log"
case "\$ans" in N|S) ;; *) echo "no postgres behind the tunnel"; exit 1 ;; esac
echo "login codes written to \$codes (SECRETMARK123)"
STUB
cat > "$work/bin/npx" <<STUB
#!/usr/bin/env bash
# test shim: the scenario and the load driver, as vm-run really calls them
echo "npx \$*" >> "$work/npx.log"
echo "env base=\$TST_BASE_URL slug=\$TST_SLUG codes_filled=\$([ -s "\$TST_CODES_FILE" ] && echo yes || echo no)" >> "$work/npx.log"
if [ -f "$work/all-skipped" ]; then echo "  6 skipped"; else echo "  6 passed (1.0m)"; fi
while [ \$# -gt 0 ]; do
  [ "\$1" = --write-cookies ] && printf '{"accounts":[{},{},{}]}' > "\$2"
  shift
done
STUB
cat > "$work/k6.sh" <<STUB
#!/usr/bin/env bash
# the k6 stub: records what the runner gets and writes the summary it would write
echo "args \$*" >> "$work/k6.log"
echo "env base=\$BASE_URL vus=\$VUS duration=\$DURATION" >> "$work/k6.log"
echo "cookies_accounts \$(jq -r '.accounts | length' "\$1")" >> "$work/k6.log"
printf '{"metrics":{"http_req_duration{page:inbox}":{"p(95)":412.34,"p(99)":800},"http_req_duration{page:case}":{"p(95)":390,"p(99)":700},"http_req_failed":{"value":0}}}' > "\$TST_K6_SUMMARY"
STUB
chmod +x "$work/bin/ssh" "$work/bin/npx" "$work/gen.sh" "$work/k6.sh"

run() { PATH="$work/bin:$PATH" TST_GENERATOR="$work/gen.sh" TST_K6_RUN="$work/k6.sh" TST_LOCAL_PORT="$port" \
  TST_RESULTS_DIR="$work/results" DEPLOY_SSH_KEY_FILE="$work/no-key" "$@"; }
cli=ops/tst/vm-run.sh

# --- bad input: exit 2 and no ssh at all --------------------------------------------------------
: > "$work/ssh.log"
for bad in "a b bbbbbbb" "deploy@ bbbbbbb" "deploy@vm.test abc" "deploy@vm.test BBBBBBB" "deploy@vm.test bbbbbbb --people x" "deploy@vm.test bbbbbbb --nope"; do
  # shellcheck disable=SC2086
  run bash $cli $bad >/dev/null 2>&1; t_eq "'$bad' exits 2" 2 "$?"
done
run bash $cli >/dev/null 2>&1; t_eq "no arguments exits 2" 2 "$?"
t_ok "none of them connected" test ! -s "$work/ssh.log"

# --- the run ------------------------------------------------------------------------------------
auth="$(host_exec "sed -n 's/^AUTH_SECRET=//p' ~/nextup/instances/$slug/.env")"
pgpw="$(host_exec "sed -n 's/^POSTGRES_PASSWORD=//p' ~/nextup/instances/$slug/.env")"
out="$(run bash $cli deploy@vm.test:2222 bbbbbbb --skip-k6 --people 50 --weeks 2 2>&1)"; rc=$?
printf '%s\n' "$out" | sed 's/^/    | /'
t_eq "vm-run exits 0" 0 "$rc"
t_eq "it prints one status line per step (9)" 9 "$(printf '%s\n' "$out" | grep -c '^\[[0-9]/9\] ')"
t_ok "the first step is the release, the last two close and write" bash -c '
  l="$(printf "%s\n" "$1" | grep "^\[")"
  [[ "$(sed -n 1p <<< "$l")" == "[1/9] release bbbbbbb ... ok"* ]] && [[ "$(sed -n 8p <<< "$l")" == "[8/9] close"* ]] && [[ "$(sed -n 9p <<< "$l")" == "[9/9] write the results file ... ok"* ]]' _ "$out"
t_ok "k6 is reported as skipped" bash -c '[[ "$1" == *"k6 load run ... skipped"* ]]' _ "$out"
t_eq "the host is released at bbbbbbb" bbbbbbb "$(host_exec "tail -n 1 ~/nextup/released | cut -d' ' -f1")"

# the tunnel: loopback on both ends, nothing else
t_ok "ssh -L binds 127.0.0.1 and ends at the db's loopback port" \
  grep -q -- "-L 127.0.0.1:$port:127.0.0.1:5439" "$work/ssh.log"
t_ok "no ssh call binds another interface" bash -c '! grep -E -- "-L (0\.0\.0\.0|\*|:)|GatewayPorts" "$1"' _ "$work/ssh.log"
t_ok "the ssh port of the target is passed on" grep -q -- "-p 2222" "$work/ssh.log"
t_ok "the override publishes db on 127.0.0.1 only" bash -c '
  c="$(cat stack/tst/compose.tst.yml)"; [[ "$c" == *"\"127.0.0.1:5439:5432\""* ]]' _
t_ok "compose resolves the override to host_ip 127.0.0.1" host_exec "cd ~/nextup && docker compose -f stack/compose.yml -f stack/tst/compose.tst.yml --env-file instances/$slug/.env config | grep -A3 'ports:' | grep -q 'host_ip: 127.0.0.1'"
t_ok "the db port is closed again after the run" bash -c '! docker exec "$1" docker ps --format "{{.Names}} {{.Ports}}" | grep -E "db.*:5439->"' _ "$OPSTEST_HOST"

# the generator
t_ok "the generator got the slug, people, weeks and seed" grep -q -- "args --slug $slug --people 50 --weeks 2 --seed 1 --codes " "$work/gen.log"
t_ok "it may replace only an empty company or an earlier Musterwerk" grep -Eq -- "args .* --replace-generated$" "$work/gen.log"
t_ok "the plain --replace is never passed" bash -c '! grep -Eq -- "--replace( |$)" "$1"' _ "$work/gen.log"

# the scenario
t_ok "the scenario is the acceptance spec through the database config" \
  grep -q -- "^npx playwright test -c playwright.db.config.ts tests/e2e/db/musterwerk.spec.ts -g TST acceptance$" "$work/npx.log"
t_ok "the scenario gets the stack's address, its slug and the filled codes file" \
  grep -Eq "^env base=https?://[^ ]+ slug=$slug codes_filled=yes$" "$work/npx.log"
t_ok "its DATABASE_URL is the tunnel on 127.0.0.1:$port" grep -q "^database 127.0.0.1:$port/nextup$" "$work/gen.log"
t_ok "Postgres answered through the tunnel" grep -Eq '^postgres_answer [NS]$' "$work/gen.log"
t_ok "it had AUTH_SECRET" grep -q '^auth_secret_set yes$' "$work/gen.log"
t_ok "the codes file was mode 600" grep -q '^codes_mode 600$' "$work/gen.log"
codes_path="$(sed -n 's/^codes_path //p' "$work/gen.log")"
t_ok "the codes file is gone after the run" test ! -e "$codes_path"
t_ok "no secret file of vm-run is left in the temp dir" bash -c '! ls "${TMPDIR:-/tmp}"/tmp.*/auth_secret "${TMPDIR:-/tmp}"/tmp.*/pg_password 2>/dev/null | grep -q .'

# the restore test and the results file
f="$(ls "$work"/results/*.md 2>/dev/null | head -n 1)"
t_ok "a results file docs/test-phase/results/<date>.md is written (named <yyyy-mm-dd>.md)" bash -c '[[ "$(basename "$1")" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$ ]]' _ "$f"
secs="$(sed -n 's/.*restore-test took \*\*\([0-9][0-9]*\) s\*\*.*/\1/p' "$f")"
t_ok "it holds the restore seconds ($secs) and RTO_SECONDS 3600" bash -c '[ -n "$1" ] && grep -q "RTO_SECONDS is \*\*3600\*\*" "$2"' _ "$secs" "$f"
t_ok "it says the restore was within the RTO" grep -q 'within the RTO' "$f"
t_ok "it records the outcome PASS and the released sha" bash -c 'grep -q "Outcome: PASS" "$1" && grep -q "bbbbbbb" "$1"' _ "$f"
t_ok "it lists the versions (db image, node)" bash -c 'grep -q "db image: .postgres:17" "$1" && grep -q "node (this machine)" "$1"' _ "$f"
t_ok "the host's restore-test ran (backup.log / snapshot exists)" host_exec "stack/backup.sh $slug snapshots --json | jq -e 'length >= 1'"

# no secret anywhere the run wrote
for what in "$auth" "$pgpw" SECRETMARK123; do
  [ -n "$what" ] || { t_eq "secret value was read" set empty; continue; }
  t_ok "'${what:0:4}...' is in no output, results file or ssh log" bash -c '! printf "%s" "$1" | grep -qF -- "$2" && ! grep -rqF -- "$2" "$3" "$4"' _ "$out" "$what" "$f" "$work/ssh.log"
done

# --- a scenario that tested nothing is a failure -----------------------------------------------------
touch "$work/all-skipped"
out4="$(run bash $cli deploy@vm.test:2222 bbbbbbb --skip-k6 --people 50 --weeks 2 2>&1)"; rc=$?
rm -f "$work/all-skipped"
t_eq "a scenario where every test skips fails the run" 1 "$rc"
t_ok "it is step 5 that fails" bash -c '[[ "$1" == *"scenario spec against "*"... FAILED"* ]]' _ "$out4"

# --- the k6 step -----------------------------------------------------------------------------------
: > "$work/npx.log"
if command -v jq >/dev/null; then
  out3="$(run env TST_ACCOUNTS=20 TST_VUS=4 TST_K6_DURATION=10s bash $cli deploy@vm.test:2222 bbbbbbb --people 50 --weeks 2 2>&1)"; rc=$?
  printf '%s\n' "$out3" | sed 's/^/    | /'
  t_eq "a run with k6 exits 0" 0 "$rc"
  t_ok "the driver gets the slug, the address, one-company paths and the accounts" \
    grep -Eq -- "^npx tsx tests/load/driver.ts --slug $slug --base-url https?://[^ ]+ --single --accounts 20 --write-cookies " "$work/npx.log"
  t_ok "the runner gets the cookies file as its argument" grep -q "^cookies_accounts 3$" "$work/k6.log"
  t_ok "the runner gets the address, the virtual users and the duration" grep -Eq "^env base=https?://[^ ]+ vus=4 duration=10s$" "$work/k6.log"
  f3="$(ls "$work"/results/*.md | head -n 1)"
  t_ok "the results hold the p95 per page" grep -q '^| inbox | 412.3 | 800 |$' "$f3"
  t_ok "the results say how many accounts really ran" grep -q 'accounts: 3 of 20 asked for, virtual users: 4, duration: 10s' "$f3"
  t_ok "the cookies are gone after the run" bash -c '! ls "${TMPDIR:-/tmp}"/tmp.*/cookies 2>/dev/null | grep -q .'
else
  echo "    (no jq on this machine: the k6 step is not checked)"
fi
PATH="$work/bin:$PATH" bash $cli deploy@vm.test bbbbbbb --people x >/dev/null 2>&1
t_eq "a bad option still exits 2" 2 "$?"

# a failing step stops the run and the results say so
host_exec "sed -i 's/^SLUG=.*/SLUG=missing/' ~/nextup/host.conf"
out2="$(run bash $cli deploy@vm.test bbbbbbb --skip-k6 2>&1)"; rc=$?
t_eq "a run that cannot start exits 1" 1 "$rc"
t_ok "it reports the failed step" bash -c '[[ "$1" == *"... FAILED"* ]]' _ "$out2"

t_done
