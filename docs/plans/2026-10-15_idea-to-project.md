# Plan: from accepted idea to measured project

> **Plan · 2026-10-15 · open.** A discussion stage before the decision, the second half of the loop
> (build together, measure, recognise), and how we test it on the sellux.ch subdomains. Follows `docs/IDEAS.md` ("Not in this step") and
> the moat board (Close the loop · Trusted numbers · Plant-floor fit). Nothing here is built yet.

## Where we are

The first half of the loop is live: **raise → challenge → route → decide**. After "Yes, do it" a
case is finished: `case.decided {answer:"yes"}` sets it to `decided`, the clock stops, the author
is told, and nothing happens after that. The Overview's step 5 "In progress" only ever says "Next".

| Loop step | Today | This plan |
|---|---|---|
| 1 Raise | live (idea studio, problems) | - |
| 2 Challenge | live (coach, brain) | - |
| 3 Route | live (owner, deputy, clock) | - |
| 4 Decide | live: yes / no + why / hand over / ask | first a discussion stage (invite people, revise, a check-in every 3 days), then a yes archives the idea and opens a project |
| 5 Build together | **missing** | project board, team, steps, brain suggests steps, links to Jira |
| 6 Measure | **missing** (seed `outcomes` only) | baseline before the start, checks after 30 and 90 days |
| 7 Recognise | **missing** | the company's own reward rule, applied after the measure |
| Author sees every step | partly (until the decision) | every project step reaches the author |

What the code has that we can build on (all on `main`, b31a7b1):

- One append-only log, `CaseEvent`, reduced with the seed by `features/cases/reducer.ts`. Status
  is derived, never stored. There are no tables for cases or ideas.
- `case.building` and `case.shipped` exist in the reducer, but only as seed history: the server
  rejects them (`APP_EVENT_TYPES`, `features/cases/persist.ts`).
- Seed `Initiative` (status, members, `idea` link, `stuckOn`) is shown as "Projects" on
  `/collaboration`. It is the closest thing to a project, and it is made-up data.
- `Outcome {promised, actual, verdict}` in the seed is the only before/after shape.
- Feature flags are ready and empty (`config/flags.ts`, `FLAGS = {}`).
- The events API (`/api/[company]/events`) lets n8n read the log and append `case.handed` and
  `case.commented` with a per-company token.

## The rules

1. **Every idea ends in the archive.** A yes also opens a project; a no archives it with its why.
   Nothing is deleted.
2. **One log.** A project's history is events in `CaseEvent`, reduced like cases. No CRUD tables,
   so the events API, n8n and the audit trail see projects for free. (If reducing ever gets slow,
   add a read table that is rebuilt from the log. Not now.)
3. **The clock never stops quietly.** A discussion has a check-in every 3 days and a last day.
   After the yes, starting the project and recording each measure are due on the same promise-days
   rule as a decision. Each one moves to the deputy when overdue. Our two built strengths, *Answer
   on a clock* and the *Wait ledger*, then cover everything after the routing too.
4. **Numbers are checked, not chosen.** The verdict (better / same / worse) is computed from the
   baseline and the measured value. It is shown even when worse.
5. **AI suggests, people decide.** The brain proposes steps and what to measure. It never moves a
   step, enters a number or grants a reward.
6. **Counts only.** There is no per-person speed, ranking or step statistic anywhere, so the works
   council can say yes.
7. **Everything new sits behind two flags**, `discussion` and `projects`. They are on for
   demo-stage stacks and off for real ones until admin.sellux.ch turns them on for a company.

## The life of an idea

```
raise ──▶ open ⇄ asked/answered ──▶ handed (the clock keeps running)
                │
                ├──▶ Discussion: invite people · the author revises · check-in every 3 days
                │       round 1 ──▶ round 2 ──▶ round 3 (last day: decide)
                │                       │
       ┌────────┴───────────────────────┴───┐
  "Yes, do it"                         "No, and why"
       │                                    │
 idea: ARCHIVED · became project P-12  idea: ARCHIVED · declined: not now
       │
 project: Planning ──▶ In progress ──▶ Done ──▶ Measuring ──▶ Measured ──▶ Recognised ──▶ Closed
          lead, team,   steps on the    clock     30 d and 90 d  better /      the company's   (archive)
          baseline      board           starts    checks         same / worse  own rule
          └──▶ Stopped (with why), from any state ──▶ Closed
```

