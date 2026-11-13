# Metrics

What the Dashboard (`/[company]/dashboard`), the KPI report (`/[company]/dashboard/kpis`) and `pilotReport` show, and
what each number means. Plan MET. Code: `src/features/metrics/` (pure), `src/lib/db/{metrics,pilot-report,baseline}.ts`
(readers), `src/server/actions/metrics.ts` (manager-only actions). The proofs are `tests/db/wait-ledger.test.ts`
(numbers equal a hand-computed fixture) and `tests/unit/met/no-person-metrics.test.ts` (no screen counts people).

## Rules that hold for every number

- **Roles, not people (D2).** Aggregates exist per company, unit or role. No screen ranks or counts a person. A
  per-person value that is needed inside (distinct raisers, resubmission) is only ever returned as a count or a share.
- **Counted from events (D5).** Every number is counted from events people or rules wrote (`case.raised`,
  `case.decided`, `case.asked`, `case.handed`, `case.discussion`, `case.override`, `clock.due`, `project.done`,
  `project.measured`, `project.rewarded`) and the company clock. No model output ever changes a KPI:
  `proposal.confidence`, `upside`, the AI brief, cover numbers and AI scores are never read. The override rate counts
  what people did with the router's proposal.
- **Minimum group (D6).** A unit or role with fewer than `MIN_GROUP = 5` active people is hidden: it shows "too few"
  and exposes no count or value. Complementary suppression: when exactly one child of a parent is hidden, the smallest
  visible sibling (or the parent, if there is none) is hidden too, so a viewer cannot subtract the visible siblings to
  rebuild the hidden one. Company participation and resubmission are hidden below 5 contributors and the exact small
  count is never shown. A selected scope under 5 people hides every tile. This is a disclosure control, not
  anonymisation: the aggregates are not described as anonymous, and no number crosses companies.
- **Verified only (D7).** A measured result counts for savings, energy, CO2 and "verified outcomes" only when its
  measure is confirmed (`Measure.confirmed`: a trusted source import or a second person) and its verdict is "better".
  An unconfirmed or worse measure counts nowhere.
- **Days are company days.** Working days in workdays mode (CLK calendar), simulated days in a demo company.

## The Dashboard (D10, D11, D19)

Manager only, company scope from the server. Fixed periods: `30d`, `quarter`, `golive` (the day after the baseline
ends); no custom ranges, to reduce differencing. A period is `[from, to]` in company days, inclusive.

| Tile | Meaning |
|---|---|
| First reasoned answer | Median working days from `case.raised` to the first `case.decided` with a non-empty reason, over cases raised in the period. Questions and hand-overs do not count. |
| On time | Share of cases raised in the period whose first response is within `promiseDays`. First response = earliest `case.decided` or `case.asked`; a hand-over (`case.handed`, `clock.due`) is never an answer. An open case past the promise counts as late; an open case still within it is left out. |
| Idea to decision | Median days from raise to decision over ideas decided in the period. |
| Past the promise now | Open cases with `dueDay` before today, out of all open cases. Only when the period ends today. |
| Escalated | Cases whose deadline escalation (`clock.due` kind deadline, or `case.handed` why deadline) falls in the period. |
| Overruled | Share of the router's proposals the person did not keep (`overrideRate`). Company-wide only; a unit view carries none. With the AI off the tile says "by keywords". |

Each tile carries its value, the baseline and the last six 30-day values. Below the tiles: the stages (open cases per
status with the average days since their last event), the answers (yes, yes with a project, question, hand-over, no)
and the trend (raised, answered, on time per 30-day bucket). `firstReasonedAnswer` and `onTime` use separate
source-event rules and do not use VIS `firstAnswerDay`, because that one includes questions and hand-overs.

