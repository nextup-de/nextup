# Plan: the project setup phase, from "Yes" to "Start"

> **Plan · 2026-11-03 · draft, waits for review.** What happens between an idea's "Yes" and "Start the project":
> one setup stage with a checklist (team, roles, goal, baseline, tools, context, how we work), new people asked for by
> the lead and let in by a manager, a kickoff notice, and company defaults. Answers open question 2 of
> [the project area](2026-11-03_project-area.md). Sam's page needs are in
> [spec 12](2026-11-02_pilot-pages/12-project-setup.md).

## Why

A "Yes" opens a project today, but nobody is told what to set up before work starts. The "Yes, do it" sheet
(`AcceptSheet` in `components/shell/LoopSheets.tsx`) asks for a lead, a title and one optional step.
`case.decided` then opens the project in `planning` (`openOrJoin` in `features/projects/reduce.ts`), and the baseline
is the only gate before `project.started`.

What a project needs in a real company, and does not have:

- **The right people with the right rights.** Today there are a lead and members. There is no sponsor, nobody who
  only reads along, and no way to bring in someone who is not in NextUp yet.
- **A goal.** The only measure is one baseline metric. There is no target, no "done when" and no link to a company goal.
- **The idea's context, kept for the team.** The source idea shows live on the project (`ProjectOrigin.tsx`). There
  is no brief the lead can shape and share, and files are only a count on the case.
- **Agreed tools and a rhythm.** Tools are links plus Jira sync, picked ad hoc. There is no check-in or channel.
- **A kickoff.** Nobody on the team hears that the project started or that they were added to it.