## 1. Discuss before deciding

A yes or no right after the routing is often too early. The idea may need another view, a number
from another department, or a second version. So between the routing and the decision there is a
**discussion stage**, with a fixed rhythm so it never drifts.

**Who starts it.** The desk holder picks "Discuss first", next to Yes, No, Pass and Ask. They write
in a line or two what is still missing, then invite people. The sheet suggests whom to ask, and the
desk holder picks:
- the route's buddy and deputy;
- the people the author added as Affected;
- the role that decides the spend or owns the goal the idea fits (`OrgRole.decides`, `Goal`);
- the authors of close ideas ("raised before?").

Anyone in the directory can be added, including people from other departments and sites. The
author is always in.

**What happens in it.**
- **People talk on the case.** Invited people get "Asked for your view" in their inbox and a mail.
  They comment on the case thread (`case.commented`) and can back the idea (`idea.cosigned`).
- **The author revises.** The author reopens the coach on the published idea and writes a new
  version. The benchmarks re-score every version, and the case shows v1 → v2 with what changed
  (▲ on the dials that got better). Older versions stay readable. The revision chat stays the
  author's own, like a draft; only the new version is published.
- **A check-in every 3 days.** Each round ends with a check-in, where the desk holder records one
  of two outcomes: ready to decide, or another round, with what is still open. The brain drafts
  the check-in:
  - what changed in the idea;
  - what people said;
  - which of the five points (Value, Feasibility, Cost, Fit, Risk) are still open.

  The desk holder edits the draft and sends it, so everyone in the discussion sees the same state
  at the same time. A check-in can happen in the app alone or after a short talk (15 minutes with
  the invited people); the app records the outcome either way.
- **A last day.** There are at most 3 rounds, so 9 days. These are company settings:
  `CompanyConfig.discussEveryDays` (default 3) and `discussMaxRounds` (default 3). After the last
  round the decision is due like any other. One more round needs a manager.
- **The clock keeps running.** A late check-in shows as "Your move" on the desk holder's inbox and
  counts in the Wait ledger. One day after that, it moves to the deputy, like a late decision.
- No and Pass stay possible at any point.

**Fast lane.** A small idea does not need a discussion. When its cost is within the team's spend
authority (€5k, the same rule the Feasibility bar uses), the desk holder can still say yes at once.

**Works council.** Comments are shown to the people in the discussion, and to everyone when the
idea is public. Nothing counts who said how much, and there is no participation score.

**What the author sees.** Their line on `/team` reads "In discussion · round 2 of 3 · next
check-in Fri". Every check-in reaches them.

