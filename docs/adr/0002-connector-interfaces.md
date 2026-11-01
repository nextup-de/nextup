# 0002 Connector interfaces

## Status

Accepted · PILOT/ARC · 2026-11

## Context

NextUp integrates into the customer's systems instead of building a parallel one (D2). Today each integration is
its own code: Jira (`apps/app/src/features/integrations/jira/types.ts`, `apps/app/src/server/jira/cloud.ts`,
`apps/app/src/server/jira/dc.ts`), Microsoft 365 search (`apps/app/src/features/m365/search.ts`,
`apps/app/src/server/m365-search.ts`), mail (`apps/app/src/server/mail.ts`,
`apps/app/src/server/case-notice.ts`), the assistant model (`apps/app/src/features/assist/index.ts`,
`apps/app/src/server/assist/provider.ts`) and Microsoft sign-in (`apps/app/src/server/microsoft-login.ts`). A new
customer system should be a new adapter, not a change to the core.

## Decision

Every external system sits behind one of eight interfaces exported from `@nextup/contracts/public`
(`packages/contracts/src/public/connectors/`), in this order: `IdentityProvider`, `DirectorySource`,
`NotifyChannel`, `CaseSource`, `WorkTracker`, `KnowledgeSource`, `LogSink`, `AiProvider`. Each extends
`Connector<"<Name>">` (`base.ts`): `info: ConnectorInfo` (kind, adapter id such as `jira-cloud`, `contractVersion`)
and an optional `health()`. Every method returns a `Promise`; every data shape is a zod schema with a type of the
same name; ids are `PublicId`, times `IsoDateTime`.

**Choosing an adapter (D4).** Which adapter a company uses, and its settings, is configuration in the database
(ADR 0006), read when the connector is needed. No code branches on a company.

**Missing adapter (D7).** A connector that is not configured is absent, not an error. Callers ask for the adapter,
get none, and skip the step; raise, route, answer and decide work with every connector off. For `AiProvider`,
`AiProviderChoice` has the value `off`, a valid setting with no adapter behind it (D8).

**Errors.** Methods that can fail in expected ways return a result, as `NotifyResult` does: `{ ok: true, ... }` or
`{ ok: false, error, retryable }`. `retryable` tells the caller whether to try again later. Other interfaces throw
for failures nobody can act on in the call; callers catch, record and carry on, never blocking the core loop.

**Versioning (D3).** The interfaces are only extended: a new optional field, a new export or a new optional member.
A rename, removal, now-required field or narrowed type is a new version that runs next to the old one.
`ConnectorInfo.contractVersion` (`PUBLIC_CONTRACT_VERSION`) tells which version an adapter implements.

Fixtures for every schema are in `packages/contracts/fixtures/connectors/` (D12); the proof is
`apps/app/tests/unit/contracts/connectors.test.ts`.

## IdentityProvider

Purpose: sign people in and say who they are. Members: `startLogin({ companyId, returnTo })` gives a `LoginStart`
(`redirectUrl`, `state`); `completeLogin(LoginCallback)` takes the OIDC query or SAML form body and gives
`IdentityClaims` (issuer, subject, email, displayName, tenantId, groups, appRoles, department, externalIds).
Today: `apps/app/src/server/microsoft-login.ts`. First adapter: phase EID (Entra today).

Checked against: Microsoft Entra ID (OIDC), a SAML 2.0 IdP (ADFS)

- Microsoft Entra ID (OIDC): the authorization redirect is `LoginStart`, the `code` and `state` of the redirect
  are `LoginCallback.params`, and the ID token claims (`iss`, `sub`, `tid`, `groups`, `roles`, `oid`) fill
  `IdentityClaims`, with `oid` in `externalIds.entra`.
- A SAML 2.0 IdP (ADFS): the redirect to the SSO URL is `LoginStart`, the POSTed `SAMLResponse` and `RelayState`
  are `LoginCallback.params`, and the assertion's issuer, `NameID` and attribute statements fill `IdentityClaims`.

## DirectorySource

