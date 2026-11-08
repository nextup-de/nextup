# Plan: project workflows and templates per department

> **Plan · 2026-11-08 · decided: it will come, as the roadmap after funding.** Planned on the weekend of 7–8 Nov 2026;
> Kevin decided on 8 Nov that workflow modes and department templates are part of NextUp. Phase TPL of
> [the decision-stages master plan](2026-11-08_decision-stages.md), worked out in detail. Not part of the demo or the
> pilot, and nothing here is built. The detailed decisions W1–W8 are taken before it starts.

## Why

After a yes, every project in NextUp runs the same way today: a board, a baseline, a measure. Real plants do not work
like that. A quick win on line 4 needs three steps and a photo. An 8D case has fixed disciplines and deadlines. An
investment of €80k goes through stage gates. An IT change lives in Jira. A large cross-site project may want the AI to
plan and follow it.

Jira lets a company configure workflow schemes; idea-management tools such as HYPE Innovation offer phase-gate
processes for campaigns. Both leave the content to the customer: every company starts by building its own process.
NextUp can do it the other way round: **ship ready templates for the work a plant does again and again, each with the
answer clock, the measurement and the recognition already built in**, and let each department adapt them. That is
quicker to roll out, and it is something a buyer can see in a sales conversation: "here is your 8D, your KVP, your
investment request, ready on day one".

## What a template is

A template has two parts:

1. **The workflow:** *how* the project is run. One of five modes (below).
2. **The content:** *what* a project of this kind contains: steps, roles, metric, approvals, rhythm.

The same content can run in different modes. "Process change" can be a board project in one plant and a Jira project
in another.

### The five workflow modes

| Mode | For | Where the work happens | What NextUp keeps |
|---|---|---|---|
| **Board** (default) | quick wins, KVP, small improvements | the NextUp board, as today | everything |
| **External tool** | IT changes, engineering work, teams that live in a tracker | Jira today; Azure DevOps, Microsoft Planner, Polarion later | the decision, setup, goal, baseline, the raiser's view, measure and recognition; the board shows the tool's progress ("12 issues, 7 done") instead of cards |
| **Stage gate** | investments, larger changes, anything a council follows | the board, split into stages (for example Concept → Pilot → Roll-out), each closed by a gate | everything; each gate is an approval as in phase GAT, at project level |
| **Fixed procedure** | 8D, ECR/ECN, safety measures: regulated work | a fixed list of steps with their own deadlines (8D: D3 within 24 h, D5 within 10 days) | everything; steps cannot be removed, only completed or marked "not applicable" with a reason |
| **AI-orchestrated** (add-on) | large or cross-site projects | the board or stage gates, with the project agent planning, reporting and nudging | everything; the agent drafts, people decide (phase AGT) |

The mode is chosen at the yes (or the provisional yes) and can change until Start. After Start it stays, so the
measurement and the history mean the same thing all the way through.

### The content of a template

| Part | Example (8D quality case) |
|---|---|
| Name, kind, description | "8D quality case", for customer complaints and internal failures |
| Departments and routes it is offered for | Quality; routes "Customer complaint", "Internal failure" |
| Mode | Fixed procedure |
| Stages or fixed steps, each with the **role** that owns it and a due day relative to Start | D1 Team (Quality lead, day 0) · D2 Problem description · D3 Containment (day 1) · … · D8 Close and recognise |
| Setup checklist defaults | sponsor required; tools "not needed"; check-in weekly |
| Project roles needed | lead, sponsor, a member from production, a member from engineering |
| Metric preset | "ppm at customer", unit ppm, better is down, source: quality report |
| Measure days | 30, 90 |
| Approvals that usually apply | none below €5k; council "Quality board" above |
| External tool mapping (mode External tool) | Jira issue type per step, component, labels |
| Agent settings (mode AI-orchestrated) | which suggestions, how often, the ceiling below the company's |
| Notices | kickoff text, the weekly update to the sponsor |

Steps and roles are always **roles, never people**, so a template works in every plant and stays clean for the works
council.

## The template library

- **Shipped by NextUp** (in code, `features/templates/library.ts`, versioned with the app): Quick win (KVP), Kaizen
  workshop, 8D quality case, ECR/ECN engineering change, Safety measure, Energy saving, Purchase under spend limit,
  Investment request (stage gate), IT change (Jira), Process change, and Large project (AI-orchestrated). German and
  English from the start.
- **The company's copies.** A company copies a shipped template and adapts it, or builds its own. A copy keeps a link
  to its source, so NextUp can show "a newer version of 8D exists" without changing the company's copy.
- **Per department.** A template can be limited to departments (`OrgUnit`) and routes. A department may own its
  templates: a role named as template owner (for example "Quality lead" for the Quality templates) edits them; a
  company manager edits all.
- **Versions.** Saving a template makes a new version. A project keeps the version it started with; a new version
  never changes a running project.
- **States.** Draft (only the owner sees it), active (offered), retired (no longer offered, old projects keep it).

## Choosing a template

On "Yes, do it" and "Yes, if approved" the sheet proposes one template, with the reason in words:

1. the route's default template, if it has one;
2. else the department's templates that fit the case kind and the cost estimate (for example above the spend limit →
   Investment request);
3. with the AI on, the brain may propose another and says why; it is labelled AI.

The desk holder or the lead confirms it or picks another. "No template" stays possible and gives today's empty board.

## Data and events

