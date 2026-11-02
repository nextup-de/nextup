---
id: DIR-B1
title: A Graph DirectorySource reads Entra user deltas into directory pages
wp: B
needs: [ DIR-G1 ]
host: any
owns:
  - apps/app/src/server/directory/graph.ts
  - packages/contracts/src/public/connectors/directory-source.ts
  - apps/app/tests/fixtures/graph-directory/**
  - apps/app/tests/unit/dir/graph.test.ts
  - docs/customer/ENTRA_SETUP.md
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D2, D5, D10, D14 ]
proofs:
  - id: B1
    says: the Graph adapter gets an app-only token, pages through a full round and a
      delta round from recorded responses, maps users, managers, disabled and
      removed accounts and the employeeId, and refuses a cursor outside
      graph.microsoft.com
    run: npm test -w @nextup/app -- tests/unit/dir/graph.test.ts -t 'DIR Graph
      directory'
status: open
---

Plan DIR (sub-plan of PILOT): the Graph adapter. Read first: D2, D5, D10 of the plan,
`packages/contracts/src/public/connectors/directory-source.ts` and `base.ts`, `apps/app/src/features/auth/entra.ts`
(`entraApp`, `tokenUrl`), `apps/app/src/server/graph-token.ts` and `apps/app/src/features/m365/` (Graph call style,
no logging of tokens), `apps/app/tests/fixtures/graph/README.md` (how recorded responses are kept),
`docs/customer/ENTRA_SETUP.md`.

## What

- `packages/contracts/src/public/connectors/directory-source.ts`: `employeeId: z.string().nullable().optional()` on
  `DirectoryEntry`, with a comment (HD14: personnel number, matching only) - nothing else (D2). Keep the existing
  contract tests green.
- `apps/app/src/server/directory/graph.ts` (new): `graphDirectory(opts)` exactly as D10, returning a
  `DirectorySource` (`kind: "DirectorySource"` as `base.ts` wants); the token cache is per tenant; errors are thrown
  with a short reason (status code and Graph error code only, no body, no token).
- `apps/app/tests/fixtures/graph-directory/` (new): recorded-shape JSON pages for a made-up tenant - a token
  response, a full round of two pages (nextLink then deltaLink) with five users (one with employeeId, one with a
  manager, one disabled), and a delta round with one moved user, one `@removed` and one new user - plus a README.
- `docs/customer/ENTRA_SETUP.md`: a section "Directory sync": the application permission User.Read.All with admin
  consent, which fields NextUp reads (D5) and what it never reads, that the department must name an org unit (Q1),
  how often it runs (Q2), how to switch it on in `/admin`.
- `apps/app/tests/unit/dir/graph.test.ts`, `describe("DIR Graph directory", …)` with an injected `fetch` serving the
  fixtures: the token request is a client-credentials POST to the tenant's token URL with the `.default` scope; the
  full round's first call has the `$select` and `$expand` of D10 and returns `nextCursor` = the nextLink, the second
  returns `nextCursor: null` and exposes the deltaLink as the cursor to store; entries carry externalId, email (mail
  or userPrincipalName), department, jobTitle, managerExternalId, employeeId and `active: false` for the disabled
  account; the delta round puts the removed id in `removedExternalIds`; a cursor `https://evil.example/...` is
  refused without a fetch; the token is fetched once for two calls.

## Not

- No database writes (DIR-A1), no loop (DIR-C1). No Graph groups endpoint (D8). No live call anywhere (D14).
- No other contract file; no package.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(dir-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
