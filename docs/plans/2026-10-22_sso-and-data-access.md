# Plan: single sign-on and direct access to company data

> **Plan · 2026-10-22 · nothing built yet.** How a company signs in with its own identity provider, and how
> NextUp then reads the company's data for AI context without becoming a copy of the company. Follows the
> data-access research of 20 Oct 2026 (vault: "nextup – Recherche Datenzugang (Okt 2026)") and the phases in
> `docs/plans/2026-10-21_company-data-page.md` (SSO + role table → directory sync → read-only connectors).

## Why

Big automotive buyers will not hand out login codes to 500 people, and the assistant is only as good as the
company context it can read. Both come from the same place: the customer's Microsoft Entra tenant. One app
registration, consented once by their IT, gives us

- **SSO**: *who is this person* (an ID token, OIDC), and
- **direct access**: *what may we read for them* (an access token for Microsoft Graph or Atlassian).

Access tokens come in two kinds, and the choice drives everything below:

| Kind | Reads as | Sees | Good for |
|---|---|---|---|
| **Delegated** | the signed-in person | only what that person can open | live search while someone asks a question |
| **App-only** | NextUp itself | what an admin granted, e.g. named SharePoint sites | background sync, routing when nobody is online |

The identity anchor that ties a person to their data permissions already exists: `User.entraOid`.

## What exists today (main 391495e)

| Area | State | Where |
|---|---|---|
| Entra login | OIDC code flow + PKCE, `scope: "openid profile email"`; only the ID token is read, then dropped | `features/auth/entra.ts`, `server/microsoft-login.ts` |
| Token check | `aud`, `tid`, `iss`, `nonce`, `exp`; **signature not verified** (relies on the TLS back-channel) | `entra.ts:5-8, 158-183` |
| People | must exist before first login (bound by email, then by `oid`); no JIT, no SCIM, no deprovisioning | `microsoft-login.ts:160-172` |
| Roles | `User.role` set by hand; Entra groups and app roles ignored | `config/roles.ts` |
| Stack wiring | **`ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` are not passed to the app** in `stack/compose.yml` or `install.sh` (no `env_file`), so Microsoft sign-in is off on every stack | `stack/compose.yml` app `environment:` |
| Company `/admin` | one shared `ADMIN_ACCESS_CODE`, no named admins | `server/actions/admin.ts` |
| Documents | push only, `POST /api/[company]/knowledge/documents` (`knowledge:write`), flat text ≤ 20k chars, `tsvector` search | `features/assist/documents.ts`, `lib/db/assist.ts` |
| Permissions on data | company + one classification ceiling; **no per-person filtering** | `CompanyConfig.classificationCeiling` |
| Connectors | n8n only: Jira Cloud (two-way, API token), ERP placeholder | `ops/n8n/` |
| Brain | stateless, receives routing rows and earlier cases, **no documents** | `server/brain.ts` |
| Network | hosted stacks reach the internet (SaaS) only; nothing reaches into a customer network | `stack/`, `docs/plans/2026-09-27_platform.md` |

## Decisions this plan proposes

1. **Entra first, standard protocols only.** OIDC now, SCIM for lifecycle, generic OIDC for Okta/ADFS when a
   customer needs it, SAML only on demand. No identity broker (Keycloak, authentik) in the stack until a second
   protocol is really required.
2. **Bring your own app registration.** Each company has its own stack, so `ENTRA_CLIENT_ID/SECRET` are
   per-stack anyway. OEM IT registers the app in *their* tenant from our manifest and keeps control of it. For
   small pilots, one multi-tenant NextUp registration stays possible (admin consent once).
3. **Live search before sync.** The first data access is delegated, at question time, with nothing copied
   (phase 2). Synced copies come later, per source, only with a manager's approval (phase 3).
4. **No mail, no chat history.** We never request `Mail.*`, `Chat.*` or `Calendars.*`. "Roles, not people"
   (`docs/COMPANY_KNOWLEDGE.md`) and the BetrVG §87(1) Nr. 6 position stay intact.
5. **The brain stays stateless.** The app retrieves and redacts; the brain gets snippets in the request.

## Phase 1: SSO that works (days, no new data access)

| Step | What | Done when |
|---|---|---|
| 1.1 | Pass `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` through `stack/compose.yml`; `install.sh` asks for them (optional) and writes them to `instances/<slug>/.env`; sops copy in `nextup-infra` | `/acme/login` shows "Continue with Microsoft" on the box |
| 1.2 | Verify the ID token signature against the tenant's JWKS (`jose`, `createRemoteJWKSet`) | a token with a broken signature is refused (unit test) |
| 1.3 | App roles in the registration manifest: `NextUp.Manager`, `NextUp.Leader`, `NextUp.Member`, `NextUp.Admin`; "assignment required" on. The `roles` claim sets `User.role` at every login | changing a group in Entra changes the role at next sign-in |
| 1.4 | Just-in-time users: tenant matches + a role claim → create the `User` (name, email, `entraOid`). No role claim → "ask your IT for access" | a new employee signs in without anyone adding them |
| 1.5 | Company `/admin` behind SSO for `NextUp.Admin`; the shared code stays only as break-glass, logged | admin actions carry a person |
| 1.6 | Customer handout: app manifest JSON, redirect URI, roles, what each permission means (`docs/customer/ENTRA_SETUP.md`) | a customer IT admin can do it without a call |

