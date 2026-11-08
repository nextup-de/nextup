# Master plan: review, approvals, a reasoned no, the raiser's view, recognition and the project agent

> **Plan · 2026-11-08 · roadmap after funding, not part of the demo or the pilot.** The product shown today is the main
> app as it runs on `main` and in the large demo. This plan collects the add-ons we would build once there is
> investment, possibly together with a launch customer. Nothing here is built, and nothing here blocks the demo.
> Kevin's decisions (D1–D12) are needed before any phase starts.
> Everything between "an idea arrives at a desk" and "the raiser is recognised" that the team discussed and the
> interviews asked for, and that no plan covers yet. It builds on what runs on `main` ([LOOP.md](../LOOP.md)), on the
> [project setup plan](2026-11-03_project-setup.md) and on the [project area](2026-11-03_project-area.md). Each phase
> below gets its own detailed plan (or brief) before it is built, in the same way as the
> [pilot master plan](2026-11-01_pilot-readiness.md).

## Why

The loop on `main` answers three questions for every idea: who owns it, by when is an answer due, and what happens if
nobody answers. Team discussions and the interviews (Nov 2026) showed six things it does not answer yet:

1. **A "no" is too cheap.** The No sheet (`components/shell/InputSheet.tsx`) asks for one of five categories; the text
   is optional, and the server does not check it (`mayDecide` in `features/cases/permissions.ts`; `reason?` on
   `case.decided`). Two of the five categories, "wrong department" and "not responsible", are not a no at all: they
   are a hand-over. Nobody looks at a no again, and nobody can tell whether the reasons hold up.
2. **Real companies decide in more than one step.** Today one desk says yes or no. In a plant of 1,000–2,000 people an
   idea is often checked first by an idea manager with long experience, a bigger one goes to a council (a
   committee that meets), and anything above the desk's spend authority needs a manager's approval. A desk holder
   often wants to say "I'll take it, but my manager has to approve it" or "yes, as a draft, I still need to talk to
   X". There is no state for that.
3. **The raiser loses sight of their idea after the yes.** They may open the project, but they see the team's working
   page. They do not get a simple answer to "how far is it, what came out, what do I get".
4. **Recognition stops at a line in the log.** A manager records `project.rewarded`; the money or the day off happens
   somewhere else, and the raiser never sees the credit as theirs.
5. **Every project starts from zero.** There are no templates for the kinds of work a plant does again and again
   (quick win, 8D, purchase, IT change, safety).
6. **The AI stops at the yes.** The brain proposes first steps and a metric once (`features/projects/brain.ts`). The
   project agent is drawn as phase 2 of the project area, with no events, no rights and no server side. There is no
   way to test a project with the agent before deciding.

## Goal

Every idea runs through a decision path the company configures, where **each step has an owner, a date and a deputy**
(the same promise as the desk today), every no is **reasoned and can be looked at again once**, the raiser **sees the
whole journey up to the recognition**, a yes can start from a **template** and an **AI planning run**, and the
recognition **reaches HR or payroll**.

**Not in this plan:** idea voting, per-person statistics of any kind, guests outside the company, file upload (see
the setup plan), SAP/ServiceNow/PLM case sources.

## The rules (unchanged, and binding for every phase)

1. **Events, not edits.** Every new state is a `case.*` or `project.*` event, reduced as today. New tables only for
   configuration (who reviews, which councils, which templates) and for data that must be deletable.
2. **Desks, not people.** Every new step is held by a role (a seat), never by a named person in the rules. The
   decision log names the role.
3. **The clock never stops quietly.** Every new step (review, approval, second look) has an answer date on the
   company calendar and a deputy hand-over, through `clock.due` like the desk today.
4. **AI suggests, people decide.** The agent drafts, plans and nudges. It never decides, approves, sends, moves a step,
   enters a number or grants a reward.
5. **Counts only.** No per-person speed, ranking or decision statistic. Quality of reasons is shown per route or
   role, with a minimum group size (D10), so the works council can say yes.
6. **Every stage is a company switch.** Each new stage is a `loop_steps` entry in Settings → Rules, off by default
   for existing companies and on in the demo. A company without review, councils or budget gates works exactly as
   today.

## The life of an idea, after this plan