New case events (Kevin's reducer). The reducer derives the status `discussion`, with the next
check-in as its due day:

| Event | Payload | Who may send |
|---|---|---|
| `case.discussion` | `invited[], missing` | desk holder, manager |
| `case.invited` | `userId` | desk holder, manager (others suggest names in a comment) |
| `case.revised` | `version, body, scores` | the raiser only |
| `case.checkin` | `round, next: "round"\|"decide", open[], note` | desk holder, manager |

`case.commented`, `idea.cosigned`, `case.handed` and `case.decided` are reused as they are.

## 2. Accept and archive

**What the decider sees.** "Yes, do it" opens a short sheet: who leads it (the decider by
default, or anyone from the directory), and an optional first step. One click is enough. Nothing
is required at this point, so a yes stays fast.

**What happens in the data.** One event, so nothing can get out of step:

`case.decided {answer:"yes", projectId, lead}`

The reducer then:
- marks the idea archived with outcome `project`, and
- opens project `projectId` with the idea as its source.

If `projectId` already exists, the idea **joins** that project. This lets several ideas about the
same problem become one project; the data supports it from day one, the UI can come later. The
project's number (P-1, P-2, ...) is the order of its opening in the log, so it is never stored.

**The archive.** The open lists (Inbox, Feed, Dashboard, Ideas) show open cases only. A new
**Archive** tab shows archived ones, filtered by: became a project, declined, and later merged or
withdrawn. An archived idea is read-only. Its page carries one line, built at render time: "Accepted
on 14 Oct by T. Vogel → P-12 *Shorter changeover* · In progress". Comments move to the project.

**What the author sees.** Their "My cases" card (`/team`) keeps one line per idea through the whole
life: Sent · Read · Approved · Planning · In progress (3 of 7 steps) · Done · Measured: better
(42 → 31 min) · Recognised. A mail goes out on: accepted, started, done, each measure, and the
reward. It uses the app's existing SMTP path (`server/case-notice.ts`).

## 3. The project space (Build together)

Pages, inside each company's stack:
- `/[company]/projects`: projects grouped by state. Leaders and managers see their area. Members
  see the projects of their own ideas and the ones they are on. Visibility is inherited from the
  source idea.
- `/[company]/projects/[projectId]` has:
  - a header: title, source idea(s) with the author's name or handle, lead, team, baseline, next
    measure date;
  - a board with To do · Doing · Blocked · Done;
  - the timeline, the measure panel, links and comments.
- `/collaboration` "Projects" becomes this list; the seed initiatives become seeded projects in
  every state.
- `/demo/projects/...` for the static demo.

New events (the server checks every one in `mayAppend`):

| Event | Payload | Who may send | n8n may send |
|---|---|---|---|
| `case.decided` (extended) | `answer:"yes", projectId, lead` | desk holder, manager | no |
| `project.member` | `userId, on` | lead, manager | no |
| `project.handed` | `to, why` (new lead) | lead, manager | no |
| `project.baseline` | `metric, unit, value, better:"up"\|"down", source` or `none + why` | lead | no |
| `project.started` | - (refused without a baseline) | lead | no |
| `project.step.added` | `stepId, text, owner?, dueDay?, external?` | lead, members | yes |
| `project.step.moved` | `stepId, to: todo\|doing\|blocked\|done, why?` | lead, step owner | yes |
| `project.linked` | `system, key, url` | lead | yes |
| `project.commented` | `text` | anyone who sees it, the author too | yes |
| `project.done` | `note` | lead | no |
| `project.measured` | `check: 30\|90, value, source, note?` | lead | no |
| `project.rewarded` | `rule, note` | manager | no |
| `project.stopped` | `why` | lead, manager | no |

This replaces the `idea.action.*` events that `docs/IDEAS.md` mentions. "Closed" is derived
(rewarded, stopped, or measured with a rule of "none"), not an event.

**The clock after the yes.** The lead has `promiseDays` (5) to set the baseline and start, or to
say why not. After that the project shows on the deputy's and the manager's desk, exactly like a
late decision. Steps can have a due day on the board, but there are no per-person overdue counts.

**The brain** (Victor, `brain-plan-v1`, redacted like every model call):
- On the yes, it proposes 3-5 first steps from the brief's lines (First step, Then, Cost, Still
  open). Each one is added with a click. Without the brain, the brief's own lines are offered as
  steps.
- It proposes the baseline metric from the matching `Goal.kpi`, for example "changeover time,
  minutes, lower is better, source: weekly MES report". The lead confirms it and enters the value.

## 4. Measure (Honest before vs. after)

- **The baseline comes before the start**: value, unit, which way is better, source and day. If no
  number is possible, `none` with a why. The project still runs, its verdict is "not measured", and
  the ledger counts it as unmeasured.
- **Checks at done + 30 and done + 90 days.** These are company settings (`CompanyConfig.measureDays`,
  default `[30, 90]`); they replace the seed's `OUTCOME_DAYS = 14`. Each check is due on the clock
  and goes to the deputy when late.
