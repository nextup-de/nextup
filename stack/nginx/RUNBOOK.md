# Runbook — NextUp stacks on the shared Hetzner box

Stage 1, step 3 of `docs/plans/2026-09-27_platform.md`. The box is `178.104.253.90` (`ssh hetzner`). It also
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
# stack files by hand (deploy.sh normally fetches them itself): the committed version, never the working tree
git archive HEAD stack | ssh hetzner 'cd ~/nextup && rm -rf stack && tar x'
```

## Add a stack

**Usually from admin.sellux.ch → Companies.** The box agent does the steps below itself and
stores the passwords in admin's vault; see `stack/provision/README.md`. By hand:

1. Add a row to `ports.md` and commit it.
2. On the server:
   ```bash
   ~/nextup/stack/nginx/add-stack.sh globex 3111 demo
   ```
   It writes `.env` with new secrets on the first run, starts the stack and waits until it's
   healthy. It prints the admin code, and on the demo stage the demo login codes: every demo
   stack is seeded with the demo people under its own slug (`--name "Initech GmbH"` sets the name).
3. The first time only, run the three `sudo` lines it prints (nginx site + certificate).
4. **Real stage:** open `https://<slug>.sellux.ch/admin` and create the company with the
   same slug.

Running `add-stack.sh` again restarts the stack. It keeps the secrets and picks up new images.

## Update to new images

CI publishes `ghcr.io/selluxhenner/nextup-app` and `nextup-migrate` on every push to `main`
(`.github/workflows/images.yml`), tagged `main` and `sha-<7-char sha>`. Scripts take the plain sha and add the `sha-` prefix. On the box:

```bash
~/nextup/stack/nginx/deploy.sh stage a16bc06      # staging gets the commit first
~/nextup/stack/nginx/deploy.sh release a16bc06    # then every other stack - only a staged sha
~/nextup/stack/nginx/deploy.sh status             # what runs where; the last staged and released sha
~/nextup/stack/nginx/deploy.sh deploy a16bc06     # by hand only: both tracks at once, no gate
```

A `release` does three things, in order:
1. **Pulls the commit's images.** A commit CI hasn't published changes nothing.
2. **Swaps in `~/nextup/stack`** from that commit's `stack/` folder on GitHub. The previous copy
   stays in `~/nextup/stack.prev`, so scripts and images always come from the same commit.
3. **Runs `add-stack.sh ... --images TAG` for each release-track stack,** then `automation.sh up -d` so compose
   changes reach n8n and the login page as well.

Each stack's `.env` keeps its old image lines until the new images are pulled. That rewrites only the two image
lines in the stack's `.env`, pulls the images and restarts. `migrate` applies new migrations
before the app starts. For one stack only: `add-stack.sh acme 3101 demo --images main`.
`--images local` goes back to images copied with `stack/push-images.sh`.

## Staging and the release track

`staging.sellux.ch` is a copy of acme (same demo company and people) that gets every green merge
first. Everyone else gets a commit only after it ran on staging, the smoke test passed on it and
Kevin approved it in GitHub. The same image moves on; nothing is rebuilt in between.

```
merge → CI → image sha-abc1234 → stage abc1234 (staging) → e2e:live on staging → Approve → release abc1234 (everyone else)
```

Which stack gets what is the **Track** column of `ports.md`:

| Track | Stacks | Moved by | Runs from |
|---|---|---|---|
| `main` | staging | `stage <sha>`, after every green merge | its own copy, `instances/staging/stack` |
| `release` | acme, globex, every stack started from admin | `release <sha>`, after Approve | the shared `~/nextup/stack` (= the released commit) |
| (pinned) | demo | `promote demo <sha>` only | its own copy, `instances/demo/stack` |

- **The gate is on the box as well.** `stage` writes each sha to `~/nextup/staged`, `release` to
  `~/nextup/released`. Once `staged` exists, `release` refuses a sha that is in neither list, and
  over ssh so does `promote`. Stopping staging does not switch the gate off.
- **One move at a time.** `stage`, `release`, `deploy` and `promote` wait for
  `~/nextup/deploy.lock` (up to 25 minutes), so two migrations never run side by side.
- **New companies from admin** get the last released sha (`NEXTUP_IMAGES=released`,
  `stack/provision/README.md`), never one that only reached staging.
- **Roll back:** release an older sha that was released before (GitHub: Actions → deploy → Run,
  `release`, the sha; it asks for approval too). `release` accepts it because it is in `released`.
  Staging alone: run `stage` with the older sha.
