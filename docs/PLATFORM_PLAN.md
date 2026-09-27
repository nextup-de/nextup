# Platform plan — one stack per company

Status: **rev. 4, 28 Sep 2026.** Steps 1 and 2 of stage 1 are built: the monorepo, the landing
split, `TENANT_MODE=single` and `stack/`. Rev. 4 moves stage 1 onto the Hetzner server we already
have, instead of new servers from OpenTofu. New servers become a stage-2 trigger. This plan
replaces the "one app, many tenants" setup in `docs/DEPLOY.md` once step 4 of stage 1 passes.

## What this plan is for

Two goals, in this order:

1. **Learn to set up a real platform properly**: Docker, servers, DNS, TLS, infrastructure as
   code, CI, backups, security checks. It should be done in a way we can reuse for later projects.
2. **Lay a solid base for the real NextUp**, so that nothing built now has to be redone when the
   first customer with confidential data arrives.

That gives two stages:

- **Stage 1 — Foundation (now).** Demo data only, three developers, `sellux.ch`. We build the
  parts that are hard to add later and teach the most.
- **Stage 2 — First real customer (later).** We add the parts that only pay off with real
  customers, real data and real load. Each one has a trigger that says when it's time.

## Now vs. later

| Topic | Stage 1 — now | Stage 2 — when the trigger fires |
|---|---|---|
| Company isolation | One Docker stack per company. Demo stacks share **one** Hetzner server, the one we already run. | One server per company. *Trigger: first real customer.* |
| Repositories | **3:** `nextup`, `nextup-landing`, `nextup-infra`. Developer admin is a folder `apps/ops`. | Split `apps/ops` into `nextup-ops`. *Trigger: a 4th developer, or ops needs its own access rules.* |
| Servers | The existing Hetzner box (nginx + certbot, ~30 other sites). Stacks sit behind its nginx on loopback ports. Setup scripted and written down in `nextup-infra`. | Our own servers, created by OpenTofu and hardened by Ansible. *Trigger: first real customer, or the shared box no longer fits.* |
| Deploy | GitHub Action: SSH → `docker compose pull && up` | Agent in each stack pulls signed releases, rolls back on failure. *Trigger: first on-prem customer.* |
| Backups | Nightly encrypted backup + a restore test | Backups to storage the customer owns, weekly automatic restore test |
| Tickets | Bug icon + screenshot → stack + email to reporter → ops ticket board | GitHub link, AI triage, screenshot policy per company, ideas voting |
| AI | Existing provider interface: mock or Bedrock, inside the stack | Job queue, AI gateway, own AI server. *Trigger: usage numbers show the need.* |
| n8n | `n8n-dev` on the ops server; workflows in git | Fixture tests in CI, drift detection |
| Security | CodeQL, gitleaks, `npm audit`, Trivy in CI; stacks reachable only through nginx; 2FA on GitHub/Hetzner | Own servers with only 80/443 open and SSH over a VPN; ZAP scans, agent config checks, image signing, pentest, AI-fix bot |
| On-prem | Not yet — but the stack must install from `install.sh` alone | Offline bundle, install rehearsal on a locked-down server |

Rule for stage 1: **the shape is final, the size is small.** Every stage-1 part is built the way
stage 2 needs it: one stack per company, config through env, setup in scripts. Stage 2 adds
pieces; it does not replace them.

The stack does not care where it runs:
- on the shared box behind nginx
- on its own server with Caddy on 80/443
- on a customer's machine

Only the `install.sh` options differ.

## Decisions this plan is built on

1. **Every company gets its own stack**: its own app, database, n8n, backups and secrets. There
   is no shared multi-tenant deployment for customer data.
2. **The same stack runs on our servers or on the company's own server.** Only who owns the
   hardware differs.
3. **`sellux.ch` is the test domain.** Moving to the real domain is a config change.
4. **Three repositories now.** They're laid out so the developer admin can become a fourth repo
   later without a rewrite.
