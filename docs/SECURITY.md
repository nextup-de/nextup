# Security

> **Updated 2026-10-15** · reference: what protects each door, and the open list before real customers.

How NextUp keeps companies apart, what protects each door, and what has to land before
real customers depend on it. Read this before touching login, `/admin`, stages or the API.

## Demo data vs. real people

Every company has a `stage` (`src/features/admin/stages.ts`). The code is identical for all four;
what changes is what the stage **allows**. `policyFor(stage)` is the one place that decides, and
the server actions check it - hiding a button is only a courtesy.

| | `demo` | `sandbox` · `pilot` · `live` |
|---|---|---|
| Whose data | Ours - made-up people and cases | Theirs - real people, real cases |
| "View the demo as..." list on the login page (`LOGIN_DEMO_FILL`) | yes | **no** - never shown, `demoSignIn` refuses |
| How people log in | their personal code or Microsoft - or, on a demo box, the list above | their **personal code** or **Microsoft** only - the staff list never reaches the browser |
| Login codes shown on admin.sellux.ch ("Demo logins", `server/demo-logins-sync.ts`) | yes - on request the stack gives everyone a new code and sends them, so the team can test the real login | **no** - the stack never asks, never sends; admin refuses them too |
| Dev panel: switch person, +1 day, reset, delete added | yes (managers for the last three) | **no** - panel hidden, actions refuse |
| People sent to the browser | the whole company (the dev panel needs them) | the signed-in viewer only |
| Move back to `demo` | - | **refused** - create a separate demo company instead |

An unknown stage gets the real-people policy: fail closed. Creating a company in `/admin` asks
"Who logs in" - demo or real people (sandbox).

## Break-glass and support access

No NextUp person holds a standing key to a company's real data. Two ways in exist, and the customer opens both.

**Server break-glass window** (`stack/break-glass.sh`, `src/features/admin/break-glass.ts`). The customer's operator
runs `stack/break-glass.sh <slug> open --hours <1-24> --reason <text>` on their host (root or the deploy user). It
prints a fresh 24-character code once and writes `<instance>/break-glass/window.json` - only the code's sha256, the
times, who and why. The app mounts that folder read-only (`/run/nextup/break-glass`), so it can read the window and
cannot change it. `close` ends it, `status` prints `open until <ISO>`, `closed` or `expired <ISO>`, and every open,
close and expiry is a line in `break-glass/log` (never the code). A replaced window ends the sessions of the old one.

| | `demo` | `sandbox` · `pilot` · `live` (every stage but `demo`) |
|---|---|---|
| `ADMIN_ACCESS_CODE` | works as before, for the stack's own company | **never accepted** |
| Way into `/admin` for NextUp | the shared code, held by NextUp | only a code from an open window, and only until `until`; each request of that session re-reads the window, so close, expiry or a new window refuses it |
| What the box agent sends to admin.sellux.ch | the stack's passwords and demo login codes, as today | **nothing**: the job result carries `"secrets":{}` and no logins (`stack/provision/agent.sh`); a leftover `BREAK_GLASS.txt` is no longer used |
| Record | - | `audit.access.break_glass` with the end time; a refused code writes no row |

**Support access granted by the company** (Settings -> Support access, `/[company]/settings/support-access`). A
company admin grants NextUp support 1, 4, 24 or 72 hours with a reason, and gets a 12-character support code shown
once to pass on. *Extend* moves the end by the chosen duration, never beyond 72 hours from now; *End now* revokes.
Grant, extend, revoke and every support sign-in are `audit.access.*` rows and form the page's log. The page also
shows the server window above, read only. Demo companies see only a line that NextUp works in them directly.

Key rotation: `stack/rotate-keys.sh` rotates `AUTH_SECRET`, the connector vault key and the restic password on the
host and logs the key name, never the value; the app opens old sealed values with `CONNECTOR_VAULT_KEY_PREVIOUS`
and re-seals every stored secret with the new key. See `docs/customer/OPERATIONS.md`.

## Claims

What may be said publicly about a non-demo company (PILOT D16): only what runs on `main`. "Holds since SEC" is
tested; "still planned" must not be claimed. The landing's security and privacy pages (`nextup-landing`, a separate
repo) are not in this checkout and were not read for this table: check each line against it before the landing says it.

