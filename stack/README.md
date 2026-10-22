# stack/ — one company's NextUp

Every company gets its own stack: app, Postgres, Caddy, and optionally mailpit (demo stage) and
n8n. Two stacks on one machine share no network, volume or secret. See docs/plans/2026-09-27_platform.md
("One stack") for why.

## Install

```bash
# a demo stack on a laptop, images built from this repo
stack/install.sh --slug acme --origin http://localhost:8080 --stage demo --build

# a real company on a public server (Caddy gets a Let's Encrypt certificate)
stack/install.sh --slug globex --origin https://globex.sellux.ch --stage real
```

The first run writes `stack/instances/<slug>/.env` with freshly generated secrets: Postgres
password, `AUTH_SECRET`, admin code and n8n key. The folder is gitignored and never leaves the
machine. Later runs keep that file and only start the stack again. It prints the URL, the admin
code and, for the demo, everyone's login code.

### Behind an existing nginx (the shared Hetzner server)

When 80/443 already belong to nginx + certbot, the stack's Caddy serves plain http on a
loopback port and nginx terminates TLS. Give each stack its own block of ten ports:

```bash
stack/push-images.sh hetzner --build            # from the laptop, until CI publishes images
# on the server, in ~/nextup:
NEXTUP_INSTANCES=~/nextup/instances stack/install.sh --slug acme \
  --origin https://acme.sellux.ch --stage demo --behind-proxy 3101
stack/nginx/site.sh acme.sellux.ch 3101 | sudo tee /etc/nginx/sites-available/nextup-acme
sudo ln -s /etc/nginx/sites-available/nextup-acme /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d acme.sellux.ch
```

Mailpit is on `127.0.0.1:PORT+1` and n8n on `PORT+2`. Reach them with `ssh -L` (n8n's production
webhooks: "n8n webhooks from outside" below). Caddy trusts the
nginx hop (`TRUSTED_PROXIES=private_ranges`), so the app's rate limiter sees the client's IP.

| Stack | Port block |
|---|---|
| acme | 3101 |
| globex | 3111 |
| demo | 3121 |

`--stage real` starts with an empty database. Open `/admin` and create the company with the
same slug.

## Run

```bash
stack/ctl.sh acme ps
stack/ctl.sh acme logs -f app
stack/ctl.sh acme down        # stop; data stays
stack/ctl.sh acme down -v     # stop and delete the database (asks for the slug first)
```

## What is in a stack

| Service | Notes |
|---|---|
| `db` | Postgres 17, not published; only this stack's network reaches it |
| `migrate` | one-shot `prisma migrate deploy` (+ demo seed); `app` waits for it |
| `app` | `TENANT_MODE=single`, read-only filesystem, all capabilities dropped |
| `caddy` | the only published service. `SITE_ADDRESS=:80` for plain http, a host name for automatic https |
| `mailpit` | profile `demo`: catches all mail, inbox on `127.0.0.1:8025` |
| `n8n` | profile `n8n` (`--n8n`): editor on `127.0.0.1:5678`, own encryption key. Only its production webhooks can be reached from outside, and only with `N8N_WEBHOOKS=public` (below) |
| `app` env `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` | optional (`--entra-client-id ID`, secret in `NEXTUP_ENTRA_CLIENT_SECRET`): turns on "Continue with Microsoft". The company's tenant ID is set in `/admin`; add `<origin>/login/microsoft/callback` to the app registration |
| `brain` + `ollama` | profile `brain` (`--brain`): the routing AI and its model, no ports, app-only with `BRAIN_API_KEY`. See `services/brain/README.md`. On a server without 8 GB to spare, leave it out and point the stack at the AI server instead: `brain-server/README.md` |

## n8n webhooks from outside (Jira)

Jira's automation rules POST to an n8n Webhook node (`docs/INTEGRATIONS.md`, "Jira through n8n").
A stack's n8n is on the loopback, so its Caddy lets exactly one kind of request through to it, and
only once the stack's `.env` says so:

```ini
N8N_WEBHOOKS=public
```

- **What passes:** `POST /webhook/<letters, digits, - and _>` (more segments allowed, a query too),
  checked on the raw request line: no dots, `%`-escapes or double slashes. Jira then calls
  `https://<the stack's host>/webhook/jira-<slug>`.
- **What doesn't:** the editor, `/rest`, `/webhook-test/`, `/webhook-waiting/`, any other method.
  Those go to the app as before and get its 404. Without the line nothing reaches n8n.
- **Guard:** every *active* Webhook node is then open to the internet, so each needs
  authentication (Header Auth). The route strips the app's cookies, drops any cookie n8n sets
  and answers with `Content-Security-Policy: sandbox`, because it is the app's own host.
- **Self-check** (Node 22 and docker; runs the real Caddyfiles in `caddy:2`):
  `node --test stack/caddy/webhook.test.mjs`

**Hosts:** the app host of every stack whose `.env` has the line, on the shared box
(`<slug>.sellux.ch`, nginx passes the raw request line through unchanged) and on a server or
on-prem where the stack's Caddy has the certificate. `automation.sellux.ch` has its own exception
in its login page (`automation/gate/`), and the older `ops/` deployment one on `n8n.<domain>`
(`ops/caddy/Caddyfile`, same variable). Box steps: `nginx/RUNBOOK.md`, "n8n webhooks for a company
stack".

## Backups

```bash
stack/backup.sh acme backup          # encrypted restic snapshot: database, .env, n8n data
stack/backup.sh acme restore-test    # restore into a throwaway container and check it
stack/backup.sh acme restore ID      # replace the live database (asks for the slug)
```

The repository and password are per stack, in its `.env` (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD`).
Keep the password outside the machine as well. On the shared box, cron runs it nightly (see
`nginx/RUNBOOK.md`).

Not yet: an agent (stage 2).

## On-prem with the company's own certificate

Mount the certificate and replace the site block in `caddy/Caddyfile` with
`tls /certs/cert.pem /certs/key.pem`. Proper support for this comes with the on-prem rehearsal
(stage 2).
