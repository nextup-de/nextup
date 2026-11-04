#!/usr/bin/env bash
# Proof for SEC-Z1 (D3, D4, D5): on a real-stage stack nobody holds a standing secret, and the
# break-glass window opens, is read-only for the app, and expires.
#
# On the Docker test host (stack/tests/README.md): the box agent runs against a fake admin that hands
# out create, credentials and restart for one stack; every result must carry "secrets":{} and no demo
# logins. Then stack/break-glass.sh opens a one-hour window; the app container sees window.json and
# cannot write it; with the clock two hours later the window is expired and logged, never with the code.
#   bash stack/tests/no-standing-access.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "SEC acceptance: no standing access and break-glass expires"
trap host_down EXIT

slug=secco
port=3161
inst="/home/deploy/nextup/instances/$slug"
bg="stack/break-glass.sh"
tab="$(printf '\t')"

host_up || { t_ok "the test host starts" false; t_done; exit 1; }
host_root 'docker rm -f registry >/dev/null 2>&1; true'
host_registry_up && host_fake_images || { t_ok "registry and fake images are ready" false; t_done; exit 1; }

# ── The fake admin: node:http on 127.0.0.1:3131, one job per poll, results recorded ───────────────
host_root 'rm -rf /tmp/fa; mkdir -p /tmp/fa/out; chmod 777 /tmp/fa/out
cat > /tmp/fa/server.js' <<'JS'
const http = require('node:http');
const fs = require('node:fs');
const common = 'ops_token=nxs_abcdefghijklmnopqrstuvwx\nname_b64=U2VjIENv\n';
const jobs = ['create', 'credentials', 'restart'].map(
  (a, i) => `id=job${a}000${i}\naction=${a}\nslug=secco\nport=3161\nstage=real\n${common}`,
);
http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = /^\/api\/provision\/jobs\/([a-z0-9]+)(\/progress)?$/.exec(req.url);
      if (req.method === 'GET' && req.url === '/api/provision/next') {
        const job = jobs.shift();
        if (!job) return res.writeHead(204).end();
        return res.writeHead(200, { 'Content-Type': 'text/plain' }).end(job);
      }
      if (req.method === 'POST' && m) {
        if (!m[2]) fs.writeFileSync(`/fa/out/${m[1]}.json`, body);
        return res.writeHead(200).end('{}');
      }
      res.writeHead(404).end();
    });
  })
  .listen(3131, '127.0.0.1', () => console.log('fake admin ready'));
JS
host_root 'docker run -d --name fakeadmin --network host -v /tmp/fa:/fa node:22.12.0-alpine3.20 node /fa/server.js >/dev/null'
t_ok "the fake admin is ready" _host_wait 30 'docker logs fakeadmin 2>&1 | grep -q "fake admin ready"'

# ── The agent: config, then one run per job ───────────────────────────────────────────────────────
host_exec 'mkdir -p "$NEXTUP_HOME/provision"
umask 077
printf "ADMIN_URL=http://127.0.0.1:3131\nPROVISION_TOKEN=npa_%s\nNEXTUP_IMAGES=aaaaaaa\nSITE_HELPER=none\nMIN_MEM_MB=1\nMIN_DISK_MB=1\n" "$(printf "x%.0s" $(seq 1 40))" > "$NEXTUP_HOME/provision/.env"'

agent() { host_exec "NEXTUP_REGISTRY=localhost:5000/nextup timeout 900 stack/provision/agent.sh"; }

for pair in create:0 credentials:1 restart:2; do
  action="${pair%%:*}"; id="job${action}000${pair##*:}"
  out="/tmp/fa/out/$id.json"
  t_ok "agent runs the $action job" agent
  t_ok "$action: the result is valid json" host_root "jq -e . $out"
  t_ok "$action: status is done or needs_nginx" host_root "jq -e '.status == \"done\" or .status == \"needs_nginx\"' $out"
  t_ok "$action: secrets is {}" host_root "jq -e '.secrets == {}' $out"
  t_ok "$action: no demo logins" host_root "jq -e '(.logins // []) == []' $out"
done

# None of the stack's own secrets appears anywhere in the three results.
t_ok "no stack secret in any result" host_root "for k in ADMIN_ACCESS_CODE POSTGRES_PASSWORD AUTH_SECRET N8N_ENCRYPTION_KEY; do
    v=\$(grep \"^\$k=\" $inst/.env | head -1 | cut -d= -f2-)
    [ -n \"\$v\" ] || { echo \"\$k missing in .env\"; exit 1; }
    ! grep -qF \"\$v\" /tmp/fa/out/*.json || { echo \"\$k leaked\"; exit 1; }
  done"
t_ok "no BREAK_GLASS.txt was written" host_root "test ! -e $inst/BREAK_GLASS.txt"

# ── The window ────────────────────────────────────────────────────────────────────────────────────
app="$(host_root "docker ps -q --filter label=com.docker.compose.project=nextup-$slug --filter label=com.docker.compose.service=app" | head -1 | tr -d '\r')"
t_ok "the app container is running" test -n "$app"

code="$(host_exec "$bg $slug open --hours 1 --reason 'SEC acceptance'" | tr -d '\r')"
t_ok "open prints a 24-hex code" grep -qE '^[0-9a-f]{24}$' <<<"$code"
t_ok "the app container sees window.json" host_root "docker exec $app test -s /run/nextup/break-glass/window.json"
t_ok "the app container reads a hash, not the code" host_root "docker exec $app sh -c 'grep -q codeSha256 /run/nextup/break-glass/window.json && ! grep -q $code /run/nextup/break-glass/window.json'"
t_ok "the app container cannot overwrite window.json" host_root "! docker exec $app sh -c ': > /run/nextup/break-glass/window.json'"
t_ok "the app container cannot add a file next to it" host_root "! docker exec $app sh -c 'touch /run/nextup/break-glass/extra'"
t_ok "window.json is unchanged and nothing was added" host_root "grep -q codeSha256 $inst/break-glass/window.json && test ! -e $inst/break-glass/extra"

status="$(host_exec "$bg $slug status" | tr -d '\r')"
t_ok "status says open until a time" grep -qE '^open until 20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$' <<<"$status"

later="$(host_exec "BREAK_GLASS_NOW=\$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ) $bg $slug status" | tr -d '\r')"
t_ok "two hours later the window is expired" grep -qE '^expired 20[0-9]{2}-' <<<"$later"

logtxt="$(host_exec "cat $inst/break-glass/log" | tr -d '\r')"
t_ok "the log has an open line" grep -q "${tab}open${tab}" <<<"$logtxt"
t_ok "the log has an expired line" grep -q "${tab}expired${tab}" <<<"$logtxt"
t_ok "the log does not contain the code" bash -c '! grep -qF "$1" <<<"$2"' _ "$code" "$logtxt"

t_done