Purpose: read people, groups and reporting lines from the customer's directory. Members: `delta({ companyId,
cursor })` gives a `DirectoryPage` (`entries`, `groups`, `removedExternalIds`, `nextCursor`); cursor null is a full
sync and a page with `nextCursor` null ends a round. Today: none yet. First adapter: phase DIR.

Checked against: Microsoft Graph delta query, SCIM 2.0

- Microsoft Graph delta query: `users/delta` and `groups/delta` return changed objects and `@removed` markers
  (`removedExternalIds`); the `@odata.nextLink` or `deltaLink` token is the cursor.
- SCIM 2.0: `GET /Users` and `/Groups` with `startIndex` paging and `meta.lastModified` filters give entries and
  groups, `active` and `externalId` map directly, and the cursor encodes the next `startIndex` or last-sync time.

## NotifyChannel

Purpose: tell a person something outside the app. Members: `send(NotifyMessage)` gives a `NotifyResult`; the
message `id` is an idempotency key so a retry never sends twice. Today: `apps/app/src/server/mail.ts` and
`apps/app/src/server/case-notice.ts`. First adapters: phases NTF and TMS.

Checked against: SMTP mail, Microsoft Teams (Bot Framework)

- SMTP mail: `recipient.address` is the `RCPT TO`, `subject` and `text` the message, `id` becomes the
  `Message-ID`; a 4xx reply is `retryable: true`, a 5xx reply `retryable: false`.
- Microsoft Teams (Bot Framework): a proactive message to the conversation reference of `recipient.userId` carries
  `text` and `link`; HTTP 429 and 5xx are retryable, 403 and 404 are not, and the activity id is `providerMessageId`.

## CaseSource

Purpose: turn a message from another system into a case input. Members: `receive({ companyId, payload, headers })`
gives a `CaseInput` or null (not a case, e.g. a ping); optional `acknowledge({ externalId, caseRef })` tells the
source which case was created. Today: none yet (the raise page is in the app). First adapters: phases TMS and FLR.

Checked against: Teams message extension, inbound mail

- Teams message extension: the submitted action payload gives `title` and `body`, the Teams user's AAD object id is
  `raisedByExternalId`, the activity id is `externalId`, and `acknowledge` replies with the case link.
- Inbound mail: the parsed message gives `title` (subject) and `body`, the `Message-ID` header is `externalId`, the
  sender address is resolved to `raisedByExternalId`, and `acknowledge` may send a confirmation.

## WorkTracker

Purpose: mirror projects and steps into the customer's tracker and read changes back. Members: `ensureContainer`,
`ensureItem` (both adopt an existing item by `label`, never create a duplicate), `setSummary`, `moveItem` to a
`WorkItemState` (`todo`, `doing`, `blocked`, `done`, the columns of `features/projects/types.ts` `StepColumn`),
`markRemoved` (never a delete), `changes({ companyId, projectId, cursor })` giving a `WorkChangePage`. Today:
`JiraApi` and `Job` in `apps/app/src/features/integrations/jira/types.ts`, with `apps/app/src/server/jira/cloud.ts`
and `dc.ts`. First adapter: phase CON.

Checked against: Jira (Cloud REST v3 and Data Center v2), Azure DevOps Boards

- Jira (Cloud REST v3 and Data Center v2): the container is an epic and an item an issue, found by label with JQL;
  `moveItem` is a workflow transition, `changes` reads issue updates by `updated` time; both versions differ only
  in the base path and the description format, which the adapter hides.
- Azure DevOps Boards: the container is a feature work item and an item a task, found by tag with WIQL;
  `moveItem` sets `System.State` and `changes` reads revisions through the work item updates API.

## KnowledgeSource

Purpose: find documents the asking person may read. Members: `search(KnowledgeQuery)` gives `KnowledgeHit[]`; it
searches as `userId` so the source's own permissions apply, and hits above `ceiling` are never returned. Today:
`M365Hit` in `apps/app/src/features/m365/search.ts` with `apps/app/src/server/m365-search.ts`. First adapter:
phase CON.

Checked against: Microsoft Graph search, Confluence search

- Microsoft Graph search: `POST /search/query` with delegated permissions returns `driveItem` hits with title,
  summary and `webUrl`; sensitivity labels give `classification`.
- Confluence search: the CQL search API run with the user's token returns title, excerpt and URL; space or page
  restrictions give the `classification`, defaulting to the company's setting.

## LogSink

Purpose: send the audit log to the customer's log system. Members: `write(LogRecord[])`; `type` starts with
`audit.`. Today: none yet. First adapter: phase EID.

Checked against: syslog (RFC 5424), Splunk HTTP Event Collector

- syslog (RFC 5424): `at` is `TIMESTAMP`, `type` the `MSGID`, `id` and `companyId` structured data, and `data` the
  message body as JSON.
- Splunk HTTP Event Collector: each record is one event with `time` from `at`, `sourcetype` from `type` and `data`
  as the event body; the batch is one POST.

## AiProvider

Purpose: call a language model for the company's chosen provider. Members: `complete(AiRequest)` gives an
`AiResponse`. `AiProviderChoice` is `bedrock`, `azure-openai`, `openai-compatible` or `off`; `off` has no adapter.
Today: `Provider` in `apps/app/src/features/assist/index.ts` with `apps/app/src/server/assist/provider.ts`. First
adapter: phase AIP.

Checked against: Amazon Bedrock, Azure OpenAI

- Amazon Bedrock: the Converse API takes `system`, `messages` and `inferenceConfig.maxTokens` and returns text and
  token usage, which map to `AiRequest` and `AiResponse` one to one.
- Azure OpenAI: chat completions take the system text as the first message plus `max_tokens`, and return the
  message and `usage`; the deployment name is the `model`.

## Consequences

- A new system is a new adapter; the core and the contracts do not change.
- Nothing in `apps/app/src` imports the interfaces yet (D10); existing code keeps its own types until the phase
  that writes the first adapter moves it.
- Optional members are added only when both checked systems support them.

## Gaps

none
