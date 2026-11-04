# Success metrics: what the pilot measures and what counts as a pass

> **Updated 2026-11-04.** The pilot criteria of `docs/plans/2026-11-01_pilot-readiness.md` (phase 21), mapped to the
> numbers of the Pilot report, with the rules for reading them. The numbers are measured by the app from the events
> people wrote; no model output changes a number (`docs/METRICS.md`). Targets marked **KEVIN: fill in** are not decided.

## The pilot

Six weeks in stage *pilot* with one company of 1,000 to 2,000 people. Week 1 is the week of the first move to pilot. A pilot
has no stored length in the app, so the report never shows "week 2 of 8"; the six weeks are an agreement between NextUp and
the customer, written down before the start together with the stop rule (`ONBOARDING.md`).

## From the pilot criteria to the report

The master plan says the pilot runs for 6 weeks, that its numbers are measured, and that it ends in a review against the
pilot criteria (gate G5, Kevin and Marc). It fixes no numeric targets, so every target below is marked for Kevin. The report
shows these tiles, per ISO week (Monday to Sunday):

| Criterion | Pilot report | How it is counted | What counts as a pass |
|---|---|---|---|
| Cases get a first answer sooner | *First answer* (median, working days) | median days from the case being raised to its first decision with a reason, over cases raised that week; questions and hand-overs do not count | the median is lower than the baseline in most pilot weeks. **KEVIN: fill in — the target, for example "at least a third lower"** |
| The promise is kept | *Answered on time* (%) | share of cases raised that week whose first response (a decision or a question, never a hand-over) came within `promiseDays`; an open case past the promise counts as late | the share is above the baseline in most weeks and ends higher than it started. **KEVIN: fill in — the target** |
| People raise things | *Cases per 10 people* | cases raised in the week, per 10 active people in scope | not lower than the baseline, and not falling over the weeks |
| People take part | *Using NextUp* (%) | share of active people who raised at least one case in the week | rising or steady over the weeks. **KEVIN: fill in — the target** |
| Deputies catch what is missed | *More numbers*: handed to a deputy (%) | cases handed over for a missed answer, of those answered or handed | falling over the weeks as desk holders adapt |
| Decisions lead to work | *More numbers*: decided projects done (%), verified results | projects decided in the week that are done; results confirmed by a second person or a trusted source | reported, no target in the first pilot |
| The AI proposal is right | *More numbers*: proposals changed by a person (%) | shown only when the AI is on | reported; with the AI off the router is by keywords |
| Nothing broke | no report number | the incident notes (`SUPPORT.md`), the first-week checks and the audit log | no data-loss or access incident open at the end; no unplanned switch back that stayed unexplained |

The baseline is the two weeks before the pilot by default, or numbers the company entered with their source. It is set on
the Dashboard; the report page links to it. A tile shows "No baseline yet" until one exists and the report cannot compare.

## Reading the numbers

- **A pass is a pattern, not a week.** One strange week (a holiday, a stack update, an incident) does not decide. Read the
  trend across the pilot weeks and against the baseline.
- **Small units are hidden.** A unit or role with fewer than 5 active people shows "Too few to show". Company numbers are
  hidden below 5 contributors. When exactly one child of a parent would be hidden, a visible sibling is hidden too, so the
  hidden number cannot be worked out by subtraction. This is a protection against picking out a person; it is not
  anonymisation.
- **Weeks follow the company's calendar.** A week with no working day has no report. A holiday Monday starts the week on
  Tuesday.
- **Ratios without a denominator are blank**, not zero: a week with no cases shows no percentage.
- **No person numbers.** No page and no download ranks or counts a person (`docs/METRICS.md`). If a customer asks for one,
  the answer is no.

## The weekly review

Each Monday NextUp and the pilot lead read the report together (30 minutes): what changed since last week, which units
are hidden and why, which tickets are open, one decision for the week. At the end of the pilot they write one page:
numbers per criterion against the baseline, the incidents, and a recommendation (stop, extend, move to live). The pilot
review is Kevin's and Marc's gate (G5). The customer decides about live.

## What is not measured yet

Savings (EUR), energy (kWh) and CO₂ are counted only as *verified* results, and only when a second person or a trusted
source confirmed them and the result is better. Time saved is not counted. The shop-floor share is "Not recorded". Anything else the customer wants to measure is agreed in
writing before the start and is outside the report unless the app counts it.