The company side is mostly done: Settings → Members (add, invite mail, codes, roles, seats, deactivate), Org,
Routing, CSV import and the company setup wizard (#381, #418, #426). This plan reuses it and adds nothing to the
company's role model.

## Decisions (Kevin, 3 Nov 2026)

| # | Question | Decision |
|---|---|---|
| D1 | Who brings a person who is not in NextUp into a project? | The lead **asks**, a manager **lets them in**. The existing invite mail goes out on the manager's OK. |
| D2 | Shared files | **Text and links now.** A brief and links (SharePoint, Teams, any http(s)). Upload waits for a storage decision. |
| D3 | How strict is setup? | **Three items gate Start**: a team, a goal, a baseline. The others are soft and can be marked "not needed". |
| D4 | What comes out of this plan | This plan and spec 12 for Sam, then Kevin's side (events, rules, actions, mails) in PRs. |

## The process

The `planning` status is shown as **Setting up**. The stage track becomes
**Opened → Set up → Started → Done → Measured → Recognised**: "Set up" takes the place of today's "Baseline" stage,
and the baseline becomes one of its items.

While a project is setting up, the Overview tab shows the **setup checklist**. Each item leads to the tab where it is
done (tabs from [the project area](2026-11-03_project-area.md)):

| # | Item | Gates Start | Done when | Tab |
|---|---|---|---|---|
| 1 | Team | yes | at least one person on the team besides the lead | Team |
| 2 | Roles | no | a sponsor is named, or "not needed" | Team |
| 3 | Goal | yes | a target and "done when" are set (a company goal may be linked) | Results |
| 4 | Baseline | yes (as today) | `project.baseline` with a value, or none with a reason | Results |
| 5 | Tools | no | Jira sync is on, a tool link is added, or "not needed" | Files and tools |
| 6 | Context | no | the lead saved the brief (pre-filled from the idea), or "not needed" | Files and tools |
| 7 | How we work | no | a check-in rhythm is set, or "not needed" | Team |

"Start the project" works once items 1, 3 and 4 are done (and the sponsor, if the company requires one, see
Defaults). Starting sends the **kickoff notice** to the team and the sponsor. Soft items still open at the start are
recorded as skipped, not as an error.

A company switch may make the sponsor required (item 2 then gates Start too).

## Project roles

| Role | How someone gets it | May do |
|---|---|---|
| Lead | the "Yes" sheet, `project.handed` | everything on the project as today, plus the setup items |
| Sponsor | `project.sponsor` (lead or manager) | read, comment, set the goal with the lead; gives the verdict once spec 11's verdict step exists |
| Member | `project.member` (default role) | today's step rights: add, edit, take and move steps |
| Contributor | `project.member {role: "contributor"}` | the same as a member; shown apart as "helps on single steps" |
| Follower | `project.member {role: "follower"}` | read and comment; gets the updates; no step rights |
| Manager | app role | acts as lead, as today; lets new people in |

App roles (`config/roles.ts`: manager, leader, member) stay as they are. A project role is a fact of one project, not of
a person.

## Data and rules

Everything is a project event, rebuilt by the reducer as today. No project table is added. The only new table holds
access requests, because they carry an email address that must be deletable (HD10).

### Events (`features/cases/events.ts`, reduced in `features/projects/reduce.ts`)

| Event | Payload | Who |
|---|---|---|
| `project.member` (extended) | `{ userId, name, on, role? }`, role `member` (default), `contributor`, `follower` | lead, manager |
| `project.sponsor` (new) | `{ userId \| null }` | lead, manager |
| `project.goal` (new) | `{ target, doneWhen, companyGoalId? }`; target is a number in the baseline's unit | lead, manager, sponsor; until done |
| `project.brief` (new) | `{ text }`, up to 4000 characters | lead, manager |
| `project.howwework` (new) | `{ checkin: "weekly" \| "biweekly" \| "none", channel?, notes? }`; channel is an http(s) link | lead, manager |
| `project.setup.skipped` (new) | `{ item: "roles" \| "tools" \| "context" \| "howwework", why? }` | lead, manager |

Links stay `project.linked`. Old logs replay unchanged: a `project.member` without a role is a member.

`ReducedProject` (`features/projects/types.ts`) gains `sponsor`, `sponsorUserId`, `roles` (per member id), `goal`,
`brief`, `howWeWork` and `skipped`.

### The brief

`briefFromSource(case)` is a pure function. It writes the first brief from the source idea: the problem, what is
expected, the upside, the decision note, and the analysis dials as words. The project shows it as a draft until the
lead saves it (`project.brief`). The source case is archived on "Yes" and does not change any more, so no snapshot
event is needed. A project that joined several ideas lists each one.

### Selectors (`features/projects/selectors.ts`, `views.ts`)

- `setupOf(p, rules)` → `{ items: { key, done, required, skipped }[], ready }`. It is pure and follows the pattern of
  the company wizard's `setupStep(counts)`.
- `nextMove()` gets `setup` as the first move. It points to the first open required item and replaces `baseline`.
- `lifecycle()` renames the second stage to "Set up".

### Rights (`features/projects/permissions.ts`)

- `mayAppendProject` gains the new events with the table above. Followers lose `step.added`, `step.edited` and
  `step.moved`.
- **The Start gate is checked when the event is appended, never in the reducer.** `project.started` is refused unless
  `setupOf(p, rules).ready`. The reducer keeps only its baseline check. A log from before this plan, where a project
  started without a goal, therefore replays exactly as before.

### New people (D1)

- New Prisma model `AccessRequest { id, companyId, projectId, name, email, why?, requestedByUserId, status
  ("open" | "approved" | "declined"), decidedByUserId?, reason?, createdAt, decidedAt? }`, plus a migration.
- `requestPersonAction` (lead): it refuses if the email belongs to someone who is already in the company, and offers
  that person instead.
- Requests show on the manager's inbox, as a section next to `ProjectDesk`.
- `approvePersonAction` (manager, guarded by `companyAdminOf`): it creates the person with the app role member through
  the same path as `inviteMemberAction` (`inviteMail`, audit `audit.member.invited`). It then appends
  `project.member { userId, role }` and tells the lead.
- `declinePersonAction` (manager): it records a reason, and the lead sees it.
- On a company whose people come from Entra or a directory sync, the manager is told to add the person there. No
  user is created outside the sync.
- A request is deleted 90 days after it is decided. The event log only ever holds the user id.

### Notices (`features/loop/notice.ts`, `loopMails`, en and de)

- **Added to a project:** "You are on P-12: {title}". It goes to the person added, and follows their notification
  settings.
- **Kickoff** on `project.started`: it goes to the team and the sponsor, with the goal, the first steps with owners,
  the check-in and the channel.
- **Setup still open:** the existing late-start escalation (`promiseDays`) already covers it. The lead's "Your move"
  names the missing item.

### Defaults (Settings → Rules, a "Projects" group in `CompanyConfig`)

| Field | Default | What it does |
|---|---|---|
| `projectSponsorRequired` | false | item 2 gates Start |
| `projectCheckin` | "weekly" | the pre-set rhythm on item 7 |
| `projectLeadsMayAsk` | true | leads may ask for new people (D1) |
| `projectTools` | all of `TOOLS` | which link tools a project offers |

### Brain (optional, AI gate on)

`/v1/plan` (`services/brain/brain/plan.py`, `planRequest` in `features/projects/brain.ts`) suggests a target and a
"done when" next to the metric. It also sends each company goal's KPI, which is sent empty today. Its suggestions are
labelled AI, and a person saves them.

## Steps

| # | What | Depends on | Lane |
|---|---|---|---|
| 1 | This plan, spec 12, and the updates to spec 10 and the project area | – | Kevin |
| 2 | **Contract:** event types, `ReducedProject` fields, `setupOf`, `briefFromSource`, rights and tests, `act.project.*` calls in `features/cases/rows.ts`. Today's page keeps working: the Start hint names the missing items. | 1 reviewed | Kevin |
| 3 | Access requests: the model, the migration, the three actions, the inbox section and audit | 2 | Kevin |
| 4 | Notices and defaults: the mails, the Rules "Projects" group and the `CompanyConfig` fields | 2 | Kevin |
| 5 | Seeds and demo: acme's projects get a sponsor, goal, brief and check-in; one project stays Setting up; the `/demo` player shows the new events | 2 | Kevin |
| 6 | Pages from spec 12 | 2 (designed now, built on the contract) | Sam |
| 7 | Brain: target and "done when" | 2 | Kevin, optional |

Steps 3, 4 and 5 touch different files once 2 is merged and can run side by side. Then one integration pass runs the
full e2e suite.

## Tests

- **Unit** (`npm test`):
  - `permissions.test.ts` covers the new rights, the follower who cannot touch steps, and Start refused until items 1,
    3 and 4 are done (and 2, when a sponsor is required).
  - `setupOf` and `briefFromSource` tests.
  - Replay: an old log with a start without a goal reduces the same as before.
- **e2e** (`npm run e2e:db`):
  - raise, discuss and say yes; the project is Setting up and the checklist shows;
  - add a member, set the goal and the baseline; Start is enabled, and the kickoff mail is captured;
  - the lead asks for a new person, the manager lets them in, and they are on the team with an invite mail.
- **By hand:** the acme demo checklist and stage track at 375 px. On a pilot stage, the flags and `policyFor()` still
  hide demo data.

## Not in this plan

- **File upload and storage.** Planned later: a storage choice per company stack (volume or S3-compatible), size and
  type limits, and a scan.
- **People outside the company (guests)**, for example a supplier.
- **Syncing a tool other than Jira**, and a Jira project or board per project. Jira keeps the company's one project
  key ([jira-in-app](2026-10-29_jira-in-app.md)).
- **Team suggestions from the brain**: that is the project agent, phase 2 of the project area.