- **The verdict is computed**: better, same (within the company's tolerance, default ±2 %) or worse.
  It is never typed in. A correction is a new event with a why, never an edit.
- `/progress` ("Movement since baseline") and the Wait ledger read real data:
  - decided → started;
  - done → measured;
  - measures owed.

## 5. Recognise

- **The company's own rule**: `CompanyConfig.rewardRule`, one of `none`, `thanks`, `fixed` (an
  amount) or `share` (a percent of the measured yearly saving, with a cap). The company sets it in
  its own admin, mirroring its works agreement on suggestions (BVW) where it has one.
- After the last check, the manager sees "Reward due by your rule: …" and confirms it
  (`project.rewarded`). NextUp records the decision; payroll pays it, outside NextUp.
- An anonymous author stays a handle. They claim the reward themselves, so nobody else learns who
  it was.
- Reports show counts and sums only (ideas rewarded, total amount). Never a ranking of people.

## 6. Connectors (Jira first)

- **A. Link field** (with section 3). `project.linked` with a URL, shown on the board. No sync.
- **B. Jira Cloud through n8n.**
  - Built on automation.sellux.ch with fake data. In production it runs in the company's own n8n
    (`--n8n`).
  - Out: n8n pulls `/api/<slug>/events?since=`. A new project becomes an Epic, a new step an
    Issue. It writes back `project.linked {system:"jira", key}`.
  - In: a Jira webhook goes to n8n, which posts `project.step.moved` (Jira Done → done) and
    `project.commented` (status changes as comments).
  - Code changes: add `project.step.added`, `project.step.moved`, `project.linked` and
    `project.commented` to `SYSTEM_EVENT_TYPES`. Never the decision, the measure or the reward:
    people decide those.
  - Box changes: automation.sellux.ch sits behind nginx basic auth, so Jira's webhook needs an
    exception for `/webhook/`, with n8n's own header secret. The same applies to a company's n8n
    behind Caddy's `basic_auth`.
  - Test: a free Jira Cloud site (up to 10 users), for example `nextup-test.atlassian.net`, with fake
    data only.
- **C. Per customer, later**: Azure DevOps, Microsoft Planner (Teams), Polarion or codebeamer.
  These use the same events with another workflow. Ask which tool at each pilot interview.

## 7. How we test it

**The flags**, in `config/flags.ts`. They are two, so the discussion stage can ship before the
projects:

```ts
discussion: {
  description: "'Discuss first' before a decision: invite people, the author revises, a check-in every 3 days",
  owner: "Kevin",
  defaults: { demo: true, sandbox: false, pilot: false, live: false },
  added: "2026-10-15",
  removeBy: "2026-12-31",
},
projects: {
  description: "After 'Yes, do it' the idea is archived and a project opens: board, measure, reward",
  owner: "Kevin",
  defaults: { demo: true, sandbox: false, pilot: false, live: false },
  added: "2026-10-15",
  removeBy: "2026-12-31",
},
```

**Where each kind of test runs:**

| Level | Where | What it proves |
|---|---|---|
| Unit | vitest | the reducer for every new `case.*` and `project.*` event, `mayAppend`, the verdict math, the check-in and project clocks |
| Whole loop | Playwright on the laptop | raise → publish → discuss first (invite, a comment, v2, two check-ins) → yes → project → steps → baseline → start → done → +30 days → measure → reward, switching person with the dev panel |
| Gate | staging.sellux.ch | every green merge; `e2e:live` gets two short checks ("discuss first opens round 1", "yes opens P-n"); Kevin approves the release |
| Show | acme.sellux.ch | seeded projects in every state, for a quick look |
| Play | globex.sellux.ch | the empty company where the team plays the loop with real logins: Kevin raises, Sam leads, Victor manages, Marc follows as the author. A weekly 30-minute loop run; problems go in through the bug icon |
| Interviews | demo.sellux.ch | the static demo gets the second half; moved only by `promote`, when Kevin says so |
| Connector | automation.sellux.ch + the Jira test site | epic out, status back, within a minute |

**Time travel**: the dev panel's "+1 day" already walks through 3-day rounds. It gets a "+30 days"
next to it, so a 90-day check can be tested in minutes too. Demo stage only (`policyFor().rewriteHistory`); real stages refuse it, as now.

