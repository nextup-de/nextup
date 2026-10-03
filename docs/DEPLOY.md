# Running NextUp — laptop and the Hetzner box

> **Updated 2026-09-28** · reference for the laptop setup (root `compose.yml`). The "On the Hetzner box" part is superseded: company stacks now run from `stack/` (`stack/README.md`, `stack/nginx/RUNBOOK.md`, `docs/plans/2026-09-27_platform.md`).

One `compose.yml` serves both. Only `.env` differs.

> **Status:** the compose stack has **not been run end to end yet** — the environment this was
> built in cannot pull container images. `compose.yml` is validated, both shell scripts parse, and
> the Prisma layer is tested against a real Postgres, but the first `docker compose up` will be on
> your machine. Expect to iterate once.

## Services

| Service | What it is | Reachable at |
|---|---|---|
| `caddy` | TLS + routes by hostname | :80, :443 |
| `app` | Next.js, standalone build | `<slug>.<domain>`, apex, `admin.` |
| `db` | Postgres 17 | in-network only |
| `migrate` | one-shot `prisma migrate deploy` | — |
| `n8n` | workflows | `n8n.<domain>` |
| `mailpit` | catches all demo mail | `mail.<domain>` |

`migrate` runs before `app` starts (`service_completed_successfully`), so a deploy can never land
code ahead of its schema.

## On a laptop

```bash
cp .env.example .env          # defaults are already the laptop ones
docker compose up --build
```

Then open **http://acme.localhost**. Admin is **http://admin.localhost**, n8n
**http://n8n.localhost**, the mail inbox **http://mail.localhost**.

`*.localhost` resolves to 127.0.0.1 natively in **Chrome, Edge and Firefox** — no DNS, no
`/etc/hosts`. **Safari and `curl` do not.** For those:

```bash
curl --resolve acme.localhost:80:127.0.0.1 http://acme.localhost/
# or add to /etc/hosts:  127.0.0.1 acme.localhost admin.localhost n8n.localhost mail.localhost
```

## On the Hetzner box

**1. DNS at hosttech** — two records, and `serviweb.ch` itself is untouched:

```
A   nextup.serviweb.ch     ->  <VPS IP>
A   *.nextup.serviweb.ch   ->  <VPS IP>
```

**2. `.env` on the box:**

```ini
APP_DOMAIN=nextup.serviweb.ch
CADDYFILE=Caddyfile
PUBLIC_SCHEME=https
COOKIE_SECURE=true
TENANT_MODE=subdomain
POSTGRES_PASSWORD=<openssl rand -base64 24>
AUTH_SECRET=<openssl rand -base64 32>
ADMIN_ACCESS_CODE=<openssl rand -base64 24>
ACME_EMAIL=you@serviweb.ch
HOSTTECH_API_TOKEN=<from the hosttech control panel>
OPS_USER=ops
OPS_PASSWORD_HASH='<docker run --rm caddy:2 caddy hash-password --plaintext ...>'
```

`OPS_USER` / `OPS_PASSWORD_HASH` put a login in front of `n8n.<domain>` and `mail.<domain>`;
without them both hosts answer 401. Create the n8n owner account right after the first deploy -
behind that login nobody else can reach the setup screen first.

**3. Deploy:**

```bash
ssh <box> 'cd /srv/nextup && ops/deploy.sh'
```

### TLS

**`CADDYFILE=Caddyfile`.** One wildcard certificate for `*.nextup.serviweb.ch` via the DNS-01
challenge, using the `caddy-dns/hosttech` plugin baked into `ops/caddy/Dockerfile`. Needs
`HOSTTECH_API_TOKEN`. A company created in `/admin` is reachable over HTTPS immediately.
Let's Encrypt **cannot** issue a wildcard over HTTP-01, which is why the token is needed at all.

The on-demand variant (`Caddyfile.ondemand` + `/api/tls-check`) is gone (28 Sep 2026): it no
longer parsed on current `caddy:2`, and the endpoint told anyone which company names exist. Company
stacks (`stack/`, docs/plans/2026-09-27_platform.md) get their certificates from Caddy or nginx+certbot.

## The database

Inside the stack Postgres is not published to the host; `app` and `migrate` reach it by service
name. To get a shell:

```bash
docker compose exec db psql -U nextup -d nextup
```

Backups — `pgdata` is a named volume:

```bash
docker compose exec -T db pg_dump -U nextup nextup | gzip > backup-$(date +%F).sql.gz
```

## Tests

`npm test` is deliberately **database-free** so CI can run it with no Postgres. The DB-backed
suite is separate:

```bash
ops/test-db.sh                      # against localhost:5432, database nextup_test
DATABASE_URL=... ops/test-db.sh     # anywhere, as long as the name contains _test
```

It refuses to run against a database whose name does not contain `_test`, so a stray
`DATABASE_URL` cannot truncate the demo.

## Without Docker at all

The app runs with **no database**, against the built-in `acme` demo tenant — which is how CI
builds it:

```bash
npm install && npm run dev      # DATABASE_URL unset
```

## Just a database, app on the host

The middle path, and the quickest way to work on `/admin` or anything session-related: Postgres in
a container, the app on your machine.

```bash
docker compose up -d db
cp .env.example .env.local      # already points at 127.0.0.1:5432
npm run db:migrate              # create the tables
npm run db:seed                 # the acme demo company; prints each person's login code once
npm run dev                     # http://localhost:3000/acme
```

Both db scripts read `.env.local` themselves, so nothing needs exporting.

> **Use `127.0.0.1`, not `localhost`.** Node resolves `localhost` to `::1` first and Docker
> Desktop publishes the port on IPv4 only, so a `localhost` URL fails with *"Can't reach database
> server at `::1`"*. `.env.example` already has the right form.

For `/admin` you also need `AUTH_SECRET` and `ADMIN_ACCESS_CODE` set in `.env.local`.
