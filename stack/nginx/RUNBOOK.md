# Runbook — NextUp stacks on the shared Hetzner box

Stage 1, step 3 of `docs/PLATFORM_PLAN.md`. The box is `178.104.253.90` (`ssh hetzner`). It also
runs about 30 other sites, so it holds **demo data only**. This folder moves to `nextup-infra` as
`hosts/sellux-box/` later.

## How it fits together

```
internet ──443──▶ nginx + certbot (host, shared with the other sites)
                    │  acme.sellux.ch   → 127.0.0.1:3101
                    │  globex.sellux.ch → 127.0.0.1:3111
                    ▼
             stack nextup-<slug>: caddy (:80, plain http) → app → db   (+ mailpit, n8n)
```

- **Each stack is its own compose project:** separate network, volumes and secrets. Only its Caddy
  is published, and only on the loopback.
- **The rest of the stack is internal:** Postgres, mailpit and n8n are never on a public port.
- **Client IPs:** nginx sets `X-Forwarded-For` to the client IP. Caddy trusts that hop
  (`TRUSTED_PROXIES=private_ranges`), so the app's rate limiter sees the real client.

## Where things are on the server

| Path | What |
|---|---|
| `~/nextup/stack/` | this repo's `stack/` folder, copied with `git archive` (no secrets) |
| `~/nextup/instances/<slug>/.env` | the stack's secrets, mode 600. **Never copy or commit.** |
| `~/nextup/nginx/nextup-<slug>` | generated nginx site, copied into `/etc/nginx` by hand |
| `/etc/nginx/sites-available/nextup-<slug>` | the live site; certbot adds the TLS part |

DNS: `*.sellux.ch` already points at the box (hostserv.eu nameservers). A new slug needs no DNS
change.

## Ship code and images (from the laptop)

```bash
# images: build and copy (until CI publishes to GHCR, step 4) - takes a few minutes
stack/push-images.sh hetzner --build
# stack files: the committed version, never the working tree
git archive HEAD stack | ssh hetzner 'cd ~/nextup && rm -rf stack && tar x'
```

## Add a stack

1. Add a row to `ports.md` and commit it.
2. On the server:
   ```bash
   ~/nextup/stack/nginx/add-stack.sh globex 3111 demo
   ```
   It writes `.env` with new secrets on the first run, starts the stack and waits until it's
   healthy. It prints the admin code, and for `acme` the demo login codes.
3. The first time only, run the three `sudo` lines it prints (nginx site + certificate).
4. **Non-acme slugs:** open `https://<slug>.sellux.ch/admin` and create the company with the
   same slug.

Running `add-stack.sh` again restarts the stack. It keeps the secrets and picks up new images.

## Update to new images

```bash
stack/push-images.sh hetzner --build                             # laptop
ssh hetzner '~/nextup/stack/nginx/add-stack.sh acme 3101 demo && ~/nextup/stack/nginx/add-stack.sh globex 3111 demo'
```

Each stack uses the port from its row in `ports.md`. The `migrate`
service applies new migrations before the app starts.

## Day to day

```bash
export NEXTUP_INSTANCES=~/nextup/instances
~/nextup/stack/ctl.sh acme ps
~/nextup/stack/ctl.sh acme logs -f app
ssh -L 3102:127.0.0.1:3102 hetzner       # then http://localhost:3102 = acme's mailpit
```

## Remove a stack

```bash
~/nextup/stack/nginx/remove-stack.sh globex            # stop; database and secrets stay
~/nextup/stack/nginx/remove-stack.sh globex --purge    # delete everything (asks for the slug)
```

Then run the `sudo` lines it prints, and delete the row from `ports.md`.

## Checks (step 3 "done when")

```bash
# 1. https answers
curl -sI https://acme.sellux.ch/api/health | head -1
curl -sI https://globex.sellux.ch/api/health | head -1
# 2. acme can't reach globex's database (different networks - must fail)
docker exec nextup-acme-app-1 node -e "require('net').connect(5432,'nextup-globex-db-1').on('error',e=>{console.log('blocked:',e.code);process.exit(0)}).on('connect',()=>{console.log('REACHABLE');process.exit(1)})"
# 3. from outside, only nginx: run from the laptop - every port must be closed/filtered
for p in 3101 3102 3111 3112 5432; do nc -zvw3 178.104.253.90 $p; done
# 4. remove + reinstall from this runbook alone
~/nextup/stack/nginx/remove-stack.sh globex --purge && ~/nextup/stack/nginx/add-stack.sh globex 3111 demo
```

## When something is wrong

| Symptom | Look at |
|---|---|
| 502 from nginx | the stack is down: `ctl.sh <slug> ps`, then `logs migrate app` |
| app never healthy | `ctl.sh <slug> logs migrate`: a failed migration stops the app on purpose |
| login loops / cookie not set | `APP_ORIGIN` in the `.env` must be `https://<slug>.sellux.ch` |
| everyone rate-limited together | nginx site lost `X-Forwarded-For $remote_addr`, or `TRUSTED_PROXIES` missing from the `.env` |
| box short on memory | `docker stats --no-stream`. The box has ~2 GB free; stop stacks you don't need |