Everything on a project stays an event, as in the [project setup plan](2026-11-03_project-setup.md). Templates are
configuration and get a table (schema is Kevin's):

- `ProjectTemplate { id, companyId, key, version, status, name, kind, mode, unitIds[], routeKeys[], ownerRoleId?,
  sourceKey?, sourceVersion?, body Json, updatedAt, updatedBy }`. `body` holds the content above and is checked by a
  pure parser (`parseTemplate`), so a bad row can never break a project page. One row per version.
- `RoutingRule.templateKey?`: the route's default.

| Event | Payload | Who |
|---|---|---|
| `project.template` (new) | `{ key, version, mode }` | the server, when the lead or desk holder applies a template |
| `project.mode` (new) | `{ mode }` | lead, manager; until Start |
| `project.stage` (new) | `{ stage }` | lead; entering the next stage, refused until its gate is approved |
| `project.step.added` (existing) | the template's steps, with `role` instead of a person and a due day | the server, on apply |
| `project.step.na` (new) | `{ stepId, why }` | lead; fixed procedure: a step that does not apply |

`ReducedProject` gains `template`, `mode`, `stages` and `stage`. Old projects have no template and mode "board", and
replay unchanged.

Stage gates reuse the approvals of phase GAT (`case.approval`), pointed at the project and the stage, so one inbox and
one clock serve both.

### External tool mode, in detail

- Jira is the first tool; the sync exists (`project.sync`, [jira-in-app](2026-10-29_jira-in-app.md)). The template
  adds the mapping (issue type per step, component, labels). A Jira project per NextUp project stays out of scope, as
  in the setup plan.
- The project page shows the tool's progress in place of the board, with "Open in Jira". Steps done in the tool come
  back as `project.step.moved`, as today.
- When every issue is resolved, the lead is asked to mark the project done; NextUp never closes it on its own, because
  the measure window starts at done.
- Azure DevOps, Microsoft Planner and Polarion follow behind the same connector interface, one adapter each.

## Pages (Sam, spec 15)

- **Settings → Projects → Templates:** the library (shipped, the company's, by department), a template editor with a
  preview of the project it creates, versions, and copy from a shipped template.
- **The Yes sheets:** the proposed template with its reason, the mode, and "pick another".
- **The project page:** the mode as a badge; stages as a track above the board (stage gate); the fixed list with
  deadlines (fixed procedure); the tool's progress (external tool); the Agent tab (AI-orchestrated).
- **A public template gallery** for sales and the landing page: the shipped templates as readable pages, without any
  customer data.

## Steps

| # | What | Needs | Lane | Size |
|---|---|---|---|---|
| W-1 | Contract: `parseTemplate`, the library with three shipped templates (Quick win, 8D, Investment request), `project.template` and `project.mode`, apply on yes; mode Board only | setup plan step 2 | Kevin | M |
| W-2 | The company's templates: table, migration, copies, versions, departments and owners, Settings → Templates | W-1 | Kevin, Sam | M |
| W-3 | Modes Fixed procedure and Stage gate (`project.stage`, `project.step.na`, stage gates on the approvals of GAT) | W-1, GAT | Kevin, Sam | M |
| W-4 | Mode External tool with Jira (mapping, progress in place of the board) | W-1, Jira engine | Kevin, Victor | M |
| W-5 | Mode AI-orchestrated (agent settings from the template) | W-1, AGT | Victor, Kevin | S on top of AGT |
| W-6 | The full shipped library (all eleven, DE/EN), the public gallery, demo seeds for every mode | W-3, W-4 | Sam, Marc | M |

W-2, W-3 and W-4 can run side by side once W-1 is merged.

## Tests

- **Unit:** `parseTemplate` accepts every shipped template and refuses broken ones; applying a template writes the
  right steps with roles and due days; a new template version leaves a running project unchanged; a stage cannot be
  entered before its gate; a fixed step can only be "not applicable" with a reason; old logs replay unchanged.
- **e2e:** a yes with the 8D template gives eight steps with deadlines; an Investment request runs Concept → gate →
  Pilot; an IT change with Jira on shows the tool's progress.
- **By hand:** the demo company has one project in every mode, readable at 375 px.

## Kevin's decisions

| # | Question | Proposal |
|---|---|---|
| W1 | Which modes in the first release after funding | Board, Fixed procedure, Stage gate; External tool with Jira next; AI-orchestrated with the agent add-on. |
| W2 | Who may edit a department's templates | A role named as template owner per department, and company managers. |
| W3 | May the mode change after Start? | No. Before Start yes. |
| W4 | Can a fixed procedure's step be removed? | No, only "not applicable" with a reason. |
| W5 | Which templates NextUp ships first | Quick win, 8D, Investment request; then the other eight. |
| W6 | Do shipped templates update the company's copies? | Never on their own; the company sees "newer version" and decides. |
| W7 | Is the template gallery public (landing page)? | Yes, the shipped templates only, as a sales page. |
| W8 | Are templates part of the paid add-on? | Board, Fixed procedure and Stage gate in the core; External tool with the integrations; AI-orchestrated in the agent add-on. |

## Docs this plan changes when it is built

[LOOP.md](../LOOP.md) (the project after a yes), [DATA_MODEL.md](../DATA_MODEL.md) (the table and the events),
[SETTINGS.md](../SETTINGS.md) (Templates), [INTEGRATIONS.md](../INTEGRATIONS.md) (the tool mapping), and a new
reference `docs/TEMPLATES.md` with the shipped library. Until then only this plan and its row in
[docs/README.md](../README.md).