5. **`nextup-infra` is a general starter kit.** NextUp is one project in it, so later projects
   reuse the same setup. In stage 1 it holds the scripts and runbook for the existing box: one
   nginx site per stack, certificates, deploy. The OpenTofu server module joins it in stage 2,
   when we create our first own server.
6. **Custom ticket system:** a bug icon in the dashboard and the company admin, with an automatic
   screenshot.
7. **AI stays behind one interface,** so it can move to its own server later without code changes.
8. **Built toward confidential data.** Stage 1 gets the habits right (secrets, firewall, backups,
   scans). Stage 2 adds the controls a customer audit asks for.

## The picture

**Stage 1:**

```
  sellux.ch / www     ──▶ Vercel: nextup-landing

  acme.sellux.ch      ──▶ ┐
  globex.sellux.ch    ──▶ │  The existing Hetzner box (178.104.253.90)
  demo.sellux.ch      ──▶ │  nginx + certbot on 80/443 (also serves ~30 other sites)
  ops.sellux.ch       ──▶ ┘    │  one nginx site per host, TLS ends here
                               ▼
                          127.0.0.1:3101 ─▶ stack nextup-acme    (Caddy · app · db · mailpit)
                          127.0.0.1:3111 ─▶ stack nextup-globex  (Caddy · app · db)
                          127.0.0.1:3121 ─▶ stack nextup-demo    (reserved)
                          127.0.0.1:3131 ─▶ ops app + n8n-dev    (steps 7 and 8, next free block)

  ports: each stack owns ten, starting at its Caddy port P (acme 3101-3110, globex 3111-3120):
         P Caddy, P+1 mailpit, P+2 n8n, P+9 the unused 443 mapping
         (registry: stack/nginx/ports.md, later nextup-infra)
  every stack: its own compose project, network, volumes and secrets; only nginx is public
  deploys: GitHub Actions → SSH → stack/ctl.sh <slug> pull && up
```

**Stage 2** adds:
- our own servers from OpenTofu (what rev. 3 had as stage-1 step 3)
- then one server per real customer
- customer servers on-prem
- an agent in each stack that talks outbound to ops
- optionally an AI server

The stack itself stays the same.

## Repositories

