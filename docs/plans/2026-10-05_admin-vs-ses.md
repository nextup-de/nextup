# Plan: admin tickets — what to take from Swiss Edu Solution's hub

> **Plan · 2026-10-05 · open.** Compares the ticket tool in `nextup-admin` (admin.sellux.ch) with the
> "Bugs & Feedback" module of Swiss Edu Solution's hub (two screenshots, 5 Oct). Fits next to
> `2026-09-27_platform.md` and the admin platform plan (mail, accounts, sidebar, box metrics).

## What their tool does well

1. **Auto tickets.** Their monitor ("Argus-Auto") files a ticket when a tenant hits an error
   (`net:econnrefused`, `http:rate-limit`, `auth:ldap-sso-failure`, `http:5xx`), and counts repeats
   on one ticket ("61x"). 38 of their tickets come from it, 27 from people. Ours come only from people.
2. **Source filter with counts**: all / testers (people) / auto.
3. **Every status has a count**, and two outcomes we lack: "Fix Update" (fix waiting for a
   deploy) and "Won't fix".
4. **Declining is its own action** ("Meldung ablehnen…"), not just a status change.
5. **The team can change the category**: a "bug" gets re-triaged as a feature request. Our kind
   (bug / idea / question) is fixed by the reporter.
6. **Search covers more**: number, product, school, reporter. Ours: title and description only.
7. **Grouped navigation** (modules / development / monitoring / infrastructure), a search over all
   tools on `/`, an audit log and a team page.

## What we already do better — keep it

- Screenshot and browser log (pages, console errors, failed requests) on every report.
- Priority and assignee, the "Mine" view; their tickets have no owner.
- Archive, labels, age column, `C` for a new ticket, named authors in the thread.
- Readable rows. Theirs cut every column ("pensumpl…", "c39d0523-…"), titles carry raw tenant ids,
  the breadcrumb is a UUID, and "delete for good" is a big red button. None of that is copied.

## The PRs

Small steps, same four statuses, no new workflow states.

| # | Repo · branch | What | Size |
|---|---|---|---|
| 1 | admin · `feat/ticket-triage` | Kind is editable on the ticket page. **Decline…** asks for a reason, posts it to the reporter (stack tickets) and closes the ticket as "won't fix" (`Ticket.resolution`, admin-only column). | S |
| 2 | admin · `feat/board-counts-search` | Counts on every tab; search also matches the key (`NU-3`, `DEV-12`), the company and the reporter role; a People / Auto filter once PR 3 exists. | S |
| 3 | both · `feat/auto-tickets` | Stacks report their own errors with a fingerprint; admin keeps one ticket per fingerprint with count, first and last seen, and reopens a fixed one when the error comes back. **Changed 8 Oct:** its own message, not optional fields on `TicketIntake` - see below. | M |
| 4 | admin · `feat/sidebar-overview-audit` (already planned) | Grouped sidebar, overview on `/`, board on `/tickets`, `/audit`; plus `/` to search tickets and pages. | M |
| 5 | admin · `feat/team-accounts` (already planned) | Named accounts instead of the shared login — our "Team & Benutzer". | — |

Order: 1 → 2, then 3; 4 and 5 follow the admin platform plan.

### PR 3, as built (8 Oct 2026)

- **The stack side** (this repo): `src/features/errors` scrubs and fingerprints; `instrumentation.ts`
  (`onRequestError`) and `/api/client-errors` count server and browser errors; the `ErrorGroup`
  table holds one row per kind; `src/server/errors-report.ts` sends the pending rows once a minute.
- **Its own message, `POST /api/errors`** (`packages/contracts/src/errors.ts`), not optional fields
  on `TicketIntake`. An auto error has no reporter, impact, screenshot or browser context, and an
  admin from before the change would strip the unknown fields and file it as a person's ticket. A
  new endpoint gets a clean 404 from an older admin instead; the stack then waits an hour.
- **Not a `Ticket` row in the stack.** That would show internal errors in the company's own
  /admin, take NU numbers from real reports, and need a reporter role.
- **Admin side** (nextup-admin): `Ticket.source` people | auto, one ticket per fingerprint across
  stacks with a per-stack count, its own key sequence; reopen only when a newer build
  (`appCommit`) sees a fixed one again - otherwise the pinned demo would reopen everything; auto
  tickets stay out of `/api/replies` and `/api/ticket-state`; the People / Auto filter of PR 2.

## Left out

- A sortable seven-column table: our grouped list reads better.
- A per-tester filter: our reporters are pseudonyms. Revisit when there is a tester programme.
