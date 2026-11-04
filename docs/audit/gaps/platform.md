# Platform, operations and security gaps

> Part of the gap register (`docs/audit/README.md`). Re-checks the platform side of the audit of 2026-11-01
> (`docs/plans/2026-11-01_pilot-readiness.md`, "Five findings" item 5 and "Platform and operations") against `main`.
> Ids `G-200` to `G-399`. Product, integration and in-app data-protection gaps are in `product.md`.

The register records gaps, it fixes none. Each row names the phase that closes it. Findings about `nextup-admin` and
`nextup-infra` are taken from the Nextup docs, not checked in this repo; their gap text ends with "(from the Nextup docs)".

| id | area | gap | evidence | severity | phase | owner |
|---|---|---|---|---|---|---|
| G-200 | deployment | Provisioning from admin runs only through the box agent on the shared demo box; there is no path to create or deploy to a dedicated VM per customer. | stack/provision/agent.sh · stack/provision/README.md · docs/plans/2026-09-27_platform.md | high | INF | K |
| G-201 | deployment | The shared Hetzner box is demo-only by rule, and deploy, agent and health checks all assume that box, so real customer data has nowhere to go yet. | stack/nginx/RUNBOOK.md · stack/provision/agent.sh · stack/health.sh | high | OPS | K |
| G-202 | deployment | No dedicated-VM infrastructure as code exists; nextup-infra holds only secrets, so a customer VM cannot be created or rebuilt from code (from the Nextup docs). | nextup-infra:README.md · docs/plans/2026-09-27_platform.md | high | INF | K |
| G-203 | deployment | The on-prem install has never been rehearsed, and the custom-certificate path for a company's own TLS is only described, not supported. | stack/README.md · stack/install.sh | high | OPS | K |
| G-204 | deployment | Images are not signed and no SBOM is produced, so a customer cannot verify what they run. | .github/workflows/images.yml | low | LATER | K |
| G-205 | deployment | There is no offline bundle of images and stack files for a customer without registry access. | stack/push-images.sh · stack/README.md | low | LATER | K |
| G-206 | release | `deploy.sh release` moves every release-track stack to the new commit without taking a backup before migrating; only `promote` backs up first. | stack/nginx/deploy.sh:239 · stack/nginx/deploy.sh:295 · stack/nginx/RUNBOOK.md | high | OPS | K |
| G-207 | release | There is no expand/contract rule for migrations: `migrate` applies them as the stack restarts, and a rollback to an older sha can meet a schema it does not know. | stack/compose.yml:50 · stack/nginx/RUNBOOK.md | medium | OPS | K |
| G-208 | release | A release needs one approver (Kevin) with "Prevent self-review" off, so there is no second pair of eyes on production. | .github/workflows/deploy.yml · stack/nginx/RUNBOOK.md | medium | OPS | K |
| G-209 | release | CODEOWNERS lists paths from before the monorepo (`/src/...`, `/prisma/schema.prisma`, `/package.json`), so the specific rules no longer match files under `apps/app/`. | .github/CODEOWNERS | medium | OPS | K |
| G-210 | release | `stack/compose.yml` uses `:latest` for mailpit, n8n and ollama and floating tags for postgres and caddy; no image is pinned by digest. | stack/compose.yml:32 · stack/compose.yml:130 · stack/compose.yml:151 · stack/compose.yml:165 · stack/compose.yml:213 | medium | OPS | K |
| G-211 | release | The brain image is not built or scanned in CI (`images.yml` builds app and migrate only), and the brain tests and eval do not run there. | .github/workflows/images.yml · services/brain/README.md · stack/compose.yml:189 | medium | OPS | V |
| G-212 | backups | Backups go to a restic repository on the same disk as the database, so a lost disk loses the data and its backups together. | stack/backup.sh · stack/README.md | high | OPS | K |
| G-213 | backups | No off-box backup target is configured; the restic password is the only thing the docs say to keep off the machine. | stack/backup.sh:13 · stack/README.md | high | OPS | K |
| G-214 | backups | No RPO or RTO is written down for any stage, so a customer cannot be told how much data or time a failure costs. | stack/backup.sh · docs/DEPLOY.md | medium | OPS | K |
| G-215 | backups | The restore test restores into a throwaway container and checks rows only; it does not check that the app starts on the restored data. | stack/backup.sh | medium | OPS | K |
| G-216 | monitoring | There is no external uptime check; box checks run on the box itself, so a dead box cannot report its own outage. | stack/health.sh · apps/app/src/server/health-report.ts | high | OPS | K |
| G-217 | monitoring | Box alerts go to one private ntfy topic with one subscriber, so one missed phone means a missed alert. | stack/health.sh:45 | medium | OPS | K |
| G-218 | monitoring | There are no central logs and no log retention rule; logs stay in each container on each box. | stack/ctl.sh · stack/compose.yml | medium | OPS | K |
| G-219 | monitoring | No metrics are collected for CPU, memory, database or request times, so capacity cannot be judged from data. | stack/health.sh · apps/app/src/server/health-report.ts | medium | OPS | K |
| G-220 | monitoring | There is no audit or security log export (JSON file, syslog) for a customer's SIEM. | docs/SECURITY.md | low | EID | K |
| G-221 | security controls | The server hardening script (`nextup-infra/servers/harden.sh`) is not on `main` and has not been applied to any server (from the Nextup docs). | nextup-infra:servers/harden.sh | high | INF | K |
| G-222 | security controls | **Narrowed by SEC-K1:** the shared `ADMIN_ACCESS_CODE` is refused on every stage but `demo`; `/admin` opens only inside a break-glass window. 2FA of its own is still open. Was: Company `/admin` has no 2FA of its own and still accepts the shared `ADMIN_ACCESS_CODE`; named admins via Entra exist, but the shared code is not switched off. | docs/SECURITY.md:76 · apps/app/src/features/auth/entra.ts | high | SEC | K |
| G-223 | security controls | **Closed by SEC-B1, SEC-G1, SEC-K1, SEC-S1:** a real stack sends no secrets to admin (`"secrets":{}`), the customer opens a time-limited, logged break-glass window and grants support access in Settings; proof `stack/tests/no-standing-access.test.sh` (SEC-Z1). Was: Team access to customer stacks is standing: the agent copies each stack's secrets into admin's vault, and there is no customer-granted, logged break-glass. | stack/provision/agent.sh:239 · stack/provision/README.md | high | SEC | K |
| G-224 | security controls | **Rotation done by SEC** (`stack/rotate-keys.sh`, vault key with `CONNECTOR_VAULT_KEY_PREVIOUS`); disk encryption is still open (INF). Was: No disk encryption is set up on the servers, and there is no key rotation for `AUTH_SECRET`, the connector vault key or the restic password. | docs/SECURITY.md · stack/install.sh · stack/backup.sh | medium | INF | K |
| G-225 | security controls | The rate limiter counts in process memory, so limits are per instance and reset on restart; a second process needs a shared store. | apps/app/src/server/throttle.ts:3 · docs/SECURITY.md | medium | VIS | K |
| G-226 | security controls | **Narrowed by SEC:** an OWASP ZAP baseline scan of the demo app runs in CI and fails on a High alert; the outside pentest before `live` is still to do. Was: No penetration test or ZAP cycle has run; SECURITY.md lists an outside pentest as still to do before `live`. | docs/SECURITY.md | high | SEC | K |
| G-227 | compliance | **Closed by SEC (compliance pack):** DPA template in `docs/compliance/DPA_TEMPLATE.md`. Was: There is no data processing agreement (DPA) template, so no customer with real data can sign one. | docs/SECURITY.md · docs/customer/ENTRA_SETUP.md | high | SEC | K |
| G-228 | compliance | **Closed by SEC (compliance pack):** TOMs in `docs/compliance/TOMS.md`. Was: The technical and organisational measures (TOMs) are not written down for a customer. | docs/SECURITY.md | high | SEC | K |
| G-229 | compliance | **Closed by SEC (compliance pack):** record of processing in `docs/compliance/RECORD_OF_PROCESSING.md`. Was: There is no record of processing activities. | docs/SECURITY.md | high | SEC | K |
| G-230 | compliance | **Closed by SEC (compliance pack):** DPIA in `docs/compliance/DPIA.md`. Was: There is no data protection impact assessment (DPIA). | docs/SECURITY.md | high | SEC | K |
| G-231 | compliance | **Closed by SEC (compliance pack):** works agreement template in `docs/compliance/WORKS_AGREEMENT_TEMPLATE.md`. Was: There is no works agreement template for a works council. | docs/customer/ENTRA_SETUP.md | high | SEC | K |
| G-232 | compliance | **Closed by SEC (compliance pack):** self-assessment in `docs/compliance/VDA_ISA_SELF_ASSESSMENT.md`. Was: There is no VDA ISA self-assessment. | docs/SECURITY.md | medium | SEC | K |
| G-233 | compliance | **Closed by SEC (compliance pack):** install, operations and security guides in `docs/customer/`. Was: `docs/customer/ENTRA_SETUP.md` is the only customer guide; install, operations and security guides for a customer's IT are missing. | docs/customer/ENTRA_SETUP.md · docs/DEPLOY.md | medium | SEC | K |
| G-234 | compliance | TISAX assessment, 24/7 operations and high availability are out of scope for the pilot and have no plan. | docs/SECURITY.md · docs/DEPLOY.md | low | LATER | K |
| G-235 | AI hosting | The brain runs on one shared CPU server (8 vCPU, 16 GB) for all demo stacks, good for about 10 users; it cannot serve a company of 1,000 to 2,000. | stack/brain-server/README.md · docs/plans/2026-10-03_ai-server-gpu.md | high | OPS | V |
| G-236 | AI hosting | The Bedrock assistant is off everywhere because no AWS account is attached to any stack. | apps/app/src/server/assist/provider.ts · docs/ASSISTANT.md | medium | AIP | V |
| G-237 | AI hosting | There is no AI gateway in front of the model providers for keys, quotas, logging and a provider choice per company. | apps/app/src/server/assist/provider.ts · stack/brain-server/README.md | medium | AIP | V |
| G-238 | scale | No load test has been run; there is no measured response time under load. | .github/workflows/ci.yml · docs/DEPLOY.md | high | TST | K |
| G-239 | scale | There is no figure for how many users one stack carries, so hosting cannot be sized or priced. | stack/compose.yml · docs/DEPLOY.md | high | TST | K |
| G-240 | scale | No connection pooler sits between the app and Postgres, so each app process opens its own connections. | stack/compose.yml:32 · apps/app/prisma/schema/core.prisma | medium | VIS | K |
| G-241 | scale | Postgres runs with default settings and is not tuned for a company of 1,000 to 2,000 users. | stack/compose.yml:32 | medium | TST | K |
| G-242 | nextup-admin | The `/audit` page for platform actions in admin is still open (from the Nextup docs). | nextup-admin:README.md | medium | OPS | K |
| G-243 | nextup-admin | Box metrics (CPU, memory, disk per box) are not shown in admin (from the Nextup docs). | nextup-admin:README.md | medium | OPS | K |
| G-244 | nextup-admin | The uptime monitor in admin is not built, so the platform has no view of whether customer stacks answer (from the Nextup docs). | nextup-admin:README.md | medium | OPS | K |
| G-245 | nextup-admin | The Brevo mail setup for admin is still open (from the Nextup docs). | nextup-admin:README.md | low | OPS | K |
