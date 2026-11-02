---
id: TRUTH-C1
title: The browser's log carries no real actor id of an anonymous member and no private case it may not see (stopgap until VIS-C1)
phase: TRUTH
needs: [ TRUTH-B1 ]
owns:
  - apps/app/src/features/cases/log-redact.ts                     # new, pure
  - apps/app/src/lib/db/log-for-viewer.ts                         # new
  - apps/app/src/app/[company]/(app)/layout.tsx
  - apps/app/src/app/api/[company]/events/route.ts
  - apps/app/tests/unit/truth/log-redact.test.ts
  - apps/app/tests/db/truth-log-for-viewer.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, HD5, HD10 ]
proofs:
  - id: B1
    says: redactForViewer replaces an anonymous actor's user id by its handle key, keeps the viewer's own id, and drops a private case's events for a viewer who is neither raiser nor desk
    run: npm test -w @nextup/app -- tests/unit/truth/log-redact.test.ts -t 'TRUTH log redaction'
    expect: '[1-9]\d* passed'
  - id: B2
    says: the log the layout and the events GET hand to a member holds no actorUserId of another handle-holder and no event of a private case raised by someone else
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/truth-log-for-viewer.test.ts -t 'TRUTH log for viewer'
    expect: '[1-9]\d* passed'
pr_title: "fix(cases): redact the browser's log until VIS lands"
---

# TRUTH-C1 The browser's log carries no real actor id of an anonymous member and no private case it may not see

## Goal

Today every signed-in browser receives the company's whole event log (`loadLog` in `lib/db/events.ts`), with
`actorUserId` next to each anonymous handle and with every "private" case. Anyone with dev tools can join a handle to
a user id and read private cases. VIS (server-side projections, VIS-C1) is the real fix; it is not merged and waits on
other phases. This task is the stopgap: one pure redaction, applied on the two paths that hand events to a browser.

## Context (read first)

- `AGENTS.md`; `apps/app/src/lib/db/events.ts` (`loadLog`, `loadLogForSlug`, `SELECT`).
- `apps/app/src/app/[company]/(app)/layout.tsx` (`initialLog`), `apps/app/src/app/api/[company]/events/route.ts`
  (`GET`, the polling path).
- `apps/app/src/features/cases/events.ts` (event types, `case.raised` payload with `visibility`, `seenBy`,
  `assigneeRoleHolderId`; `case.handed` with `toRoleHolderId`), `apps/app/src/features/cases/visibility.ts`,
  `apps/app/src/components/dashboard/derive.ts` (`canOpen`: visible by choice, on the viewer's desk, or invited).
- `apps/app/src/features/auth/identity.ts` (the viewer's seats), `User.handle` in `prisma/schema/auth.prisma`.
- VIS plan: [build-plans/VIS/PLAN.md](../2026-11-02_pilot-pages/build-plans/VIS/PLAN.md), task VIS-C1.

## What

- `features/cases/log-redact.ts` (pure): `redactForViewer(log: EventLog, v: { userId: string; seatIds: string[];
  role: string }, anon: ReadonlyMap<string, string>): EventLog` where `anon` maps the user id of every member with a
  handle to that handle.
  - Every event whose `actorUserId` is in `anon` and is not `v.userId` gets `actorUserId: "handle:" + handle`
    (stable per person, so co-signer dedupe by id still works, and no real id leaves the server).
  - Every event of a case whose `case.raised` has `visibility: "private"` is dropped unless the viewer raised it
    (`actorUserId === v.userId`), or one of `v.seatIds` is its `assigneeRoleHolderId` or a later `toRoleHolderId`.
    Cases with any other visibility stay (the browser's existing rule still filters them).
  - When unsure (missing payload fields), keep the event: the stopgap must never hide a case from its desk.
- `lib/db/log-for-viewer.ts`: `loadLogForViewer(slug, viewer, now?)` = `loadLogForSlug` plus one query for
  `{ id, handle }` of the company's users with a handle, then `redactForViewer`.
- `layout.tsx`: `initialLog` comes from `loadLogForViewer`. `events/route.ts` GET applies `redactForViewer` to the
  rows it returns, with the same viewer.
- Tests:
  - `tests/unit/truth/log-redact.test.ts`, `describe("TRUTH log redaction", …)`: an anonymous actor's id becomes
    `handle:Anonymous #1234`; the viewer's own id stays; a named member's id stays; a private case raised by A is
    dropped for B, kept for A and kept for the holder of its assignee seat; an "everyone" case stays.
  - `tests/db/truth-log-for-viewer.test.ts`, `describe("TRUTH log for viewer", …)`: seed a sandbox company with two
    handle-holders and a private case; `loadLogForViewer` for the other member holds neither the first member's
    user id nor the private case.

## Not

- No projection table, no paging, no change to `visibility.ts` or the reducer (VIS). No change to what managers
  see beyond the private rule above.

## Constraints

- Edit only the paths in `owns`. Must merge after TRUTH-B1 (same layout file) and before VIS-C1; tell Kevin in the
  report that VIS-C1's `viewer-log.ts` should call `redactForViewer` for the actor ids.
- No `git commit`, no installs, no network; do not run the DB proof (the runner does).

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/log-redact.test.ts -t 'TRUTH log redaction'` (≥ 1 passed)

## Done when

- B1 and B2 red on `main` (the files do not exist), green on the branch; lint, typecheck, test, build green; the case
  page, inbox and dashboard of `/acme` still load in the dev server.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