Role names stay data: the claim → role map lives in `config/roles.ts`, not in pages.

## Phase 2: live Microsoft 365 search, nothing copied

| Step | What |
|---|---|
| 2.1 | "Connect Microsoft 365" in the user menu: incremental consent for delegated `Files.Read.All`, `Sites.Read.All`, `offline_access` (most tenants need their admin to consent once) |
| 2.2 | New `Connection` model: `companyId`, `userId`, `provider`, `scopes`, `refreshTokenSealed`, `expiresAt`, `revokedAt`. Sealed with `CONNECTOR_VAULT_KEY` (same pattern as `OPS_VAULT_KEY` in nextup-admin). Revoke button; tokens die with the user |
| 2.3 | `search_documents` fans out: local `Document` full-text + Graph `POST /search/query` (`driveItem`, `listItem`). Microsoft trims results to what the person may open, so we replicate no ACLs |
| 2.4 | Snippets go through `features/assist/redact.ts` and the classification ceiling before any model sees them; sources are cited in the answer |
| 2.5 | Same for the brain: the app adds the top snippets to `/v1/route` and `/v1/coach` requests when the raising person has a connection |
| 2.6 | Data page (`/admin/company-data`) shows the source "Microsoft 365 (live)", how many people connected, last query; never content |

**Rule change.** `docs/INTEGRATIONS.md` says per-customer credentials live in n8n, never in the app database.
Per-person refresh tokens cannot live in n8n, so this plan makes one exception: delegated user tokens live
sealed in the app DB. App-only credentials (phase 3) stay in n8n. Update `INTEGRATIONS.md` and `SECURITY.md`
in the same PR.

Atlassian works the same way (OAuth 2.0 3LO, delegated, Confluence search API) once a customer asks for it.

## Phase 3: synced sources the customer picks

For context that must be available when nobody is signed in (routing, duplicate checks) or must be fast.

| Step | What |
|---|---|
| 3.1 | `DataSource` + `SyncRun` (step 4 of the company-data plan): `kind`, `status`, `lastSyncAt`, `lastError`, `rowCount` |
| 3.2 | Access request: a department manager approves a source before it syncs, recorded as an event (step 6 of the company-data plan) |
| 3.3 | App-only Graph with **`Sites.Selected`**: the customer's admin grants named SharePoint sites only, never the whole tenant |
| 3.4 | n8n (or a `ROLE=worker` container) pulls, extracts text, chunks (~800 tokens), embeds, and pushes to the documents API |
| 3.5 | DB image `pgvector/pgvector:pg17`; `DocumentChunk` with `embedding` and `principals text[]` (Entra group ids from the item's permissions) |
| 3.6 | `searchChunks(companyId, userGroups, query, k)` is the one raw-SQL helper: tenant filter **and** `principals && userGroups`, with an isolation test |
| 3.7 | User groups come from the `groups` claim; above 200 groups Entra drops the claim, so fall back to Graph `getMemberGroups` and cache per session |

Jira stays on the existing n8n credential (`ops/n8n/jira-projects.json`); Confluence spaces sync the same way as
SharePoint sites.

## Phase 4: systems inside the customer network

File shares, SAP, PLM (Teamcenter, Windchill) are not reachable from a hosted stack, and we open no inbound path.

- **On-prem stack**: the same `install.sh` on their server (`docs/plans/2026-09-27_platform.md`), so the stack
  sits next to the data.
- **Outbound connector**: n8n or a small agent inside their network pushes to the existing
  `/knowledge/documents` endpoint with a `knowledge:write` token. No new API on our side.
- **SCIM** (`/scim/v2/Users`, `/Groups`) for lifecycle once a customer runs NextUp company-wide: Entra
  deprovisions, we disable the user and end their sessions (per-user revocation, `docs/SECURITY.md` open item #2).

## Infrastructure changes, by phase

| Phase | Stack (`stack/compose.yml`, `install.sh`) | Elsewhere |
|---|---|---|
| 1 | `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | sops secrets in `nextup-infra`; redirect URI per stack in the customer's registration |
| 2 | `CONNECTOR_VAULT_KEY`; egress to `graph.microsoft.com` | tell customers the box's egress IP for Conditional Access |
| 3 | `pgvector/pgvector:pg17`; optional `worker` profile | restore test must cover the vector index |
| 4 | none on hosted stacks | on-prem install docs; connector agent image |

## Before we sell it

- **Landing copy contradicts phase 1.** `nextup-landing/src/config/site.ts:18` says "No SSO, no mailbox access,
  no read access to your systems." Change to: SSO yes, mailbox never, read access only per source and approved.
- **Paperwork per phase.** Phase 1 needs the DPA only. Phases 2-3 need a works agreement (Betriebsvereinbarung)
  and a DPIA (DSFA). Synced copies (phase 3) are where TISAX applies, which is another reason live search
  comes first.
- **Over-sharing risk.** Delegated search makes existing over-shared SharePoint files easier to find. The
  customer handout says so and recommends running their own sharing report first.

## Open questions

- Multi-tenant NextUp registration or bring-your-own for the first pilot?
- Does the first pilot customer use Entra at all, or Okta/ADFS (then generic OIDC moves into phase 1)?
- Is delegated Graph search allowed from a hosted stack under their Conditional Access policies?
- TISAX level for a pilot with phase-2 access only.
