Updated 2026-11-04 · Draft for legal review, not legal advice.

# Technical and organisational measures (Art. 32 GDPR)

What NextUp does to protect a company's data, and the proof for each measure. *Proof* is a test file and the title
of the test that shows the control, or *organisational* with the owner. The tests run in CI
(`.github/workflows/ci.yml`); the database tests run as the `db-tests` job. Scope: a non-demo company on its own
stack. Demo companies hold made-up data and are out of scope.

## Access control

| Control | How NextUp does it | Proof |
|---|---|---|
| Roles and what each may do | A person is a manager, leader or member. `mayAppend` decides who may add a case event; every server action re-checks the session for the company | `apps/app/tests/unit/permissions.test.ts` · "keeps deciding, handing and asking with the person the case sits with" |
| Personal sign-in per person | A personal login code per person, stored as a sha256 hash; the shared company code opens nothing | `apps/app/tests/unit/login-code.test.ts` · "hashes the same however it is typed" |
| Sessions are signed and checked | HMAC-signed cookie, checked against the database on every request (`sessionEpoch`, `loginCodeAt`); a tampered or expired cookie is refused | `apps/app/tests/unit/session.test.ts` · "rejects a tampered payload" |
| Second factor | A manager who signs in with a code enrols TOTP (RFC 6238, `features/auth/totp.ts`); the secret is sealed. Microsoft sign-in relies on the customer's Entra multi-factor setting. Leaders and members have no second factor with a code | `apps/app/tests/unit/adm/totp.test.ts` · "accepts one step of drift and refuses two" |
| Single sign-on | OpenID Connect with Microsoft Entra ID (PKCE, state, nonce, signature, issuer, audience) and SAML 2.0 (signature, audience, InResponseTo, replay) | `apps/app/tests/unit/eid/oidc.test.ts` · "refuses a wrong issuer, audience, azp and nonce" |
| Brakes on guessing | `src/server/throttle.ts` limits tries per address and company; an IPv6 address counts by its /64. The counter lives in process memory, per instance | `apps/app/tests/unit/security.test.ts` · "allows the limit, then blocks until the window resets" |
| Real-people stages fail closed | `policyFor(stage)` refuses demo shortcuts for sandbox, pilot and live; an unknown stage is treated as real people | `apps/app/tests/unit/security.test.ts` · "an unknown stage fails closed" |
| No standing access for NextUp staff | The box agent sends no stack secrets to NextUp for a real stack | `stack/provision/break-glass.test.sh` · "SEC agent secrets" |
| Break-glass only in a window the customer opens | `ADMIN_ACCESS_CODE` is never accepted on a real stage. `stack/break-glass.sh` opens a time-limited window with a one-time code; the app accepts the code only while the window is open and ends the session when the window closes, expires or is replaced | `apps/app/tests/db/sec-break-glass.test.ts` · "signs in with the window's code, writes one row, and ends the session when the window closes" |
| Break-glass window on the host | The window file holds only a hash of the code; every open, close and expiry is logged | `stack/tests/break-glass-window.test.sh` · "SEC break-glass window" |
| Support access granted by the customer | A company admin grants NextUp support access for 1, 4, 24 or 72 hours with a reason, and can extend (never past 72 hours from now) or end it; every step is in the audit log | `apps/app/tests/db/sec-support-access.test.ts` · "a company admin grants, NextUp signs in, the admin extends and ends; one audit row each and the session stops" |
| Company scope inside the code | Every query of a company-owned table names the company; an unscoped read or write is refused by the database client guard | `apps/app/tests/unit/tenant-guard.test.ts` · "blocks an unscoped read of a tenant table" |

## Encryption

| Control | How NextUp does it | Proof |
|---|---|---|
| In transit | The stack's Caddy serves HTTPS; the app sends `Strict-Transport-Security`, a strict content security policy and `nosniff`; session cookies are `Secure` over https | organisational · Kevin (head engineer) reviews `stack/caddy/Caddyfile` and `apps/app/next.config.ts` at each release |
| Secrets in the database | The vault seals connector tokens, integration secrets, webhook secrets and second-factor secrets with AES-256-GCM (`CONNECTOR_VAULT_KEY`), bound to company and person | `apps/app/tests/unit/connector-vault.test.ts` · "does not open for another person or another company" |
| Vault key rotation | `CONNECTOR_VAULT_KEY_PREVIOUS` lets the app open old values; a test lists every sealed field of the schema in `RESEALED_COLUMNS` | `apps/app/tests/unit/sec/vault-keys.test.ts` · "lists every sealed field of the Prisma schema in RESEALED_COLUMNS" |
| Re-seal of stored values | `resealAll` skips values already sealed with the current key, re-seals the rest, and leaves a value that opens with neither key untouched, counted as failed | `apps/app/tests/db/sec-vault-reseal.test.ts` · "re-seals every value of both companies" |
| Key rotation on the host | `stack/rotate-keys.sh` rotates `AUTH_SECRET`, the vault key and the restic password, edits the `.env` atomically and logs the key name, never the value | `stack/tests/rotate-keys.test.sh` · "SEC rotate keys" |
| Backups encrypted | restic encrypts the repository with `RESTIC_PASSWORD` | `stack/tests/backup-offbox.test.sh` · "OPS hands to: stack/backup.sh with an off-box RESTIC_REPOSITORY" |
| Disk encryption of the server | **Not provided.** NextUp's install scripts do not set it up (gap G-224) | organisational · Kevin (head engineer) |

## Audit