| Claim | State | Where it holds |
|---|---|---|
| NextUp staff have no standing access to real customer data | holds since SEC | `stack/tests/no-standing-access.test.sh` |
| Break-glass is time-limited, opened by the customer, logged and cannot be written by the app | holds since SEC | `stack/break-glass.sh`, `stack/tests/break-glass-window.test.sh`, `no-standing-access.test.sh` |
| The shared admin code does not work on a real stage | holds since SEC | `src/features/admin/break-glass.ts` |
| Customers grant, extend and end support access and see a log | holds since SEC | Settings -> Support access |
| Secrets of a real stack are not copied to NextUp's vault | holds since SEC | `stack/provision/agent.sh` (`secrets_to_send`) |
| Keys can be rotated: `AUTH_SECRET`, vault key, backup password | holds since SEC | `stack/rotate-keys.sh`, `vault-keys.test.ts` |
| Connection tokens are sealed with AES-256-GCM | holds | `src/features/connectors/vault.ts` |
| Dependency audit, image scan (Trivy) and an OWASP ZAP baseline scan of the demo app run in CI | holds since SEC | `.github/workflows/ci.yml` (`zap` is a passive scan of the demo app, not of a customer stack) |
| Sign-in with Microsoft (OIDC), SAML and SCIM provisioning | holds since EID | `docs/IDENTITY.md` |
| Audit log of admin and console changes, 24 months, CSV; export to syslog or a JSON file | holds | `docs/PRIVACY.md`, EID log export |
| DPA template, TOMs, record of processing, DPIA, works-agreement template, VDA ISA self-assessment | holds since SEC (templates, not signed contracts) | `docs/compliance/` |
| A penetration test by an outside firm | still planned, before `live` | - |
| Two-factor sign-in for the company admin console `/admin` | still planned | - |
| Disk encryption of the servers | still planned (INF) | G-224 |
| Rate limits shared across processes | still planned | G-225 |
| Encrypted backups with a retention rule | still planned | `docs/PRIVACY.md` |

## Doors and their locks

| Door | Lock | Brake (`src/server/throttle.ts`) |
|---|---|---|
| `/[company]/login` | personal login code per person (~59 bits, sha256 stored, `src/features/auth/login-code.ts`) - the code alone says who you are | 10 tries / 10 min per address+company; 200 / 10 min per company |
| `/[company]/login/microsoft` | Entra ID OpenID Connect, code flow + PKCE, state + nonce in a signed 10-min cookie; token's `tid` must equal the company's tenant; person matched by `oid` (bound on first sign-in by email) - `src/features/auth/entra.ts` | Microsoft's own |
| `/admin/login` | `demo`: `ADMIN_ACCESS_CODE`, constant-time compare; any other stage: only a code from an open break-glass window (see above) | 5 tries / 15 min per address |
| `/contact` | honeypot + server-side validation | 5 / hour per address |
| `/api/[company]/events` | bearer token (sha256 hash stored), scoped to one company | - (token is 192 bits) |
| `/api/client-errors` | public on purpose (a crash on the login page must report too): `Sec-Fetch-Site: same-origin` or `Origin` = `APP_ORIGIN`, 8 KB, zod-validated; message scrubbed and route made a pattern before it is kept (`src/features/errors`); no cookie, session or address stored | 30 / 10 min per address, then silently 204 |
| Every server action | re-checks the session for the slug; never trusts the client for actor or company | - |
| Every page that loads its own data | `guardPage` (`src/server/page-guard.ts`) re-checks the session and the role - the `(app)` layout's check does not keep a page's output out of the response, and the proxy is routing, not a boundary | - |
| Case and idea events | `mayAppend` (`src/features/cases/permissions.ts`): only whoever holds a case (or a manager) decides, hands or asks; only the raiser answers; only managers re-route or move the clock; no re-raising an existing id | - |
| Discussions | `mayAppend`: only whoever holds the case (or a manager) starts one, invites or checks in; past the company's last round only a manager adds one; only the raiser revises, and only before the decision. Behind the `discussion` flag (`appendEventAction`) | - |
| Projects | `mayAppendProject` (`src/features/projects/permissions.ts`): a yes opens a project only as the case's first decision; the lead (or a manager) runs it - baseline before the start, measures only once a check opens; the team adds steps, a step's owner or the lead moves it; only a manager records a reward, only an author claims it. Behind the `projects` flag | - |
| `n8n.<domain>`, `mail.<domain>` | Caddy `basic_auth` from `OPS_USER` / `OPS_PASSWORD_HASH`; unset = 401 for everyone. With `N8N_WEBHOOKS=public`, `POST /webhook/<letters, digits, - and _>` on `n8n.<domain>` skips it (raw request line, `ops/caddy/Caddyfile`) | - |
| A company stack's n8n (`stack/`) | loopback only. With `N8N_WEBHOOKS=public` in the stack's `.env`, its Caddy passes `POST /webhook/<letters, digits, - and _>` on the app's host to n8n, without the app's cookies and with `Content-Security-Policy: sandbox` (`stack/caddy/Caddyfile`). Each active Webhook node: Header Auth | - |