**Breakdown.** Units roll their cases up the unit tree (a case belongs to the unit of its route's owner role); roles
count the cases on that desk. Columns: cases, first reasoned answer, on time, open past the promise, escalated. A
unit's cohort is its active seat holders, a role's cohort its holders. No row names a person.

## Baseline (D12)

One `CompanyRule` row, key `metrics_baseline`: `{ fromDay, toDay, fromDate, toDate, imported }`. A company admin sets it
on the Dashboard; every save writes `audit.settings.metrics_baseline` with before and after. A baseline value is
counted from the log for the baseline period unless an imported value for that key exists; imported values carry a
source label, the file's SHA-256, the importing admin and a timestamp. These are provenance, not proof the values are
true; the page labels imported and counted values apart. Saving the Rules page leaves the baseline alone.

Import format: `;`-separated `metric;value` lines, first line the header, decimal comma or point, keys from
`PILOT_METRIC_KEYS`. A bad line is reported with its line number.

## CSV formats (D19)

- **Dashboard breakdown** (`exportDashboardCsvAction`, units or roles): `;` separated, header `Unit or role; Cases;
  First reasoned answer (days, median); On time (%); Open cases past promise; Escalated`; German decimal comma in the
  German locale; a hidden row has "too few" in every number column; a field that starts with `= + - @` is defused.
  File name `units|roles-<company>-<from>-<to>.csv`. The same suppression as the screen; no names, no ids of people.
- **KPI report** (`exportKpisCsvAction`): one row per unit and the company: participation (%), ideas per 100,
  implemented (%), days to decision, savings (EUR), energy (kWh), CO2 (kg), premiums (EUR); hidden rows "too few".
  Headcount is customer-supplied when configured and is labelled so.

## `pilotReport(companyId, from, to)` for PIL (D14)

Returns `metrics` in the order of `PILOT_METRIC_KEYS`, each `{ key, value, baseline, hidden, note }`, plus the ZI rows.

| Key | Meaning |
|---|---|
| `firstReasonedAnswer` | Median working days, as the tile. |
| `withinPromisePct` | The On time tile as a percentage. |
| `deputyHandoverPct` | Hand-overs out of all answers (yes, yes with project, question, hand-over, no) in the period. |
| `participationPct` | Distinct raisers in the period out of the people in scope (configured top-level headcount when above 0, else the active users). Hidden below 5 raisers or 5 people. |
| `casesPer10` | Cases raised per 10 people in scope. |
| `shopFloorPct` | Always `null`, note `not-recorded`, until FLR records the channel on `case.raised` (Q4). |
| `implementationPct` | Of the projects decided in the period, the share finished in it. |
| `verifiedOutcomes`, `verifiedSavingsEur`, `verifiedEnergyKwh`, `verifiedCo2Kg` | Verified only (D7). |
| `overrideRatePct` | Overridden proposals out of proposals. |
| `resubmissionAfterNoPct` | Of the people with a reasoned No in the period, the share who raised again afterwards. Hidden below 5 people. |

The report holds no user id, name, handle or importer id. The imported baseline keeps its source label and timestamps
only; `baseline.source` is `counted`, `imported` or `mixed`.

## MET gaps (D23)

Rows of `docs/audit/gaps/product.md` that MET answers. That register is AUD's; this table maps it and changes nothing there.

| Gap | What it said | Answered by |
|---|---|---|
| G-045 | Person rankings: "Most relied-on contributors" and per-person counts on the person page | MET-E1 (the ranking and `contributors()` are gone from Progress and `features/metrics`) and MET-D1 (the person page by user id, name, role and unit only). Checked by `tests/unit/met/no-person-metrics.test.ts`. |
| G-048 | The manager dashboard showed `dashboardPreview` data | MET-H1 (the Dashboard reads the company's log through `dashboardData`; `dashboardPreview` deleted). Numbers proven by `tests/db/wait-ledger.test.ts`. |
| G-049 | The feed ran on `feedPreview` placeholder data | MET-F1 (the Feed runs on real events; `feedPreview` deleted). |
| G-050 | The overview ran on `overviewPreview` placeholder data | MET-O1 (the Overview runs on real events; `overviewPreview` deleted). |

## AI usage by purpose

`aiUsage` (`lib/db/ai-usage.ts`) sums the company's model use for a period, totals only, never a person. The assistant's
turns and the brain's calls (`AiCall`, purposes `routing`, `read`, `coach`, `plan`, `checkin`, `context`) both count in
`byModel`, `tokensIn`, `tokensOut` and `costUsd`; `turns` stays the number of assistant turns. `byPurpose` splits the same
totals into `{ purpose, calls, tokensIn, tokensOut, costUsd }`, sorted by purpose, with the assistant under `assist`.
`costUsd` is `null` as soon as one model has no price.

Each assistant answer is stored twice: as an `AssistTurn` (with the text, deleted by retention) and as an `AiCall` with
purpose `assist` (tokens only, kept). `aiUsage` counts the turns up to the company's first `assist` call and the calls
from then on, so retention cannot shrink the month and no answer counts twice.

`loadAiBudget` in the same file is what the gate asks before a model call: the company's monthly cap and the cost of
the calendar month so far, priced with the company's own prices first, and the tokens of models that have no price
against the company's token limit (docs/ASSISTANT.md, "The monthly budget"). `aiUsage`'s `costUsd` stays a list-price
figure.

In the idea studio the brain is called twice per message: `read` (the reading of the idea, docs/IDEAS.md) and then
`coach`, each recorded on its own once it answered, so one message adds one call to each purpose (and none when the brain
did not answer: nothing is recorded for a failed or timed-out call). Both are in `byModel` and `byPurpose` like the
others. The counts say how often the studio used the model, never whose idea it was.

## Open

- **Q4, shop-floor share and verbatim share.** `shopFloorPct` stays `null` / `not-recorded` until FLR records a channel on
  `case.raised`. The verbatim share of suggested answers needs an event no phase records and is not in the report.
- **Q7, Ideas, Problems, Collaboration.** `/ideas`, `/problems`, `/collaboration` still run on seed data and Collaboration is
  person-centric. They stay out of the navigation; the redesign comes after the pilot pages. MET removed only the
  per-person numbers named in D2.
- **Q8, Feed AI-off.** The opened Feed card's "What the AI found" has no AI-off variant yet; the browser does not know
  the company's AI setting.
- **Q5, `RaisePerson` and `hiddenPeople`.** `components/ideas/RaisePerson.tsx` (LOOP's area) is the one reader of
  `tenant.hiddenPeople`; `no-person-metrics.test.ts` lists it as the only allowed reader. It stays until LOOP's raise
  rework (desks, not people) removes the person card. Its name links point at `/people/<name>`, which returns not found
  and is never looked up.

## Claims checked (D25)

A public claim describes only what runs on main for a non-demo company. Checked in this repo for dashboards, KPIs,
"never people" and the person page:

- `README.md`: no claim about dashboards, KPIs or the person page beyond the folder layout. Nothing to correct.
- `docs/ROUTES.md`: the `/dashboard` row said "Every problem and idea: open since, on whose desk, stage, score" and for any
  role (corrected: manager-only wait ledger); the `/dashboard/kpis` and `/people/[userId]` rows were missing (added);
  the demo row listed `people/[name]`, which the static demo no longer has (removed).
- `docs/plans/2026-11-02_pilot-pages/04-everyday-app.md`, `10-existing-pages.md`: corrected (D24), see the PR.
- `docs/ASSISTANT.md`, `IDEAS.md`, `SHOP_FLOOR.md`, `COMPANY_KNOWLEDGE.md`: their "counts only, no per-person view" statements are
  true of the code MET covers; not changed.
- `docs/IDENTITY.md` (ownership table lists `people/[name]/page.tsx`) and `docs/SECURITY.md` (history of the old name route)
  describe the old route as a to-do or a past finding, not a current claim; not in MET-Z1's ownership, left as is.
- Landing copy: the marketing site is its own repo (`nextup-landing`, `src/app/page.tsx` only redirects to the login), so
  its claims are not checked here. Someone with that repo should check them against this page.
- `docs/plans/2026-11-02_defensible-offer*.md` and spec `11-defensible-offer-pages.md`: not on main in the form MET
  expects (D24), not changed.
