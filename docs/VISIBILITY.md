# Visibility: who receives which case

Plan VIS (`docs/plans/2026-11-02_pilot-pages/build-plans/VIS/PLAN.md`). The server decides what a browser may
know; the browser never gets a case its person may not open.

## The rule

`apps/app/src/features/cases/visibility.ts` is the only place that decides. A viewer may open a case when one of
these holds:

- they raised it, or it is on their desk, or they are invited, or they are on a project it opened or joined;
- the raiser's choice lets them: `everyone`; `custom` with their user id or one of their units; `private` lets nobody
  else in (not a manager either);
- with no choice: a manager always, a leader when the raiser's seat reports to one of the leader's roles, a member never.

People are matched by user id, seat id, role id and org unit id, never by display name.

## The keys

Each case has `accessKeys` (table `CaseView`, one row per case); each viewer has `viewerKeys`. A viewer may open a
case when the two share a key.

| Key | Opens the case for |
|---|---|
| `u:<userId>` | the raiser, invitees, project people, custom audience |
| `r:<roleId>` | holders of the desk's role, the escalation's role, the roles the raiser reports to (no choice) |
| `n:<unitId>` | holders of a role in a custom unit |
| `all` | everyone (`everyone`) |
| `m` | managers (no choice, or any choice but `private`) |

## The window

`loadLogFor(companyId, viewer)` (`apps/app/src/lib/db/viewer-log.ts`) ships the events of the cases the viewer may
open that are open, or whose last day is within the last 90 working days, at most the 500 newest by last day; plus the
events of the projects those cases opened or joined, every `idea.*` event and every event with no target. The window
applies to everyone, managers too. An older case the viewer may open is loaded on its page by the server action
`loadCaseLog(slug, caseId)`; one they may not open is a 404.

## Rebuilding the projections

`CaseView` rows follow every append. After a release that changes the rule, an org change (seats, roles) or to give old
custom raises their audience by id, rebuild them all (apps/app, reads `.env.local` or the environment):

```bash
npx tsx prisma/rebuild-projections.ts
```

One line per company: `<slug>: <n> cases`. Safe to repeat. A company without rows gets the full log until the first
rebuild.

## Q1: the token-based events GET

`GET /api/[company]/events` (n8n and other tokens) still returns every event of the company. A token is an integration
acting for the company, not a person. Phase API decides scopes such as private cases for v1.

## The proof

`apps/app/tests/e2e/db/visibility.spec.ts` (`VIS acceptance: …`) creates a demo-template company in sandbox stage,
fills it with 50,000 events (`fixtures/bulk-events.ts`, 5,000 cases of 10 events, deterministic), and signs in:

- as member M (one private and one shared case, plus another member's private case): every response of the layout and
  of `loadCaseLog` is recorded; no id or title of the other member's private case appears in them;
- as the route owner's leader and as the manager: the inbox and one case page reach `load` in under 1000 ms (Navigation
  Timing, after one warm-up visit).

Status when written: the visibility half passes. The speed half does not yet: against a built app the layout's
document is about 1.5 MB and takes about 1.7 s to arrive, and a case page about 7 s, against about 0.15 s with the
same company without the bulk. The server reads are fast (`loadLogFor` 100 to 270 ms, `loadCaseFor` 20 ms, the reducer
on the shipped log under 15 ms), so the time is spent rendering the shipped log, not loading it.

## VIS gaps

Register rows of phase VIS (`docs/audit/gaps/`) and the task that answers each (D14):

| Row | Gap | Answered by |
|---|---|---|
| G-039 | Every browser gets the whole case log; visibility applied in the browser only | VIS-C1 (`loadLogFor`, `seedForViewer`, `loadCaseLog`) |
| G-040 | No read model and no paging; every page reduces the full log | VIS-B1 (`CaseView`, `projectCases`, `rebuildProjections`) |
| G-225 | The rate limiter counts in process memory | VIS-D1 (`RateCounter`, `hitShared`) |
| G-240 | No connection pooler between the app and Postgres | open: VIS-D1 sets `DATABASE_POOL_MAX` and the statement timeout, but a pooler service in `stack/` belongs to OPS/SEC |