Sessions are HMAC-signed cookies (`src/features/auth/cookie.ts`), `HttpOnly`, `SameSite=Lax`, and
`Secure` whenever `COOKIE_SECURE=true` **or** `PUBLIC_SCHEME=https`. Post-login redirects only go
to same-site paths (`safeNextPath`). `next.config.ts` sends a strict CSP, `frame-ancestors 'none'`,
HSTS, `nosniff` and a referrer policy.

The brakes count an IPv6 address by its /64 (`clientAddress`), so one line cannot rotate through
fresh addresses. On a box served over https the `change-me` placeholder from `.env.example` opens
nothing: not `/admin` as `ADMIN_ACCESS_CODE`, and as `AUTH_SECRET` it neither signs a cookie nor
is a cookie signed with it accepted - by the proxy, `getViewer()` or `isAdmin()` (`usableSecret`,
`src/features/admin/environment.ts`). Over plain http - a laptop - it still works. The proxy skips
static files by their extension, not every path with a dot, so a person's page
(`/acme/people/T.%20Vogel`) meets the login check like any other.

## Before the first real customer

1. ~~**Per-person login.**~~ Done: a personal login code per person (issued and replaced in
   `/admin` -> Companies -> People & sign-in) and "Continue with Microsoft" per company. The shared
   company code opens nothing any more (`Company.accessCodeHash` is kept, nullable, until old
   rows are gone). Still open: team leaders issuing codes themselves instead of the admin, and an
   Entra app registration for the production box. A stack takes it with `stack/install.sh
   --entra-client-id` + `NEXTUP_ENTRA_CLIENT_SECRET`; the ID token signature is verified against the
   tenant's published keys (`docs/plans/2026-10-22_sso-and-data-access.md`, phase 1). The customer's IT
   assigns the Entra app roles `NextUp.Manager` / `NextUp.Leader` / `NextUp.Member`; the `roles` claim
   sets the role at every Microsoft sign-in (the most powerful wins) and is the only thing that creates
   a person on first sign-in. No role claim: a known person keeps the stored role, a new one is refused.
2. ~~**Session revocation.**~~ Done: `getViewerFor` checks every session against the database
   (same company id, the person still exists with the same role, `Company.sessionEpoch`
   unchanged - a stage move bumps it, so demo sessions end when real people move in - and no
   login code issued since the cookie was signed, `User.loginCodeAt`). Issuing someone a new code
   ends every session they had, Microsoft ones included; "New demo codes" ends a demo's sessions.
   Offboarding is deleting the person.
3. **Admin as people, not a shared code.** One `ADMIN_ACCESS_CODE` for everyone means no audit of
   who did what. Named admin users (magic link or SSO) plus 2FA. Started: on a company stack, a
   Microsoft account with the Entra app role `NextUp.Admin` opens `/admin`; the cookie carries who
   (shown in the header, logged at sign-in) and the break-glass use is logged. The shared code is off on every stage but `demo`. Still open:
   2FA of our own, naming the admin on each action (item 4), and
   the platform admin on admin.sellux.ch. Customer setup: `docs/customer/ENTRA_SETUP.md`.
4. ~~**Audit log for admin actions.**~~ Done (GDP): every admin, console and system change to a company is written to an append-only
   `AuditEvent` in the same transaction, readable by company admins in Settings → Audit log and as CSV, kept 24 months.
   See [PRIVACY.md](PRIVACY.md).
