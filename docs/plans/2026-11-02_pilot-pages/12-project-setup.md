# 12 · Project setup: from "Yes" to "Start"

> **Plan · 2026-11-03 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> "Start here, Sam", its ground rules and its shared building blocks first.**
> What a project needs while it is being set up: a checklist on the Overview, roles and a sponsor on Team, a goal on
> Results, the brief and the tools on Files and tools, how the team works, asking for someone new, the manager's
> answer to that, the Start button and the kickoff, and the company's project defaults. The data comes from
> [the project setup plan](../2026-11-03_project-setup.md). The tabs come from
> [the project area](../2026-11-03_project-area.md). **0 new routes, 6 changed parts, 1 new settings group.**

Context for this file:

- **Who does what.** Kevin builds the events, the rules, the server actions and the mails (setup plan, steps 2 to 5).
  You design and build the parts. Design them now. Build each part once step 2 (the contract) is merged; until then
  the names in code below are the ones it will have.
- **Describe needs, not looks.** As in every spec: the content, actions, states, rules and names in code are fixed;
  the ASCII layouts are suggestions.
- **The rules that matter most here:**
  - **No per-person numbers (HD5).** The team list shows roles, not counts of steps per person.
  - **People are ids (HD10).** An email address shows only in the manager's request card and the lead's own request.
  - **No model output in a number (DO2).** A suggested target from the AI is labelled AI and saved only by a person.
  - **Colour means state only.** A required open item, a done item and a skipped item differ by icon and words.
- **Text namespaces** *(proposal)*: `projects` (everything on the project), `inbox` (the request card),
  `settingsRules` (the Projects group), `mails` (the two notices).
- **Test ids:** `project-setup-<item>`, `project-team-<thing>`, `project-goal-<thing>`, `project-brief-<thing>`,
  `project-ask-<thing>`, `inbox-ask-<thing>`, `settings-projects-<thing>`.

## Parts in this file

| Part | Where | New / changed | Data from |
|---|---|---|---|
| Setup checklist | Project, Overview tab, while Setting up | new | `setupOf(p, rules)` |
| Stage track | Project header and Overview | changed (spec 10) | `lifecycle(p, locale)` |
| Team and roles | Project, Team tab | changed | `p.lead`, `p.members`, `p.roles`, `p.sponsor` |
| Ask for someone new | Project, Team tab | new | `requestPersonAction` → `AccessRequest` |
| Goal | Project, Results tab | new | `p.goal`, `p.baseline`, company goals |
| Brief, tools and how we work | Project, Files and tools tab and Team tab rail | new | `p.brief`, `briefFromSource`, `connectionsOf(p)`, `p.howWeWork` |
| Start and kickoff | Project header | changed | `setupOf(p, rules).ready` |
| Requests from leads | Inbox (manager) | new | `AccessRequest` rows |
| Projects defaults | Settings → Rules | new group | `CompanyConfig.project*` |

---

## Setup checklist

- **Where:** the Overview tab, at the top, while `p.status === "planning"` (shown as "Setting up"). It takes the place
  of the Baseline panel and suggested steps that sit above the board today. Once the project starts it is gone, and
  the record keeps what was skipped.
- **Who:** everyone who may see the project sees it. Only the lead and managers get the buttons; the others read.
- **Data:** `setupOf(p, rules)` → `{ items: { key, done, required, skipped }[], ready }`. The keys, in order:
  `team`, `roles`, `goal`, `baseline`, `tools`, `context`, `howwework`.

| Item | Line when open | Line when done | Action (lead) |
|---|---|---|---|
| team | "Add at least one person to the team" | "{n} people on the team" | Go to Team |
| roles | "Name a sponsor" | "Sponsor: {name}" | Go to Team · Not needed |
| goal | "Set the target and when it is done" | "Target {value} {unit} · done when {text}" | Go to Results |
| baseline | "Take the baseline" | "{metric} {value} {unit}" or "No baseline: {why}" | Go to Results |
| tools | "Connect the tools the team uses" | "Jira NUP-41 · Teams" | Go to Files and tools · Not needed |
| context | "Check the brief for the team" | "Brief saved {date}" | Go to Files and tools · Not needed |
| howwework | "Agree on a check-in" | "Weekly check-in · channel" | Go to Team · Not needed |

