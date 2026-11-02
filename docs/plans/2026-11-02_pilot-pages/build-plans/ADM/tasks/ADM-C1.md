---
id: ADM-C1
title: The connectors page - Microsoft 365, Jira Cloud and Data Center, AI provider and directory status
wp: C
needs: [ ADM-G1, AIP-G1, DIR-C1 ]
host: any
owns:
  - apps/app/src/app/[company]/(app)/settings/connectors/**
  - apps/app/src/components/settings/connectors/**
  - apps/app/src/server/actions/settings/connectors.ts
  - apps/app/src/i18n/messages/settingsConnectors.ts
  - apps/app/tests/unit/adm/connectors.test.ts
  - apps/app/tests/db/adm-connectors.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D3, D6, D7, D10, D15 ]
proofs:
  - id: B1
    says: the Jira settings accept Data Center with a base URL and token, the
      connector views never contain a key or token, and the Microsoft 365 block
      shows counts and times only
    run: npm test -w @nextup/app -- tests/unit/adm/connectors.test.ts -t 'ADM
      connector views'
  - id: B2
    says: a company admin saves Jira, the M365 switch and the AI choice for their
      own company only, and reads the directory status, while a leader can do
      none of it
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-connectors.test.ts -t 'ADM connectors settings'
status: open
---

Plan ADM (sub-plan of PILOT): connectors in the app. Read first: `components/admin/JiraAdmin.tsx`,
`server/actions/jira-admin.ts`, `features/integrations/jira/{settings,types}.ts`, `server/jira/dc.ts`,
`components/admin/M365Admin.tsx`, `server/actions/m365.ts`, `components/admin/{DataMap,DataOverview}.tsx`,
AIP's `lib/db/ai.ts` and `features/ai/settings.ts`, DIR's `loadDirectoryStatus`, and D10.

## What

- `server/actions/settings/connectors.ts` ("use server"): Jira test, save, on/off, sync now; the M365 company switch;
  AI save; all through the same lib functions the /admin actions use, each after `companyAdminOf`. A key or token
  is write-only (D10).
- The Jira block offers both flavors (`parseJiraSettings` in `features/integrations/jira/settings.ts` already accepts
  `dc`; read only): for `dc` the form asks base URL and personal access token, no email.
- `settings/connectors` page with four blocks in `components/settings/connectors/` (Jira, Microsoft 365 with the
  PR D data block, AI, Directory read-only), test ids of D7, strings in `settingsConnectors.ts`. The /admin screens
  stay as they are.
- Tests:
  - `apps/app/tests/unit/adm/connectors.test.ts`, `describe("ADM connector views", …)`: the pure view builders of the
    four blocks never include a value of a key or token field (only "set" / "not set"); the M365 block from a
    fixture holds a count and a time and no name or email; the Jira block's form data for `dc` (URL and token, no email) passes `parseJiraSettings`.
  - `apps/app/tests/db/adm-connectors.test.ts`, `describe("ADM connectors settings", …)` (D15): as a manager of A,
    Jira (dc) and the AI choice are stored in A's integration rows and read back without the secret; the M365 switch
    flips A only; the directory block shows A's run; a leader's calls write nothing.

## Not

- No change to the /admin Jira, M365 or directory screens (DIR-C1 owns the integrations page). No sync logic, no
  provider adapter (CNX, AIP). No `.prisma` file.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