## 8. Subdomains

**Projects live inside each company's stack, on the same host**: `acme.sellux.ch/projects/P-12`.
- One login and one session cookie per host.
- One database, so the idea, the project and the measure sit in the same log.
- It works on-prem with one hostname (`APP_ORIGIN=https://nextup.example-oem.de`); the paths
  stay the same.
- No new certificates: the box has no wildcard certificate, so certbot needs one per name.
- Isolation between companies is unchanged.

Rejected:
- `projects.acme.sellux.ch`: needs `*.acme` DNS, a certificate per company and a cookie that
  crosses hosts.
- One shared `projects.sellux.ch`: it would mix companies, which breaks one stack per company.

**Subdomains stay what they are today: one per company or test system.**

| Address | Is | Role for this plan |
|---|---|---|
| staging.sellux.ch | gets every green merge (track `main`) | the first place any change runs |
| acme.sellux.ch | seeded demo company | projects in every state, to show |
| globex.sellux.ch | empty demo company | the team plays the loop with real logins |
| demo.sellux.ch | pinned static demo | interviews; the second half once promoted |
| automation.sellux.ch | our n8n | the Jira workflow |
| admin.sellux.ch | our tool | the `discussion` and `projects` flags per company; tickets from the loop runs |
| `<new>.sellux.ch` | companies started from admin (track `release`) | flags off until we turn them on |

**Preview stacks per PR** (`pr-123.sellux.ch`) are not needed now. The shared box is short on
memory, each name needs its own certificate, and staging plus the flag cover what previews would
show. Trigger: two front-end developers need to show branches at the same time.

## Steps

Sizes are rough. Each step ends on staging, then a release.

### 0. Decisions (Kevin, this week)

The list at the end of this plan.

### 1. Discussion stage (4-5 days) - Kevin events and clock, Sam case page, Victor brain

- [ ] Add the `discussion` flag and the `case.discussion`, `case.invited`, `case.revised` and
  `case.checkin` events. The reducer derives the status `discussion`, with the next check-in as
  its due day. Add the `mayAppend` rules, `CompanyConfig.discussEveryDays` and `discussMaxRounds`,
  and unit tests.
- [ ] Build:
  - the "Discuss first" sheet, with suggested people;
  - "Asked for your view" in the inbox, plus a mail;
  - the versions on the case page (v1 → v2, ▲ on the dials);
  - the rounds timeline and the check-in sheet.
- [ ] Brain: whom to invite and the check-in draft. Offline, the draft lists the new comments and
  the dials that are still open.
- [ ] Show the round and the next check-in on the author's line on `/team`.

**Done when:** on staging, using "+1 day", an idea goes through two rounds and then gets a yes. In
those rounds an invited person from another department comments, the author posts a v2 that scores
higher, and two check-ins reach everyone in the discussion. A missed check-in shows on the deputy's
desk.

### 2. Accept and archive (3-4 days) - Kevin back-end, Sam front-end

- [ ] Add the `projects` flag; `case.decided` takes `projectId` + `lead`; the reducer archives the
  idea and opens or joins the project; `mayAppend` rules; unit tests.
- [ ] Add the yes sheet (lead, first step), the Archive tab and filters, and the read-only banner
  on archived ideas.
- [ ] Extend the author's line on `/team` and send the "accepted" mail.

**Done when:** on staging, "Yes, do it" opens P-1 and the idea leaves every open list. Its banner
links to P-1, the author's card says "Planning", and a no lands in the Archive with its reason.

### 3. Project space (1-1.5 weeks) - Sam pages, Kevin events and clock, Victor brain

- [ ] Build `/projects` and `/projects/[id]`: board, team, lead hand-over, comments, link field.
- [ ] Add the `project.step.*`, `member`, `handed`, `started`, `done`, `stopped` and `commented`
  events; the start clock goes to the deputy.
