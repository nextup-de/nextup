# The inbox

> **Updated 2026-11-12.** Plan INB, "One inbox for every role". Decisions Q3.1 and Q3.2 (the inbox) and Q2.9 and Q2.10 (the
> channels) are in nextup-context: [decisions/2026-11-10_prozesskarte-entscheide.md](https://github.com/nextup-de/nextup-context/blob/main/decisions/2026-11-10_prozesskarte-entscheide.md),
> with the reasoning in [analysis/2026-11-10_process-map/analysis.md](https://github.com/nextup-de/nextup-context/blob/main/analysis/2026-11-10_process-map/analysis.md).
> Acceptance: `apps/app/tests/e2e/db/inb.spec.ts` (INB-Z1).

One page, `/<company>/inbox`, answers "what is waiting for me?" for every role. It is derived from the event log by one
selector; there is no inbox table.

## What it holds (Q3.1)

Three asks. Each item is an `InboxItem` (`src/features/inbox/types.ts`) with an `ask` and a `kind`.

| Ask (section) | Kind | What it is | Who gets it | Source |
|---|---|---|---|---|
| Decide | `case` | An open or asked case on a desk | everyone who holds the desk's role (or the role it was escalated to) | `sources/cases.ts`, `onDeskOf` |
| Decide | `idea` | The manager's older "ideas waiting for a decision" | a manager, **demo companies only** (D9) | `sources/cases.ts`, `decisionsWaiting` |
| Approve or confirm | `confirm` | A typed project result that waits for a second person | the route's deputy role and managers; later the seat above; never the lead nor who typed it | `sources/projects.ts`, `projectDeskFor` |
| Approve or confirm | `reward` | A measured project whose reward is due | a manager | `sources/projects.ts` |
| Do my part | `view` | A discussion that asked for my view | an invitee who does not hold the desk and did not raise it (only with the discussion flag) | `sources/cases.ts`, `invitedTo` |
| Do my part | `question` | A question the desk asked about a case I raised | the raiser | `sources/cases.ts` |
| Do my part | `move` | My next step on a project: the lead's move, or a late move escalated to my desk | the lead, the desk it was passed to | `sources/projects.ts` |
| Do my part | `lead`, `invitation` | A project draft that waits for me, an invitation to a project | filled by plan SET | `sources/project-draft.ts` |

Items belong to a person through their user id and the roles their seats hold, never through a display name (D10). A
case that became an idea waiting in the same list is shown once, as the idea. A section with no items is not drawn;
with nothing at all the page says so.

## The order (Q3.3, Q3.4)

`orderItems` (`src/features/inbox/order.ts`): pinned first, then **late** (due day before today), then **due soon**
(exactly one working day left, shown amber), then the rest. Inside each bucket by due day ascending (no due day last),
then oldest first. An item without a due day is never late. Nothing sets `pinned` yet. Days are the company's
working-day numbers (`docs/CLOCK.md`), so a weekend or a holiday sits between Friday and the next working day without
counting; in the demo they are plain days.

## The Today line

Above the list: `n to decide · n late · n to do my part`, from `inboxCounts` (`total`, `decide`, `late`, `waiting`).
They overlap: a late case to decide is in `decide` and in `late`, so the nav badge uses `total` and nothing ever adds
the others. `waiting` counts the Do my part ask, not work that waits on other people. No count per person is shown.

## Who sees it where (Q3.2)

| Role | Home | Inbox in the nav |
|---|---|---|
| leader | `/inbox` | always, with the badge |
| manager | `/dashboard` | always, with the badge |
| member | `/raise` | only while at least one item waits |

`/inbox` has no entry in `ROLE_ACCESS`, so every signed-in role may open it. `/leader` redirects to `/inbox` and keeps
`?id=`. A Decide item opens in place with the same detail and decision sheets the leader inbox always had; every other
item links to its own page (case, project).

## Notices

Below the list, the viewer's notices: every notice a person gets by mail or Teams is also written to the outbox as a
row with channel `inapp` (see [NOTIFICATIONS.md](NOTIFICATIONS.md), "In the app"). The list shows them newest first,
unread marked, with Mark as read for one and Mark all as read. Read marks (`readAt`) belong to the person; the server
action (`markNoticesReadAction`) takes the user and company from the session only.

## Where the code is

| What | Where |
|---|---|
| Items, counts, order | `src/features/inbox/` |
| Page and detail | `src/components/inbox/`, `src/app/[company]/(app)/inbox/`, `src/app/demo/(app)/inbox/` |
| Notices | `src/lib/db/notices.ts`, `src/server/actions/notices.ts` |
| Nav and homes | `src/config/roles.ts`, `src/config/nav.ts` |