```
raise ─▶ [Review]  idea manager: forward · back to the author · merge with a duplicate · reasoned no
            │
            ▼
         Desk  ─── ask / answer · hand over · discuss (rounds, invited colleagues, check-ins)
            │
   ┌────────┼──────────────────────────────┬───────────────────────────────┐
   ▼        ▼                              ▼                               ▼
"Yes"   "Yes, if approved"            "No, because …"                 (hand over: not a no)
   │     project opens as a draft       category + written reason
   │     (setup may run, Start          + what would change it
   │      waits)                        + revisit date for "not now"
   │        │                              │
   │     [Approvals] in order:          raiser may ask for a
   │       budget (spend limit ↑)       [Second look] once
   │       council (at its meeting)        │ upheld (final) / reopened (back to a desk)
   │       a named role                    ▼
   │        │ all yes        any no ─▶ "No, because …" (same rules)
   ▼        ▼
 Project: Setting up (template, AI plan) ─▶ Started ─▶ Done ─▶ Measured ─▶ Recognised ─▶ paid / handed to HR
                                    agent: unblock · report · plan (add-on)

 Raiser's view: every box above, with the role that holds it, the date, the result and the recognition.
```

## Phases

| # | Code | Phase | Size | Needs | Lane |
|---|---|---|---|---|---|
| 0 | DEC | Kevin's decisions D1–D12 below | – | – | Kevin |
| 1 | NOR | A reasoned no and the second look | M | 0 | Kevin, Sam |
| 2 | SEE | The raiser's view of the whole journey | M | 0 (uses 1 when there) | Sam, Kevin |
| 3 | SET | Project setup, as already planned | M | 0 | Kevin, Sam |
| 4 | GAT | Review, "yes, if approved", approvals (budget, council, role) | L | 1, 3 | Kevin, Sam |
| 5 | TPL | Project workflows and templates per department; joined / related projects | M–L | 3 (stage gates: 4) | Kevin, Sam |
| 6 | REC | Recognition up to HR and payroll | M–L (+ legal per country) | 2 | Kevin, Sam, Marc |
| 7 | AGT | The project agent, with a planning run before the decision | L | 3, 5; AI server | Victor, Kevin, Sam |