- [ ] Add the brain's step and metric proposals, with the offline fallback.
- [ ] Turn the seed initiatives into seeded projects; `/collaboration` reads them.
- [ ] Send the author a mail on started and done.

**Done when:** on globex, with real logins, a lead takes P-1 from Planning to Done. The author
gets every change by mail and on `/team`, and an unstarted project shows on the deputy's desk
after 5 days.

### 4. Measure (3-4 days) - Kevin

- [ ] Add `project.baseline` (required before the start, or `none` with a why) and
  `project.measured`, plus the computed verdict and the tolerance.
- [ ] Add `CompanyConfig.measureDays` and the due checks on the clock.
- [ ] Add "+30 days" to the dev panel; `/progress` and the Wait ledger read real data.

**Done when:** on staging, with time travel, a 90-day check that came out worse shows "worse" to
the lead, the manager and the author, and a late check moves to the deputy.

### 5. Recognise (2 days) - Kevin, Sam

- [ ] Add `CompanyConfig.rewardRule` to the company's admin, the "reward due" prompt for the
  manager, `project.rewarded`, and the claim step for anonymous authors.
- [ ] Report counts and sums only.

**Done when:** a reward follows the company's rule, an anonymous author can claim it, and no page
or export ranks people.

### 6. Connectors (1 week) - Victor, Kevin for the allow-list

- [ ] Extend `SYSTEM_EVENT_TYPES` for the four project events.
- [ ] Build the n8n Jira workflow (out and back) and export it to `ops/n8n/`, where
  `docs/INTEGRATIONS.md` puts exported workflows.
- [ ] Add the nginx `/webhook/` exception on automation.sellux.ch (Kevin runs the sudo lines).
- [ ] Before a pilot connects its own Jira: `N8N_WEBHOOKS=public` on its stack (`stack/nginx/RUNBOOK.md`,
  "n8n webhooks for a company stack").

**Done when:** opening P-1 creates an epic on the Jira test site, and moving its issue to Done
moves the step in NextUp within a minute.

### 7. Demo and roll-out (2-3 days) - Sam, Kevin, Marc

- [ ] Add the rest of the loop to the static demo: discuss first → one comment and a v2 → check-in →
  yes → board → done → +30 days → "better: 42 → 31 min" → reward.
- [ ] Kevin promotes demo.sellux.ch.
- [ ] Turn both flags on for the first pilot in admin, and delete them by their `removeBy` date.
- [ ] Marc: a two-minute pitch walk-through of the second half.

**Done when:** the full loop runs on demo.sellux.ch without a login, and on one real-stage company
with the flag on.

## Decisions for Kevin

| # | Question | Recommendation |
|---|---|---|
| 1 | Does a "No" also go to the archive? | Yes: one archive, filtered by outcome |
| 2 | Is the desk holder's "Yes" enough, or must the receiving team lead accept too? | The yes alone; the lead can hand the project on |
| 3 | Who leads by default? | The decider |
| 4 | Can several ideas share one project? | In the data now, in the UI later |
| 5 | Is a baseline required before the start? | Yes, or `none` with a why |
| 6 | Are the measure days fixed or per company? | Per company, default 30 and 90 |
| 7 | Which connector first? | Jira Cloud |
| 8 | Which company do we play the loop on? | globex (empty, demo stage, real logins) |
| 9 | Does every idea go through the discussion? | By default, yes. The desk holder may skip it when the cost is within the team's spend authority |
| 10 | What rhythm and length? | A check-in every 3 days, at most 3 rounds, set per company; one more round needs a manager |

## Docs to update in the same PRs

- `docs/IDEAS.md`: a section on the discussion stage; "Not in this step" points here.
- `docs/DATA_MODEL.md`: the project events (and drop the stale `Company.baseline`).
- `docs/ROUTES.md`: `/projects`, and the missing `/overview`.
- `docs/INTEGRATIONS.md`: the new allow-list.
- `docs/SECURITY.md`: the `mayAppend` rows.
- `docs/README.md`: this plan's row.
- nextup-admin `handbook/roadmap.ts`: the items and `ROADMAP_AS_OF`.
