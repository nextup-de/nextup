# The case loop on a real company

> **Updated 2026-11-04.** Plan LOOP «Case loop v1» (LOOP-Z1). Describes what runs on `main` for a non-demo company.
> The proof of the whole loop is `apps/app/tests/e2e/db/loop.spec.ts`.

The loop: an idea is **raised to a desk**, the desk owes an **answer by a date**, a breached date **hands the case to the
deputy**, the author sees the **routing**, every yes and no lands in the **decision log**, a yes opens a **project**, the
project is **measured** with a result a second person **confirms**, and a better confirmed result makes a **reward** due.
It works with the AI, n8n, Jira and Microsoft 365 all off (D2).

## The loop step by step

1. **Raise to a desk.** On the raise page "Publish idea" asks "Where should it go?". It offers at most 3 *desks*: a desk is a
   role that owns a route, its holders come second (`desksFor`, `features/ideas/desks.ts`). The route the keywords found is
   tagged "Proposed" and the line "Routed by keywords - the AI is off for this company." says where it came from. The reasons
   are facts about the route and the role, never a score or a person's track record. "Choose another desk" lists every
   route-owning role. The send names the role and a date.
   A raise that no route owns, or whose route has no owner seat, lands on the **fallback desk**: the occupied seat at
   the head of the org chart (`fallbackSeat`, `features/cases/stamp.ts`), set by the server like every seat of a raise.
   Its holder passes it on or answers it; a manager can still give it a route (`case.override`). It has the same answer
   date as any case, and the desk is reminded to pass it on after one working day. Without an org chart it lands on no
   desk, as before, and only a manager can pick it up.
   A raise onto a desk nobody sits at does not wait: within a minute the clock writes `case.handed` with
   `why: "vacant"` to the route's deputy desk, or to the seat above when that desk is vacant too (`features/clock/due.ts`).
   The desk card and the sent line of the raise already name who gets it. The new desk and the raiser are told.
2. **Answer promise.** The case page (and "My cases") shows "Answer by {date}" and "With · {role} · {people}"
   (`answerPromise`, `features/cases/promise.ts`). The date counts working days of the company calendar. A yes, a no or a
   question answers; a hand-over does not. A question pauses the answer date until the raiser replies. If no reply
   comes, the raiser is reminded after 3 working days, and after 5 the clock writes `case.unanswered`: the case is open
   on the desk again, the question stays on it marked "no answer", and the answer date runs on
   (`QUESTION_REMIND_DAYS`, `QUESTION_RETURN_DAYS` in `features/clock/due.ts`; fixed numbers, not company rules yet).
   Demo companies have no scheduler, so there a question waits.
3. **Hand-over rule.** With the company rule `deadline_handover` on (default for new companies), a breached answer date
   writes one `case.handed` with `why: "deadline"` to the deputy seat; the submitter sees the date and who holds the case. With
   the rule off, the deputy role is told and the owner keeps the case.
4. **Routing panel.** The raiser, the holders of the desk or its escalation role and managers see "Proposed and sent to
   {role} · by keywords" (or "by the AI"), then one row per move, with the destination and the day only (`routingTrail`).
5. **Decision log.** `/<company>/decisions`, in the nav after Feed: every yes and no a person may open, newest first, with the
   deciding desk's role (never the decider's user id) and, while projects are on, the project it opened.
6. **Projects.** A yes opens a project with the person who said yes as lead. The lead takes the baseline (metric, unit, which
   way is better, source), starts the project, works the board and marks it done.