**Order.** NOR, SEE and SET touch different files and can run side by side once DEC is done. GAT comes after NOR
(an approval's no is a reasoned no) and after SET (a provisional yes opens a project that sets up while it waits).
TPL needs the setup checklist; AGT needs templates to plan from. REC needs the raiser's view to show the credit.

**Pages.** Sam gets one spec per phase with pages: spec 13 (NOR + SEE), spec 14 (GAT), spec 15 (TPL, see the workflows plan), spec 15b (REC),
spec 16 (AGT), in `plans/2026-11-02_pilot-pages/`, like spec 12 for the setup.

---

## 1 · NOR — a reasoned no and the second look

**Result.** No idea is turned down without a written reason the raiser can understand, and the raiser can ask once
for a second look by someone who did not say no.

**What changes.**

- **The No sheet** gets new categories, and the text is required:

  | Category | Extra field | Note |
  |---|---|---|
  | Not now | **revisit date** (required) | on that day the case comes back to the desk (`clock.due` kind `revisit`) |
  | No budget this year | revisit date (optional) | |
  | Does not fit a goal or a standard | which goal or standard (optional) | `Goal` list |
  | Already solved or in work | link to the case or project (required) | becomes a "merged" fact for the raiser |
  | Risk, safety or quality concern | – | |
  | Not feasible as described | – | |

  "Wrong department" and "not responsible" leave the No sheet: the sheet points to **Hand over** instead.
- **Every no needs** the category, a reason of at least 40 characters (D2), and optionally "what would make it a
  yes". `mayDecide` refuses a no without them, so the Teams card and API v1 follow the same rule.
- **AI reason check (AI on only).** Before sending, the brain reads the reason and says when it does not explain the
  why ("not now" without what changes). It is a hint; the person may still send.
- **Second look.** Within N working days (D3, default 10) the raiser may write why they disagree. The case goes to the
  **review role** (phase 4) or, without one, to the route's **deputy role**; never to the person who said no. The
  answer is `upheld` (final, with a reason) or `reopened` (back to a desk of the reviewer's choice, the clock starts
  again). One second look per case.
- **Quality of reasons.** On the dashboards (MET): share of noes with "what would make it a yes", second looks asked
  and reopened, days to the first reasoned answer, revisits that came back. Per route and role only, with the
  minimum group size (D10). The idea manager (phase 4) gets a sample list of recent noes to read.

**Events** (`features/cases/events.ts`; the reducer is Kevin's):

| Event | Payload | Who |
|---|---|---|
| `case.decided` (extended) | for a no: `{ answer: "no", category, reason, changeIf?, revisitDay?, duplicateOf?, goalId? }` | desk holder, manager |
| `case.appealed` (new) | `{ text }` | the raiser, once, within the window |
| `case.appeal.decided` (new) | `{ answer: "upheld" \| "reopened", reason, toRouteId? }` | review role, else deputy role, else manager; never the one who said no |
| `clock.due` (new kind) | `{ kind: "revisit", dueDay }` | `system:clock` |

Old logs replay unchanged: a no without a category reads as "other".

**Done when.** A no without a reason is refused on every path (app, Teams card, API v1); a "not now" comes back on its
date; a raiser asks for a second look, a deputy reopens it, and the case lands on a desk with a new date.

**Acceptance test.** e2e: no with too short a reason refused; no with reason sent; raiser appeals; deputy reopens;
new answer date shows. Unit: `mayDecide` rows, revisit due, second look refused twice and for the one who said no.

**Code.** `features/cases/{events,reducer,permissions,selectors,promise}.ts`, `features/clock/due.ts`,
`components/shell/InputSheet.tsx`, `features/teams/cards.ts`, `features/api/map.ts`, `features/loop/rules.ts`
(`appealDays`, `noReasonMin`), i18n en/de.

**Docs.** [LOOP.md](../LOOP.md) (steps 5 and "Claims"), [DATA_MODEL.md](../DATA_MODEL.md),
[API.md](../API.md), [TEAMS.md](../TEAMS.md), [SECURITY.md](../SECURITY.md) (`mayAppend` rows).

---

## 2 · SEE — the raiser's view of the whole journey

**Result.** The person who raised an idea sees, on one screen, where it is, who holds it (as a role), by when, what
came out of it and what they got for it, without the team's working rights.

**What changes.**

- **"My ideas"** (the existing "My cases") shows one **journey track** per idea:
  Raised → Review → With the desk → Discussion → Approvals → Project: setting up / started / done → Measured →
  Recognised. Stages a company has switched off are not drawn. Each stage shows the role holding it, the date it is
  due or was done, and its outcome.
- **The raiser's project panel** on the case page and on the project's Overview, for a raiser who is not on the
  team: stage, steps done (x of y), the lead's latest update, before → target → after, the verdict, and the
  recognition. No board, no comments of the team, no step owners (D5).
- **The lead's update.** A new `project.update { text }` (lead, sponsor; up to 600 characters) is the short status the
  raiser and the followers read. The agent (phase 7) can draft it.
- **A no** shows the category, the reason, "what would make it a yes", the revisit date and the second-look button.
- **Notices** at each stage change (follows the raiser's notification settings and the Teams channel).

**Events.** `project.update` (new). Everything else is read from existing events.

**Done when.** A raiser follows one idea from raise to recognition in the e2e and sees each stage with role and date;
a raiser who is not on the team cannot open the board or append a step.

**Code.** `features/cases/selectors.ts` (`journeyOf(case, project, rules)`, pure), `features/projects/views.ts`,
`features/projects/permissions.ts` (raiser = reader), pages under `(app)/cases/[caseId]` and the projects route,
`features/loop/notice.ts`.

**Docs.** [LOOP.md](../LOOP.md), [VISIBILITY.md](../VISIBILITY.md) (what a raiser sees of a project),
[NOTIFICATIONS.md](../NOTIFICATIONS.md).

---

## 3 · SET — project setup

As planned in [2026-11-03_project-setup.md](2026-11-03_project-setup.md) and spec 12: setup checklist (team, roles,
goal, baseline, tools, brief, how we work), project roles (sponsor, contributor, follower), asking for new people,
kickoff notice, company defaults. Nothing of it is built yet. This plan adds two hooks it must leave open:

- **Start can be held by more than the checklist.** `project.started` is refused while the project waits for
  approvals (phase 4). `setupOf()` returns the approval state as one more required item, "Approved", when the project
  came from a "yes, if approved".
- **The checklist can be pre-filled.** A template (phase 5) and the agent's plan (phase 7) fill the brief, steps,
  roles and metric as drafts the lead saves.

---

## 4 · GAT — review, "yes, if approved", and approvals

**Result.** A company can put an idea manager in front of the desks, and can require approvals after a desk's yes:
by budget, by a council, or by a named role. A desk holder can accept an idea provisionally, so the project gets set
up while the approvals run.

### 4.1 Review by the idea manager (optional per company)

- A company names a **review role** (Settings → Rules; D6), for example "Idea manager". With review on, a raised
  idea lands with that role first, with its own answer date (default 2 working days, counted inside the raiser's
  5-day promise; D7).
- The reviewer can **forward** (to the proposed desk or another one; the desk's clock starts), **send back to the
  author** with what is missing (the author revises in the coach, as in the discussion), **merge** with an earlier
  case or project ("already solved or in work"), or give a **reasoned no** (same rules as phase 1, D8).
- The reviewer also answers second looks (phase 1) and reads the sample of recent noes.

### 4.2 "Yes, if approved" — the provisional yes

- Next to "Yes, do it" the desk holder gets **"Yes, if approved"**. They name the lead, write a note ("I'd take it,
  but …"), and the sheet shows which approvals the company's rules require for this idea (4.3), plus any role the
  desk holder adds by hand ("my manager must approve").
- The project opens in **Setting up** with the badge "Waits for approval". Setup (phase 3) may run, so no time is
  lost; **Start is refused** until every approval is a yes.
- If an approval says no, the project is stopped with that reason, and the case gets the reasoned no. If an
  approval says "yes, with conditions", the conditions go into the project's brief and goal.

### 4.3 Which approvals an idea needs

Rules per company and per route (`ApprovalRule`, a new configuration table; schema is Kevin's):

| Kind | When it applies | Who answers | Built on |
|---|---|---|---|
| **Budget** | the cost estimate is above the deciding role's `OrgRole.spendLimitEur` (and above `fastLaneEur`) | the first role up `OrgRole.reportsToId` whose limit covers the cost | `structure.prisma` today |
| **Council** | the route or the cost needs it ("all safety ideas", "above €50k") | the council's secretary records the council's outcome at its meeting | new `Council` table |
| **Role** | always for this route, or added by hand on the sheet | holders of that role | `OrgRole` |

- **Cost estimate.** `case.costed { eur, basis }` by the desk holder or the lead; the idea studio's cost read
  (`features/ideas/company-read.ts`) pre-fills it. No estimate means no budget approval is computed, and the sheet
  says so.
- **Order.** Budget first, then council, then roles (D9). Each approval has an answer date and goes to the deputy of
  its role when late, like a desk.
- **Councils.** A council has a name, member roles, a meeting rhythm (for example every second Tuesday) and a
  secretary role. Pending approvals form the **agenda** of the next meeting; the secretary records one outcome per
  idea with the reason. **Individual votes are never stored** (D10); the outcome may record how many were present.
- When the last approval is a yes, the server appends the final `case.decided { answer: "yes" }` as
  `system:approvals` (the pattern of `system:clock`), so the decision log and the events API stay as they are (D11).

### 4.4 Events and data

| Event | Payload | Who |
|---|---|---|
| `case.reviewed` (new) | `{ outcome: "forward" \| "back" \| "merged", routeId?, into?, note }` | review role |
| `case.costed` (new) | `{ eur, basis }` | desk holder, lead, manager |
| `case.provisional` (new) | `{ projectId, lead, leadUserId?, note, approvals: { kind, roleId?, councilId? }[] }` | desk holder, manager |
| `case.approval` (new) | `{ step, answer: "yes" \| "conditions" \| "no" \| "back", reason, conditions?, present? }` | holder of that step's role; council secretary |
| `case.decided` | final yes by `system:approvals`; a no as phase 1 | – |

New case statuses: `review` (before `open`) and `approval` (after a provisional yes). Tables (Prisma, Kevin):
`ApprovalRule { companyId, routeKey?, kind, minEur?, roleId?, councilId?, order }`,
`Council { companyId, name, memberRoleIds, secretaryRoleId, rhythm, nextMeeting? }`, and on `CompanyConfig`:
`reviewRoleId?`, `reviewDays`, `appealDays`, `noReasonMin`.

**Done when.** In the e2e: review forwards an idea; a desk gives "yes, if approved" for a €12k idea whose desk limit
is €5k; the plant manager role approves; the council (for the route) approves at its meeting; the project starts.
A second run: the council says no, the project stops, the raiser sees the reasoned no and asks for a second look.

**Code.** `features/cases/*`, `features/projects/{reduce,permissions,selectors}.ts`, new `features/approvals/`
(pure: `approvalsFor(case, rules, org)`, `nextApproval()`), `server/actions/`, Settings → Rules and a new Settings →
Approvals page, inbox sections for reviewers, approvers and council secretaries, `features/clock/due.ts`, Teams cards
for approvals.

**Docs.** New reference `docs/DECISION_PATH.md` (review, provisional yes, approvals, councils;
written in this phase), [LOOP.md](../LOOP.md), [DATA_MODEL.md](../DATA_MODEL.md), [SETTINGS.md](../SETTINGS.md),
[CLOCK.md](../CLOCK.md), [TEAMS.md](../TEAMS.md), [SECURITY.md](../SECURITY.md), the customer guide for the works
council (what is and is not stored about a council's vote).

---

## 5 · TPL — project workflows and templates per department, joined and related projects

**Result.** A yes starts from the kind of project it is and the way the company wants to run it, and a new idea can
join or support a project next to it. Worked out in detail in
[the project workflows plan](2026-11-08_project-workflows.md).

- **Five workflow modes:** Board (today's, for quick wins), External tool (Jira now, Azure DevOps, Planner and
  Polarion later; NextUp keeps decision, setup, measure and recognition), Stage gate (investments: stages closed by
  approvals from phase 4), Fixed procedure (8D, ECR/ECN, safety: fixed steps with their own deadlines), and
  AI-orchestrated (large projects, with the agent of phase 7).
- **Templates per department.** NextUp ships a library (Quick win, 8D, Investment request, IT change, …, in DE and
  EN); a company copies and adapts them, limits them to departments and routes, and names a role per department
  that owns them. Templates are versioned; a running project keeps its version.
- **Choosing.** The Yes sheets propose the route's default template, else the department's template that fits the
  kind and the cost, else the brain's suggestion; a person confirms. Applying it writes `project.template`,
  `project.mode` and the steps as ordinary `project.step.added` events with roles, not people.
- **Sales.** The shipped templates also form a public gallery: a buyer sees their 8D, KVP and investment request ready
  on day one.
- **Joining.** The data already lets a yes join an open project (`openOrJoin` in `features/projects/reduce.ts`). The
  Yes sheet gets "Join P-12 instead", with the close projects found by shared words now and by embeddings later.
- **Related projects.** `project.related { projectId, why }` links two projects both ways, shown on Overview. A
  member of one can be added to the other as a contributor (role from phase 3), which is how a team "supports the
  neighbouring project".

**Code, steps, events, tests and decisions (W1–W8):** in [the project workflows plan](2026-11-08_project-workflows.md).
**Docs.** [LOOP.md](../LOOP.md), [DATA_MODEL.md](../DATA_MODEL.md), [SETTINGS.md](../SETTINGS.md),
[INTEGRATIONS.md](../INTEGRATIONS.md), and a new reference `docs/TEMPLATES.md`.

---

## 6 · REC — recognition up to HR and payroll

**Result.** The raiser sees the credit as theirs, chooses how to take it where the company allows a choice, and HR or
payroll receives it without retyping.

- **Credits page** for each person, private to them: their ideas, what each became, the measured result, the thanks
  and rewards. No leaderboard, no ranking.
- **Claim menu** per company (D12): payment through payroll, voucher, a day off, a donation, a training. The
  `RewardRule` decides the amount; the raiser picks the form (`project.reward.claimed { option }`).
- **Co-authors and team share.** Co-authors named at raise or added during the discussion
  (`case.coauthor { userId }`; LOOP's open item Q4) split the reward by the company's rule.
- **Hand-over to HR.** A monthly export of due rewards (CSV first; DATEV, SAP SuccessFactors and SAP HCM adapters
  behind the same interface later), with the personnel number from the directory, recorded as
  `project.reward.exported { batch }` and `project.reward.paid`. It carries personal data: GDPR rows, retention.
- **Guards.** Tax hints per country (for example the German €50 monthly limit for non-cash benefits) as a warning on
  the manager's confirm; an **invention flag** (`case.invention`) sends possibly patentable ideas to the company's
  ArbnErfG process instead of the normal reward.

**Legal first.** Marc checks the works-agreement and tax rows per pilot country before any amount leaves NextUp.
**Code.** `features/loop/rules.ts` (`RewardRule`), `features/projects/*`, new `features/rewards/` (export, pure),
`server/actions/`, Settings → Rules.
**Docs.** [LOOP.md](../LOOP.md) (step 8), [PRIVACY.md](../PRIVACY.md), [INTEGRATIONS.md](../INTEGRATIONS.md),
the pilot package.

---

## 7 · AGT — the project agent (add-on), with a planning run before the decision

**Result.** A desk holder can see what an idea would take before saying yes, and a running project gets a daily
assistant that drafts and nudges, under the company's ceiling. It is a paid add-on and needs the AI server.

- **Planning run (before the decision).** On a case in discussion or waiting for approval, "Plan it with the agent"
  asks the brain for a draft: the template that fits, steps with roles, the team roles needed, a metric with target,
  an effort range, the risks, and which approvals it will likely need. It shows on the case as an AI draft; it helps
  the decision and the council's agenda. On a yes the lead may apply it to the setup checklist.
- **Running project.** Once a day the agent reads the project, its board, Jira and the Teams channel and suggests:
  **Unblock** (a nudge to the role a step waits on, with draft text), **Report** (the weekly `project.update` for the
  sponsor and the raiser), **Plan** (a missing step learned from earlier projects of the same template). An ask box
  answers questions about the project.
- **Rights.** The company admin sets a ceiling; the lead sets what the agent may do below it. Read, draft and suggest
  are on; send without asking and move steps are off and stay off in the pilot.
- **What came of it.** Each suggestion is accepted or dismissed by a person; the project shows the list.

**Events.** `agent.suggested { kind, text, refs }`, `agent.accepted { id }`, `agent.dismissed { id, why? }`,
`project.agent { read, draft, suggest }`; the planning run as `case.planned { draft, version }`. All AI text is
redacted and labelled as AI, like the raise assistant.

**Code.** `services/brain/brain/plan.py` (extend `/v1/plan` with templates, roles, effort, approvals), a new daily job
in the scheduler, `features/projects/brain.ts`, new `features/agent/`, the project's Agent tab (project area,
artboard 05), `config/flags.ts` (`agent` add-on flag, admin.sellux.ch).
**Docs.** [ASSISTANT.md](../ASSISTANT.md) or a new `AGENT.md`, [PRIVACY.md](../PRIVACY.md) (what the agent reads),
the customer security guide, the works-council paper (AI Act Art. 26(7) information duty).

---

## Kevin's decisions

| # | Question | Proposal |
|---|---|---|
| D1 | Order of the phases | NOR, SEE and SET first, side by side; then GAT; then TPL, REC, AGT. |
| D2 | Minimum length of a no's reason | 40 characters, a company setting (`noReasonMin`, 20–400). |
| D3 | Second-look window | 10 working days after the no, one per case. |
| D4 | Do "wrong department" and "not responsible" go? | Yes; the sheet points to Hand over instead. Old events keep their text. |
| D5 | What a raiser who is not on the team sees of a project | The raiser panel only (stage, steps x/y, the lead's update, results, recognition). |
| D6 | Who is the idea manager | A role named in Settings → Rules, not an app role. |
| D7 | Does review time count in the 5-day promise? | Yes: the raiser sees one date. Review gets 2 of the 5 days by default. |
| D8 | May the reviewer say no on their own? | Yes, with the same reason rules; the second look then goes to the route's deputy role. |
| D9 | Order of approvals | Budget, council, role; a company may reorder per route later. |
| D10 | What is stored about a council's vote, and the minimum group for quality figures | The outcome and how many were present, never who voted how; quality figures only for groups of 5 or more cases. |
| D11 | Who writes the final yes after approvals | `system:approvals`, so the decision log and API stay one event per decision. |
| D12 | Recognition: claim menu and payroll export in the pilot? | The claim menu yes; the export as CSV only, adapters after the pilot. |

## Docs this plan changes

Now (this PR): this file and its row in [docs/README.md](../README.md), listed as a roadmap after funding. The reference
docs that describe the running app ([LOOP.md](../LOOP.md) and the others) stay unchanged until a phase is built. Each phase then updates the reference docs listed in its section **in the same PR as the code**, so the docs
describe what runs on `main`, and moves its row in the README status column. GAT writes the new reference
`docs/DECISION_PATH.md`. The nextup-admin roadmap (`handbook/roadmap.ts`) gets the phases once D1 is decided.
