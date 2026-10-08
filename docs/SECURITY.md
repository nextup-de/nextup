# Security

> **Updated 2026-09-28** · reference: what protects each door, and the open list before real customers.

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
| Dev panel: switch person, +1 day, reset, delete added | yes (managers for the last three) | **no** - panel hidden, actions refuse |
| People sent to the browser | the whole company (the dev panel needs them) | the signed-in viewer only |
| Move back to `demo` | - | **refused** - create a separate demo company instead |

An unknown stage gets the real-people policy: fail closed. Creating a company in `/admin` asks
"Who logs in" - demo or real people (sandbox).

## Doors and their locks

| Door | Lock | Brake (`src/server/throttle.ts`) |
|---|---|---|
| `/[company]/login` | personal login code per person (~59 bits, sha256 stored, `src/features/auth/login-code.ts`) - the code alone says who you are | 10 tries / 10 min per address+company; 200 / 10 min per company |
| `/[company]/login/microsoft` | Entra ID OpenID Connect, code flow + PKCE, state + nonce in a signed 10-min cookie; token's `tid` must equal the company's tenant; person matched by `oid` (bound on first sign-in by email) - `src/features/auth/entra.ts` | Microsoft's own |
| `/admin/login` | `ADMIN_ACCESS_CODE`, constant-time compare | 5 tries / 15 min per address |
| `/contact` | honeypot + server-side validation | 5 / hour per address |
| `/api/[company]/events` | bearer token (sha256 hash stored), scoped to one company | - (token is 192 bits) |
| `/api/client-errors` | public on purpose (a crash on the login page must report too): `Sec-Fetch-Site: same-origin` or `Origin` = `APP_ORIGIN`, 8 KB, zod-validated; message scrubbed and route made a pattern before it is kept (`src/features/errors`); no cookie, session or address stored | 30 / 10 min per address, then silently 204 |
| Every server action | re-checks the session for the slug; never trusts the client for actor or company | - |
| Case and idea events | `mayAppend` (`src/features/cases/permissions.ts`): only whoever holds a case (or a manager) decides, hands or asks; only the raiser answers; only managers re-route or move the clock; no re-raising an existing id | - |
| `n8n.<domain>`, `mail.<domain>` | Caddy `basic_auth` from `OPS_USER` / `OPS_PASSWORD_HASH`; unset = 401 for everyone | - |

Sessions are HMAC-signed cookies (`src/features/auth/cookie.ts`), `HttpOnly`, `SameSite=Lax`, and
`Secure` whenever `COOKIE_SECURE=true` **or** `PUBLIC_SCHEME=https`. Post-login redirects only go
to same-site paths (`safeNextPath`). `next.config.ts` sends a strict CSP, `frame-ancestors 'none'`,
HSTS, `nosniff` and a referrer policy.

## Before the first real customer

1. ~~**Per-person login.**~~ Done: a personal login code per person (issued and replaced in
   `/admin` -> Companies -> People & sign-in) and "Continue with Microsoft" per company. The shared
   company code opens nothing any more (`Company.accessCodeHash` is kept, nullable, until old
   rows are gone). Still open: team leaders issuing codes themselves instead of the admin, and an
   Entra app registration for the production box (`ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET`).
2. **Session revocation.** Partly done: `getViewerFor` checks every session against the database
   (same company id, the person still exists with the same role, and `Company.sessionEpoch`
   unchanged - a stage move bumps it, so demo sessions end when real people move in). Still open:
   issuing someone a new code does not end the session they already have. Add
   `User.sessionVersion` next to the epoch and bump it on new code/offboarding.
3. **Admin as people, not a shared code.** One `ADMIN_ACCESS_CODE` for everyone means no audit of
   who did what. Named admin users (magic link or SSO) plus 2FA.
4. **Audit log for admin actions** - create, stage move, issue login code, issue token, delete - as
   events, like everything else.
5. **Shared rate-limit store.** The throttle counts in process memory: right for one Hetzner box,
   per-instance on Vercel. Move the `Map` to a Postgres table when there is more than one process.
6. **Role-scoped data.** The whole case log goes to every signed-in browser; roles only choose
   which pages show it. If members must not see something, filter it on the server.
7. **GDPR basics** - a processing record, a DPA with each customer, data export and deletion per
   company (delete exists; export does not), backup encryption and retention.

## Ongoing

- **In CI:**
  - `npm audit --omit=dev --audit-level=high` fails a PR on high or critical findings. On 28 Sep
    2026 there were none. The old findings in Prisma's CLI tooling (`mysql2`, `deepmerge-ts`) are
    pinned away by `overrides` in the root `package.json`.
  - Dependabot opens weekly update PRs.
  - Trivy scans the app image before it's pushed. A fixable HIGH/CRITICAL finding stops the
    release.
- **Demo shortcuts:** `LOGIN_DEMO_FILL` only on demo stages, `ADMIN_DEMO_FILL` only on demo boxes.
  `/admin/connections` flags both. Company stacks (`stack/`) never pass `ADMIN_DEMO_FILL` at all.
- Anything published by Docker on a laptop binds to `127.0.0.1`, never all interfaces.
- A pentest by an outside firm before `live`.

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
