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
| 1 | The raiser is told about a question, a pass and a no; the desk is told about the answer; a yes without a project tells the raiser too | Q4.1 | P4 | this PR |
| 2 | An unanswered question: a reminder to the raiser after 3 working days, back on the desk as open after 5, marked "no answer" | Q4.3 | P4 | open |
| 3 | A case without a route goes to a triage seat with a deadline; a raise with no fitting desk goes to a fallback desk | Q2.1, Q1.9 | P2, P1 | open |
| 4 | A raise onto a vacant desk is handed to the route's deputy seat at once, on the web and on the floor | Q1.10 | P1 | open |
| 5 | A Teams card that cannot be delivered becomes a mail for the same notice | Q2.11 | P2 | open |
| 6 | "Confirm result" gets a desk, a deadline of 5 working days, one reminder, then the seat above | Q6.15 | P6 | open |
| 7 | The event that closes a project sends one summary to team, sponsor, followers and raiser | Q6.20 | P6 | open |
| 8 | Stopping a project: lead, managers and sponsor may, with a reason; raiser and team are told | Q6.21 | P6 | open |
| 9 | The raiser can withdraw an idea that is not decided (`case.withdrawn`) | Q1.14 | P1 | open |
| 10 | Anonymity is chosen per idea on the last look; the company sets the default | Q1.7 | P1 | open; Marc checks the works-agreement text first |
| 11 | A monthly AI cost cap per company in the gate, with warnings at 70 and 90 % | Q7.3 | P7 | open (block H1 of the build order) |

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

## Docs this plan changes

Each item updates the reference doc of what it touches in the same PR: `docs/NOTIFICATIONS.md` (items 1, 5 to 8),
`docs/CLOCK.md` (2, 3, 6), `docs/LOOP.md` (2 to 4, 9), `docs/IDEAS.md` (9, 10), `docs/ASSISTANT.md` (11).
