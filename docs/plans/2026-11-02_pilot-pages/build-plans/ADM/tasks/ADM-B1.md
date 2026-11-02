---
id: ADM-B1
title: Org units, roles, seats and the routing table are edited in settings
wp: B
needs: [ ADM-G1 ]
host: any
owns:
  - apps/app/src/app/[company]/(app)/settings/org/**
  - apps/app/src/app/[company]/(app)/settings/routing/**
  - apps/app/src/components/settings/OrgEditor.tsx
  - apps/app/src/components/settings/RoutingEditor.tsx
  - apps/app/src/server/actions/settings/org.ts
  - apps/app/src/lib/db/org-edit.ts
  - apps/app/src/features/org-edit/**
  - apps/app/src/i18n/messages/settingsOrg.ts
  - apps/app/tests/unit/adm/org-rules.test.ts
  - apps/app/tests/db/adm-org.test.ts
risk: normal
profile: orch
budget: { minutes: 120, window_pct: 20 }
uses: [ D1, D2, D3, D5, D6, D7, D8, D15 ]
proofs:
  - id: B1
    says: the org rules refuse a duplicate unit key, a reportsTo loop, removing a
      role a route still names and a route without an owner role, each with its
      message key, and accept good changes
    run: npm test -w @nextup/app -- tests/unit/adm/org-rules.test.ts -t 'ADM org
      rules'
  - id: B2
    says: an admin adds a unit, a role with a seat linked to a member and a route,
      the company's seed then routes a raise to that seat's role, and nothing of
      another company changes
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-org.test.ts -t 'ADM org editor'
status: open
---

Plan ADM (sub-plan of PILOT): the org and routing editor (G-012, G-013). Read first: `docs/COMPANY_KNOWLEDGE.md`,
`docs/IDENTITY.md`, `apps/app/prisma/schema/structure.prisma`, `apps/app/src/features/knowledge/index.ts` (read only:
`seedParts`, `structureSeed`, `roleTree`), `apps/app/src/lib/db/knowledge.ts` (read only), the current
`settings/routing/page.tsx`, `apps/app/src/server/actions/settings/guard.ts`.

## What

- `apps/app/src/features/org-edit/` (new, pure): the rules of D8 as functions over `Knowledge` and a change, each
  returning `null` or a message key.
- `apps/app/src/lib/db/org-edit.ts` (new): the write functions of D8, each one statement or one transaction, the
  company id from the caller, `updatedBy` set; `linkSeat` checks that the user belongs to the company.
- `server/actions/settings/org.ts` ("use server"): one action per change, each `companyAdminOf` → load knowledge →
  rule → write → revalidate.
- `settings/org` (units as a tree, roles under their unit with reportsTo, decides, spend limit, seats with the
  linked member chosen from the company's active users) and `settings/routing` (the table becomes editable: type,
  keywords, owner, deputy and buddy role, wait, order), with `OrgEditor` and `RoutingEditor`; test ids of D7.
- Strings in `i18n/messages/settingsOrg.ts`.
- Tests:
  - `apps/app/tests/unit/adm/org-rules.test.ts`, `describe("ADM org rules", …)` on `rowsFromSeed(SEED, …)`: the
    four refusals of the proof and their keys; renaming a unit and adding a role are accepted.
  - `apps/app/tests/db/adm-org.test.ts`, `describe("ADM org editor", …)` (D15): an empty company; the actions add
    unit `ENG`, role "Engineering lead" with a seat linked to member X, and route r1 owned by that role; `companySeed`
    then has the route with `ownerSeatId` = that seat, and IDN's `onDeskOf` for X's `Me` is true for a case raised on
    r1; another company's rows are unchanged; a leader's call writes nothing.

## Not

- No members page change (ADM-D1), no wizard (ADM-F1). No change to `features/knowledge/index.ts` or
  `lib/db/knowledge.ts` (DIR-D1's). No `.prisma` file; matching people by name nowhere (D5).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