7. **Measure and confirmation.** The check opens 30 days (or the company's days) after done. The lead types the result,
   optionally with saving, CO₂, energy and scrap figures; the card reads "Typed by … · not confirmed" and "Waiting for a
   second person until {date}". A manager or a holder of the route's deputy role confirms ("Confirm result"); never the lead
   and never the person who typed it. The confirmation has a desk and a date (decision Q6.15, `features/projects/confirm.ts`):
   who may confirm is mailed when the result is typed, finds "Confirm the result" under "Projects waiting on you" in the
   inbox, and has 5 working days. After that the clock reminds them once; 3 working days later it asks the seat above the
   deputy's desk, whose holders may confirm from then on. A file import is provenance only and is confirmed the same way; a trusted system source is not available to people.
8. **Recognition.** Only a confirmed latest result with the verdict *better* makes the reward due, by the company's reward
   rule; a manager records it. Same or worse closes the project without a reward.
9. **Stopped.** The lead or a manager stops a project at any time before its reward, with a reason. The lead, the team
   and who raised the idea get a mail with who stopped it and why (decision Q6.21); the idea stays in the archive.
10. **Closed.** Still derived, never an event. The event that closes the project sends one summary to the lead, the team
   and who raised the idea: the latest result against the baseline and the recognition (decision Q6.20,
   `features/projects/close.ts`, `docs/NOTIFICATIONS.md`).

## Switches per company, and who sets them

| Switch | Where | Who | Effect when off |
|---|---|---|---|
| Rollout flags `discussion`, `projects` (`src/config/flags.ts`) | admin.sellux.ch | Sellux, kill switch | Page, action and events API follow; default on for every stage. |
| Step `discussion` (`loop_steps`) | Settings → Rules | company manager | No discussion stage. |
| Step `projects` | Settings → Rules | company manager | No Projects in the nav; the Project column of the decision log goes; a yes opens no project. |
| Step `measure` | Settings → Rules | company manager | A project opens no checks, closes at done with status measured, no verdict, no reward. |
| Step `recognition` | Settings → Rules | company manager | No reward ever falls due. |
| `deadline_handover` | Settings → Rules | company manager | The deputy is told, the owner keeps the case. |
| Measure days, tolerance, reward rule, fast lane | Settings → Rules | company manager | Company rules read by the project reducer. |

`flagsFor(slug)` returns the rollout flag AND the company's step.

## Claims of D10, each with the test that proves it

A claim is public only for what runs on `main` for a non-demo company. "e2e" is `tests/e2e/db/loop.spec.ts` on a sandbox company
with no AI, n8n, Jira or Microsoft 365; "db" tests run against a company in the test database.

| Claim | Proof |
|---|---|
| The answer date: the author sees by when they get an answer and who holds it | e2e (sent line names the role and a date; the case page shows "Answer by" and "With · Quality lead · {name}"). Rules of the date: `tests/unit/loop/promise.test.ts`. |
| The deputy hand-over: a breached date hands the case to the deputy once | db `tests/db/loop-handover.test.ts` (one `case.handed`, also when run twice; none with the rule off); unit `tests/unit/loop/handover.test.ts`, `handover-reducer.test.ts`. Not exercised in the e2e: a sandbox clock cannot be moved to breach a date. |
| Desks, not people: ideas go to a role, with no score or track record of a person | e2e (the desk "Quality lead" with its holder, tagged "Proposed", reasons from the keywords); unit `tests/unit/loop/desks.test.ts` ("no score, no person, no answered-case count"). |
| The score does not count model output | unit `tests/unit/loop/truth.test.ts`. Not exercised in the e2e: with the AI off no model proposes a route. |
| Verified outcomes: a measured result counts only with a second person's confirmation | e2e (the lead's result is "Waiting for a second person until …" and the lead finds no confirm button; the second manager finds it on the desk and confirms); unit `tests/unit/projects-confirm.test.ts`; unit `tests/unit/loop/measure.test.ts`; db `tests/db/loop-measure-import.test.ts`. |
| Reward only after a better result | e2e (verdict better, then the reward is due and recorded); unit `tests/unit/loop/measure.test.ts` ("a confirmed same or worse latest verdict gives no reward"; "recognition off"). |

Also proved in the e2e: the decision log lists the yes for a manager and for the raiser, and a manager who switches
Projects off removes Projects from the member's nav.

## What the acceptance does, and its limits

- The company is in stage `sandbox`, made from the empty template; the structure, route and login codes are written with
  the same writers the Settings pages use. The company has a single 30-day check (`measureDays: [30]`): a project counts as
  measured only when every check has a result, and the 90-day check cannot be reached on a clock that does not move.
- A sandbox clock cannot be moved, so `project.started` and `project.done` are written as `CaseEvent` rows dated 31 working
  days back; the baseline, the result, the confirmation and the reward go through the UI.
- The card names the person who typed the result ("Typed by {name} · not confirmed"), because the seat label is the holder's
  name; the decision log and the case page name the desk's role.

## LOOP gaps

Register rows of phase LOOP (D24).

| Row | Gap | Answered by |
|---|---|---|
| G-006 | Raise stand-ins: the receiver is a person with a score, and the colleague and meeting stand-ins. | LOOP-B1 (desks, not people; stand-ins gone), LOOP-C1 (case page, My cases). Proved in the e2e. |
| G-007 | Switches: projects and discussion were off outside the demo and only admin.sellux.ch could switch them. | LOOP-S1 (flags default on; step and hand-over switches on the Rules page, D12). Proved in the e2e (projects off removes the nav item). |

## Open items

- **Q2, suggestion provenance in the database.** Open: LOOP stops the gain ranking and marks each suggestion's source (D5)
  without a schema change. A verbatim record of which turns came from a suggestion waits for MET or AIP, if the verbatim
  share becomes a pilot metric.
- **Q3, metric presets, an emission factor and a confirmer role.** Open: managers and the route's deputy role confirm (D18);
  saving, CO₂, energy and scrap are plain optional figures (D20). Presets, the factor and a confirmer role wait for the PROOF
  follow-up after the pilot start.
- **Q4, co-authors and team credit.** Open: not built; the brief allows no feature beyond the loop.