| EN | DE |
|---|---|
| Set up the project | Projekt aufsetzen |
| {done} of 7 done · Start needs team, goal and baseline | {done} von 7 erledigt · Start braucht Team, Ziel und Ausgangswert |
| Required | Pflicht |
| Not needed | Nicht nötig |
| Skipped | Übersprungen |
| Undo | Rückgängig |

**States:** nothing done (a new project); some done; ready (every required item done, the Start button is live);
an item marked "Not needed", which shows "Skipped" with an Undo while still Setting up; a viewer who is not the lead
(no buttons, the same lines); the company requires a sponsor (`roles` shows "Required").

**Rules:** required items carry the word "Required", not a colour. "Not needed" is never offered on team, goal or
baseline. "Not needed" may ask "Why? (optional)" and sends `project.setup.skipped {item, why}`.

```
┌ Set up the project · 4 of 7 done ─────────────── Start needs team, goal and baseline ┐
│ ✓ Team            3 people on the team                                               │
│ ○ Roles           Name a sponsor                         [Go to Team]  Not needed    │
│ ○ Goal  Required  Set the target and when it is done     [Go to Results]             │
│ ✓ Baseline        Scrap rate 4.1 %                                                   │
│ ✓ Tools           Jira NUP-41 · Teams                                                │
│ – Context         Skipped                                Undo                        │
│ ✓ How we work     Weekly check-in · Teams channel                                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Stage track

- **Change to spec 10:** the second stage is **Set up**, not Baseline: Opened → Set up → Started → Done → Measured →
  Recognised. Its day is the day the project became ready. The status badge reads "Setting up" for `planning`.

| EN | DE |
|---|---|
| Setting up | Wird aufgesetzt |
| Set up | Aufgesetzt |

## Team and roles

- **Where:** the Team tab (project area 03). It replaces the "role in the project" column with the roles below.
- **Data:** `p.lead`, `p.leadUserId`, `p.members`, `p.memberUserIds`, `p.roles[userId]`
  (`member` | `contributor` | `follower`), `p.sponsor`, `p.sponsorUserId`.
- **Actions (lead, manager):**
  - Add someone (people already in the company): `act.project.member(userId, true, role)`.
  - Change the role: the same call with a new role.
  - Remove: `act.project.member(userId, false)`.
  - Name or change the sponsor: `act.project.sponsor(userId | null)`.
  - Hand over the lead (as today).

| Role | EN label | EN hint | DE label |
|---|---|---|---|
| lead | Lead | Runs the project | Leitung |
| sponsor | Sponsor | Backs it and gives the verdict | Sponsor |
| member | Team | Takes and moves steps | Team |
| contributor | Helps | Helps on single steps | Hilft mit |
| follower | Follows | Reads along and gets the updates | Liest mit |

**Rules:** one sponsor per project. The sponsor may also be on the team. A follower never gets step buttons
anywhere: not on the board, not in the card sheet. No per-person count (HD5).

## Ask for someone new

- **Where:** the Team tab, next to "Add someone". It is shown when the company allows it
  (`CompanyConfig.projectLeadsMayAsk`) and the viewer is the lead.
- **Form:** name, work email, role on the project, and why (optional). It calls the server action `requestPersonAction`, which is not an event: the email stays out of the log.
- **States:**
  - sent ("Waiting for a manager");
  - the person is already in the company ("{name} is already in NextUp · Add them");
  - the company syncs its people from Entra or a directory ("Ask IT to add them to the directory first");
  - let in (the person shows on the team, and the request disappears);
  - declined (the reason, then Dismiss).

| EN | DE |
|---|---|
| Ask for someone new | Jemand Neues anfragen |
| A manager lets them in. They get an invitation by email. | Eine Führungskraft lässt die Person zu. Sie erhält eine Einladung per E-Mail. |
| Waiting for a manager | Wartet auf eine Führungskraft |
| Declined: {reason} | Abgelehnt: {reason} |

## Goal

- **Where:** the Results tab, above the baseline (project area 04: Before, Target, After). While Setting up it is a
  form; after that it is a line, and lead, manager and sponsor can still edit it until the project is done.
- **Data:** `p.goal` `{ target, doneWhen, companyGoalId? }`, the unit and direction from `p.baseline`, the company's
  goals (title, KPI, target, period) to pick from.
- **Action:** `act.project.goal({ target, doneWhen, companyGoalId })`.
- **States:**
  - empty;
  - the baseline is not taken yet: the target asks for a number, and the unit follows once the baseline exists;
  - an AI suggestion, labelled AI, with a button to use it;
  - saved;
  - linked to a company goal (its title shows).

| EN | DE |
|---|---|
| Target | Zielwert |
| Done when | Fertig, wenn |
| e.g. "Line 4 runs with the new kit for two weeks" | z. B. „Linie 4 läuft zwei Wochen mit dem neuen Kit" |
| Supports company goal | Zahlt ein auf Unternehmensziel |

## Brief, tools and how we work

**Brief** (the Files and tools tab, top):

- **Data:** `p.brief`, or, while none is saved, the draft from `briefFromSource(case)`, which is built from the idea's
  problem, expectation, upside, decision note and analysis. With more than one idea, each is named.
- **Action:** `act.project.brief(text)`, up to 4000 characters. Lead and manager edit. Everyone on the project reads.
- **States:** draft from the idea ("From the idea · not saved yet"), saved ("Saved {date} by {name}"), and empty
  (an idea with no text).
- **Below it:** "Files and links" lists `project.linked` links and the idea's file count as today, plus "+ Add a link"
  (SharePoint, Teams, any http(s)). There is **no upload** in this phase. Do not draw one.

**Tools** (the same tab): as spec 10 (named tool chips, Jira's `StatusBadge`), plus the setup line "Not needed" while
Setting up. The tools offered are filtered by `CompanyConfig.projectTools`.

**How we work** (the Team tab's rail, project area 03):

- **Data:** `p.howWeWork` `{ checkin, channel?, notes? }`, pre-set from `CompanyConfig.projectCheckin`.
- **Action:** `act.project.howWeWork(...)`.
- **Fields:** check-in Weekly, Every two weeks or None; the team's channel (a link); notes, such as who gets updates.

| EN | DE |
|---|---|
| Brief for the team | Briefing fürs Team |
| From the idea · not saved yet | Aus der Idee · noch nicht gespeichert |
| How we work | So arbeiten wir |
| Weekly · Every two weeks · None | Wöchentlich · Alle zwei Wochen · Keine |

## Start and kickoff

- **Start button** (the header's primary action while Setting up): it is live when `setupOf(p, rules).ready`.
  Otherwise it is disabled, with the hint "Start needs: {missing items}".
- **Confirm sheet** (suggestion): it shows what will happen ("The team and the sponsor get the kickoff: goal, first
  steps, check-in"), then the skipped items as a short list. The button is "Start the project".
- **After:** the stage moves to Started, and the Overview shows "Kickoff sent to {n} people".

The two mails (Kevin builds them; the copy is for review here):

| Mail | To | EN subject | DE subject |
|---|---|---|---|
| Added | the person added | You are on P-12: {title} | Du bist im Projekt P-12: {title} |
| Kickoff | team and sponsor | P-12 starts: {title} | P-12 startet: {title} |

## Requests from leads (manager inbox)

- **Where:** the manager's inbox, as a section of its own ("People to let in"), next to `ProjectDesk`.
- **Card:** the person's name and email, the project (code and title), the role asked for, why, who asked, and when.
- **Actions:**
  - Let in: `approvePersonAction`. This creates the person with the app role member, sends the invitation and adds
    them to the project.
  - Decline: a reason is required.
- **States:**
  - open;
  - the email already belongs to someone in the company (the card offers "Add {name} instead");
  - the company syncs from a directory (Let in is replaced by "Add them in the directory");
  - done (the card leaves the inbox; the audit log keeps it).

## Projects defaults (Settings → Rules)

A "Projects" group on the Rules page, beside the loop rules that are there today:

| Field | Control | EN | DE |
|---|---|---|---|
| `projectSponsorRequired` | switch | A project needs a sponsor before it starts | Ein Projekt braucht vor dem Start einen Sponsor |
| `projectCheckin` | segmented | Default check-in | Standard-Check-in |
| `projectLeadsMayAsk` | switch | Leads may ask for new people | Projektleitungen dürfen neue Personen anfragen |
| `projectTools` | checkboxes | Tools a project can link | Werkzeuge, die ein Projekt verlinken kann |

## Phone (≤ 760 px)

- The checklist is one item per row: the label and its line, with the action below. "Not needed" sits behind the row's
  menu.
- The goal form is stacked.
- The request card's actions are full width.

## Open questions added by this file

- **12-Q1.** Does the checklist stay visible as a compact "Set up ✓" line after the start, or go away entirely?
  Kevin decides.
- **12-Q2.** Should followers be able to follow on their own ("Follow this project"), or only be added by the lead?
  Today's plan says only the lead adds them.