4b. **Microsoft 365 connections** (phase 2 of `docs/plans/2026-10-22_sso-and-data-access.md`). A
   person's refresh token for their own files (`Files.Read.All` + `offline_access`, nothing else)
   is stored sealed: AES-256-GCM with `CONNECTOR_VAULT_KEY`, bound to company and person, so a
   database dump or a token copied into another row opens nothing. Off per company until its
   admin turns it on; the Microsoft account must be the signed-in person's own; disconnecting
   deletes the row, and "disconnect everyone" is one click in `/admin/assistant`. Losing the key
   disconnects everyone - back it up with the other stack secrets.
5. **Shared rate-limit store.** The throttle counts in process memory: right for one Hetzner box,
   per-instance on Vercel. Move the `Map` to a Postgres table when there is more than one process.
6. **Role-scoped data.** The whole case log goes to every signed-in browser; roles only choose
   which pages show it. If members must not see something, filter it on the server.
7. **GDPR basics** - Done (GDP): data export (company and person, JSON, 7 days), person pseudonymisation (structured
   identity only; authored free text may keep a name), deletion per company, and retention rules with a daily run; see
   [PRIVACY.md](PRIVACY.md). Still open: a processing record, a DPA with each customer, backup encryption and backup retention.

## Ongoing

- **In CI:**
  - `npm audit --omit=dev --audit-level=high` fails a PR on high or critical findings. On 28 Sep
    2026 there were none. The old findings in Prisma's CLI tooling (`mysql2`, `deepmerge-ts`) are
    pinned away by `overrides` in the root `package.json`.
  - Dependabot opens weekly update PRs.
  - Trivy scans the app image before it's pushed. A fixable HIGH/CRITICAL finding stops the
    release.
- **Demo shortcuts:** `LOGIN_DEMO_FILL` only on demo stages, `ADMIN_DEMO_FILL` only on demo boxes,
  demo login codes to admin.sellux.ch only from a demo-stage company (`policyFor(stage).shareDemoCodes`;
  the stage is checked again in the transaction that replaces the codes). The static demo
  (demo.sellux.ch) has no login at all.
  `/admin/connections` flags both. Company stacks (`stack/`) never pass `ADMIN_DEMO_FILL` at all.
- Anything published by Docker on a laptop binds to `127.0.0.1`, never all interfaces.
- A pentest by an outside firm before `live` (still planned). A ZAP baseline scan of the demo app runs in CI and fails on a High alert
  that `.zap/ignore.json` does not cover.

## Checked and closed

- **`uploads/` in the git history** (24 Sep audit; commits `e8c110b`..`d8ebf99`, public repo).
  Deleted from the tree on 14 Sep, still in history. Checked on 28 Sep 2026:
  - Two phone screenshots of Pinterest/Dribbble design inspiration, one of them committed twice.
  - A hand-drawn concept diagram.
  - A Miro stock template.
  - A whiteboard photo from a brainstorm.
  - `skunk-works-model.md`.

  **No personal data:** no people, faces, names or customer screens. The only business detail is
  one company named on the whiteboard as a possible target customer. It isn't repeated here on
  purpose, and it appears nowhere else in the repo. Decision (Kevin): **no history rewrite.** A rewrite would change every commit
  hash, force re-clones and need GitHub support to purge caches, for one name on a whiteboard photo
  that has been public since 10 Sep. `uploads/` is gitignored, and CI's guard blocks images under it, so it can't
  happen again.
- **On-demand TLS** (`ops/caddy/Caddyfile.ondemand`, `/api/tls-check`): removed in #90. The
  endpoint told anyone which companies exist.
- **n8n encryption key:** each company stack generates its own (`stack/install.sh`), and backups
  include it (`stack/backup.sh`, #87).
- **Login audit, 11 Oct 2026.** Each hole reproduced against a production build, then closed:
  - `adminSignOut` moved the admin revocation watermark for anyone. Called without a session, it
    logged every admin out, as often as the caller liked. Now only a signed-in admin moves it.
  - `/[company]/people/[name]` showed a person's email, role and department to a visitor with no
    session: names like "B. Hartmann" carry a dot, so the proxy never saw the request, and the
    layout's redirect did not keep the page out of the response. The same held for a session the
    database had already ended. It and the routing table now check for themselves (`guardPage`).
  - The `change-me` placeholder was accepted as `ADMIN_ACCESS_CODE` and `AUTH_SECRET` on a public box.
  - A new login code left the person's existing sessions running for up to eight hours.
  - The proxy skipped every path with a dot - a person's page among them - so in subdomain and
    single mode such a page was never rewritten to its company and answered 404.