- **Change staging only with `stage`.** `add-stack.sh staging ...` would start it from the shared
  `~/nextup/stack` again, which is usually older.
- **Memory and disk:** staging and the others are often on different commits, so the box holds
  more images. `prune_images` keeps the two newest sha tags plus any a container uses.

### Install staging (once)

After this section's commit was released to the box:

```bash
free -m && df -h /                         # about 700 MB available; the agent wants 600, health.sh alerts below 400
# admin.sellux.ch → Stacks: issue a ticket token for "staging" (not "Register a stack that already runs")
mkdir -p ~/nextup/instances/staging
printf 'PORT=3161\nSTAGE=demo\nTRACK=main\n' > ~/nextup/instances/staging/stack.conf
sha=$(~/nextup/stack/nginx/deploy.sh status | sed -n 's/^released: *//p')   # or the sha acme runs now
NEXTUP_OPS_TOKEN=nxs_... ~/nextup/stack/nginx/add-stack.sh staging 3161 demo --images "$sha" \
  --name "Acme Maschinenbau GmbH (staging)" --ops-url https://admin.sellux.ch
# the three sudo lines it prints (nginx site + certificate), then onto its own copy:
~/nextup/stack/nginx/deploy.sh stage "$sha"
```

- If `released:` is empty, the release this section came with ran the old script: write the sha
  acme runs (`status`) into `~/nextup/released` by hand first (`echo "<sha> $(date -u +%FT%TZ)" >> ~/nextup/released`),
  or a rollback to it is refused later.
- Remove an explicit `NEXTUP_IMAGES=` from `~/nextup/provision/.env`, so the agent's new default
  (`released`) applies.
- Leave the LLM keys out of staging's `.env` unless a model call on every merge is fine.
- From a laptop: `INTERVIEW_URL=https://staging.sellux.ch npm run e2e:live`.

### Reset staging

The smoke test leaves an idea behind on every run. To start clean:
`~/nextup/stack/nginx/remove-stack.sh staging --purge`, then the install above again (keep its
`stack.conf`).

### Deploy from CI (restricted key)

The box hosts other sites, so the CI key never gets a shell. Put this one line in
`~/.ssh/authorized_keys` (the key's private half goes into a GitHub secret, nowhere else):

```
command="~/nextup/stack/nginx/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy
```

That key can then only run `ssh hetzner stage <sha>`, `ssh hetzner release <sha>`,
`ssh hetzner deploy <tag>`, `ssh hetzner promote <slug> <sha>` (a staged or released sha) or
`ssh hetzner status`, each with exactly its own arguments. Everything else is refused. Deploys
are logged in `~/nextup/deploy.log`. The admin code and login codes never reach the CI log.

## The interview stack (demo.sellux.ch)

`staging` gets every green merge, `acme` and `globex` every release. Both move without anyone
asking, which is right for building and wrong for showing. `demo.sellux.ch` is the stack to show: acme's demo
company and people, **pinned** to one commit. A deploy skips it.

```bash
# first install, and every later move - always a 7-char sha that CI has published, never `main`
~/nextup/stack/nginx/deploy.sh promote demo a16bc06 --name "Acme Maschinenbau GmbH"
~/nextup/stack/nginx/deploy.sh promote demo 4c952d9      # later: --name is only read the first time
~/nextup/stack/nginx/deploy.sh status                    # demo shows "(pinned)"
```

`promote` does this, in order:
1. **Pulls that commit's images.** A sha CI hasn't published changes nothing.
2. **Backs up the database** (`backup.sh demo backup`), once the nightly backup has set the stack up.
3. **Copies that commit's `stack/` into `~/nextup/instances/demo/stack`.** The pinned stack runs
   from this copy, so its compose file and Caddyfile are as old as its images. `ctl.sh demo ...`
   uses it too.
4. **Writes `PINNED=<sha>` into `~/nextup/instances/demo/stack.conf`** and restarts the stack.

The first install prints the admin code, the login codes and the three `sudo` lines for nginx and
the certificate. `nextup-site` refuses the slug `demo`, so those are run by hand.

- **From admin.sellux.ch:** the demo stack's **Version** card lists the released shas (and the one
  staging runs); **Install this version** does the `promote` below through the box agent and
  shows its log (`stack/provision/README.md`, "Picking the demo's version").
