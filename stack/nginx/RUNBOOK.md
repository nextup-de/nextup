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

CI publishes `ghcr.io/selluxhenner/nextup-app` and `nextup-migrate` on every push to `main`
(`.github/workflows/images.yml`), tagged `main` and `sha-<7-char sha>`. Scripts take the plain sha and add the `sha-` prefix. On the box:

```bash
~/nextup/stack/nginx/deploy.sh deploy main       # every installed stack in ports.md
~/nextup/stack/nginx/deploy.sh deploy a16bc06    # pin (or roll back to) one commit
~/nextup/stack/nginx/deploy.sh status
```

`deploy.sh` runs `add-stack.sh ... --images TAG` for each stack. That rewrites only the two image
lines in the stack's `.env`, pulls the images and restarts. `migrate` applies new migrations
before the app starts. For one stack only: `add-stack.sh acme 3101 demo --images main`.
`--images local` goes back to images copied with `stack/push-images.sh`.

### Deploy from CI (restricted key)

The box hosts other sites, so the CI key never gets a shell. Put this one line in
`~/.ssh/authorized_keys` (the key's private half goes into a GitHub secret, nowhere else):

```
command="~/nextup/stack/nginx/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy
```

That key can then only run `ssh hetzner deploy <tag>` or `ssh hetzner status`. Everything else
is refused. Deploys are logged in `~/nextup/deploy.log`. The admin code and login codes never
reach the CI log.

## Backups

`stack/backup.sh` makes an encrypted restic snapshot per stack. Each snapshot holds the database
dump (`pg_dump -Fc`), the instance `.env` and, if the stack runs n8n, its data volume. Each stack
has its own repository and password: `RESTIC_REPOSITORY` and `RESTIC_PASSWORD` in its `.env`.
They're added on the first backup.

- **Cron (installed in `crontab -l` of the deploy user):**
  - 03:17 nightly `backup.sh all backup`
  - Sunday 04:47 `backup.sh all restore-test`
  - Both log to `~/nextup/backup.log`.
- **Retention:** 7 daily, 4 weekly and 6 monthly snapshots.
- **Target: local only for now** (`~/nextup/backups/<slug>`), Kevin's decision, 28 Sep 2026. The same
  disk isn't a real backup. For off-box, change `RESTIC_REPOSITORY` per stack (Storage Box
  `sftp:...`, or `s3:...`) and run `backup.sh <slug> backup`.
- **Copy each `RESTIC_PASSWORD` into the password manager.** Without it, no snapshot can be read.

```bash
export NEXTUP_INSTANCES=~/nextup/instances
~/nextup/stack/backup.sh acme backup
~/nextup/stack/backup.sh acme snapshots
~/nextup/stack/backup.sh acme restore-test          # throwaway container; the live stack is untouched
~/nextup/stack/backup.sh acme restore b4dd1a68      # REPLACES the live database (asks for the slug)
```

**Restore rehearsal (step 5 "done when"), 28 Sep 2026, acme:**
1. `backup.sh acme backup` created snapshot `b4dd1a68`.
2. `DROP DATABASE nextup WITH (FORCE)` on acme. `/login` then returned 500.
3. `backup.sh acme restore b4dd1a68`.
4. Afterwards: 5 users, company `acme`, 7 migrations. `/login` and `/api/health` returned 200 over https.

The actual restore takes about 10 s.

## automation.sellux.ch (n8n)

This n8n is for building and testing workflows (step 8), **with fake data only**. It isn't a
company stack: company stacks run their own n8n with `install.sh --n8n`. It lives in
`stack/automation/`, a compose project `nextup-automation` on `127.0.0.1:3141`.

There are two logins:
1. **nginx basic auth:** user `nextup`, with a generated password in
   `~/nextup/automation/basic-auth.txt`. nginx strips that header, so n8n never sees it.
2. **n8n's own accounts.** The first visitor past the basic auth creates the owner, so do that
   right after enabling the site.

```bash
~/nextup/stack/automation/automation.sh install        # first run: key, login, nginx site; prints the sudo lines
~/nextup/stack/automation/automation.sh ps | logs -f   # anything else goes to docker compose
~/nextup/stack/automation/automation.sh backup         # workflows + credentials (still encrypted) + volume
~/nextup/stack/automation/automation.sh restore-test   # fresh n8n imports them and decrypts the credentials
```

- **Keys to keep off the box:** `N8N_ENCRYPTION_KEY` and `RESTIC_PASSWORD` in
  `~/nextup/automation/.env` go into the password manager. Without the key, stored credentials
  can't be decrypted.
- **Cron:** backup at 03:18 nightly, restore test on Sundays at 04:48. Both log to `backup.log`.
- **First restore test, 28 Sep 2026:** 1 workflow (`ops/n8n/erp-knowledge-sync.json`, imported
  inactive) and 1 dummy credential restored; the credential decrypted.
- **Importing a workflow from `ops/n8n/`:** n8n 2.x needs an `id` in the JSON. The exported files
  in git should keep theirs.
- **Webhooks** are behind the basic auth too. A caller outside the box needs those credentials.
  Open individual `/webhook/` paths only on purpose.

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
| backup failed | `tail ~/nextup/backup.log`; `backup.sh <slug> snapshots` must list recent ones |
| box short on memory | `docker stats --no-stream`. The box has ~2 GB free; stop stacks you don't need |
