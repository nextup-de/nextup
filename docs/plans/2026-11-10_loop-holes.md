# Plan: close the holes in today's loop

> **Plan · 2026-11-10 · in progress.** Block A of the build order (nextup-context
> `plans/2026-11-10_build-order.md`): eleven small changes to the loop that runs on `main`. Each fixes something the
> product already promises and does not do. Decided on 10 Nov 2026 with the process charts (nextup-context
> `decisions/2026-11-10_prozesskarte-entscheide.md`); the `Q` ids are the decisions.

## Why

The process charts of 10 Nov showed places where today's loop simply stops. The No sheet says the raiser "is told
today", and no mail is written. A question the raiser never answers keeps the case paused forever. A measured result
waits for a second person who is never asked. None of these needs a new concept: the events, the clock and the outbox
exist. Each item below is one small PR.

## The items

| # | What | Decision | Charts | Status |
|---|---|---|---|---|
| 1 | The raiser is told about a question, a pass and a no; the desk is told about the answer; a yes without a project tells the raiser too | Q4.1 | P4 | built (#640) |
| 2 | An unanswered question: a reminder to the raiser after 3 working days, back on the desk as open after 5, marked "no answer" | Q4.3 | P4 | built (#641) |
| 3 | A case without a route goes to a triage seat with a deadline; a raise with no fitting desk goes to a fallback desk | Q2.1, Q1.9 | P2, P1 | built, without the setting (#642) |
| 4 | A raise onto a vacant desk is handed to the route's deputy seat at once, on the web and on the floor | Q1.10 | P1 | built (#643) |
| 5 | A Teams card that cannot be delivered becomes a mail for the same notice | Q2.11 | P2 | built (#644) |
| 6 | "Confirm result" gets a desk, a deadline of 5 working days, one reminder, then the seat above | Q6.15 | P6 | built, without the sponsor |
| 7 | The event that closes a project sends one summary to team, sponsor, followers and raiser | Q6.20 | P6 | open |
| 8 | Stopping a project: lead, managers and sponsor may, with a reason; raiser and team are told | Q6.21 | P6 | open |
| 9 | The raiser can withdraw an idea that is not decided (`case.withdrawn`) | Q1.14 | P1 | open |
| 10 | Anonymity is chosen per idea on the last look; the company sets the default | Q1.7 | P1 | open; Marc checks the works-agreement text first |
| 11 | A monthly AI cost cap per company in the gate, with warnings at 70 and 90 % | Q7.3 | P7 | open (block H1 of the build order); built apart from this stack, on its own branch off `main` |

Items 2 to 4, 6 and 9 need a new event or clock fact and so start with Kevin's contract (events, reducer, rights,
tests). Items 1, 5, 7 and 8 only plan notices from events that exist.

## Item 1: who is told what

All of it is planned by the pure `loopMails` (`features/loop/notice.ts`) from the state after the event and written to
the outbox as `loop.<event type>` rows, like the discussion and project mails. The actor never gets a mail about their
own event.

| Event | To | Says |
|---|---|---|
| `case.asked` | the raiser | the question, and that the answer date waits for the reply |
| `case.answered` | every holder of the case's desk, and who asked | the answer, and when the answer to the idea is now due |
| `case.handed` by a person | every holder of the new desk; the raiser | who passed it and why; the answer date stays |
| `case.handed` by the clock | nobody here | its reminders (`reminder.deadline`, `reminder.escalation`) already tell them |
| `case.decided` no | the raiser | the reason in words (the sheet's category) and the line the desk wrote |
| `case.decided` yes without a project | the raiser | that it was accepted (projects off, or a yes from a Teams card) |

Not in this item: these rows are mails only, as every `loop.*` row is today. Whether a notice goes to Teams, to mail or
to both is decided per notice group in block B (Q2.9), together with the in-app list of notices.

## Item 2: a question nobody answers

A new event, `case.unanswered`, that only the clock writes; no schema change. The clock counts from the day the question
was asked: on day 3 one `clock.due` fact of kind `question` reminds the raiser (`reminder.question`), on day 5 the
scheduler writes `case.unanswered`. The reducer opens the case again, adds the paused days to the answer date and keeps
the question with `unanswered` set. The desk and who asked are told that they can decide without the answer, and the
raiser that the idea goes on. The desk's inbox shows "No answer from {name}", the raiser's row and the timeline say the
same. The numbers 3 and 5 are constants in `features/clock/due.ts`; they become company rules when Settings → Rules is
next touched. The raiser can no longer answer the returned question, only comment.

## Item 3: a raise no desk owns

Today such a raise is stored with no seat: it is in nobody's inbox, nobody is told, and the clock skips it. Now the
server puts it on the **fallback desk** when it stamps the raise: the occupied seat at the head of the org chart, the
top role with the most roles under it. Everything else then works as for any case: the desk's holders get the raise
notice, it shows in their inbox, they pass it on or answer it, and the raiser's answer date runs from the raise. The
clock reminds the desk after one working day while it has not moved (`reminder.triage`) and gives the case its deadline
fact and the second level like any other.

Decided and not built here: the decisions name a role chosen in Settings (the review role once the review exists, else a
"triage role"). There is no such setting yet, so the head of the org chart stands in. A company without an org chart
has no fallback desk. Cases raised without a route before this release keep sitting on no desk; a manager can pass them.

## Item 4: a desk nobody sits at

Today the web raise accepts a vacant desk and the case waits five working days for the deadline; the floor refuses a
role without a seat. Now the clock, the one writer for every way of raising, hands such a case on at its next run:
`case.handed` with `why: "vacant"` to the route's deputy desk, else to the seat above. The same rule catches a desk that
empties after the raise. The new desk and the raiser are mailed. On the web the desk card says "Vacant - goes to
{names}" and the sent line names them. On the floor a role with no seat at all now lands on the seat above it, and the
form says which role that is; only with nobody above is the raise still refused.

Not covered: a vacant desk with no deputy and nobody above still waits for its deadline; a seat whose user is
deactivated counts as occupied; the demo has no scheduler, so nothing moves there.

## Item 5: a card that does not arrive

Today a Teams row that fails stays failed: the person who added the bot and later removed it, or whose tenant refuses
the card, is told nothing. Now the delivery writes one mail row for the same notice when a card fails for good, with
the key `<key>:mail`. A card that keeps failing with an error worth retrying is given up on its third try, about six
minutes in, instead of after the whole ladder of about fifteen hours: a deadline reminder is of no use the next day.
The failed card stays on Settings → Notifications and says that a mail was written.

Not covered: a person without a mail address still gets nothing (the card keeps retrying); "Retry" on a failed card
sends the card again, so the person can end up with the mail and the card.

## Item 6: a result nobody confirms

Today a typed result waits for a second person who is never asked: no notice, nothing in the inbox, no date. The
reward and the KPI wait with it. Now every manager and every holder of the route's deputy role is mailed when the
result is typed and finds "Confirm the result" under "Projects waiting on you", due in 5 working days. The project page
says "Waiting for a second person until {date}". The clock reminds them once when the date has passed
(`reminder.confirm`), and 3 working days later asks the seat above the deputy's desk, whose holders may then confirm
too. No new event type: two `clock.due` facts of the new kind `confirm`.

Decided and not built here: the sponsor as a third confirmer (a project has no sponsor until the project draft of
chapter 5 exists), and sending a doubtful number back once (Q6.16). The demo has no second person and no scheduler,
so it shows none of this.

## Docs this plan changes

Each item updates the reference doc of what it touches in the same PR: `docs/NOTIFICATIONS.md` (items 1, 5 to 8),
`docs/CLOCK.md` (2, 3, 6), `docs/LOOP.md` (2 to 4, 9), `docs/IDEAS.md` (9, 10), `docs/ASSISTANT.md` (11).
