# stack/ — one company's NextUp

Every company gets its own stack: app, Postgres, Caddy, and optionally mailpit (demo stage) and
n8n. Two stacks on one machine share no network, volume or secret. See docs/PLATFORM_PLAN.md
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
| `n8n` | profile `n8n` (`--n8n`): editor on `127.0.0.1:5678`, own encryption key |

Not yet: backups (step 5), images from GHCR (step 4), an agent (stage 2).

## On-prem with the company's own certificate

Mount the certificate and replace the site block in `caddy/Caddyfile` with
`tls /certs/cert.pem /certs/key.pem`. Proper support for this comes with the on-prem rehearsal
(stage 2).