| Control | How NextUp does it | Proof |
|---|---|---|
| Audit log | Every admin, console, support and system change to a company is written to `AuditEvent` in the same transaction; append-only; a change holds no name or email and a secret only as set, replaced or removed | `apps/app/tests/db/gdp-admin-audit.test.ts` · "each access action writes one row with the right action and actor kind, and no secret" |
| Secrets never in the log | `auditChanges` writes a secret field as set, replaced or removed | `apps/app/tests/unit/gdp/audit.test.ts` · "auditChanges writes a secret field as set, replaced or removed and never its value" |
| Audit actions are a closed list | `AUDIT_ACTIONS` in `src/features/audit/index.ts`; each has a label in both languages | `apps/app/tests/unit/gdp/audit.test.ts` · "every action and actor kind has a label in both catalogs" |
| Audit view and CSV | Company admins read the log in Settings → Audit log (newest first) and export it as CSV; the export is itself audited | `apps/app/tests/unit/gdp/audit-view.test.ts` · "auditCsv quotes a comma, a quote and a newline in a field" |
| Export to a SIEM | Audit rows are sent once, in order, to a syslog receiver (UDP, TCP or TLS) or to a file; the cursor stays while the receiver is down | `apps/app/tests/db/eid-log-export.test.ts` · "sends new rows once, in order, over UDP, TCP and TLS; never history nor another company" |
| Retention of the log | Fixed at 730 days (24 months); no setting | `apps/app/tests/db/gdp-retention.test.ts` · "deletes only what is past its rule, records totals and one audit row, and does nothing twice" |

## Availability

| Control | How NextUp does it | Proof |
|---|---|---|
| Backups | `stack/backup.sh` runs nightly (restic) and before every release migration; RPO 24 hours (`docs/ops/RPO_RTO.md`) | `stack/tests/rpo-rto.test.sh` · "OPS hands to: docs/ops/RPO_RTO.md and a restore within RTO" |
| Off-box copy | Production stacks set an `s3:` repository and `BACKUP_OFFBOX=required`; a local repository is then refused | `stack/tests/backup-offbox.test.sh` · "OPS hands to: stack/backup.sh with an off-box RESTIC_REPOSITORY" |
| Restore drill | `backup.sh <slug> restore-test` restores the latest snapshot into a throwaway database weekly and fails over the RTO of one hour | `stack/tests/rpo-rto.test.sh` · "OPS hands to: docs/ops/RPO_RTO.md and a restore within RTO" |
| High availability, 24/7 operations | **Not provided.** One stack per company on one host (gap G-234) | organisational · Kevin (head engineer) |

## Deletion and retention

| Control | How NextUp does it | Proof |
|---|---|---|
| Retention rules | Per company: assistant turns, idea drafts, closed cases; limits are checked and a default applies without a rule | `apps/app/tests/unit/gdp/retention.test.ts` · "checks the limits of each kind" |
| Retention run | A daily run deletes only what is past its rule, records one audit row, and does nothing twice | `apps/app/tests/db/gdp-retention.test.ts` · "deletes only what is past its rule, records totals and one audit row, and does nothing twice" |
| Export of a company or a person | JSON, kept 7 days; every request and download is audited | `apps/app/tests/db/gdp-export.test.ts` · "a manager exports the company: ready, sized, valid for 7 days, one audit row, no D5 data" |
| Deleted data in older backups | **Not provided** as a separate rule: deleted rows stay in older snapshots until restic prunes them | organisational · Kevin (head engineer) |

## Pseudonymisation

| Control | How NextUp does it | Proof |
|---|---|---|
| Pseudonymise a person who has left | Name, email, initials, line, department, login code and directory ids are cleared; assistant turns, drafts, connections and mail settings are deleted. Authored free text is not scrubbed | `apps/app/tests/db/gdp-pseudonymise.test.ts` · "pseudonymises, leaves the log alone and refuses a second call" |
| Only for people who have left | An active member, oneself, a wrong name, a stranger or a non-admin is refused | `apps/app/tests/db/gdp-pseudonymise.test.ts` · "refuses an active member, oneself, a wrong name, a stranger and a non-admin" |
| Minimum group in metrics | A unit or role with fewer than `MIN_GROUP` (5) people is hidden, and a hidden sibling cannot be derived by subtraction | `apps/app/tests/unit/met/breakdown.test.ts` · "hides every tile of a scope of 3 people" |
| No person metrics | No contributor ranking is exported and no person route is keyed by name | `apps/app/tests/unit/met/no-person-metrics.test.ts` · "exports no contributor ranking from features/metrics" |

## Separation

| Control | How NextUp does it | Proof |
|---|---|---|
| One stack per company | Each company runs its own app, database, secrets and backups from `stack/` with its own `.env`; two customers are never in one database | `stack/tests/stack-mounts.test.sh` · "Proof for SEC-G1" |
| Company scope inside a stack | The `[company]` segment and the query guard keep companies apart; no list or count crosses companies | `apps/app/tests/db/isolation.test.ts` · "lists only its own events" |

## Testing

| Control | How NextUp does it | Proof |
|---|---|---|
| CI suites | Lint, typecheck, unit tests, database tests, build and end-to-end tests run on every pull request; `npm audit` fails on high findings; Trivy scans the app image | `apps/app/tests/unit/docs/ci-jobs.test.ts` · "has a db-tests job that runs ops/test-db.sh against a postgres:17 service" |
| Web scan | A ZAP baseline scan of the demo app runs in CI; a High alert not in `.zap/ignore.json` fails the job | `apps/app/tests/unit/sec/zap.test.ts` · "fails on a High alert and names plugin id, name and URL" |
| Outside penetration test | **Not done yet.** `docs/SECURITY.md` lists it before `live` | organisational · Kevin (head engineer) |