| Repo | Contents | Deploys to |
|---|---|---|
| `nextup` (today's repo, restructured) | `apps/app` (dashboard + company admin), `apps/ops` (our developer admin + ticket board), `packages/*`, `stack/`, `n8n/` | Images on GHCR → stacks and ops server |
| `nextup-landing` | Marketing site (moved out of `src/app/(marketing)`) | Vercel |
| `nextup-infra` | Starter kit: scripts + runbook for the existing box now, OpenTofu/Ansible later; backup templates, reusable CI workflows; secrets in sops/age | Nothing; run by CI or an engineer |

### Layout of `nextup`

```
nextup/
  apps/
    app/          company dashboard + company admin (/admin inside each stack)
    ops/          our developer admin: companies, tickets, later releases + security
  packages/
    contracts/    zod schemas for everything that crosses app ↔ ops (tickets, heartbeats)
    tickets/      ticket model, redaction, screenshot handling
    ui/           shared components, incl. the bug-report widget
    ai/           provider interface (today's src/server/assist/provider.ts)
  stack/          compose.yml, Caddy config, backup, install.sh
  n8n/            workflows as JSON (today's ops/n8n)
  turbo.json      builds and tests only what changed
```

### Keeping `apps/ops` ready to move out

These rules cost almost nothing now and make the later split about a day of work:

- **No imports between apps.** A lint rule stops `apps/app` and `apps/ops` from importing each
  other. Shared code goes only through `packages/*`.
- **Separate databases.** Ops has its own. It never reads a stack's database.
- **Talk only through `packages/contracts`.** Ops and stacks talk only through HTTP messages
  defined there, and every message carries `contractVersion`.
- **Separate images and env.** Each app has its own Docker image and env file.

**When it's time to split:**
1. `git filter-repo` `apps/ops` into `nextup-ops`.
2. Publish `packages/*` as private `@nextup/*` packages.
3. Make ops accept contract versions N and N-1.

Those last two steps are the process overhead we are avoiding now.

### `nextup-infra` as a starter kit

```
nextup-infra/
  hosts/sellux-box/     stage 1: the existing server - RUNBOOK.md, an nginx site template per
                        stack, add-stack.sh / remove-stack.sh, a port registry (ports.md)
  templates/backup/     restic sidecar + restore-test script
  .github/workflows/    reusable: build image, scan, deploy-over-SSH
  projects/nextup/      NextUp's stacks, domains, secrets (sops)
  projects/<next>/      a later project reuses everything above
  modules/server/       stage 2: OpenTofu - Hetzner server + firewall + DNS record + volume
  ansible/base.yml      stage 2: hardening - updates, Docker, Tailscale, SSH off the internet
```

Until `nextup-infra` exists, the box-specific scripts live in `stack/` (for example
`stack/nginx/`). They move over in step 3.

## What changes in the app

| Change | Why |
|---|---|
| New `TENANT_MODE=single` + `COMPANY_SLUG=acme` | The stack serves one company at `/`. `path`/`subdomain` stay for local dev. |
| `APP_ORIGIN` replaces `APP_DOMAIN` + `PUBLIC_SCHEME` | Hosts become arbitrary (on-prem: `https://nextup.bigcorp.local`). |
| `Company` table stays, with one row | Schema and queries stay as they are. |
| `/admin` splits | **Company admin** stays in `apps/app`. **Cross-company** pages (companies, requests) move to `apps/ops`. |
| `src/app/(marketing)` moves out | Into `nextup-landing`. |
| Model calls only through `packages/ai` | So AI can move to its own server later. |

The demo keeps working: the `demo` stage becomes a stack of its own at `demo.sellux.ch`.

## One stack

```
caddy       the stack's own front door. On its own server: TLS on 80/443. On the shared box:
            plain http on a loopback port, with nginx in front doing TLS (install.sh --behind-proxy)
app         apps/app image, non-root, read-only filesystem
migrate     one-shot prisma migrate deploy before app
postgres    not published outside the stack's network
n8n         workflows from n8n/; UI only over Tailscale
backup      restic, nightly, encrypted
mailpit     demo stage only; otherwise the company's SMTP relay
agent       stage 2
```

`install.sh` generates every secret locally, writes `.env` and starts the stack. The same script
is used by our deploy and, later, by a company installing on its own server.

## Tickets

### Stage 1

- **Bug icon:** a small bug icon in a bottom corner of every page of the **dashboard** and the
  **company admin**, and in ops. It also opens with a keyboard shortcut.
- **The screenshot is taken first,** before the dialog opens, from the page itself
  (`modern-screenshot`), so there is no browser prompt. Password fields and anything marked
  `data-private` are blurred.
- **The dialog** asks:
  - *What happened?* (required) and *What did you expect?*
  - type (bug · idea · question) and impact (blocks me · annoying · cosmetic)
  - it shows the screenshot with a pen to black out areas, and a "leave screenshot out" switch
- **Captured automatically:** page, app version + commit, company, stage, role (not the name),
  browser, screen size, the last console errors and failed requests, and the last request ID.
- **Where it goes:**

  ```
  browser → app (stack): stores Ticket + screenshot, emails the reporter
                      → POST ops.sellux.ch/api/intake (per-stack token, HTTPS, outbound)
  ops: ticket board — list, filters, detail with screenshot + context, status, comments
  ```

- **The reporter gets:** ticket number `NU-123`, an email with their text and screenshot, and
  a "My reports" list in the app.
- **Developers:** work from the ops board. They change the status (new → in progress → fixed →
  closed) and reply. Replies marked "to reporter" appear in the app and go by email.
- **If ops is unreachable:** the stack retries later. The ticket is safe in the stack either way.

### Stage 2

- The agent takes over sending, so stacks without inbound access (on-prem) work too.
- A per-company setting decides whether screenshots leave the stack, read through `policyFor()`.
- GitHub link: "Create issue" (without the screenshot); `Fixes NU-123` in a PR sets it to fixed.
- AI triage (summary, steps to reproduce, duplicates), ideas voting, and screenshot retention
  (deleted 90 days after close).

### Data model (`packages/tickets`)

```
Ticket         id, number, stackId, kind, impact, status, title, description, expected,
               reporterRef, reporterRole, context (json), screenshotKey?, screenshotShared,
               aiSummary?, githubIssue?, fixedInVersion?, createdAt, closedAt
TicketComment  ticketId, author, toReporter, body, createdAt
TicketEvent    ticketId, kind, by, at
```

The stack's `reporterRef` is the user ID. Ops receives a pseudonym plus role. In stage 1 it also
receives the reporter's email so developers can reply, which is fine while everything is demo
data.

## AI

| Stage | Setup |
|---|---|
| 1 | `LLM_PROVIDER=mock` or `bedrock` (eu-central-1) inside each stack, through `packages/ai`. Ops logs tokens per stack from each ticket/heartbeat so we learn the real load. |
| 2 | Heavy work (document import, embeddings, triage) moves to a job queue with a worker (`ROLE=worker`, same image). `LLM_PROVIDER=gateway` + `AI_GATEWAY_URL` points at our AI server or the company's own. The gateway is stateless and keeps no prompt logs. |

## n8n

- **Stage 1:** `n8n-dev` on the shared box, on a loopback port, reached over an SSH tunnel
  (or Tailscale), with fake data only. It replaces the Cloudflare quick tunnel to the laptop.
  - The colleague builds there and exports to `nextup/n8n/`; a PR brings it into the stacks.
  - The existing rule stays: **the app answers, n8n acts**, through the events API, never
    Postgres.
- **Stage 2:** fixture tests in CI, a staging stack, and drift detection by the agent.

## Security

### Stage 1 — habits from day one

- **In CI on every PR:** CodeQL, gitleaks, `npm audit --omit=dev`, Trivy on images.
- **The shared box:**
  - stacks publish only on 127.0.0.1; nginx is the only way in
  - Caddy trusts nginx as a proxy, so rate limits see the real client address
  - automatic OS updates
  - **demo data only.** The box also runs ~30 other sites, so a hole in any of them sits right
    next to our stacks. No real customer data goes on it; that is what the stage-2 trigger is
    for.
- **Secrets:**
  - generated by `install.sh`, one set per stack
  - ours in sops in `nextup-infra`
  - never in git or chat
- **Accounts:** 2FA on GitHub, Hetzner, Vercel, AWS and the DNS provider.
- **Backups:** one real restore done and written down.
- **Carried over from the 24 Sep audit:**
  - old `uploads/` still in git history
  - `ADMIN_DEMO_FILL` leaking the admin code
  - n8n encryption key and backups
  - broken `Caddyfile.ondemand` (becomes obsolete)

### Stage 2 — what a customer audit asks for

| Threat | Control |
|---|---|
| Company A sees company B | One server per company; isolation test |
| A neighbour on a shared box is breached | Real customers only on servers we alone run, never the stage-1 shared box |
| Supply chain | Pinned digests, cosign signatures checked by the agent, SBOM |
| Stolen disk / backup | Encrypted volumes, backups with a key the company holds |
| Admin takeover | OIDC (Entra) + 2FA, short sessions, audit log |
| Our engineer reads customer data | No standing access; break-glass granted and logged by the company admin |
| Screenshot shows confidential data | Blur, black-out pen, company setting to keep screenshots in the stack |
| LLM leaks data | redact → gate → checkAnswer, provider per company, DPA date, `off` possible |
| Unpatched stack | Agent reports version; ops flags stacks behind |

Also in stage 2:
- a weekly OWASP ZAP scan
- a weekly Claude security review
- the AI-fix bot, which opens PRs only and never merges
- an external pentest before the first confidential customer

## Stage 1 — steps

Each step has a learning goal and a check that proves it works.

| # | Step | You learn | Done when |
|---|---|---|---|
| 1 | Restructure `nextup` into `apps/` + `packages/` (Turborepo); move marketing to `nextup-landing` | Monorepos, workspaces, Vercel projects | Both repos build in CI; the app behaves as before |
| 2 | `TENANT_MODE=single`, `APP_ORIGIN`, `stack/compose.yml` + `install.sh` | Docker Compose, env-driven config | The `acme` stack runs on a laptop from `stack/` alone |
| 3 | Stacks on the existing Hetzner box: `install.sh --behind-proxy`, one nginx site + certificate per stack, `sellux.ch` DNS records. Scripts and a runbook go in `nextup-infra`. | Reverse proxies, DNS, TLS with certbot, running several apps on one server | `acme.sellux.ch` and `globex.sellux.ch` answer over https; acme cannot reach globex's database; from outside, the stacks are reachable only through nginx; a stack can be removed and reinstalled from the runbook alone |
| 4 | Deploy `acme`, `globex`, `demo` stacks + ops app to that box via GitHub Actions; images on GHCR | CI/CD, container registries | A merge to `main` updates the stacks in minutes; the old Vercel demo is retired |
| 5 | Backups + a written restore test | Backups that actually work | A deleted `acme` database is restored from backup |
| 6 | Security checks in CI; fix the carried-over audit items | Supply-chain and secret scanning | All checks green on every repo |
| 7 | Tickets stage 1: bug icon, screenshot, stack storage, reporter email, ops board | Full-stack feature across two apps | A report from `acme` shows up in ops with its screenshot; a reply reaches the reporter |
| 8 | `n8n-dev` on the ops server; colleague ships one workflow via PR | Team workflow for non-core code | A workflow change reaches the stacks without anyone touching n8n by hand |

After step 8, NextUp runs the way it will run for customers, just smaller. `nextup-infra` is also
ready to reuse for the next project.

## Stage 2 — triggers

| Trigger | Then do |
|---|---|
| First real customer signs, or the shared box no longer fits | Our own servers from OpenTofu + Ansible in `nextup-infra` (`tofu destroy && tofu apply` rebuilds one; a port scan shows only 80/443). Then one server per company, screenshot policy, OIDC + 2FA for company admins, audit log. |
| First customer wants it on their own server | Agent (outbound, signed releases, rollback); offline bundle; install rehearsal on a locked-down server |
| First confidential data | Pentest; ZAP; break-glass access; customer-owned backups |
| 4th developer, or ops needs separate access | Split `apps/ops` into `nextup-ops` (see above) |
| AI usage numbers climb | Job queue + worker; AI gateway; own AI server if Bedrock doesn't fit |
| Security findings keep repeating | AI-fix bot on `ai-fixable` findings |
| Real domain chosen | Change `domain` in `nextup-infra`, re-point stacks one at a time |

## Open questions

1. **Real production domain:** only needed in stage 2.
2. **DNS provider for `sellux.ch`:** Hetzner DNS (everything in one place) or Cloudflare? In
   stage 1, adding a record per stack by hand is fine. An API matters once servers come from
   OpenTofu.
3. **Who else has root on the shared box?** Anyone with root there can read our stacks' `.env`
   files. That's fine for demo data, but worth writing down.
4. **Should company admins see every report from their company by default?**
5. **Kubernetes:** not planned. One compose stack per server is simpler to run, learn, audit and
   hand over.