- **Before an interview:** promote the evening before, click through the script once on
  `demo.sellux.ch`, then leave it. Pick the `released:` sha from `status` (or the staged one, once
  it looks right on `staging.sellux.ch`).
- **Go back:** `promote demo <old sha>`; the last line of a promote and `~/nextup/deploy.log`
  name it. If a migration ran in between, the old code meets a newer database: also
  `backup.sh demo restore <snapshot>` (the one taken in step 2).
- **Change it only with `promote`.** `add-stack.sh demo ...` would start it from the shared
  `~/nextup/stack` again.
- **Any stack can be pinned** the same way. To put one back on its track, delete the `PINNED=`
  line from its `stack.conf`; the next `stage` or `release` moves it.
- **Memory:** one more stack is an app, a Postgres, a Caddy and a mailpit. Check `free -m` first
  (see "When something is wrong").

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
1. **The NextUp login page** (`stack/automation/gate/`, Node with no dependencies, on
   `127.0.0.1:3142`). nginx asks it about every request (`auth_request`) and sends visitors
   without a session to `/_gate/login`.
   - User `nextup`, password in `~/nextup/automation/login.txt`.
   - Sessions last 12 h (signed, HttpOnly, Secure cookie).
   - 10 failed attempts per IP lock the form for 15 min.
   - `automation.sh set-password` issues a new password and ends every session.
2. **n8n's own accounts.** The first visitor past the login page creates the owner, so do that
   right after enabling the site.

```bash
~/nextup/stack/automation/automation.sh install        # key, login, nginx site; prints the sudo lines if nginx needs updating
~/nextup/stack/automation/automation.sh set-password   # new login password
~/nextup/stack/automation/automation.sh ps | logs -f   # anything else goes to docker compose
~/nextup/stack/automation/automation.sh backup         # workflows + credentials (still encrypted) + volume
~/nextup/stack/automation/automation.sh restore-test   # fresh n8n imports them and decrypts the credentials
```

The nginx site is written from `stack/automation/nginx-https.conf`, or `nginx-http.conf` until a
certificate exists. For a new host, run `sudo certbot certonly --nginx -d <host>` first, then
`install` again.

- **Keys to keep off the box:** `N8N_ENCRYPTION_KEY` and `RESTIC_PASSWORD` in
  `~/nextup/automation/.env` go into the password manager. Without the key, stored credentials
  can't be decrypted.
- **Cron:** backup at 03:18 nightly, restore test on Sundays at 04:48. Both log to `backup.log`.
- **First restore test, 28 Sep 2026:** 1 workflow (`ops/n8n/erp-knowledge-sync.json`, imported
  inactive) and 1 dummy credential restored; the credential decrypted.
- **Importing a workflow from `ops/n8n/`:** n8n 2.x needs an `id` in the JSON. The exported files
  in git should keep theirs.
- **Webhooks** are behind the login page too, so nothing outside the box can call them. Open
  individual `/webhook/` paths in `nginx-https.conf` only on purpose.

## Health checks and alerts

`stack/health.sh` runs from cron every 5 minutes and pushes to Kevin's phone through
[ntfy](https://ntfy.sh). The topic is in `~/nextup/health.env` (mode 600); subscribe to it in the
ntfy app.

| Check | Fails when |
|---|---|
| web | a stack's `APP_ORIGIN/api/health`, automation's login page or a `HEALTH_URLS` entry isn't 200 |
| cert | an https certificate has 14 days or less left (checked hourly) |
| backup | no `<name>: backup done` in `backup.log` for 26 h, for each stack, automation and `BACKUP_NAMES` |
| restore-test | the latest weekly restore test of a name logged a failure |
| disk / memory | `/` is 85% full or more / less than 400 MB available |

- A check must fail **twice in a row** before it alerts, so a deploy doesn't page anyone.
- A recovered check sends one "Recovered" push. On Mondays at 08:00 UTC a summary arrives, so a
  silent week means the checks are still running.
- Alerts never contain secrets.
- If the box itself is down, nothing can push: an outside uptime check is still to do.

```bash
~/nextup/stack/health.sh --list      # state of every check now
~/nextup/stack/health.sh install     # once: health.env, cron, a test push (keeps an existing health.env)
tail ~/nextup/health.log             # every alert and recovery
```

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
| disk filling up | `docker system df`; container logs are capped at 3 x 10 MB (compose `x-logging`) |
| box short on memory | `docker stats --no-stream`. The box has ~2 GB free; stop stacks you don't need |
